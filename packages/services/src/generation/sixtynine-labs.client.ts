import { Readable } from 'node:stream';
import { AppError, env, ExternalServiceError } from '@yulia/core';
import type { GenerationKind, GenerationStatus } from './types.js';

/**
 * Low-level 69Labs REST client (https://69labs.vip/api/v1). All HTTP with the
 * provider funnels through here so the request/response contract lives in one
 * place.
 *
 * The API is per-kind and async-by-poll:
 *   POST /{videos|images}/generate  -> { id, queuePosition }   (no status yet)
 *   GET  /{videos|images}/status/:id -> { id, status, outputMetadata, ... }
 *   GET  /{videos|images}/download/:id -> 302 to a presigned R2 URL
 *
 * Status is UPPERCASE (PENDING/PROCESSING/FINALIZING/COMPLETED/FAILED/CANCELLED)
 * and the completed job carries NO result URL — the bytes come from the
 * dedicated download endpoint, which we resolve in `download()`.
 */
export interface CreateGenerationBody {
  prompt: string;
  model?: string;
  aspectRatio?: string;
  resolution?: string;
  duration?: string; // videos only; string per the API ("5", "10")
  mode?: string; // videos only
  seed?: number; // images only
  imageUrls?: string[];
}

export interface ProviderGeneration {
  id: string;
  status: GenerationStatus;
  /** 69Labs download endpoint (stable, re-resolves a fresh presigned URL each
   * call). Non-null once the job is COMPLETED. */
  resultUrl: string | null;
  costUsd: number | null;
  error: string | null;
  raw: unknown;
}

/** Live per-window credit quota for a kind (from GET /models). */
export interface ProviderCredits {
  used: number;
  /** Total credits in the window (e.g. 100 for video). 0 if unknown. */
  limit: number;
  /** Credits left in the current window. */
  remaining: number;
  /** ISO timestamp when the window resets, or null if the API didn't report it. */
  resetsAt: string | null;
  /** Credits one generation of the submit model costs (>=1). */
  costPerGen: number;
}

const REQUEST_TIMEOUT_MS = 30_000;

/**
 * How many times a single request retries a 429 (rate limit) in-process before
 * surfacing as a job failure. With WORKER_CONCURRENCY scenes polling every
 * GENERATION_POLL_INTERVAL_SEC concurrently, 69Labs' per-account rate limit is
 * hit routinely under normal load, not just as a rare hiccup — without this, a
 * single 429 on either the submit or a status poll burns one of only
 * VIDEO_GENERATION's 6 BullMQ attempts (see QUEUE_RETRY_POLICY), and a scene
 * polling every 2s for minutes will exhaust its attempts on rate limits alone
 * well before the generation itself finishes.
 */
const RATE_LIMIT_MAX_RETRIES = 6;
const RATE_LIMIT_BASE_DELAY_MS = 1_500;

/**
 * 69Labs also enforces a separate CONCURRENT in-flight job cap per account
 * (distinct from the per-minute 429 above) — submitting while already at the
 * cap 403s with "Concurrent {video|image} generation limit reached (N)". A
 * slot only frees once an EXISTING job elsewhere on the account finishes
 * (tens of seconds to minutes), not on a fixed per-minute window, so this only
 * absorbs a couple of quick retries in-process (to smooth a slot freeing up
 * right around submit time) and otherwise surfaces the error as retryable —
 * BullMQ's own VIDEO_GENERATION policy (6 attempts, 15s exponential backoff)
 * then handles the rest, RELEASING this worker's concurrency slot between
 * attempts so other queued scenes can run instead of blocking on this one.
 */
const CONCURRENCY_LIMIT_MAX_RETRIES = 2;
const CONCURRENCY_LIMIT_DELAY_MS = 8_000;
const CONCURRENCY_LIMIT_MESSAGE = /concurrent .* generation limit reached/i;

/**
 * 69Labs also enforces a TIME-WINDOW credit quota (distinct from both the
 * per-minute 429 and the concurrent-job 403 above) — e.g. an "Hourly video
 * credit limit exceeded" / "Daily ... limit" 403 with code FORBIDDEN. This is a
 * quota that RESETS on a clock boundary, not a permanent "out of credits" error,
 * so it must be treated as RETRYABLE — otherwise a single hourly-limit hit kills
 * the scene's job (UnrecoverableError) and, via the processor wrapper, FAILS THE
 * WHOLE PROJECT on the first attempt (client-reported bug).
 *
 * The reset window is long (up to an hour), far beyond what an in-process wait
 * can bridge without holding the worker slot, so we do NOT spin here. We surface
 * it as retryable and let BullMQ's VIDEO/IMAGE_GENERATION policy (6 attempts,
 * exponential backoff) space the resubmits out, freeing this worker's slot
 * between attempts so other scenes proceed. `Retry-After`, when present, is
 * honored by the caller-visible error so an operator/monitor can see the window.
 */
const CREDIT_LIMIT_MESSAGE = /(hourly|daily|weekly|monthly)\b.*\b(credit|limit)|credit limit exceeded/i;

/**
 * A job id only exists on the ACCOUNT that created it, so polling/downloading it
 * with a DIFFERENT key 403s with a bare "Access denied". That happens whenever the
 * key pool changes underneath an in-flight job — e.g. adding
 * SIXTYNINE_LABS_VIDEO_KEYS/IMAGE_KEYS, or rotating a key, restarts the worker and
 * re-pins the resumed job to a different account than submitted it. The provider
 * id is then permanently ORPHANED: no amount of retrying can reach it, because the
 * account that owns it is no longer the one we select for that slot.
 *
 * This is NOT the same as the quota/capacity 403s above (which are transient and
 * resolve on their own). Flagged via the error's `context.orphanedJob` so the
 * caller can drop the dead id and RESUBMIT fresh instead of failing the project —
 * see SceneGenerationService.runLayer, which already does exactly that for a
 * wedged job. Matched narrowly (plain "access denied" / "not found", no quota or
 * concurrency wording) so a real auth problem — a revoked or wrong key, which
 * resubmitting would NOT fix — still surfaces as a hard failure.
 */
const ORPHANED_JOB_MESSAGE = /access denied|(job|generation).*not found|not found.*(job|generation)/i;

export class SixtyNineLabsClient {
  // Separate key pools per media type. 69Labs plans give far more image than
  // video credits, so video keys are dedicated (and can be scaled independently)
  // rather than sharing one flat pool where video would exhaust an account while
  // its image budget sits unused. When per-media keys aren't configured, both
  // pools resolve to the same shared pool (today's behavior).
  private readonly imageKeys: string[];
  private readonly videoKeys: string[];

  constructor(
    pools: { image: string[]; video: string[] } = resolveApiKeyPools(),
    private readonly baseUrl: string = env.SIXTYNINE_LABS_BASE_URL,
  ) {
    const fallback = [env.SIXTYNINE_LABS_API_KEY];
    this.imageKeys = pools.image.length > 0 ? pools.image : fallback;
    this.videoKeys = pools.video.length > 0 ? pools.video : fallback;
  }

  /** The key pool for a media kind. */
  private poolFor(kind: GenerationKind): string[] {
    return kind === 'video' ? this.videoKeys : this.imageKeys;
  }

  /** How many 69Labs accounts (keys) are configured for a media kind. */
  keyCountFor(kind: GenerationKind): number {
    return this.poolFor(kind).length;
  }

  /** The Bearer key for a given kind's pinned index (wraps safely). */
  private keyAt(kind: GenerationKind, keyIndex: number): string {
    const pool = this.poolFor(kind);
    const n = pool.length;
    return pool[((keyIndex % n) + n) % n]!;
  }

  /** URL path segment for a generation kind: 'videos' | 'images'. */
  private resource(kind: GenerationKind): string {
    return kind === 'video' ? 'videos' : 'images';
  }

  async createGeneration(
    kind: GenerationKind,
    body: CreateGenerationBody,
    keyIndex = 0,
  ): Promise<ProviderGeneration> {
    const json = await this.request(kind, 'POST', `/${this.resource(kind)}/generate`, body, keyIndex);
    // Create returns only { id, queuePosition } — no status field yet.
    return this.normalize(kind, json, 'pending');
  }

  async getGeneration(kind: GenerationKind, id: string, keyIndex = 0): Promise<ProviderGeneration> {
    const json = await this.request(
      kind,
      'GET',
      `/${this.resource(kind)}/status/${encodeURIComponent(id)}`,
      undefined,
      keyIndex,
    );
    return this.normalize(kind, json);
  }

  /**
   * Live credit quota for a kind, read from GET /models. 69Labs enforces a
   * per-window credit budget (e.g. 100 video credits) that resets on a clock
   * boundary; the response carries `{kind}.credits = {used, limit, remaining,
   * resetsAt}` and each model's per-generation `cost`. The credit-aware
   * submission throttle (see CreditThrottle) polls this so it paces submits
   * against the REAL remaining budget instead of a hardcoded guess — and because
   * every worker instance reads the same provider-side counter, the pacing is
   * correct across multiple machines without shared client state.
   */
  async getCredits(kind: GenerationKind, keyIndex = 0): Promise<ProviderCredits> {
    const json = (await this.request(kind, 'GET', '/models', undefined, keyIndex)) as Record<
      string,
      unknown
    >;
    const section = (json?.[this.resource(kind)] ?? {}) as Record<string, unknown>;
    const credits = (section.credits ?? {}) as Record<string, unknown>;
    const models = Array.isArray(section.models) ? (section.models as Record<string, unknown>[]) : [];
    // Cost of the model we actually submit with: the configured override, else
    // the account default; fall back to 1 credit if the model isn't listed.
    const wantId =
      (kind === 'video' ? env.SIXTYNINE_LABS_VIDEO_MODEL : env.SIXTYNINE_LABS_IMAGE_MODEL) ??
      (typeof section.defaultModelId === 'string' ? section.defaultModelId : undefined);
    const model = models.find((m) => m.id === wantId) ?? models[0];
    const costPerGen = model && typeof model.cost === 'number' ? model.cost : 1;

    return {
      used: numberOr(credits.used, 0),
      limit: numberOr(credits.limit, 0),
      remaining: numberOr(credits.remaining, 0),
      resetsAt: typeof credits.resetsAt === 'string' ? credits.resetsAt : null,
      costPerGen: costPerGen > 0 ? costPerGen : 1,
    };
  }

  /**
   * Stream a completed job's output. The /download/:id endpoint requires the
   * Bearer header and 302-redirects to a short-lived presigned R2 URL. We follow
   * that redirect manually so the Authorization header does not travel to R2
   * (the presigned URL is self-authenticating and a stray Authorization header
   * can make some S3-compatible stores reject the request).
   */
  async download(kind: GenerationKind, id: string, keyIndex = 0): Promise<Readable> {
    const url = `${this.baseUrl}/${this.resource(kind)}/download/${encodeURIComponent(id)}`;
    // Bound only the connect/redirect handshake; the body streams unbounded once
    // headers arrive (a large video must not be aborted mid-download).
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      let res = await fetch(url, {
        headers: { authorization: `Bearer ${this.keyAt(kind, keyIndex)}` },
        redirect: 'manual',
        signal: controller.signal,
      });

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location');
        if (!location) {
          throw new ExternalServiceError('69labs', 'download redirect missing Location header', {
            retryable: true,
          });
        }
        res = await fetch(location); // presigned URL: no auth, no manual timer
      }

      if (res.status === 410) {
        // Output expired — not recoverable by retry; caller must regenerate.
        throw new ExternalServiceError('69labs', 'download expired (410 GONE)', { retryable: false });
      }
      if (!res.ok || !res.body) {
        throw new ExternalServiceError('69labs', `download failed: ${res.status}`, {
          retryable: res.status >= 500,
        });
      }
      return Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]);
    } catch (cause) {
      if (cause instanceof ExternalServiceError) throw cause;
      throw new ExternalServiceError('69labs', `download/${id} request failed`, { cause });
    } finally {
      clearTimeout(timer);
    }
  }

  private async request(
    kind: GenerationKind,
    method: string,
    path: string,
    body?: unknown,
    keyIndex = 0,
  ): Promise<unknown> {
    for (let attempt = 0; ; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const res = await fetch(`${this.baseUrl}${path}`, {
          method,
          headers: {
            authorization: `Bearer ${this.keyAt(kind, keyIndex)}`,
            'content-type': 'application/json',
            accept: 'application/json',
          },
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
          signal: controller.signal,
        });

        if (!res.ok) {
          if (res.status === 429 && attempt < RATE_LIMIT_MAX_RETRIES) {
            // Retry in-process: at normal WORKER_CONCURRENCY load, 69Labs' rate
            // limit is hit routinely (not a rare hiccup), so absorb it here
            // instead of burning a BullMQ job attempt per 429.
            await sleep(rateLimitDelayMs(res, attempt));
            continue;
          }
          const text = await res.text().catch(() => '');
          const isConcurrencyLimit = res.status === 403 && CONCURRENCY_LIMIT_MESSAGE.test(text);
          if (isConcurrencyLimit && attempt < CONCURRENCY_LIMIT_MAX_RETRIES) {
            // Absorb a couple of quick retries in-process (smooths a slot
            // freeing up right around submit time); beyond that, fall through
            // to the retryable throw below so BullMQ's own backoff takes over
            // and this worker's concurrency slot frees for other scenes.
            await sleep(concurrencyLimitDelayMs(attempt));
            continue;
          }
          // A time-window credit-quota 403 ("Hourly ... credit limit exceeded")
          // is TRANSIENT — it resets on a clock boundary. We don't spin
          // in-process (the window is too long); we surface it as retryable so
          // BullMQ backs off and resubmits, and free this slot meanwhile.
          const isCreditLimit = res.status === 403 && CREDIT_LIMIT_MESSAGE.test(text);
          // An "Access denied" 403 on a call that addresses an EXISTING job id
          // (status/download — never /generate) means the id is orphaned: it was
          // created by a different account than the one now pinned to this slot,
          // so it can never be reached again. Flag it so the caller drops the dead
          // id and resubmits fresh. Scoped to id-addressed reads because a 403 on
          // /generate is a real auth failure that a resubmit would not fix.
          const addressesExistingJob = /\/(status|download)\//.test(path);
          const isOrphanedJob =
            res.status === 403 &&
            addressesExistingJob &&
            !isConcurrencyLimit &&
            !isCreditLimit &&
            ORPHANED_JOB_MESSAGE.test(text);
          // 4xx = our fault (bad params, or a HARD "out of credits"), don't
          // retry; 5xx + 429 + the concurrent-job 403 + the time-window credit
          // 403 are transient (BullMQ retries them). An orphaned job is retryable
          // only because the caller clears the dead id first — the retry submits a
          // NEW job rather than re-polling the unreachable one.
          throw new ExternalServiceError('69labs', `${method} ${path} -> ${res.status} ${text}`, {
            retryable:
              res.status >= 500 ||
              res.status === 429 ||
              isConcurrencyLimit ||
              isCreditLimit ||
              isOrphanedJob,
            ...(isOrphanedJob ? { context: { orphanedJob: true } } : {}),
          });
        }
        return (await res.json()) as unknown;
      } catch (cause) {
        if (cause instanceof ExternalServiceError) throw cause;
        throw new ExternalServiceError('69labs', `${method} ${path} request failed`, { cause });
      } finally {
        clearTimeout(timer);
      }
    }
  }

  private normalize(
    kind: GenerationKind,
    json: unknown,
    fallbackStatus: GenerationStatus = 'pending',
  ): ProviderGeneration {
    const obj = (json ?? {}) as Record<string, unknown>;
    const id = String(obj.id ?? '');
    if (!id) throw new ExternalServiceError('69labs', 'response missing job id');
    const status = obj.status !== undefined ? mapStatus(obj.status) : fallbackStatus;
    return {
      id,
      status,
      // No URL in the payload; the bytes come from the download endpoint, which
      // we re-resolve at download time to dodge presigned-URL expiry.
      resultUrl:
        status === 'completed'
          ? `${this.baseUrl}/${this.resource(kind)}/download/${encodeURIComponent(id)}`
          : null,
      costUsd: typeof obj.creditCost === 'number' ? obj.creditCost : null,
      error: typeof obj.error === 'string' ? obj.error : null,
      raw: json,
    };
  }
}

/**
 * Delay before the next rate-limit retry. Prefers the response's `Retry-After`
 * header (seconds or an HTTP-date, per spec) when 69Labs sends one; falls back
 * to exponential backoff with jitter (jitter spreads out concurrent scenes that
 * all got 429'd on the same beat, so they don't all retry in lockstep and
 * immediately re-trip the limit).
 */
function rateLimitDelayMs(res: Response, attempt: number): number {
  const header = res.headers.get('retry-after');
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000) + 250;
    const dateMs = Date.parse(header);
    if (!Number.isNaN(dateMs)) return Math.max(0, dateMs - Date.now()) + 250;
  }
  const backoff = RATE_LIMIT_BASE_DELAY_MS * 2 ** attempt;
  const jitter = Math.random() * RATE_LIMIT_BASE_DELAY_MS;
  return backoff + jitter;
}

/**
 * Delay before retrying a concurrent-job-limit 403. Flat (not exponential) —
 * unlike a 429's per-minute window, a freed slot could open at any moment as
 * ANY in-flight job on the account completes, so there's no reason to back off
 * further with each attempt. Jittered so scenes that all got capacity-rejected
 * together don't all resubmit in the same instant and re-trip the limit.
 */
function concurrencyLimitDelayMs(attempt: number): number {
  return CONCURRENCY_LIMIT_DELAY_MS + Math.random() * CONCURRENCY_LIMIT_DELAY_MS * (attempt === 0 ? 0.5 : 1);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * True when an error is a 69Labs ORPHANED-JOB failure: the stored provider id was
 * created by a different account than the one now pinned to this slot (see
 * ORPHANED_JOB_MESSAGE), so it is permanently unreachable. Callers should clear
 * the dead external id and resubmit rather than re-polling it.
 */
export function isOrphanedJobError(err: unknown): boolean {
  return err instanceof AppError && err.context?.orphanedJob === true;
}

/** Parse a comma-separated key list (each trimmed, blanks dropped). */
function parseKeyCsv(csv: string | undefined): string[] {
  return (
    csv
      ?.split(',')
      .map((s) => s.trim())
      .filter(Boolean) ?? []
  );
}

/**
 * Resolve the configured 69Labs key pool: the comma-separated
 * SIXTYNINE_LABS_API_KEYS if set, else the single SIXTYNINE_LABS_API_KEY.
 * Always returns at least one key. (Shared pool, media-agnostic.)
 */
export function resolveApiKeys(): string[] {
  const csv = parseKeyCsv(env.SIXTYNINE_LABS_API_KEYS);
  return csv.length > 0 ? csv : [env.SIXTYNINE_LABS_API_KEY];
}

/**
 * Resolve the per-media key pools. Each media type prefers its dedicated list
 * (SIXTYNINE_LABS_IMAGE_KEYS / SIXTYNINE_LABS_VIDEO_KEYS); when unset it falls
 * back to the shared pool (resolveApiKeys) — so with no per-media config both
 * pools are identical and behavior is unchanged. This is what routes image jobs
 * to image-funded accounts and video jobs to video-funded accounts.
 */
export function resolveApiKeyPools(): { image: string[]; video: string[] } {
  const shared = resolveApiKeys();
  const image = parseKeyCsv(env.SIXTYNINE_LABS_IMAGE_KEYS);
  const video = parseKeyCsv(env.SIXTYNINE_LABS_VIDEO_KEYS);
  return {
    image: image.length > 0 ? image : shared,
    video: video.length > 0 ? video : shared,
  };
}

/**
 * Deterministically pin a generation job to ONE key in the pool. Submit, poll,
 * and download must all use the SAME account (the provider job id only exists on
 * the account that created it), so the choice is derived from a STABLE job key
 * (e.g. `sceneId:kind:slot`) rather than a rotating counter — every stage
 * recomputes the same index without persisting it. FNV-1a hash spread across the
 * pool distributes a project's jobs roughly evenly over the accounts.
 */
export function keyIndexForJob(jobKey: string, keyCount: number): number {
  if (keyCount <= 1) return 0;
  let h = 2166136261;
  for (let i = 0; i < jobKey.length; i++) {
    h ^= jobKey.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % keyCount;
}

function numberOr(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function mapStatus(raw: unknown): GenerationStatus {
  const s = String(raw ?? '').toLowerCase();
  if (['completed', 'succeeded', 'success', 'done'].includes(s)) return 'completed';
  if (['failed', 'error', 'cancelled', 'canceled'].includes(s)) return 'failed';
  if (['processing', 'in_progress', 'running', 'started', 'finalizing'].includes(s))
    return 'processing';
  return 'pending';
}

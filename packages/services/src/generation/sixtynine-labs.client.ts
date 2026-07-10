import { Readable } from 'node:stream';
import { env, ExternalServiceError } from '@yulia/core';
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

export class SixtyNineLabsClient {
  constructor(
    private readonly apiKey: string = env.SIXTYNINE_LABS_API_KEY,
    private readonly baseUrl: string = env.SIXTYNINE_LABS_BASE_URL,
  ) {}

  /** URL path segment for a generation kind: 'videos' | 'images'. */
  private resource(kind: GenerationKind): string {
    return kind === 'video' ? 'videos' : 'images';
  }

  async createGeneration(kind: GenerationKind, body: CreateGenerationBody): Promise<ProviderGeneration> {
    const json = await this.request('POST', `/${this.resource(kind)}/generate`, body);
    // Create returns only { id, queuePosition } — no status field yet.
    return this.normalize(kind, json, 'pending');
  }

  async getGeneration(kind: GenerationKind, id: string): Promise<ProviderGeneration> {
    const json = await this.request('GET', `/${this.resource(kind)}/status/${encodeURIComponent(id)}`);
    return this.normalize(kind, json);
  }

  /**
   * Stream a completed job's output. The /download/:id endpoint requires the
   * Bearer header and 302-redirects to a short-lived presigned R2 URL. We follow
   * that redirect manually so the Authorization header does not travel to R2
   * (the presigned URL is self-authenticating and a stray Authorization header
   * can make some S3-compatible stores reject the request).
   */
  async download(kind: GenerationKind, id: string): Promise<Readable> {
    const url = `${this.baseUrl}/${this.resource(kind)}/download/${encodeURIComponent(id)}`;
    // Bound only the connect/redirect handshake; the body streams unbounded once
    // headers arrive (a large video must not be aborted mid-download).
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      let res = await fetch(url, {
        headers: { authorization: `Bearer ${this.apiKey}` },
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

  private async request(method: string, path: string, body?: unknown): Promise<unknown> {
    for (let attempt = 0; ; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const res = await fetch(`${this.baseUrl}${path}`, {
          method,
          headers: {
            authorization: `Bearer ${this.apiKey}`,
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
          // 4xx = our fault (bad params / no credits), don't retry; 5xx + 429 = transient.
          throw new ExternalServiceError('69labs', `${method} ${path} -> ${res.status} ${text}`, {
            retryable: res.status >= 500 || res.status === 429,
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mapStatus(raw: unknown): GenerationStatus {
  const s = String(raw ?? '').toLowerCase();
  if (['completed', 'succeeded', 'success', 'done'].includes(s)) return 'completed';
  if (['failed', 'error', 'cancelled', 'canceled'].includes(s)) return 'failed';
  if (['processing', 'in_progress', 'running', 'started', 'finalizing'].includes(s))
    return 'processing';
  return 'pending';
}

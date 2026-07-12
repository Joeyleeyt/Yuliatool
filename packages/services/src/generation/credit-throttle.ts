import { ExternalServiceError } from '@yulia/core';
import type { GenerationKind } from './types.js';
import { SixtyNineLabsClient, type ProviderCredits } from './sixtynine-labs.client.js';

/**
 * Paces 69Labs submissions so the pipeline stays UNDER the provider's per-window
 * credit quota instead of bursting the whole budget in minutes and then 403ing
 * ("Hourly video credit limit exceeded") on every remaining scene until the
 * window resets.
 *
 * Why this exists: a ~20-minute video fans out ~160 video generations up front,
 * but the video window allows only ~100 credits (see GET /models →
 * `videos.credits`). Without pacing, the first ~100 submits drain the window and
 * the rest fail; with it, submits hold at the window boundary and resume when
 * the quota resets, so the project completes across windows instead of failing.
 *
 * Design (multi-instance safe): the 69Labs API is the shared source of truth —
 * every worker instance reads the same provider-side `remaining`/`resetsAt`, so
 * we don't need cross-machine coordination. Each instance:
 *   1. caches a credits snapshot briefly (SNAPSHOT_TTL_MS) to avoid hammering
 *      GET /models on every submit,
 *   2. locally RESERVES `costPerGen` credits before a submit and releases them
 *      if the submit fails for a non-credit reason (so a transient error doesn't
 *      leak budget),
 *   3. when the (snapshot − local reservations − safety margin) budget is
 *      exhausted, WAITS until `resetsAt` (capped) and re-fetches, rather than
 *      submitting into a guaranteed 403.
 *
 * A safety margin keeps several instances from each spending the final credit in
 * the same refresh window (they'd otherwise all see `remaining=1` and submit).
 */

/** How long a credits snapshot from GET /models is trusted before re-fetch. */
const SNAPSHOT_TTL_MS = 30_000;
/** Credits kept in reserve below `remaining` so concurrent instances don't race
 * the last credit. Scaled up a little for video since its window is small. */
const SAFETY_MARGIN = { video: 3, image: 5 } as const;
/**
 * If the window reset is at most this far off, WAIT for it in-job (a short block
 * that keeps the worker slot briefly, then submits). If it's further away,
 * DON'T hold the slot — throw a retryable error so BullMQ frees this slot for
 * other queues/scenes and reschedules the job (its attempt budget is sized to
 * span a full window). Prevents a fleet of parked jobs from freezing the
 * generation queue for the whole reset window.
 */
const MAX_IN_JOB_WAIT_MS = 60_000;
/** Small buffer added to a reset wait so we re-fetch just AFTER the boundary. */
const RESET_SLACK_MS = 3_000;

interface Snapshot {
  credits: ProviderCredits;
  fetchedAt: number;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export class CreditThrottle {
  private snapshot: Snapshot | null = null;
  /** Credits reserved locally since the last snapshot (this instance only). */
  private reserved = 0;
  /** Serializes acquire() so reservations don't race within one instance. */
  private chain: Promise<void> = Promise.resolve();

  constructor(
    private readonly kind: GenerationKind,
    private readonly client: SixtyNineLabsClient = new SixtyNineLabsClient(),
    private readonly onWait?: (info: { waitMs: number; remaining: number; resetsAt: string | null }) => void,
  ) {}

  private get margin(): number {
    return this.kind === 'video' ? SAFETY_MARGIN.video : SAFETY_MARGIN.image;
  }

  /**
   * Block until there's budget for one generation, reserving it. Returns a
   * `release()` the caller MUST invoke if the submit ultimately fails for a
   * non-credit reason (so the reserved credit isn't leaked). On a successful
   * submit the reservation is simply left to expire with the next snapshot
   * (the provider's `used` will reflect it on the next fetch).
   */
  async acquire(): Promise<{ release: () => void }> {
    // Serialize: chain each acquire after the previous so two concurrent
    // acquires in one instance can't both reserve the same last credit.
    let unlock!: () => void;
    const prev = this.chain;
    this.chain = new Promise<void>((r) => (unlock = r));
    await prev;

    try {
      for (;;) {
        const credits = await this.getCredits();
        const cost = credits.costPerGen;
        // Available to THIS instance right now = provider remaining, minus what
        // we've locally reserved since the snapshot, minus the safety margin.
        const available = credits.remaining - this.reserved - this.margin;

        if (available >= cost) {
          this.reserved += cost;
          let released = false;
          return {
            release: () => {
              if (released) return;
              released = true;
              this.reserved = Math.max(0, this.reserved - cost);
            },
          };
        }

        // Out of budget for this window. If the reset is imminent, wait in-job
        // and re-check; if it's far off, DON'T hold the worker slot — surface a
        // retryable error so BullMQ frees the slot and reschedules the job (its
        // attempt budget spans a window). Either way we log so it's visible.
        const untilReset = this.msUntilReset(credits);
        this.onWait?.({ waitMs: untilReset, remaining: credits.remaining, resetsAt: credits.resetsAt });
        if (untilReset <= MAX_IN_JOB_WAIT_MS) {
          await sleep(untilReset);
          this.invalidate(); // fresh fetch after the wait
          continue;
        }
        throw new ExternalServiceError(
          '69labs',
          `credit budget exhausted (${this.kind}); window resets at ${credits.resetsAt ?? 'unknown'}`,
          { retryable: true },
        );
      }
    } finally {
      unlock();
    }
  }

  /** Get a fresh-enough credits snapshot, re-fetching past the TTL. */
  private async getCredits(): Promise<ProviderCredits> {
    const now = Date.now();
    if (this.snapshot && now - this.snapshot.fetchedAt < SNAPSHOT_TTL_MS) {
      return this.snapshot.credits;
    }
    const credits = await this.client.getCredits(this.kind);
    this.snapshot = { credits, fetchedAt: now };
    // A fresh snapshot already reflects real `used`, so drop stale local
    // reservations — they've either landed (counted in `used`) or were released.
    this.reserved = 0;
    return credits;
  }

  private invalidate(): void {
    this.snapshot = null;
    this.reserved = 0;
  }

  /**
   * Milliseconds until the window resets (+ a small slack so we act just after
   * the boundary). If `resetsAt` is missing/unparseable, return a value ABOVE
   * the in-job wait threshold so the caller frees the slot and reschedules
   * rather than blocking on an unknown window.
   */
  private msUntilReset(credits: ProviderCredits): number {
    if (!credits.resetsAt) return MAX_IN_JOB_WAIT_MS + 1;
    const resetMs = Date.parse(credits.resetsAt);
    if (Number.isNaN(resetMs)) return MAX_IN_JOB_WAIT_MS + 1;
    const untilReset = resetMs - Date.now() + RESET_SLACK_MS;
    return untilReset <= 0 ? RESET_SLACK_MS : untilReset; // past boundary -> re-check now
  }
}

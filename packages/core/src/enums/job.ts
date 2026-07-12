/**
 * Queue + job taxonomy. Each queue maps to exactly one worker processor.
 * Fan-out stages (video/image generation, downloads) enqueue one job per scene;
 * the rest are one job per project.
 */
export const QueueName = {
  TRANSCRIPTION: 'transcription',
  SCRIPT_ANALYSIS: 'script-analysis',
  PROMPT_GENERATION: 'prompt-generation',
  VIDEO_GENERATION: 'video-generation',
  IMAGE_GENERATION: 'image-generation',
  DOWNLOAD_ASSETS: 'download-assets',
  RENDERING: 'rendering',
  THUMBNAIL: 'thumbnail',
} as const;

export type QueueName = (typeof QueueName)[keyof typeof QueueName];

export const QUEUE_NAMES = Object.values(QueueName) as QueueName[];

/**
 * Persisted job status, mirrored in the `jobs` table so a worker restart can
 * reconcile "what did I already do" against the DB rather than Redis alone.
 */
export const JobStatus = {
  QUEUED: 'queued',
  ACTIVE: 'active',
  WAITING_EXTERNAL: 'waiting_external', // submitted to 69Labs/etc, polling
  COMPLETED: 'completed',
  FAILED: 'failed',
  DEAD_LETTER: 'dead_letter',
  CANCELLED: 'cancelled',
} as const;

export type JobStatus = (typeof JobStatus)[keyof typeof JobStatus];

/**
 * Default BullMQ retry policy per queue. Generation stages get more attempts.
 *
 * VIDEO/IMAGE_GENERATION use 10 attempts on exponential backoff so a job that
 * throws "credit budget exhausted" when the window reset is far off (the credit
 * throttle only waits in-job for imminent resets — see CreditThrottle) keeps
 * retrying across the FULL reset window instead of dying in ~8 minutes. With
 * base 15s, attempt N waits ~15s·2^(N-1); by attempt ~9-10 the gaps exceed an
 * hour, so the retries span a video credit window (which resets hourly). The
 * throttle frees the worker slot between these attempts, so waiting jobs don't
 * starve the queue.
 */
export const QUEUE_RETRY_POLICY: Record<
  QueueName,
  { attempts: number; backoffMs: number }
> = {
  [QueueName.TRANSCRIPTION]: { attempts: 4, backoffMs: 5_000 },
  [QueueName.SCRIPT_ANALYSIS]: { attempts: 4, backoffMs: 5_000 },
  [QueueName.PROMPT_GENERATION]: { attempts: 4, backoffMs: 5_000 },
  [QueueName.VIDEO_GENERATION]: { attempts: 10, backoffMs: 15_000 },
  [QueueName.IMAGE_GENERATION]: { attempts: 10, backoffMs: 10_000 },
  [QueueName.DOWNLOAD_ASSETS]: { attempts: 3, backoffMs: 5_000 },
  [QueueName.RENDERING]: { attempts: 3, backoffMs: 20_000 },
  [QueueName.THUMBNAIL]: { attempts: 3, backoffMs: 10_000 },
};

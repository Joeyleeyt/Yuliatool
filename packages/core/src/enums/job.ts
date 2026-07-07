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

/** Default BullMQ retry policy per queue. Generation stages get more attempts. */
export const QUEUE_RETRY_POLICY: Record<
  QueueName,
  { attempts: number; backoffMs: number }
> = {
  [QueueName.TRANSCRIPTION]: { attempts: 4, backoffMs: 5_000 },
  [QueueName.SCRIPT_ANALYSIS]: { attempts: 4, backoffMs: 5_000 },
  [QueueName.PROMPT_GENERATION]: { attempts: 4, backoffMs: 5_000 },
  [QueueName.VIDEO_GENERATION]: { attempts: 6, backoffMs: 15_000 },
  [QueueName.IMAGE_GENERATION]: { attempts: 6, backoffMs: 10_000 },
  [QueueName.DOWNLOAD_ASSETS]: { attempts: 5, backoffMs: 5_000 },
  [QueueName.RENDERING]: { attempts: 3, backoffMs: 20_000 },
  [QueueName.THUMBNAIL]: { attempts: 3, backoffMs: 10_000 },
};

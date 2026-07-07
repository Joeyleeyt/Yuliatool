import { randomUUID } from 'node:crypto';
import type { QueueName } from '../enums/job.js';

/**
 * Deterministic idempotency key for a queue job. Re-enqueuing the same logical
 * unit of work (after a crash/restart) yields the same key, so BullMQ dedupes
 * and we never pay for a duplicate generation.
 */
export function jobIdempotencyKey(
  projectId: string,
  queue: QueueName,
  sceneId?: string | null,
): string {
  return `${projectId}:${queue}:${sceneId ?? 'project'}`;
}

/** Opaque token for temp R2 objects / one-off keys. */
export function randomToken(): string {
  return randomUUID();
}

/** Extract a file extension (lowercased, no dot) from a filename, if any. */
export function fileExtension(filename: string): string | null {
  const idx = filename.lastIndexOf('.');
  if (idx <= 0 || idx === filename.length - 1) return null;
  return filename.slice(idx + 1).toLowerCase();
}

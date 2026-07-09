import type { Job } from 'bullmq';
import { QUEUE_NAMES, type QueueName } from '@yulia/core';
import { getQueue } from './queues.js';

/**
 * Job states we scan when purging. We deliberately include `active`: a job mid-run
 * can't be force-removed (BullMQ throws while it's locked), so those are handled
 * best-effort — but a project delete must not leave *pending* work behind. The
 * terminal-but-retained sets (`completed`) are skipped: they hold no future work
 * and are trimmed by `removeOnComplete`.
 */
const PURGE_STATES = ['waiting', 'delayed', 'prioritized', 'active', 'failed'] as const;

export interface PurgeResult {
  removed: number;
  skipped: number;
}

/**
 * Remove every queued/retrying job belonging to a project across all queues.
 *
 * Matches on the job payload's `projectId` (every queue payload carries one), so
 * it catches fan-out per-scene jobs without needing to know their scene ids.
 * Called when a project is deleted so its jobs don't keep running against rows
 * that no longer exist (which otherwise 404 on every retry and pollute workers).
 *
 * Best-effort by contract: individual removal failures (e.g. a job that just
 * became locked/active) are counted as `skipped`, never thrown, so a transient
 * queue issue can't block the authoritative DB+storage deletion.
 */
export async function purgeProject(projectId: string): Promise<PurgeResult> {
  let removed = 0;
  let skipped = 0;

  await Promise.all(
    QUEUE_NAMES.map(async (name: QueueName) => {
      const queue = getQueue(name);
      // getJobs with an explicit state list; 0..-1 = all. BullMQ paginates
      // internally per state.
      const jobs = await queue.getJobs([...PURGE_STATES], 0, -1);
      const mine = jobs.filter(
        (job): job is Job =>
          !!job && (job.data as { projectId?: string } | undefined)?.projectId === projectId,
      );
      for (const job of mine) {
        try {
          await job.remove();
          removed += 1;
        } catch {
          // Job is locked/active or already gone — leave it; the handler's own
          // "project not found" guard turns it into a terminal no-op next tick.
          skipped += 1;
        }
      }
    }),
  );

  return { removed, skipped };
}

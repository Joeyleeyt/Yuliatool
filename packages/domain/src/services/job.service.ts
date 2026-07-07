import { QUEUE_RETRY_POLICY, jobIdempotencyKey, type QueueName } from '@yulia/core';
import { enqueue, enqueueDeadLetter, type QueuePayloadMap } from '@yulia/queue';
import type { JobRepository, JobRow, Json } from '@yulia/db';

export interface DispatchTarget {
  projectId: string;
  sceneId?: string | null;
}

/**
 * Bridges the durable DB ledger and BullMQ. `dispatch` is the single entry
 * point producers use; the ledger-lifecycle methods are driven by the worker's
 * `defineProcessor` wrapper.
 */
export class JobService {
  constructor(private readonly jobs: JobRepository) {}

  /**
   * Idempotently enqueue a stage. If the ledger says this exact unit already
   * completed, we skip re-enqueue entirely (no duplicate paid work).
   */
  async dispatch<Q extends QueueName>(
    queue: Q,
    payload: QueuePayloadMap[Q],
    target: DispatchTarget,
    opts: { force?: boolean } = {},
  ): Promise<JobRow> {
    const key = jobIdempotencyKey(target.projectId, queue, target.sceneId);
    const existing = await this.jobs.findByKey(key);
    // Skip a genuinely-completed unit unless forced (retry/recovery).
    if (existing && existing.status === 'completed' && !opts.force) return existing;

    const row = await this.jobs.create({
      projectId: target.projectId,
      sceneId: target.sceneId ?? null,
      queue,
      idempotencyKey: key,
      payload: payload as unknown as Json,
      maxAttempts: QUEUE_RETRY_POLICY[queue].attempts,
    });
    await enqueue(queue, payload, { jobId: key, ...(opts.force ? { force: true } : {}) });
    return row;
  }

  // --- ledger lifecycle (called by the worker wrapper) ---------------------

  markActive(key: string, bullJobId: string | null): Promise<void> {
    return this.jobs.markActive(key, bullJobId);
  }

  markCompleted(key: string): Promise<void> {
    return this.jobs.markCompleted(key);
  }

  recordFailure(key: string, error: Json, isFinal: boolean): Promise<void> {
    return this.jobs.recordFailure(key, error, isFinal);
  }

  async deadLetter(
    queue: QueueName,
    key: string,
    data: unknown,
    reason: string,
    failedAtIso: string,
  ): Promise<void> {
    await this.jobs.markDeadLetter(key);
    await enqueueDeadLetter(queue, key, data, reason, failedAtIso);
  }
}

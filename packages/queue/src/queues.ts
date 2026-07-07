import { Queue, type JobsOptions } from 'bullmq';
import { QueueName, QUEUE_RETRY_POLICY } from '@yulia/core';
import { getProducerConnection } from './connection.js';
import { PAYLOAD_SCHEMAS, type QueuePayloadMap } from './payloads.js';

const registry = new Map<QueueName, Queue>();

export function getQueue(name: QueueName): Queue {
  let queue = registry.get(name);
  if (!queue) {
    queue = new Queue(name, {
      connection: getProducerConnection(),
      defaultJobOptions: {
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 },
      },
    });
    registry.set(name, queue);
  }
  return queue;
}

export interface EnqueueOptions {
  /** Deterministic id for idempotent dedupe (defaults set by the caller/domain). */
  jobId?: string;
  delayMs?: number;
  /**
   * Evict any existing job with this id before adding. Needed for retry/recovery:
   * BullMQ ignores a re-add whose id still sits in the retained completed/failed
   * set, so a plain re-dispatch of a failed job would be a silent no-op.
   */
  force?: boolean;
}

/**
 * Validate + enqueue a job. Retry/backoff come from the central policy so the
 * producer never has to know them. Passing a stable `jobId` makes re-enqueue a
 * no-op while the job exists.
 */
export async function enqueue<Q extends QueueName>(
  name: Q,
  data: QueuePayloadMap[Q],
  opts: EnqueueOptions = {},
): Promise<string> {
  const parsed = PAYLOAD_SCHEMAS[name].parse(data);
  const policy = QUEUE_RETRY_POLICY[name];

  if (opts.force && opts.jobId) {
    // Best-effort eviction; ignore "job not found" / locked errors.
    await getQueue(name)
      .remove(opts.jobId)
      .catch(() => undefined);
  }

  const jobOptions: JobsOptions = {
    attempts: policy.attempts,
    backoff: { type: 'exponential', delay: policy.backoffMs },
    ...(opts.jobId ? { jobId: opts.jobId } : {}),
    ...(opts.delayMs ? { delay: opts.delayMs } : {}),
  };

  const job = await getQueue(name).add(name, parsed, jobOptions);
  return job.id ?? (opts.jobId ?? '');
}

/** Close all producer queues (graceful shutdown). */
export async function closeQueues(): Promise<void> {
  await Promise.all([...registry.values()].map((q) => q.close()));
  registry.clear();
}

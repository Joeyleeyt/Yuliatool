import { Worker, type Processor, type WorkerOptions } from 'bullmq';
import type { Redis } from 'ioredis';
import { env, type QueueName } from '@yulia/core';

/**
 * Create a BullMQ Worker for a queue. Concurrency defaults to WORKER_CONCURRENCY.
 * The worker must be given its own Redis connection (BullMQ requirement).
 */
export function createQueueWorker(
  name: QueueName,
  processor: Processor,
  connection: Redis,
  opts: Partial<WorkerOptions> = {},
): Worker {
  return new Worker(name, processor, {
    connection,
    concurrency: env.WORKER_CONCURRENCY,
    // Cap stalled-job re-processing; combined with idempotent handlers this is safe.
    maxStalledCount: 2,
    ...opts,
  });
}

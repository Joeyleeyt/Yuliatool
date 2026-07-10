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
    // How long an idle worker BLOCKS on Redis (brpoplpush) waiting for a job
    // before re-polling. BullMQ's default (5s) means 7 queues × N machines each
    // re-issue the moveToActive script every few seconds around the clock, which
    // burns Redis commands fast on metered plans (Upstash's per-command cap).
    // A waiting worker is still woken IMMEDIATELY when a job is enqueued (the
    // block returns), so raising this only reduces EMPTY-queue polling — no
    // latency cost when work is flowing. 30s cuts idle command volume ~6×.
    drainDelay: env.WORKER_DRAIN_DELAY_SEC,
    ...opts,
  });
}

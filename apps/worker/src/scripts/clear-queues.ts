/**
 * Wipe ALL BullMQ queue state from Redis — every waiting/active/delayed/failed/
 * completed job across all queues, plus each queue's meta/marker keys. Uses
 * BullMQ's own `Queue.obliterate()` (scans and removes the queue's `bull:*` keys
 * correctly) rather than a raw `DEL bull:*`.
 *
 * WARNING: this is destructive. Any project mid-pipeline loses its queued work
 * and will sit at its current DB status with no job to advance it. Recover such
 * a project afterwards with the recover-project script (generation/download are
 * idempotent, so already-produced assets are reused, not regenerated):
 *   pnpm --filter @yulia/worker recover -- <projectId>
 *
 * Does NOT touch cache or rate-limiter keys — only `bull:*`.
 *
 * Usage (from repo root):
 *   tsx --env-file=.env apps/worker/src/scripts/clear-queues.ts
 * Add --force on a single queue name to clear just one:
 *   tsx --env-file=.env apps/worker/src/scripts/clear-queues.ts transcription
 *
 * Stop the worker first (or restart it after) so it doesn't hold stale in-memory
 * job references — obliterate throws if a job is currently locked/active.
 */
import { createLogger, QUEUE_NAMES, type QueueName } from '@yulia/core';
import { getQueue, closeQueues } from '@yulia/queue';
import { closeRedis } from '@yulia/services';

const log = createLogger({ component: 'clear-queues' });

async function main(): Promise<void> {
  const only = process.argv[2] as QueueName | undefined;
  const targets: QueueName[] = only ? [only] : [...QUEUE_NAMES];

  if (only && !QUEUE_NAMES.includes(only)) {
    log.error({ only, valid: QUEUE_NAMES }, 'unknown queue name');
    process.exitCode = 1;
    return;
  }

  try {
    for (const name of targets) {
      const queue = getQueue(name);
      // force:true removes even jobs that look active — we're doing a full wipe.
      await queue.obliterate({ force: true });
      log.info({ queue: name }, 'queue obliterated');
    }
    log.info({ queues: targets }, 'done — restart the worker so it reconciles clean state');
  } finally {
    await closeQueues();
    await closeRedis();
  }
}

main().catch((err) => {
  log.error({ err }, 'clear-queues failed');
  process.exit(1);
});

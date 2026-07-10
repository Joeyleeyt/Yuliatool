/**
 * Un-wedge a project whose jobs failed permanently (all retries exhausted, so
 * BullMQ won't retry on its own). Re-plans from persisted state and force-
 * re-dispatches only the OUTSTANDING work — every scene not yet `stored`.
 *
 * Already-generated assets are REUSED (generation + download are idempotent and
 * skip layers that are already stored/generated), so this costs no regeneration.
 * With the download-assets fix in place, a video-only scene (or a product scene
 * whose overlay couldn't be produced) now completes full-frame instead of
 * looping on a missing overlay.
 *
 * Usage (from repo root):
 *   pnpm --filter @yulia/worker recover -- <projectId>
 * or directly:
 *   tsx --env-file=.env apps/worker/src/scripts/recover-project.ts <projectId>
 *
 * The worker does NOT need to be running for this to enqueue the work, but a
 * worker must be running (or started afterwards) to actually process it.
 */
import { createLogger } from '@yulia/core';
import { closeDb } from '@yulia/db';
import { closeRedis } from '@yulia/services';
import { closeQueues } from '@yulia/queue';
import { createAppContext, RecoveryService } from '@yulia/domain';

const log = createLogger({ component: 'recover-project' });

async function main(): Promise<void> {
  const projectId = process.argv[2];
  if (!projectId) {
    log.error('missing projectId. usage: recover-project <projectId>');
    process.exitCode = 1;
    return;
  }

  const ctx = createAppContext();
  try {
    const status = await new RecoveryService(ctx).resume(projectId);
    log.info({ projectId, status }, 'project recovery dispatched — start/keep the worker running to process it');
  } finally {
    await closeQueues();
    await closeRedis();
    await closeDb();
  }
}

main().catch((err) => {
  log.error({ err }, 'recovery failed');
  process.exit(1);
});

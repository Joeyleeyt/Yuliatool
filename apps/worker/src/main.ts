import { createLogger } from '@yulia/core';
import { closeDb } from '@yulia/db';
import { closeRedis } from '@yulia/services';
import { createBullConnection, closeQueues } from '@yulia/queue';
import { createAppContext, RecoveryService } from '@yulia/domain';
import { startHealthServer } from './health.js';
import { registerProcessors } from './register.js';

/**
 * Worker entrypoint. Boots the health server, wires the domain context, and
 * registers all queue processors. SIGTERM (Fly deploy/restart) triggers a
 * graceful drain: stop accepting work, let in-flight jobs finish, close
 * connections. Combined with idempotent, DB-authoritative processors, this
 * makes the pipeline resumable across restarts.
 */
const log = createLogger({ component: 'worker' });

async function main(): Promise<void> {
  // BUILD_DATE is stamped at image build time (see worker.Dockerfile +
  // worker.fly.toml [build.args]). Falls back to a static date for local dev.
  console.log(`Worker version: ${process.env.BUILD_DATE ?? '2026-07-09'}`);

  const health = startHealthServer(Number(process.env.PORT ?? 8080));
  const ctx = createAppContext();
  const connection = createBullConnection();
  const workers = registerProcessors(connection, ctx);

  log.info({ queues: workers.length }, 'worker booted; processors registered');

  // Crash/restart recovery: re-dispatch outstanding work for any active project.
  void new RecoveryService(ctx)
    .reconcileActive()
    .catch((err: unknown) => log.error({ err }, 'boot recovery failed'));

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info({ signal }, 'graceful shutdown started');
    health.close();
    await Promise.allSettled(workers.map((w) => w.close()));
    await closeQueues();
    await connection.quit().catch(() => undefined);
    await closeRedis();
    await closeDb();
    log.info('shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  // Safety net: a stray rejection from a fire-and-forget call (e.g. a background
  // progress write during a DB blip) must not crash the worker and abort every
  // in-flight job. Log it; BullMQ still owns per-job failure/retry. An
  // uncaughtException is more serious — log and drain rather than die abruptly.
  process.on('unhandledRejection', (reason) => {
    log.error({ err: reason }, 'unhandled promise rejection (ignored; worker stays up)');
  });
  process.on('uncaughtException', (err) => {
    log.error({ err }, 'uncaught exception; draining');
    void shutdown('uncaughtException');
  });
}

main().catch((err) => {
  log.error({ err }, 'worker failed to boot');
  process.exit(1);
});

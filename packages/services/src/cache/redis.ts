import { Redis, type RedisOptions } from 'ioredis';
import { env, logger } from '@yulia/core';

/**
 * Shared ioredis connection factory.
 *
 * Two flavors:
 *  - `getRedis()`  — general connection for caching / rate limiting (reused).
 *  - `createBullConnection()` — a *fresh* connection for BullMQ, which requires
 *    `maxRetriesPerRequest: null` and its own connection per Worker/Queue.
 *
 * The cache connection is configured to **fail fast** when Redis is unreachable
 * (no offline queue, bounded retries) so requests don't hang; combined with the
 * fail-soft cache/limiter, the app stays usable without Redis (queue/pipeline
 * features still require it).
 */
let shared: Redis | null = null;

function baseOptions(): RedisOptions {
  const isTls = env.REDIS_URL.startsWith('rediss://');
  return {
    lazyConnect: false,
    enableAutoPipelining: true,
    connectTimeout: 5000,
    ...(isTls ? { tls: {} } : {}),
  };
}

export function getRedis(): Redis {
  if (!shared) {
    shared = new Redis(env.REDIS_URL, {
      ...baseOptions(),
      // Commands reject immediately when disconnected instead of queueing/hanging.
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      retryStrategy: (times) => Math.min(times * 500, 5000),
    });
    attachErrorLogger(shared, 'cache');
  }
  return shared;
}

/**
 * Attach a throttled error handler so a down Redis doesn't spam the console with
 * "[ioredis] Unhandled error event" and doesn't crash the process.
 */
function attachErrorLogger(client: Redis, label: string): void {
  let warned = false;
  client.on('error', (err: Error) => {
    if (!warned) {
      warned = true;
      logger.warn({ err: err.message, label }, 'Redis unavailable — degrading gracefully');
    }
  });
  client.on('ready', () => {
    warned = false;
  });
}

/** BullMQ needs a dedicated connection with retries disabled. */
export function createBullConnection(): Redis {
  const client = new Redis(env.REDIS_URL, {
    ...baseOptions(),
    maxRetriesPerRequest: null,
  });
  attachErrorLogger(client, 'bull');
  return client;
}

export async function closeRedis(): Promise<void> {
  if (shared) {
    await shared.quit();
    shared = null;
  }
}

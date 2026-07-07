import { Redis, type RedisOptions } from 'ioredis';
import { env } from '@yulia/core';

/**
 * Shared ioredis connection factory.
 *
 * Two flavors:
 *  - `getRedis()`  — general connection for caching / rate limiting (reused).
 *  - `createBullConnection()` — a *fresh* connection for BullMQ, which requires
 *    `maxRetriesPerRequest: null` and its own connection per Worker/Queue.
 */
let shared: Redis | null = null;

function baseOptions(): RedisOptions {
  const isTls = env.REDIS_URL.startsWith('rediss://');
  return {
    lazyConnect: false,
    enableAutoPipelining: true,
    ...(isTls ? { tls: {} } : {}),
  };
}

export function getRedis(): Redis {
  if (!shared) {
    shared = new Redis(env.REDIS_URL, baseOptions());
  }
  return shared;
}

/** BullMQ needs a dedicated connection with retries disabled. */
export function createBullConnection(): Redis {
  return new Redis(env.REDIS_URL, {
    ...baseOptions(),
    maxRetriesPerRequest: null,
  });
}

export async function closeRedis(): Promise<void> {
  if (shared) {
    await shared.quit();
    shared = null;
  }
}

import type { Redis } from 'ioredis';
import { createBullConnection } from '@yulia/services';

/**
 * Shared Redis connection for queue *producers* (Queue instances can share one).
 * Workers must each own a connection — use `createBullConnection()` directly in
 * the worker process for that.
 */
let producerConnection: Redis | null = null;

export function getProducerConnection(): Redis {
  if (!producerConnection) producerConnection = createBullConnection();
  return producerConnection;
}

export { createBullConnection };

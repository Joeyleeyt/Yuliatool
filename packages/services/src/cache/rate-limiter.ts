import type { Redis } from 'ioredis';
import { getRedis } from './redis.js';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetSec: number;
}

/**
 * Fixed-window rate limiter backed by Redis INCR + EXPIRE (atomic via Lua).
 * Keyed by an arbitrary identifier (e.g. `user:<id>:projects:create`).
 */
export class RateLimiter {
  constructor(private readonly redis: Redis = getRedis()) {}

  private static readonly LUA = `
    local current = redis.call('INCR', KEYS[1])
    if current == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
    local ttl = redis.call('TTL', KEYS[1])
    return {current, ttl}
  `;

  async check(identifier: string, limit: number, windowSec: number): Promise<RateLimitResult> {
    const key = `ratelimit:${identifier}`;
    const [current, ttl] = (await this.redis.eval(
      RateLimiter.LUA,
      1,
      key,
      String(windowSec),
    )) as [number, number];

    const remaining = Math.max(0, limit - current);
    return {
      allowed: current <= limit,
      remaining,
      limit,
      resetSec: ttl < 0 ? windowSec : ttl,
    };
  }
}

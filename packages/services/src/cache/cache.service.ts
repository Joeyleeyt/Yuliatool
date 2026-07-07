import { randomToken } from '@yulia/core';
import type { Redis } from 'ioredis';
import { getRedis } from './redis.js';

export interface CacheService {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSec?: number): Promise<void>;
  del(key: string): Promise<void>;
  /** Cache-aside: return cached value or compute, store, and return it. */
  remember<T>(key: string, ttlSec: number, fn: () => Promise<T>): Promise<T>;
  /** Best-effort distributed lock (SET NX PX). Returns fn's result. */
  withLock<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T>;
}

const KEY_PREFIX = 'cache:';
const LOCK_PREFIX = 'lock:';

export class RedisCache implements CacheService {
  constructor(private readonly redis: Redis = getRedis()) {}

  async get<T>(key: string): Promise<T | null> {
    const raw = await this.redis.get(KEY_PREFIX + key);
    return raw === null ? null : (JSON.parse(raw) as T);
  }

  async set<T>(key: string, value: T, ttlSec?: number): Promise<void> {
    const payload = JSON.stringify(value);
    if (ttlSec && ttlSec > 0) {
      await this.redis.set(KEY_PREFIX + key, payload, 'EX', ttlSec);
    } else {
      await this.redis.set(KEY_PREFIX + key, payload);
    }
  }

  async del(key: string): Promise<void> {
    await this.redis.del(KEY_PREFIX + key);
  }

  async remember<T>(key: string, ttlSec: number, fn: () => Promise<T>): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;
    const value = await fn();
    await this.set(key, value, ttlSec);
    return value;
  }

  async withLock<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
    const lockKey = LOCK_PREFIX + key;
    const token = randomToken();
    const acquired = await this.redis.set(lockKey, token, 'PX', ttlMs, 'NX');
    if (acquired !== 'OK') {
      throw new Error(`Could not acquire lock: ${key}`);
    }
    try {
      return await fn();
    } finally {
      // Release only if we still own the lock (compare-and-delete).
      const releaseLua =
        "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";
      await this.redis.eval(releaseLua, 1, lockKey, token);
    }
  }
}

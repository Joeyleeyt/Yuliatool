import { logger, type Logger } from '@yulia/core';
import { getDb, createRepositories, type Repositories, type Sql } from '@yulia/db';
import {
  R2StorageService,
  RedisCache,
  RateLimiter,
  type StorageService,
  type CacheService,
} from '@yulia/services';
import { JobService } from './services/job.service.js';

/**
 * Dependency container passed to every application service.
 *
 * `createAppContext()` builds the production wiring from env singletons.
 * Tests pass `overrides` to inject in-memory fakes for any dependency.
 */
export interface AppContext {
  sql: Sql;
  repos: Repositories;
  storage: StorageService;
  cache: CacheService;
  rateLimiter: RateLimiter;
  jobs: JobService;
  logger: Logger;
}

export function createAppContext(overrides: Partial<AppContext> = {}): AppContext {
  const sql = overrides.sql ?? getDb();
  const repos = overrides.repos ?? createRepositories(sql);
  return {
    sql,
    repos,
    storage: overrides.storage ?? new R2StorageService(),
    cache: overrides.cache ?? new RedisCache(),
    rateLimiter: overrides.rateLimiter ?? new RateLimiter(),
    jobs: overrides.jobs ?? new JobService(repos.jobs),
    logger: overrides.logger ?? logger,
  };
}

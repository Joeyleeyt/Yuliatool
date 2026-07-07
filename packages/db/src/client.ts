import postgres from 'postgres';
import { env } from '@yulia/core';

/**
 * Single shared Postgres connection pool (postgres.js).
 *
 * The repository layer receives this `Sql` instance via DI. Server actions and
 * workers import the singleton; tests can construct an isolated pool against a
 * test database. postgres.js gives us tagged-template parameterization (no
 * string concatenation => no SQL injection) and transaction helpers.
 */
export type Sql = postgres.Sql;

let pool: Sql | null = null;

export function getDb(): Sql {
  if (!pool) {
    const dbUrl = env.DATABASE_URL;
    // Supabase's transaction pooler (pgBouncer, :6543) cannot use prepared
    // statements; the session pooler / direct connection can.
    const isPooler = /pooler\.supabase\.com|pgbouncer=true|:6543(\b|\/)/.test(dbUrl);
    const isLocal = /@(localhost|127\.0\.0\.1)/.test(dbUrl);
    pool = postgres(dbUrl, {
      max: env.NODE_ENV === 'production' ? 20 : 5,
      idle_timeout: 30,
      connect_timeout: 15,
      prepare: !isPooler,
      ssl: isLocal ? false : { rejectUnauthorized: false },
      transform: { undefined: null },
    });
  }
  return pool;
}

/** Explicitly close the pool (graceful worker shutdown). */
export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end({ timeout: 5 });
    pool = null;
  }
}

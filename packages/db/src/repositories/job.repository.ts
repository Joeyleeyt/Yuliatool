import type { JobStatus, QueueName } from '@yulia/core';
import type { Sql } from '../client.js';
import type { JobRow, Json } from '../types/index.js';

export interface CreateJobData {
  projectId: string;
  sceneId?: string | null;
  queue: QueueName;
  idempotencyKey: string;
  payload: Json;
  maxAttempts: number;
}

/**
 * DB-authoritative job ledger. Mirrors BullMQ so a worker restart can reconcile
 * "what did I already do" from Postgres. Keyed by the deterministic
 * `idempotency_key` (also used as the BullMQ jobId).
 */
export class JobRepository {
  constructor(private readonly sql: Sql) {}

  async findByKey(key: string): Promise<JobRow | null> {
    const rows = await this.sql<JobRow[]>`
      select * from jobs where idempotency_key = ${key} limit 1`;
    return rows[0] ?? null;
  }

  async create(data: CreateJobData): Promise<JobRow> {
    const rows = await this.sql<JobRow[]>`
      insert into jobs (project_id, scene_id, queue, idempotency_key, status, max_attempts, payload)
      values (
        ${data.projectId}, ${data.sceneId ?? null}, ${data.queue}, ${data.idempotencyKey},
        'queued', ${data.maxAttempts}, ${this.sql.json(data.payload as never)}
      )
      on conflict (idempotency_key) do update set
        status = 'queued', updated_at = now()
      returning *`;
    return rows[0]!;
  }

  async markActive(key: string, bullJobId: string | null): Promise<void> {
    await this.sql`
      update jobs set status = 'active', bull_job_id = ${bullJobId},
        started_at = coalesce(started_at, now())
      where idempotency_key = ${key}`;
  }

  async markCompleted(key: string, result?: Json): Promise<void> {
    await this.sql`
      update jobs set status = 'completed', result = ${this.sql.json((result ?? null) as never)},
        finished_at = now()
      where idempotency_key = ${key}`;
  }

  /** Record a failed attempt; status becomes 'failed' when final, else 'queued' (awaiting retry). */
  async recordFailure(key: string, error: Json, isFinal: boolean): Promise<void> {
    const status: JobStatus = isFinal ? 'failed' : 'queued';
    await this.sql`
      update jobs set
        status = ${status},
        attempts = attempts + 1,
        error = ${this.sql.json(error as never)},
        finished_at = ${isFinal ? this.sql`now()` : this.sql`finished_at`}
      where idempotency_key = ${key}`;
  }

  async markDeadLetter(key: string): Promise<void> {
    await this.sql`update jobs set status = 'dead_letter', finished_at = now() where idempotency_key = ${key}`;
  }
}

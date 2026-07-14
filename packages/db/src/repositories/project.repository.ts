import { ProjectStatus, ACTIVE_PROJECT_STATUSES } from '@yulia/core';
import type { RenderFormat } from '@yulia/core';
import type { Sql } from '../client.js';
import type { ProjectRow } from '../types/index.js';
import { BaseRepository } from './base.repository.js';

/**
 * Fixed key for the global project-queue advisory lock. Admission and promotion
 * both take `pg_advisory_xact_lock(PROJECT_QUEUE_LOCK)` so the "is a slot free?"
 * check-and-set is serialized across all workers/web processes.
 */
const PROJECT_QUEUE_LOCK = 826140;

export interface CreateProjectData {
  ownerId: string;
  title: string;
  description?: string | null;
  renderFormat: RenderFormat;
}

export interface UpdateProjectData {
  title?: string;
  description?: string | null;
  renderFormat?: RenderFormat;
}

export interface StatusUpdate {
  status: ProjectStatus;
  errorCode?: string | null;
  errorMessage?: string | null;
  failedAt?: string | null;
}

export interface ListParams {
  ownerId: string;
  status?: string;
  search?: string;
  limit: number;
  offset: number;
}

export class ProjectRepository extends BaseRepository<ProjectRow> {
  constructor(sql: Sql) {
    super(sql, 'projects');
  }

  async create(data: CreateProjectData): Promise<ProjectRow> {
    const rows = await this.sql<ProjectRow[]>`
      insert into projects (owner_id, title, description, render_format)
      values (${data.ownerId}, ${data.title}, ${data.description ?? null}, ${data.renderFormat})
      returning *`;
    return rows[0]!;
  }

  async findByIdForOwner(id: string, ownerId: string): Promise<ProjectRow | null> {
    const rows = await this.sql<ProjectRow[]>`
      select * from projects where id = ${id} and owner_id = ${ownerId} limit 1`;
    return rows[0] ?? null;
  }

  async list(params: ListParams): Promise<{ items: ProjectRow[]; total: number }> {
    const { ownerId, status, search, limit, offset } = params;
    const like = search ? `%${search}%` : null;

    const items = await this.sql<ProjectRow[]>`
      select * from projects
      where owner_id = ${ownerId}
      ${status ? this.sql`and status = ${status}` : this.sql``}
      ${like ? this.sql`and title ilike ${like}` : this.sql``}
      order by created_at desc
      limit ${limit} offset ${offset}`;

    const countRows = await this.sql<{ count: string }[]>`
      select count(*)::text as count from projects
      where owner_id = ${ownerId}
      ${status ? this.sql`and status = ${status}` : this.sql``}
      ${like ? this.sql`and title ilike ${like}` : this.sql``}`;

    return { items, total: Number(countRows[0]?.count ?? 0) };
  }

  async update(id: string, data: UpdateProjectData): Promise<ProjectRow | null> {
    const rows = await this.sql<ProjectRow[]>`
      update projects set
        title = coalesce(${data.title ?? null}, title),
        description = ${data.description === undefined ? this.sql`description` : data.description},
        render_format = coalesce(${data.renderFormat ?? null}, render_format)
      where id = ${id}
      returning *`;
    return rows[0] ?? null;
  }

  /** Persist a status transition + optional failure fields (validation is the domain layer's job). */
  async applyStatus(id: string, update: StatusUpdate): Promise<ProjectRow | null> {
    // Stamp completed_at when (and only when) the project reaches COMPLETED;
    // clear it on any other status so a retry that leaves COMPLETED resets the
    // duration. Uses the DB clock (now()) so the timestamp is authoritative.
    const isCompleted = update.status === ProjectStatus.COMPLETED;
    const rows = await this.sql<ProjectRow[]>`
      update projects set
        status = ${update.status},
        error_code = ${update.errorCode ?? null},
        error_message = ${update.errorMessage ?? null},
        failed_at = ${update.failedAt ?? null},
        completed_at = ${isCompleted ? this.sql`now()` : this.sql`null`}
      where id = ${id}
      returning *`;
    return rows[0] ?? null;
  }

  async setSceneTotals(id: string, totalScenes: number): Promise<void> {
    await this.sql`update projects set total_scenes = ${totalScenes} where id = ${id}`;
  }

  /** Active projects in the given statuses (recovery scan). */
  async listByStatuses(statuses: string[], limit = 500): Promise<ProjectRow[]> {
    return this.sql<ProjectRow[]>`
      select * from projects where status::text = any(${statuses})
      order by created_at asc limit ${limit}`;
  }

  /**
   * Global 1-by-1 queue — ADMISSION. Under a global advisory lock (so concurrent
   * uploads can't both start), atomically: if any production already occupies the
   * generation slot, park this project as `queued`; otherwise start it
   * (`transcribing`). Returns which happened; the caller dispatches transcription
   * only when 'started'. The lock + the promotion method below share one key, so
   * admission and promotion are serialized against each other.
   */
  async tryStartOrQueue(id: string): Promise<'started' | 'queued'> {
    return this.sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(${PROJECT_QUEUE_LOCK})`;
      const active = await tx<{ c: number }[]>`
        select count(*)::int as c from projects where status::text = any(${[...ACTIVE_PROJECT_STATUSES]})`;
      const busy = (active[0]?.c ?? 0) > 0;
      const next = busy ? ProjectStatus.QUEUED : ProjectStatus.TRANSCRIBING;
      await tx`
        update projects set status = ${next}, error_code = null, error_message = null, failed_at = null
        where id = ${id}`;
      return busy ? 'queued' : 'started';
    });
  }

  /**
   * Global 1-by-1 queue — PROMOTION. Under the same advisory lock: if the slot is
   * free, claim the OLDEST queued project, flip it to `transcribing`, and return
   * its id (the caller then resumes/dispatches it). Returns null if the slot is
   * busy or nothing is queued. Safe to call after every completion/failure and at
   * boot — it self-guards on the active-slot check.
   */
  async claimNextQueued(): Promise<string | null> {
    return this.sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(${PROJECT_QUEUE_LOCK})`;
      const active = await tx`
        select 1 from projects where status::text = any(${[...ACTIVE_PROJECT_STATUSES]}) limit 1`;
      if (active.length > 0) return null;
      const next = await tx<{ id: string }[]>`
        select id from projects where status = 'queued' order by created_at asc limit 1`;
      const id = next[0]?.id;
      if (!id) return null;
      await tx`
        update projects set status = ${ProjectStatus.TRANSCRIBING}, error_code = null, error_message = null, failed_at = null
        where id = ${id}`;
      return id;
    });
  }

  /** 1-based position of a queued project in the global queue (oldest = 1). */
  async queuePosition(id: string): Promise<number | null> {
    const rows = await this.sql<{ pos: number }[]>`
      select count(*)::int + 1 as pos from projects q
      where q.status = 'queued'
        and q.created_at < (select created_at from projects where id = ${id})`;
    return rows[0]?.pos ?? null;
  }

  /**
   * Race-safe fan-in: atomically flip VIDEO_GENERATION -> WAITING_ASSETS iff every
   * scene is stored. Exactly one concurrent download worker gets a returned row
   * (the last scene to commit); the rest get null. No locks needed.
   */
  async tryClaimAssetsComplete(id: string): Promise<ProjectRow | null> {
    const rows = await this.sql<ProjectRow[]>`
      update projects set status = 'waiting_assets'
      where id = ${id}
        and status = 'video_generation'
        and total_scenes > 0
        and completed_scenes >= total_scenes
      returning *`;
    return rows[0] ?? null;
  }
}

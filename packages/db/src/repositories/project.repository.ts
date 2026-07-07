import type { ProjectStatus, RenderFormat } from '@yulia/core';
import type { Sql } from '../client.js';
import type { ProjectRow } from '../types/index.js';
import { BaseRepository } from './base.repository.js';

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
    const rows = await this.sql<ProjectRow[]>`
      update projects set
        status = ${update.status},
        error_code = ${update.errorCode ?? null},
        error_message = ${update.errorMessage ?? null},
        failed_at = ${update.failedAt ?? null}
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

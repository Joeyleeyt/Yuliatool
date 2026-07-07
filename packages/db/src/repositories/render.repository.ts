import type { RenderFormat } from '@yulia/core';
import type { Sql } from '../client.js';
import type { RenderRow } from '../types/index.js';
import { BaseRepository } from './base.repository.js';

export type RenderStatus = RenderRow['status'];

export interface UpdateRenderData {
  status?: RenderStatus;
  progress?: number;
  assetId?: string | null;
  thumbnailAssetId?: string | null;
  durationSec?: number | null;
  fps?: number | null;
  errorMessage?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
}

export class RenderRepository extends BaseRepository<RenderRow> {
  constructor(sql: Sql) {
    super(sql, 'renders');
  }

  async create(data: { projectId: string; format: RenderFormat }): Promise<RenderRow> {
    const rows = await this.sql<RenderRow[]>`
      insert into renders (project_id, format, status)
      values (${data.projectId}, ${data.format}, 'pending')
      returning *`;
    return rows[0]!;
  }

  async findLatestByProject(projectId: string): Promise<RenderRow | null> {
    const rows = await this.sql<RenderRow[]>`
      select * from renders where project_id = ${projectId}
      order by created_at desc limit 1`;
    return rows[0] ?? null;
  }

  async update(id: string, data: UpdateRenderData): Promise<RenderRow | null> {
    const rows = await this.sql<RenderRow[]>`
      update renders set
        status = coalesce(${data.status ?? null}, status),
        progress = coalesce(${data.progress ?? null}, progress),
        asset_id = ${data.assetId === undefined ? this.sql`asset_id` : data.assetId},
        thumbnail_asset_id = ${
          data.thumbnailAssetId === undefined ? this.sql`thumbnail_asset_id` : data.thumbnailAssetId
        },
        duration_sec = coalesce(${data.durationSec ?? null}, duration_sec),
        fps = coalesce(${data.fps ?? null}, fps),
        error_message = ${data.errorMessage === undefined ? this.sql`error_message` : data.errorMessage},
        started_at = coalesce(${data.startedAt ?? null}, started_at),
        completed_at = coalesce(${data.completedAt ?? null}, completed_at)
      where id = ${id}
      returning *`;
    return rows[0] ?? null;
  }
}

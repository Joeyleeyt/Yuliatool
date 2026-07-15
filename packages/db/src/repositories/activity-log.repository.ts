import type { Sql } from '../client.js';
import type { ActivityLogRow, Json } from '../types/index.js';

export interface LogEntry {
  projectId?: string | null;
  actorId?: string | null;
  type: string;
  message?: string | null;
  data?: Json;
}

/** An activity entry enriched with the production it belongs to (cross-project feed). */
export interface OwnerActivityRow extends ActivityLogRow {
  projectTitle: string;
}

/** Append-only; no BaseRepository (no updates/deletes by design). */
export class ActivityLogRepository {
  constructor(private readonly sql: Sql) {}

  async log(entry: LogEntry): Promise<ActivityLogRow> {
    const rows = await this.sql<ActivityLogRow[]>`
      insert into activity_logs (project_id, actor_id, type, message, data)
      values (
        ${entry.projectId ?? null}, ${entry.actorId ?? null}, ${entry.type},
        ${entry.message ?? null}, ${this.sql.json((entry.data ?? {}) as never)}
      )
      returning *`;
    return rows[0]!;
  }

  async listByProject(projectId: string, limit = 50, offset = 0): Promise<ActivityLogRow[]> {
    return this.sql<ActivityLogRow[]>`
      select * from activity_logs
      where project_id = ${projectId}
      order by created_at desc
      limit ${limit} offset ${offset}`;
  }

  /** Cross-project feed for the dashboard — every event across the owner's productions. */
  async listByOwner(ownerId: string, limit = 50, offset = 0): Promise<OwnerActivityRow[]> {
    return this.sql<OwnerActivityRow[]>`
      select activity_logs.*, projects.title as "projectTitle"
      from activity_logs
      join projects on projects.id = activity_logs.project_id
      where projects.owner_id = ${ownerId}
      order by activity_logs.created_at desc
      limit ${limit} offset ${offset}`;
  }
}

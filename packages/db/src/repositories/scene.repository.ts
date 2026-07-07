import type { AssetStatus, SceneVisualType } from '@yulia/core';
import type { Sql } from '../client.js';
import type { SceneRow, Json } from '../types/index.js';

export interface NewScene {
  sceneIndex: number;
  visualType: SceneVisualType;
  startSec: number;
  endSec: number;
  durationSec: number;
  title: string;
  summary: string;
  narrationText: string;
  visualBrief: Json;
  continuityNotes: string;
}

export class SceneRepository {
  constructor(private readonly sql: Sql) {}

  async listByProject(projectId: string): Promise<SceneRow[]> {
    return this.sql<SceneRow[]>`
      select * from scenes where project_id = ${projectId} order by scene_index asc`;
  }

  async findById(id: string): Promise<SceneRow | null> {
    const rows = await this.sql<SceneRow[]>`select * from scenes where id = ${id} limit 1`;
    return rows[0] ?? null;
  }

  async updateStatus(id: string, status: AssetStatus): Promise<void> {
    await this.sql`update scenes set status = ${status} where id = ${id}`;
  }

  async countByProject(projectId: string): Promise<number> {
    const rows = await this.sql<{ count: string }[]>`
      select count(*)::text as count from scenes where project_id = ${projectId}`;
    return Number(rows[0]?.count ?? 0);
  }

  /**
   * Idempotently (re)create the full scene list for a project inside one
   * transaction: clear existing scenes, then insert the new set. `visual_brief`
   * is written as jsonb per-row.
   */
  async replaceForProject(projectId: string, scenes: NewScene[]): Promise<SceneRow[]> {
    return this.sql.begin(async (tx) => {
      await tx`delete from scenes where project_id = ${projectId}`;
      const inserted: SceneRow[] = [];
      for (const s of scenes) {
        const rows = await tx<SceneRow[]>`
          insert into scenes
            (project_id, scene_index, visual_type, start_sec, end_sec, duration_sec,
             title, summary, narration_text, visual_brief, continuity_notes)
          values (
            ${projectId}, ${s.sceneIndex}, ${s.visualType}, ${s.startSec}, ${s.endSec},
            ${s.durationSec}, ${s.title}, ${s.summary}, ${s.narrationText},
            ${tx.json(s.visualBrief as never)}, ${s.continuityNotes}
          )
          returning *`;
        inserted.push(rows[0]!);
      }
      return inserted;
    });
  }
}

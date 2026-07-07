import type { Sql } from '../client.js';
import type { AnalysisRow, Json } from '../types/index.js';
import { BaseRepository } from './base.repository.js';

export interface AnalysisData {
  model: string;
  summary: string;
  emotionalArc: Json;
  visualMotifs: Json;
  styleGuide: Json;
  promptStrategy: Json;
  continuityMemory: Json;
  raw?: Json | null;
}

export class AnalysisRepository extends BaseRepository<AnalysisRow> {
  constructor(sql: Sql) {
    super(sql, 'analyses');
  }

  async findByProject(projectId: string): Promise<AnalysisRow | null> {
    const rows = await this.sql<AnalysisRow[]>`
      select * from analyses where project_id = ${projectId} limit 1`;
    return rows[0] ?? null;
  }

  async upsertForProject(projectId: string, data: AnalysisData): Promise<AnalysisRow> {
    const rows = await this.sql<AnalysisRow[]>`
      insert into analyses
        (project_id, model, summary, emotional_arc, visual_motifs, style_guide,
         prompt_strategy, continuity_memory, raw)
      values (
        ${projectId}, ${data.model}, ${data.summary},
        ${this.sql.json(data.emotionalArc as never)},
        ${this.sql.json(data.visualMotifs as never)},
        ${this.sql.json(data.styleGuide as never)},
        ${this.sql.json(data.promptStrategy as never)},
        ${this.sql.json(data.continuityMemory as never)},
        ${this.sql.json((data.raw ?? null) as never)}
      )
      on conflict (project_id) do update set
        model = excluded.model,
        summary = excluded.summary,
        emotional_arc = excluded.emotional_arc,
        visual_motifs = excluded.visual_motifs,
        style_guide = excluded.style_guide,
        prompt_strategy = excluded.prompt_strategy,
        continuity_memory = excluded.continuity_memory,
        raw = excluded.raw,
        updated_at = now()
      returning *`;
    return rows[0]!;
  }
}

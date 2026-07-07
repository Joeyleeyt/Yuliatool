import type { Sql } from '../client.js';
import type { GenerationHistoryRow, Json } from '../types/index.js';

export interface RecordGenerationInput {
  projectId: string;
  sceneId?: string | null;
  assetId?: string | null;
  provider: 'sixtynine_labs' | 'openai' | 'deepgram';
  operation: string; // 'transcribe' | 'submit' | 'poll' | 'download' | 'analyze' ...
  externalId?: string | null;
  status: string;
  costUsd?: number | null;
  durationMs?: number | null;
  request?: Json | null;
  response?: Json | null;
  error?: Json | null;
}

export interface CostByProvider {
  provider: string;
  operations: number;
  costUsd: number;
}

/** Append-only audit of external generation calls (+ cost). No updates/deletes. */
export class GenerationHistoryRepository {
  constructor(private readonly sql: Sql) {}

  /** Cost + call-count rollup per provider for a project. */
  async costSummary(projectId: string): Promise<CostByProvider[]> {
    const rows = await this.sql<{ provider: string; ops: string; cost: string }[]>`
      select provider::text as provider, count(*)::text as ops,
             coalesce(sum(cost_usd), 0)::text as cost
      from generation_history
      where project_id = ${projectId}
      group by provider`;
    return rows.map((r) => ({
      provider: r.provider,
      operations: Number(r.ops),
      costUsd: Number(r.cost),
    }));
  }

  async record(input: RecordGenerationInput): Promise<GenerationHistoryRow> {
    const rows = await this.sql<GenerationHistoryRow[]>`
      insert into generation_history
        (project_id, scene_id, asset_id, provider, operation, external_id, status,
         cost_usd, duration_ms, request, response, error)
      values (
        ${input.projectId}, ${input.sceneId ?? null}, ${input.assetId ?? null},
        ${input.provider}, ${input.operation}, ${input.externalId ?? null}, ${input.status},
        ${input.costUsd ?? null}, ${input.durationMs ?? null},
        ${this.sql.json((input.request ?? null) as never)},
        ${this.sql.json((input.response ?? null) as never)},
        ${this.sql.json((input.error ?? null) as never)}
      )
      returning *`;
    return rows[0]!;
  }
}

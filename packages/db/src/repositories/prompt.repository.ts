import type { Sql } from '../client.js';
import type { PromptRow, Json } from '../types/index.js';

export interface NewPrompt {
  sceneId: string;
  projectId: string;
  model: string;
  positivePrompt: string;
  negativePrompt: string;
  parameters: Json;
}

export class PromptRepository {
  constructor(private readonly sql: Sql) {}

  async getActiveByScene(sceneId: string): Promise<PromptRow | null> {
    const rows = await this.sql<PromptRow[]>`
      select * from prompts where scene_id = ${sceneId} and is_active order by version desc limit 1`;
    return rows[0] ?? null;
  }

  async listActiveByProject(projectId: string): Promise<PromptRow[]> {
    return this.sql<PromptRow[]>`
      select * from prompts where project_id = ${projectId} and is_active order by created_at asc`;
  }

  async countActiveByProject(projectId: string): Promise<number> {
    const rows = await this.sql<{ count: string }[]>`
      select count(*)::text as count from prompts where project_id = ${projectId} and is_active`;
    return Number(rows[0]?.count ?? 0);
  }

  /**
   * Create a new active prompt version for a scene, deactivating any prior
   * versions — atomic, so a re-run bumps the version cleanly.
   */
  async createVersion(input: NewPrompt): Promise<PromptRow> {
    return this.sql.begin(async (tx) => {
      await tx`update prompts set is_active = false where scene_id = ${input.sceneId}`;
      const versionRows = await tx<{ next: number }[]>`
        select coalesce(max(version), 0) + 1 as next from prompts where scene_id = ${input.sceneId}`;
      const version = versionRows[0]?.next ?? 1;
      const rows = await tx<PromptRow[]>`
        insert into prompts
          (scene_id, project_id, version, model, positive_prompt, negative_prompt, parameters, is_active)
        values (
          ${input.sceneId}, ${input.projectId}, ${version}, ${input.model},
          ${input.positivePrompt}, ${input.negativePrompt},
          ${tx.json(input.parameters as never)}, true
        )
        returning *`;
      return rows[0]!;
    });
  }
}

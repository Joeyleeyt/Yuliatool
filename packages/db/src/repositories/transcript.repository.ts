import type { Sql } from '../client.js';
import type { TranscriptRow, Json } from '../types/index.js';
import { BaseRepository } from './base.repository.js';

export interface TranscriptData {
  provider?: 'deepgram';
  language?: string | null;
  durationSec?: number | null;
  fullText?: string | null;
  words: Json;
  paragraphs: Json;
  raw?: Json | null;
}

export class TranscriptRepository extends BaseRepository<TranscriptRow> {
  constructor(sql: Sql) {
    super(sql, 'transcripts');
  }

  async findByProject(projectId: string): Promise<TranscriptRow | null> {
    const rows = await this.sql<TranscriptRow[]>`
      select * from transcripts where project_id = ${projectId} limit 1`;
    return rows[0] ?? null;
  }

  /** Idempotent: transcripts.project_id is unique, so re-running upserts. */
  async upsertForProject(projectId: string, data: TranscriptData): Promise<TranscriptRow> {
    const rows = await this.sql<TranscriptRow[]>`
      insert into transcripts
        (project_id, provider, language, duration_sec, full_text, words, paragraphs, raw)
      values (
        ${projectId},
        ${data.provider ?? 'deepgram'},
        ${data.language ?? null},
        ${data.durationSec ?? null},
        ${data.fullText ?? null},
        ${this.sql.json(data.words as never)},
        ${this.sql.json(data.paragraphs as never)},
        ${this.sql.json((data.raw ?? null) as never)}
      )
      on conflict (project_id) do update set
        provider = excluded.provider,
        language = excluded.language,
        duration_sec = excluded.duration_sec,
        full_text = excluded.full_text,
        words = excluded.words,
        paragraphs = excluded.paragraphs,
        raw = excluded.raw,
        updated_at = now()
      returning *`;
    return rows[0]!;
  }
}

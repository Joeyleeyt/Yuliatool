import type {
  ProjectStatus,
  JobStatus,
  QueueName,
  AssetKind,
  AssetStatus,
  SceneVisualType,
  RenderFormat,
} from '@yulia/core';

/**
 * Hand-authored row types mirroring packages/db/supabase/migrations.
 *
 * These are the shapes the repository layer returns. When the schema changes,
 * regenerate `src/generated/database.types.ts` via `pnpm db:types` and reconcile
 * — these curated types are what the app imports (cleaner than generated ones).
 */

export type UUID = string;
export type ISODateTime = string;
export type Json = string | number | boolean | null | { [k: string]: Json } | Json[];

export interface BaseRow {
  id: UUID;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface UserRow extends BaseRow {
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  role: 'member' | 'admin';
}

export interface SettingsRow extends BaseRow {
  owner_id: UUID | null;
  key: string;
  value: Json;
}

export interface ProjectRow extends BaseRow {
  owner_id: UUID;
  title: string;
  description: string | null;
  status: ProjectStatus;
  render_format: RenderFormat;
  total_scenes: number;
  completed_scenes: number;
  error_code: string | null;
  error_message: string | null;
  failed_at: ISODateTime | null;
  /** When the project reached COMPLETED; null while running or after a retry. */
  completed_at: ISODateTime | null;
  config: Json;
}

export interface TranscriptRow extends BaseRow {
  project_id: UUID;
  provider: 'deepgram';
  language: string | null;
  duration_sec: number | null;
  full_text: string | null;
  words: Json;
  paragraphs: Json;
  raw: Json | null;
}

export interface AnalysisRow extends BaseRow {
  project_id: UUID;
  model: string;
  summary: string | null;
  emotional_arc: Json;
  visual_motifs: Json;
  style_guide: Json;
  prompt_strategy: Json;
  continuity_memory: Json;
  raw: Json | null;
}

export interface SceneRow extends BaseRow {
  project_id: UUID;
  scene_index: number;
  visual_type: SceneVisualType;
  status: AssetStatus;
  start_sec: number;
  end_sec: number;
  duration_sec: number;
  title: string | null;
  summary: string | null;
  narration_text: string | null;
  visual_brief: Json;
  continuity_notes: string | null;
}

export interface PromptRow extends BaseRow {
  scene_id: UUID;
  project_id: UUID;
  version: number;
  model: string;
  positive_prompt: string;
  negative_prompt: string | null;
  parameters: Json;
  is_active: boolean;
}

export interface AssetRow extends BaseRow {
  project_id: UUID;
  scene_id: UUID | null;
  kind: AssetKind;
  status: AssetStatus;
  r2_bucket: string | null;
  r2_key: string | null;
  content_type: string | null;
  size_bytes: number | null;
  checksum_sha256: string | null;
  width: number | null;
  height: number | null;
  duration_sec: number | null;
  provider: 'sixtynine_labs' | 'openai' | 'deepgram' | null;
  external_id: string | null;
  source_url: string | null;
  metadata: Json;
}

export interface GenerationHistoryRow {
  id: UUID;
  project_id: UUID;
  scene_id: UUID | null;
  asset_id: UUID | null;
  provider: 'sixtynine_labs' | 'openai' | 'deepgram';
  operation: string;
  external_id: string | null;
  status: string;
  cost_usd: number | null;
  duration_ms: number | null;
  request: Json | null;
  response: Json | null;
  error: Json | null;
  created_at: ISODateTime;
}

export interface RenderRow extends BaseRow {
  project_id: UUID;
  format: RenderFormat;
  status:
    | 'pending'
    | 'downloading_assets'
    | 'normalizing'
    | 'concatenating'
    | 'muxing'
    | 'uploading'
    | 'completed'
    | 'failed';
  asset_id: UUID | null;
  thumbnail_asset_id: UUID | null;
  duration_sec: number | null;
  fps: number | null;
  progress: number;
  error_message: string | null;
  started_at: ISODateTime | null;
  completed_at: ISODateTime | null;
}

export interface JobRow extends BaseRow {
  project_id: UUID;
  scene_id: UUID | null;
  queue: QueueName;
  idempotency_key: string;
  bull_job_id: string | null;
  status: JobStatus;
  attempts: number;
  max_attempts: number;
  payload: Json;
  result: Json | null;
  error: Json | null;
  scheduled_at: ISODateTime | null;
  started_at: ISODateTime | null;
  finished_at: ISODateTime | null;
}

export interface ActivityLogRow {
  id: UUID;
  project_id: UUID | null;
  actor_id: UUID | null;
  type: string;
  message: string | null;
  data: Json;
  created_at: ISODateTime;
}

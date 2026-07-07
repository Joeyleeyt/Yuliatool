-- ============================================================================
-- 0001 — Extensions & enum types
-- ============================================================================
-- All enum string values MUST match the TypeScript enums in
-- packages/core/src/enums. Adding a value here requires a matching const there.
-- ============================================================================

create extension if not exists "pgcrypto";      -- gen_random_uuid()
create extension if not exists "uuid-ossp";
create extension if not exists "pg_trgm";        -- fuzzy search on titles/transcripts
create extension if not exists "citext";         -- case-insensitive email

-- ---------------------------------------------------------------------------
-- Project lifecycle (top-level state machine)
-- ---------------------------------------------------------------------------
create type project_status as enum (
  'created',
  'uploading_audio',
  'transcribing',
  'analyzing',
  'segmenting',
  'prompt_generation',
  'video_generation',
  'image_generation',
  'waiting_assets',
  'rendering',
  'completed',
  'failed'
);

-- ---------------------------------------------------------------------------
-- Queue + job taxonomy
-- ---------------------------------------------------------------------------
create type queue_name as enum (
  'transcription',
  'script-analysis',
  'prompt-generation',
  'video-generation',
  'image-generation',
  'download-assets',
  'rendering',
  'thumbnail'
);

create type job_status as enum (
  'queued',
  'active',
  'waiting_external',
  'completed',
  'failed',
  'dead_letter',
  'cancelled'
);

-- ---------------------------------------------------------------------------
-- Assets & scenes
-- ---------------------------------------------------------------------------
create type asset_kind as enum (
  'voiceover',
  'video_clip',
  'image',
  'render',
  'thumbnail',
  'temp'
);

create type asset_status as enum (
  'pending',
  'submitted',
  'generated',
  'downloading',
  'stored',
  'failed'
);

create type scene_visual_type as enum ('video', 'image');

create type render_format as enum ('vertical_1080x1920', 'horizontal_1920x1080');

create type render_status as enum (
  'pending',
  'downloading_assets',
  'normalizing',
  'concatenating',
  'muxing',
  'uploading',
  'completed',
  'failed'
);

create type generation_provider as enum ('sixtynine_labs', 'openai', 'deepgram');

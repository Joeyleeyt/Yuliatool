-- ============================================================================
-- 0002 — Core tables
-- ============================================================================
-- Conventions (every table):
--   * id            uuid primary key default gen_random_uuid()
--   * created_at    timestamptz not null default now()
--   * updated_at    timestamptz not null default now()  (auto-bumped by trigger)
-- Binaries live in Cloudflare R2; tables store only R2 keys + metadata.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- users — application profile mirroring auth.users (Supabase Auth ready)
-- ---------------------------------------------------------------------------
create table public.users (
  id            uuid primary key references auth.users (id) on delete cascade,
  email         citext unique not null,
  display_name  text,
  avatar_url    text,
  role          text not null default 'member' check (role in ('member', 'admin')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
comment on table public.users is 'App-level profile; 1:1 with auth.users.';

-- ---------------------------------------------------------------------------
-- settings — per-user defaults + global config (owner_id null => global)
-- ---------------------------------------------------------------------------
create table public.settings (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid references public.users (id) on delete cascade,
  key           text not null,
  value         jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (owner_id, key)
);
comment on table public.settings is 'Key/value config. owner_id null = global default.';

-- ---------------------------------------------------------------------------
-- projects — the aggregate root; drives the state machine
-- ---------------------------------------------------------------------------
create table public.projects (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null references public.users (id) on delete cascade,
  title             text not null default 'Untitled project',
  description       text,
  status            project_status not null default 'created',
  render_format     render_format not null default 'vertical_1080x1920',

  -- Denormalized progress for cheap dashboard reads (kept in sync by workers).
  total_scenes      integer not null default 0,
  completed_scenes  integer not null default 0,

  -- Failure surface for the UI; cleared on successful retry.
  error_code        text,
  error_message     text,
  failed_at         timestamptz,

  -- Free-form config snapshot (style overrides, model choices) captured at run.
  config            jsonb not null default '{}'::jsonb,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
comment on table public.projects is 'Aggregate root. status is the top-level state machine.';

-- ---------------------------------------------------------------------------
-- transcripts — Deepgram output (1:1 with project)
-- ---------------------------------------------------------------------------
create table public.transcripts (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null unique references public.projects (id) on delete cascade,
  provider          generation_provider not null default 'deepgram',
  language          text,
  duration_sec      numeric(10, 3),
  full_text         text,
  -- Rich structured payload: words[], paragraphs[], sentences[] with timings.
  words             jsonb not null default '[]'::jsonb,
  paragraphs        jsonb not null default '[]'::jsonb,
  raw               jsonb,  -- full provider response for reprocessing
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
comment on table public.transcripts is 'Deepgram transcript with word/paragraph timings.';

-- ---------------------------------------------------------------------------
-- analyses — OpenAI global narrative analysis (1:1 with project)
-- ---------------------------------------------------------------------------
create table public.analyses (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null unique references public.projects (id) on delete cascade,
  model             text not null,
  summary           text,
  emotional_arc     jsonb not null default '[]'::jsonb,   -- ordered beats
  visual_motifs     jsonb not null default '[]'::jsonb,   -- recurring motifs
  style_guide       jsonb not null default '{}'::jsonb,   -- palette, lighting, camera language
  prompt_strategy   jsonb not null default '{}'::jsonb,
  continuity_memory jsonb not null default '{}'::jsonb,   -- carried across scenes
  raw               jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
comment on table public.analyses is 'Global story analysis: arc, motifs, style guide, continuity.';

-- ---------------------------------------------------------------------------
-- scenes — the segmented timeline; one row per visual segment
-- ---------------------------------------------------------------------------
create table public.scenes (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references public.projects (id) on delete cascade,

  scene_index       integer not null,                 -- 0-based ordinal in timeline
  visual_type       scene_visual_type not null,       -- alternates video/image
  status            asset_status not null default 'pending',

  -- Timeline placement (from transcript timings).
  start_sec         numeric(10, 3) not null,
  end_sec           numeric(10, 3) not null,
  duration_sec      numeric(10, 3) not null,

  -- Narrative content.
  title             text,
  summary           text,
  narration_text    text,

  -- Structured visual direction (camera, lighting, mood, palette, motion...).
  visual_brief      jsonb not null default '{}'::jsonb,
  continuity_notes  text,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  unique (project_id, scene_index),
  check (end_sec >= start_sec),
  check (duration_sec > 0)
);
comment on table public.scenes is 'One segment of the timeline; alternating video/image.';

-- ---------------------------------------------------------------------------
-- prompts — generated 69Labs prompts per scene (versioned)
-- ---------------------------------------------------------------------------
create table public.prompts (
  id                uuid primary key default gen_random_uuid(),
  scene_id          uuid not null references public.scenes (id) on delete cascade,
  project_id        uuid not null references public.projects (id) on delete cascade,
  version           integer not null default 1,
  model             text not null,
  positive_prompt   text not null,
  negative_prompt   text,
  parameters        jsonb not null default '{}'::jsonb,   -- aspect ratio, motion strength, seed
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (scene_id, version)
);
comment on table public.prompts is 'Versioned, provider-ready prompts per scene.';

-- ---------------------------------------------------------------------------
-- assets — every binary reference (audio, clips, images, renders)
-- ---------------------------------------------------------------------------
create table public.assets (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references public.projects (id) on delete cascade,
  scene_id          uuid references public.scenes (id) on delete cascade,  -- null for voiceover/render
  kind              asset_kind not null,
  status            asset_status not null default 'pending',

  -- R2 location (the only place binaries live).
  r2_bucket         text,
  r2_key            text,
  content_type      text,
  size_bytes        bigint,
  checksum_sha256   text,

  -- Media metadata (probe results).
  width             integer,
  height            integer,
  duration_sec      numeric(10, 3),

  -- Provenance: which external generation produced this (if any).
  provider          generation_provider,
  external_id       text,          -- 69Labs generation id
  source_url        text,          -- provider result URL prior to R2 download

  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
comment on table public.assets is 'Reference to a binary in R2 plus probe metadata + provenance.';

-- ---------------------------------------------------------------------------
-- generation_history — immutable log of every external generation attempt
-- ---------------------------------------------------------------------------
create table public.generation_history (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references public.projects (id) on delete cascade,
  scene_id          uuid references public.scenes (id) on delete set null,
  asset_id          uuid references public.assets (id) on delete set null,
  provider          generation_provider not null,
  operation         text not null,          -- 'submit' | 'poll' | 'download'
  external_id       text,
  status            text not null,
  cost_usd          numeric(12, 6),
  duration_ms       integer,
  request           jsonb,
  response          jsonb,
  error             jsonb,
  created_at        timestamptz not null default now()
);
comment on table public.generation_history is 'Append-only audit of external generation calls + cost.';

-- ---------------------------------------------------------------------------
-- renders — final MP4 render attempts
-- ---------------------------------------------------------------------------
create table public.renders (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references public.projects (id) on delete cascade,
  format            render_format not null,
  status            render_status not null default 'pending',
  asset_id          uuid references public.assets (id) on delete set null,  -- resulting MP4 asset
  thumbnail_asset_id uuid references public.assets (id) on delete set null,
  duration_sec      numeric(10, 3),
  fps               integer,
  progress          numeric(5, 2) not null default 0,  -- 0..100
  error_message     text,
  started_at        timestamptz,
  completed_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
comment on table public.renders is 'Final render attempts; multiple formats/retries per project.';

-- ---------------------------------------------------------------------------
-- jobs — mirror of queue jobs for durable, DB-authoritative recovery
-- ---------------------------------------------------------------------------
create table public.jobs (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references public.projects (id) on delete cascade,
  scene_id          uuid references public.scenes (id) on delete cascade,
  queue             queue_name not null,
  -- Deterministic idempotency key => re-enqueue after crash is a no-op.
  idempotency_key   text not null,
  bull_job_id       text,
  status            job_status not null default 'queued',
  attempts          integer not null default 0,
  max_attempts      integer not null default 1,
  payload           jsonb not null default '{}'::jsonb,
  result            jsonb,
  error             jsonb,
  scheduled_at      timestamptz,
  started_at        timestamptz,
  finished_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (idempotency_key)
);
comment on table public.jobs is 'DB-authoritative job ledger; idempotency_key dedupes re-enqueues.';

-- ---------------------------------------------------------------------------
-- activity_logs — append-only, user-facing timeline of project events
-- ---------------------------------------------------------------------------
create table public.activity_logs (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid references public.projects (id) on delete cascade,
  actor_id          uuid references public.users (id) on delete set null,
  type              text not null,          -- 'status_changed' | 'job_failed' | 'render_completed' ...
  message           text,
  data              jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now()
);
comment on table public.activity_logs is 'Append-only event stream for the project timeline UI.';

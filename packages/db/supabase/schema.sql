-- yulia-video full schema (0001..0004 concatenated). Run once on a fresh Supabase DB.

-- ============================================================
-- migrations/0001_extensions_and_enums.sql
-- ============================================================
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

-- ============================================================
-- migrations/0002_tables.sql
-- ============================================================
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

  -- When the project reached COMPLETED. Total generation time =
  -- completed_at - created_at. Cleared if the project leaves COMPLETED (retry),
  -- so it always reflects the current completed run (see applyStatus).
  completed_at      timestamptz,

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

-- ============================================================
-- migrations/0003_indexes_and_triggers.sql
-- ============================================================
-- ============================================================================
-- 0003 — Indexes & triggers
-- ============================================================================

-- ---------------------------------------------------------------------------
-- updated_at auto-bump trigger (attached to every mutable table)
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  t text;
  mutable_tables text[] := array[
    'users', 'settings', 'projects', 'transcripts', 'analyses',
    'scenes', 'prompts', 'assets', 'renders', 'jobs'
  ];
begin
  foreach t in array mutable_tables loop
    execute format(
      'create trigger trg_%1$s_updated_at
         before update on public.%1$s
         for each row execute function public.set_updated_at();', t
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Indexes — driven by the actual access patterns
-- ---------------------------------------------------------------------------

-- Dashboard: list a user's projects newest-first, filter by status.
create index idx_projects_owner_created on public.projects (owner_id, created_at desc);
create index idx_projects_status on public.projects (status);
-- Trigram search over project titles.
create index idx_projects_title_trgm on public.projects using gin (title gin_trgm_ops);

-- Scenes: always fetched ordered by timeline position within a project.
create index idx_scenes_project_index on public.scenes (project_id, scene_index);
create index idx_scenes_status on public.scenes (project_id, status);

-- Prompts: active prompt per scene.
create index idx_prompts_scene_active on public.prompts (scene_id) where is_active;
create index idx_prompts_project on public.prompts (project_id);

-- Assets: fetch by scene, by kind, and reconcile pending generations.
create index idx_assets_project_kind on public.assets (project_id, kind);
create index idx_assets_scene on public.assets (scene_id);
create index idx_assets_status on public.assets (status);
-- Reconcile in-flight external generations by provider id.
create index idx_assets_external on public.assets (provider, external_id)
  where external_id is not null;

-- Jobs: worker reconciliation + queue introspection.
create index idx_jobs_project on public.jobs (project_id);
create index idx_jobs_queue_status on public.jobs (queue, status);
create index idx_jobs_scene on public.jobs (scene_id) where scene_id is not null;

-- Generation history: cost rollups + audit by project/provider.
create index idx_genhist_project on public.generation_history (project_id, created_at desc);
create index idx_genhist_external on public.generation_history (provider, external_id);

-- Renders: latest render per project.
create index idx_renders_project on public.renders (project_id, created_at desc);

-- Activity feed: newest-first per project.
create index idx_activity_project_created on public.activity_logs (project_id, created_at desc);

-- Settings lookup.
create index idx_settings_owner_key on public.settings (owner_id, key);

-- ---------------------------------------------------------------------------
-- Keep projects.completed_scenes in sync when a scene reaches 'stored'.
-- ---------------------------------------------------------------------------
create or replace function public.sync_project_scene_counts()
returns trigger
language plpgsql
as $$
begin
  update public.projects p
  set completed_scenes = (
    select count(*) from public.scenes s
    where s.project_id = p.id and s.status = 'stored'
  )
  where p.id = coalesce(new.project_id, old.project_id);
  return coalesce(new, old);
end;
$$;

create trigger trg_scenes_sync_counts
  after insert or update of status or delete on public.scenes
  for each row execute function public.sync_project_scene_counts();

-- ============================================================
-- migrations/0004_rls.sql
-- ============================================================
-- ============================================================================
-- 0004 — Row Level Security
-- ============================================================================
-- Model:
--   * Browser clients use the ANON key + a Supabase Auth JWT -> RLS enforced.
--   * Workers / server actions use the SERVICE ROLE key -> RLS bypassed by
--     design (trusted server context). Never expose the service key to a client.
--
-- Ownership rule: a row is visible/writable to auth.uid() if it belongs to a
-- project the user owns (or is the user's own profile/settings).
-- ============================================================================

alter table public.users            enable row level security;
alter table public.settings         enable row level security;
alter table public.projects         enable row level security;
alter table public.transcripts      enable row level security;
alter table public.analyses         enable row level security;
alter table public.scenes           enable row level security;
alter table public.prompts          enable row level security;
alter table public.assets           enable row level security;
alter table public.generation_history enable row level security;
alter table public.renders          enable row level security;
alter table public.jobs             enable row level security;
alter table public.activity_logs    enable row level security;

-- Helper: does the current user own this project?
create or replace function public.owns_project(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.projects
    where id = p_project_id and owner_id = auth.uid()
  );
$$;

-- users: self-only.
create policy users_self_select on public.users
  for select using (id = auth.uid());
create policy users_self_update on public.users
  for update using (id = auth.uid());

-- settings: owner-scoped; global (owner_id null) is read-only to all authed.
create policy settings_select on public.settings
  for select using (owner_id = auth.uid() or owner_id is null);
create policy settings_write on public.settings
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- projects: owner-scoped full access.
create policy projects_owner_all on public.projects
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Child tables: visibility follows project ownership.
create policy transcripts_by_project on public.transcripts
  for select using (public.owns_project(project_id));
create policy analyses_by_project on public.analyses
  for select using (public.owns_project(project_id));
create policy scenes_by_project on public.scenes
  for select using (public.owns_project(project_id));
create policy prompts_by_project on public.prompts
  for select using (public.owns_project(project_id));
create policy assets_by_project on public.assets
  for select using (public.owns_project(project_id));
create policy genhist_by_project on public.generation_history
  for select using (public.owns_project(project_id));
create policy renders_by_project on public.renders
  for select using (public.owns_project(project_id));
create policy jobs_by_project on public.jobs
  for select using (public.owns_project(project_id));
create policy activity_by_project on public.activity_logs
  for select using (project_id is null or public.owns_project(project_id));

-- NOTE: no INSERT/UPDATE/DELETE policies on child tables for the anon role.
-- All writes to child tables happen server-side via the service role, which
-- bypasses RLS. This keeps the write path funneled through the service layer.

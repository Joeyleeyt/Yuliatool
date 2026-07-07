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

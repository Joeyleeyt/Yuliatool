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

-- ---------------------------------------------------------------------------
-- 0005 — projects.completed_at
--
-- Records the wall-clock moment a project reaches COMPLETED, so the UI can show
-- how long generation took (completed_at − created_at) without abusing
-- updated_at (which any later write — a view, a retry — would bump, corrupting
-- the total). Set once on the transition to COMPLETED and cleared on any
-- transition away from it (e.g. a retry), so it always reflects the CURRENT
-- completed run.
-- ---------------------------------------------------------------------------

alter table public.projects
  add column if not exists completed_at timestamptz;

comment on column public.projects.completed_at is
  'When the project reached COMPLETED. Total duration = completed_at - created_at. Cleared if it leaves COMPLETED (retry).';

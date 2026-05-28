-- 19_project_status_snapshots.sql
-- Daily synthesis cache: one row per (project, snapshot_date) holding the
-- Claude-generated project status payload. Written by the
-- synthesize-project-status Edge Function (service role); a second same-day
-- call returns the cached payload instead of burning more tokens against
-- the global daily cap.
--
-- Sequence: 00_init … 18_project_phase_status, 19_project_status_snapshots ← THIS.
create table if not exists public.project_status_snapshots (
  project_id    uuid not null references public.projects(id) on delete cascade,
  snapshot_date date not null,
  payload_jsonb jsonb not null,
  model_used    text,
  created_at    timestamptz not null default now(),
  primary key (project_id, snapshot_date)
);

-- RLS: any authenticated user can read snapshots for projects they can
-- access (frontend filters by project). Writes come from the Edge Function
-- via the service-role key (RLS-exempt).
alter table public.project_status_snapshots enable row level security;
drop policy if exists "status_snapshots: read" on public.project_status_snapshots;
create policy "status_snapshots: read" on public.project_status_snapshots
  for select using (auth.role() = 'authenticated');

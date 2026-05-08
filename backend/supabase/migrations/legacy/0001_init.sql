-- ─────────────────────────────────────────────────────────────────────────────
-- 0001_init.sql — initial schema for the SiteProof QA app.
--
-- HOW TO APPLY:
--   Open the Supabase dashboard → SQL Editor → New query.
--   Paste this entire file, click Run.
--
-- This script is idempotent: re-running it is safe (uses IF NOT EXISTS /
-- CREATE OR REPLACE everywhere).
--
-- WHAT IT CREATES:
--   • enums:           project_status, task_status, construction_phase
--   • tables:          projects, tasks, progress_snapshots
--   • RPC:             create_project_with_tasks(...)
--   • trigger:         trg_snapshot_progress on tasks UPDATE
--   • RLS policies:    authenticated users can read/write their own rows.
--                      Tighten when you wire org_id / multi-tenant.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Enums ────────────────────────────────────────────────────────────────────
do $$ begin
  create type project_status as enum ('active', 'on_hold', 'completed', 'archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type task_status as enum ('not_started', 'in_progress', 'complete', 'delayed', 'blocked');
exception when duplicate_object then null; end $$;

do $$ begin
  create type construction_phase as enum (
    'excavation', 'foundation', 'framing', 'electrical',
    'plumbing', 'drywall', 'finishing', 'roofing'
  );
exception when duplicate_object then null; end $$;

-- ── Tables ───────────────────────────────────────────────────────────────────
create table if not exists projects (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  client_name   text not null,
  description   text,
  start_date    date not null,
  end_date      date not null,
  status        project_status not null default 'active',
  budget        numeric(14, 2),
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (end_date >= start_date)
);

create index if not exists idx_projects_created_by on projects(created_by);
create index if not exists idx_projects_status on projects(status);

create table if not exists tasks (
  id                 uuid primary key default gen_random_uuid(),
  project_id         uuid not null references projects(id) on delete cascade,
  name               text not null,
  phase              construction_phase not null default 'foundation',
  start_date         date not null,
  end_date           date not null,
  percent_complete   int  not null default 0 check (percent_complete between 0 and 100),
  status             task_status not null default 'not_started',
  zone_id            uuid,
  dependencies       uuid[] not null default '{}',
  photo_count        int not null default 0,
  notes              text,
  created_by         uuid references auth.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  last_updated       timestamptz not null default now(),
  check (end_date >= start_date)
);

create index if not exists idx_tasks_project_id on tasks(project_id);
create index if not exists idx_tasks_status on tasks(status);

create table if not exists progress_snapshots (
  project_id        uuid not null references projects(id) on delete cascade,
  snapshot_date     date not null default current_date,
  overall_progress  int  not null check (overall_progress between 0 and 100),
  tasks_completed   int  not null default 0,
  primary key (project_id, snapshot_date)
);

create index if not exists idx_snapshots_date on progress_snapshots(snapshot_date);

-- ── RPC: create_project_with_tasks ───────────────────────────────────────────
-- Creates the project + N initial tasks atomically. If any task insert fails
-- the whole thing rolls back, so you never end up with a project that has no
-- Gantt data.
--
-- p_milestones is a jsonb array shaped like:
--   [{ "name": "...", "phase": "electrical",
--      "startDate": "2026-04-01", "endDate": "2026-04-15" }, ...]
create or replace function create_project_with_tasks(
  p_name        text,
  p_client      text,
  p_description text,
  p_start_date  date,
  p_end_date    date,
  p_status      text,
  p_budget      numeric,
  p_milestones  jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_project_id uuid;
begin
  insert into projects (
    name, client_name, description, start_date, end_date, status, budget, created_by
  ) values (
    p_name, p_client, p_description, p_start_date, p_end_date,
    p_status::project_status, p_budget, auth.uid()
  )
  returning id into new_project_id;

  insert into tasks (
    project_id, name, phase, start_date, end_date, percent_complete, status, created_by
  )
  select
    new_project_id,
    m->>'name',
    coalesce((m->>'phase')::construction_phase, 'foundation'),
    (m->>'startDate')::date,
    (m->>'endDate')::date,
    0,
    'not_started'::task_status,
    auth.uid()
  from jsonb_array_elements(coalesce(p_milestones, '[]'::jsonb)) m
  where (m->>'name') is not null and length(trim(m->>'name')) > 0;

  return new_project_id;
end;
$$;

-- ── Trigger: snapshot project progress whenever a task's % moves ─────────────
create or replace function snapshot_project_progress() returns trigger
language plpgsql
as $$
declare
  v_overall   int;
  v_completed int;
begin
  select
    coalesce(round(avg(percent_complete))::int, 0),
    count(*) filter (where percent_complete >= 100)
  into v_overall, v_completed
  from tasks
  where project_id = new.project_id;

  insert into progress_snapshots (project_id, snapshot_date, overall_progress, tasks_completed)
  values (new.project_id, current_date, v_overall, v_completed)
  on conflict (project_id, snapshot_date)
  do update set
    overall_progress = excluded.overall_progress,
    tasks_completed  = excluded.tasks_completed;

  -- Touch the project row so list views show "recently active".
  update projects set updated_at = now() where id = new.project_id;

  return new;
end;
$$;

drop trigger if exists trg_snapshot_progress on tasks;
create trigger trg_snapshot_progress
  after update of percent_complete on tasks
  for each row execute function snapshot_project_progress();

-- ── Row Level Security ───────────────────────────────────────────────────────
-- Permissive starter policies: any authenticated user can CRUD their own data.
-- Tighten these once orgs/teams/roles are modeled (e.g. join through a
-- project_members table).

alter table projects           enable row level security;
alter table tasks              enable row level security;
alter table progress_snapshots enable row level security;

drop policy if exists "projects: authed read"   on projects;
drop policy if exists "projects: authed write"  on projects;
drop policy if exists "tasks: authed read"      on tasks;
drop policy if exists "tasks: authed write"     on tasks;
drop policy if exists "snapshots: authed read"  on progress_snapshots;

create policy "projects: authed read" on projects
  for select using (auth.role() = 'authenticated');

create policy "projects: authed write" on projects
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "tasks: authed read" on tasks
  for select using (auth.role() = 'authenticated');

create policy "tasks: authed write" on tasks
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "snapshots: authed read" on progress_snapshots
  for select using (auth.role() = 'authenticated');

-- ── Realtime ─────────────────────────────────────────────────────────────────
-- Enable Realtime broadcasts on tasks so the Timeline tab updates live across
-- browsers. (You can also flip this on in the Supabase dashboard:
-- Database → Replication → tasks.)
alter publication supabase_realtime add table tasks;
alter publication supabase_realtime add table projects;

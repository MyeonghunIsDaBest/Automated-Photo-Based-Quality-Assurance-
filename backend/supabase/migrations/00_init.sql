-- 00_init.sql — single consolidated schema for the SiteProof QA app.
--
-- WHAT THIS DOES (in order):
--   §1  Resets the public schema we own — drops every table / function /
--       trigger / enum this script created, plus empties Storage objects in
--       our two buckets. Storage bucket configs are preserved.
--   §2  Recreates the 8 enums.
--   §3  Defines RBAC + maintenance helper functions BEFORE any tables that
--       reference them in RLS.
--   §4  Defines `handle_new_user()` with auto-promote: the very first signup
--       on a clean database becomes `company_admin` automatically.
--   §5  Creates the 14 tables in dependency order.
--   §6  Creates triggers (after all functions exist).
--   §7  Enables RLS and declares policies — tasks/photos/profiles use the
--       reworked single-helper pattern; the rest use is_admin_role().
--   §8  Storage buckets + policies.
--   §9  Realtime publication memberships.
--   §10 Sanity NOTICEs for the operator.
--
-- HOW TO RUN:
--   Supabase Dashboard → SQL Editor → New query → paste this entire file
--   → click Run. Idempotent: re-running is safe and gives you a fresh DB.
--
-- WARNING: Re-running WIPES all SQL data (profiles, projects, tasks, photos
-- metadata, etc.). It does NOT wipe Storage objects — Supabase blocks SQL
-- deletes there. To clear uploaded files, use the dashboard:
--   Storage → photos → select all → Delete
--   Storage → user-documents → select all → Delete
-- For a demo where you've already signed up, only run this once at the very
-- start.
-- ─────────────────────────────────────────────────────────────────────────────


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ §1. RESET                                                                ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- NOTE on Storage objects: Supabase blocks `delete from storage.objects` from
-- regular SQL via a `storage.protect_delete()` trigger. Existing photo files
-- in the `photos` and `user-documents` buckets must be wiped through the
-- dashboard (Storage → bucket → select all → Delete) or via the Storage API
-- with the service role key. The bucket configs themselves (rows in
-- `storage.buckets`) are preserved by this script — only their `storage.objects`
-- contents need a manual wipe. On a fresh project there's nothing to wipe.

-- Drop the trigger we placed on auth.users (Supabase-managed table; we leave
-- the table itself alone so existing auth accounts survive a re-run).
drop trigger if exists on_auth_user_created on auth.users;

-- Drop our public-schema tables in reverse-dependency order. CASCADE clears
-- dependent objects (FKs, sequences, policies attached to the table).
drop table if exists supplier_contacts        cascade;
drop table if exists supplier_branches        cascade;
drop table if exists suppliers                cascade;
drop table if exists stakeholders             cascade;
drop table if exists user_documents           cascade;
drop table if exists ai_analyses              cascade;
drop table if exists comments                 cascade;
drop table if exists audit_log                cascade;
drop table if exists photos                   cascade;
drop table if exists zones                    cascade;
drop table if exists progress_snapshots       cascade;
drop table if exists tasks                    cascade;
drop table if exists projects                 cascade;
drop table if exists profiles                 cascade;

-- Drop our functions. CASCADE removes any leftover triggers/policies that
-- still reference them after the table drops above.
drop function if exists handle_new_user                  cascade;
drop function if exists touch_profile_updated_at         cascade;
drop function if exists touch_stakeholder_updated_at     cascade;
drop function if exists touch_supplier_updated_at        cascade;
drop function if exists snapshot_project_progress        cascade;
drop function if exists on_photo_inserted_queue_ai       cascade;
drop function if exists is_admin_role                    cascade;
drop function if exists is_company_admin                 cascade;
drop function if exists current_security_group           cascade;
drop function if exists is_manager_or_above              cascade;
drop function if exists claim_first_admin                cascade;
drop function if exists create_project_with_tasks        cascade;
drop function if exists increment_photo_count            cascade;

-- Drop our enums (CASCADE clears column references that may have survived
-- the table drops if a column was created via ALTER on an existing table).
drop type if exists security_group     cascade;
drop type if exists expiry_alert       cascade;
drop type if exists ai_action          cascade;
drop type if exists note_status        cascade;
drop type if exists note_type          cascade;
drop type if exists construction_phase cascade;
drop type if exists task_status        cascade;
drop type if exists project_status     cascade;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ §2. ENUMS                                                                ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

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

do $$ begin
  create type note_type   as enum ('issue', 'accuracy_check', 'general');
exception when duplicate_object then null; end $$;

do $$ begin
  create type note_status as enum ('open', 'resolved');
exception when duplicate_object then null; end $$;

do $$ begin
  create type ai_action   as enum ('auto_updated', 'confirmed', 'skipped', 'pending');
exception when duplicate_object then null; end $$;

do $$ begin
  create type security_group as enum (
    'company_admin', 'administrator', 'construction_mgr',
    'project_manager', 'site_manager', 'worker'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type expiry_alert as enum (
    '2_months', '1_month', '3_weeks', '2_weeks', '1_week'
  );
exception when duplicate_object then null; end $$;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ §3. PLPGSQL FUNCTIONS — safe to define BEFORE tables.                    ║
-- ║                                                                          ║
-- ║ plpgsql defers reference resolution until call time, so these can use    ║
-- ║ tables that don't exist yet at the moment they're created. The four      ║
-- ║ LANGUAGE sql RBAC helpers (current_security_group, is_manager_or_above,  ║
-- ║ is_admin_role, is_company_admin) and increment_photo_count must be       ║
-- ║ created AFTER the tables exist — see §5b below.                          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── Maintenance helpers (touch updated_at on UPDATE) ────────────────────────
create or replace function touch_profile_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function touch_stakeholder_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function touch_supplier_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── Snapshot trigger: writes a daily progress row when a task's % moves ─────
create or replace function snapshot_project_progress() returns trigger
language plpgsql as $$
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

  update projects set updated_at = now() where id = new.project_id;

  return new;
end;
$$;

-- ── Photo upload → pending AI placeholder row ───────────────────────────────
create or replace function on_photo_inserted_queue_ai() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into ai_analyses (
    photo_id, model_used, completion_pct, confidence, action_taken
  ) values (
    new.id, 'pending', 0, 0, 'pending'
  )
  on conflict do nothing;
  return new;
end;
$$;

-- ── Atomically creates a project + N initial tasks via JSONB. Used by
--    NewProjectModal in the frontend.
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
    project_id, name, phase, start_date, end_date,
    percent_complete, status, created_by
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

-- ── Bootstrap RPC kept as a fallback: the in-app /bootstrap-admin page calls
--    it. With the auto-promote in §4 it'll usually be a no-op redirect, but
--    keeping the path means an operator who deactivates every admin can still
--    promote themselves from the UI rather than the SQL editor.
create or replace function claim_first_admin() returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller   uuid := auth.uid();
  v_existing int;
begin
  if v_caller is null then
    return false;
  end if;

  select count(*) into v_existing
    from profiles
   where security_group in ('company_admin', 'administrator')
     and is_active;

  if v_existing > 0 then
    return false;
  end if;

  update profiles
     set security_group = 'company_admin',
         is_active      = true
   where id = v_caller;

  return true;
end;
$$;

grant execute on function claim_first_admin() to authenticated;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ §4. handle_new_user() — auto-promote the first signup to company_admin  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

create or replace function handle_new_user() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requested   text;
  v_group       security_group;
  v_admin_count int;
begin
  v_requested := lower(coalesce(new.raw_user_meta_data->>'security_group', ''));

  -- Map the form's role pick to a real enum value. Stakeholder + supplier
  -- aren't security_group values — they're separate tables — so they
  -- normalise to 'worker' here. Picking company_admin or administrator
  -- from the form is silently ignored (those tiers are admin-assigned only).
  v_group := case v_requested
    when 'site_manager'     then 'site_manager'::security_group
    when 'project_manager'  then 'project_manager'::security_group
    when 'construction_mgr' then 'construction_mgr'::security_group
    when 'worker'           then 'worker'::security_group
    else 'worker'::security_group
  end;

  -- Auto-bootstrap: if no active admin exists yet, promote this user to
  -- company_admin regardless of what they picked. Self-healing — once an
  -- admin exists, every later signup keeps the role they chose.
  select count(*) into v_admin_count
    from profiles
   where security_group in ('company_admin', 'administrator')
     and is_active;

  if v_admin_count = 0 then
    v_group := 'company_admin'::security_group;
  end if;

  insert into profiles (id, email, first_name, last_name, security_group)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'first_name', ''),
    coalesce(new.raw_user_meta_data->>'last_name', ''),
    v_group
  )
  on conflict (id) do nothing;

  return new;
end;
$$;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ §5. TABLES                                                               ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── profiles ────────────────────────────────────────────────────────────────
-- One row per auth.users row, written by the on_auth_user_created trigger.
create table profiles (
  id                       uuid primary key references auth.users(id) on delete cascade,
  email                    text not null,
  first_name               text not null default '',
  last_name                text not null default '',
  mobile                   text,
  emergency_contact_name   text,
  emergency_contact_email  text,
  emergency_contact_mobile text,
  security_group           security_group not null default 'worker',
  is_active                boolean not null default true,
  avatar_url               text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create index idx_profiles_security_group on profiles(security_group);
create index idx_profiles_email          on profiles(email);

-- ── projects ────────────────────────────────────────────────────────────────
create table projects (
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
create index idx_projects_created_by on projects(created_by);
create index idx_projects_status     on projects(status);

-- ── zones (created before tasks because tasks.zone_id references it) ────────
create table zones (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references projects(id) on delete cascade,
  name         text not null,
  description  text,
  color_code   text not null default '#64748b',
  created_at   timestamptz not null default now()
);
create index idx_zones_project_id on zones(project_id);

-- ── tasks ───────────────────────────────────────────────────────────────────
-- Born with the columns the frontend expects (assignee/parent/update_source)
-- and with notes as jsonb — no later ALTER needed.
create table tasks (
  id                 uuid primary key default gen_random_uuid(),
  project_id         uuid not null references projects(id) on delete cascade,
  name               text not null,
  phase              construction_phase not null default 'foundation',
  start_date         date not null,
  end_date           date not null,
  percent_complete   int  not null default 0 check (percent_complete between 0 and 100),
  status             task_status not null default 'not_started',
  zone_id            uuid references zones(id) on delete set null,
  assignee_id        uuid references profiles(id) on delete set null,
  parent_task_id     uuid references tasks(id) on delete cascade,
  dependencies       uuid[] not null default '{}',
  photo_count        int not null default 0,
  notes              jsonb not null default '[]'::jsonb,
  update_source      text not null default 'manual'
                       check (update_source in ('manual', 'ai_auto', 'supervisor')),
  created_by         uuid references auth.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  last_updated       timestamptz not null default now(),
  check (end_date >= start_date)
);
create index idx_tasks_project_id   on tasks(project_id);
create index idx_tasks_status       on tasks(status);
create index idx_tasks_assignee     on tasks(assignee_id);
create index idx_tasks_parent_task  on tasks(parent_task_id);

-- ── progress_snapshots ──────────────────────────────────────────────────────
create table progress_snapshots (
  project_id        uuid not null references projects(id) on delete cascade,
  snapshot_date     date not null default current_date,
  overall_progress  int  not null check (overall_progress between 0 and 100),
  tasks_completed   int  not null default 0,
  primary key (project_id, snapshot_date)
);
create index idx_snapshots_date on progress_snapshots(snapshot_date);

-- ── photos ──────────────────────────────────────────────────────────────────
create table photos (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  task_id         uuid references tasks(id)   on delete set null,
  zone_id         uuid references zones(id)   on delete set null,
  uploaded_by     uuid references auth.users(id) on delete set null,
  filename        text not null,
  storage_path    text not null,
  thumbnail_path  text,
  file_size_kb    int  not null default 0,
  width           int  not null default 0,
  height          int  not null default 0,
  taken_at        timestamptz,
  uploaded_at     timestamptz not null default now(),
  gps_lat         double precision,
  gps_lng         double precision,
  notes           text,
  ai_analyzed     boolean not null default false
);
create index idx_photos_project_id   on photos(project_id);
create index idx_photos_task_id      on photos(task_id);
create index idx_photos_uploaded_at  on photos(uploaded_at desc);

-- ── ai_analyses ─────────────────────────────────────────────────────────────
create table ai_analyses (
  id                uuid primary key default gen_random_uuid(),
  photo_id          uuid not null references photos(id) on delete cascade,
  model_used        text not null,
  phase_detected    construction_phase,
  completion_pct    int not null check (completion_pct between 0 and 100),
  confidence        numeric(4, 3) not null check (confidence between 0 and 1),
  safety_flags      text[] not null default '{}',
  quality_flags     text[] not null default '{}',
  materials         text[] not null default '{}',
  suggested_task    text,
  action_taken      ai_action not null default 'pending',
  analyzed_at       timestamptz not null default now(),
  unique (photo_id, model_used, analyzed_at)
);
create index idx_ai_analyses_photo_id on ai_analyses(photo_id);

-- ── comments ────────────────────────────────────────────────────────────────
create table comments (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid references tasks(id)  on delete cascade,
  photo_id    uuid references photos(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete set null,
  body        text not null check (length(trim(body)) > 0),
  note_type   note_type   default 'general',
  status      note_status default 'open',
  created_at  timestamptz not null default now(),
  check (task_id is not null or photo_id is not null)
);
create index idx_comments_task_id  on comments(task_id);
create index idx_comments_photo_id on comments(photo_id);

-- ── audit_log ───────────────────────────────────────────────────────────────
create table audit_log (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid references projects(id) on delete set null,
  user_id      uuid references auth.users(id) on delete set null,
  action       text not null,
  entity_type  text not null,
  entity_id    uuid,
  old_value    jsonb,
  new_value    jsonb,
  notes        text,
  ip_address   inet,
  created_at   timestamptz not null default now()
);
create index idx_audit_log_entity   on audit_log(entity_type, entity_id);
create index idx_audit_log_project  on audit_log(project_id, created_at desc);

-- ── user_documents ──────────────────────────────────────────────────────────
create table user_documents (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references profiles(id) on delete cascade,
  document_name  text not null,
  reference_no   text,
  expiry_date    date,
  expiry_alert   expiry_alert,
  notes          text,
  storage_path   text not null,
  file_size_kb   int  not null default 0,
  uploaded_by    uuid references auth.users(id) on delete set null,
  uploaded_at    timestamptz not null default now()
);
create index idx_user_documents_user_id      on user_documents(user_id);
create index idx_user_documents_expiry_date
  on user_documents(expiry_date) where expiry_date is not null;

-- ── stakeholders ────────────────────────────────────────────────────────────
create table stakeholders (
  id           uuid primary key default gen_random_uuid(),
  company_name text not null,
  first_name   text not null,
  last_name    text not null,
  email        text,
  mobile       text,
  role         text,
  notes        text,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index idx_stakeholders_company_name on stakeholders(company_name);
create index idx_stakeholders_email        on stakeholders(email);

-- ── suppliers + branches + contacts ─────────────────────────────────────────
create table suppliers (
  id                        uuid primary key default gen_random_uuid(),
  name                      text not null,
  abn                       text,
  website                   text,
  main_email                text,
  main_contact_number       text,
  main_contact_name         text,
  accounts_email            text,
  accounts_contact_number   text,
  accounts_contact_name     text,
  main_address              jsonb,
  postal_address            jsonb,
  notes                     text,
  created_by                uuid references auth.users(id) on delete set null,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
create index idx_suppliers_name on suppliers(name);
create index idx_suppliers_abn  on suppliers(abn);

create table supplier_branches (
  id                        uuid primary key default gen_random_uuid(),
  supplier_id               uuid not null references suppliers(id) on delete cascade,
  branch_name               text not null,
  email                     text,
  contact_number            text,
  contact_name              text,
  accounts_email            text,
  accounts_contact_number   text,
  accounts_contact_name     text,
  address                   jsonb,
  postal_address            jsonb,
  created_at                timestamptz not null default now()
);
create index idx_supplier_branches_supplier_id on supplier_branches(supplier_id);

create table supplier_contacts (
  id           uuid primary key default gen_random_uuid(),
  supplier_id  uuid not null references suppliers(id) on delete cascade,
  branch_id    uuid references supplier_branches(id) on delete set null,
  name         text not null,
  email        text,
  mobile       text,
  role         text,
  notes        text,
  created_at   timestamptz not null default now()
);
create index idx_supplier_contacts_supplier_id on supplier_contacts(supplier_id);
create index idx_supplier_contacts_branch_id   on supplier_contacts(branch_id);


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ §5b. RBAC HELPERS (LANGUAGE sql) — defined AFTER tables exist.           ║
-- ║                                                                          ║
-- ║ LANGUAGE sql resolves table references at function-creation time, so     ║
-- ║ these had to wait until profiles + tasks were created above. They're     ║
-- ║ STABLE so the planner can cache results within a statement, and          ║
-- ║ SECURITY DEFINER so they can read profiles regardless of the caller's    ║
-- ║ RLS context.                                                             ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- The reworked RBAC core. Every write policy in §7 calls one of these
-- helpers, replacing the verbose `exists (select 1 from profiles ...)`
-- pattern from the legacy migrations.
create or replace function current_security_group() returns security_group
language sql
stable
security definer
set search_path = public
as $$
  select security_group
    from profiles
   where id = auth.uid()
     and is_active
   limit 1;
$$;

-- True for the manager tier and above (everyone allowed to edit Gantt tasks).
create or replace function is_manager_or_above() returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(current_security_group() in (
    'company_admin', 'administrator', 'construction_mgr',
    'project_manager', 'site_manager'
  ), false);
$$;

-- True for company_admin or administrator. The optional `uid` arg keeps
-- existing call sites in storage policies / elsewhere working unchanged.
create or replace function is_admin_role(uid uuid default null) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select security_group in ('company_admin', 'administrator')
      from profiles
     where id = coalesce(uid, auth.uid())
       and is_active
  ), false);
$$;

-- True only for the highest tier. Used by the profiles delete policy.
create or replace function is_company_admin(uid uuid default null) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select security_group = 'company_admin'
      from profiles
     where id = coalesce(uid, auth.uid())
       and is_active
  ), false);
$$;

-- Bumps tasks.photo_count by 1; called from the frontend after a photo
-- upload succeeds so the Gantt badge stays accurate without a re-fetch.
create or replace function increment_photo_count(p_task_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update tasks
     set photo_count  = photo_count + 1,
         last_updated = now()
   where id = p_task_id;
$$;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ §6. TRIGGERS                                                             ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

create trigger trg_profiles_updated_at
  before update on profiles
  for each row execute function touch_profile_updated_at();

create trigger trg_snapshot_progress
  after update of percent_complete on tasks
  for each row execute function snapshot_project_progress();

create trigger trg_stakeholders_updated_at
  before update on stakeholders
  for each row execute function touch_stakeholder_updated_at();

create trigger trg_suppliers_updated_at
  before update on suppliers
  for each row execute function touch_supplier_updated_at();

create trigger trg_on_photo_inserted_queue_ai
  after insert on photos
  for each row execute function on_photo_inserted_queue_ai();


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ §7. ROW LEVEL SECURITY                                                   ║
-- ║                                                                          ║
-- ║ Reads stay open to any authenticated user. Writes go through three       ║
-- ║ helpers: is_manager_or_above() (Gantt edits), is_admin_role() (admin    ║
-- ║ surfaces), is_company_admin() (top-tier deletes).                        ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── profiles ────────────────────────────────────────────────────────────────
alter table profiles enable row level security;

create policy "profiles: read" on profiles
  for select using (auth.role() = 'authenticated');

-- Users can update their own profile, but they cannot change their own
-- security_group (the WITH CHECK clause locks the column to whatever is
-- already in the row).
create policy "profiles: self update" on profiles
  for update using (auth.uid() = id)
  with check (auth.uid() = id and security_group = current_security_group());

create policy "profiles: admin update" on profiles
  for update using (is_admin_role())
  with check (is_admin_role());

create policy "profiles: admin delete" on profiles
  for delete using (is_company_admin());

-- ── projects ────────────────────────────────────────────────────────────────
alter table projects enable row level security;

create policy "projects: read" on projects
  for select using (auth.role() = 'authenticated');

create policy "projects: insert by manager+" on projects
  for insert with check (is_manager_or_above());

create policy "projects: update by manager+" on projects
  for update using (is_manager_or_above())
  with check (is_manager_or_above());

create policy "projects: delete by admin" on projects
  for delete using (is_admin_role());

-- ── tasks ───────────────────────────────────────────────────────────────────
alter table tasks enable row level security;

create policy "tasks: read" on tasks
  for select using (auth.role() = 'authenticated');

create policy "tasks: insert by manager+" on tasks
  for insert with check (is_manager_or_above());

create policy "tasks: update by manager+" on tasks
  for update using (is_manager_or_above())
  with check (is_manager_or_above());

-- A worker can move the % bar on tasks they're assigned to, but can't
-- edit other fields (the with-check rule pins the assignee to themselves).
create policy "tasks: update own assignments" on tasks
  for update using (assignee_id = auth.uid())
  with check (assignee_id = auth.uid());

create policy "tasks: delete by admin" on tasks
  for delete using (is_admin_role());

-- ── progress_snapshots ──────────────────────────────────────────────────────
alter table progress_snapshots enable row level security;

create policy "snapshots: read" on progress_snapshots
  for select using (auth.role() = 'authenticated');

-- ── zones ───────────────────────────────────────────────────────────────────
alter table zones enable row level security;

create policy "zones: read" on zones
  for select using (auth.role() = 'authenticated');

create policy "zones: write by manager+" on zones
  for all using (is_manager_or_above())
  with check (is_manager_or_above());

-- ── photos ──────────────────────────────────────────────────────────────────
alter table photos enable row level security;

create policy "photos: read" on photos
  for select using (auth.role() = 'authenticated');

-- Workers must be able to upload, so insert is open to any authed user.
create policy "photos: insert" on photos
  for insert with check (auth.role() = 'authenticated');

create policy "photos: update by uploader/admin" on photos
  for update using (uploaded_by = auth.uid() or is_admin_role())
  with check (uploaded_by = auth.uid() or is_admin_role());

create policy "photos: delete by uploader/admin" on photos
  for delete using (uploaded_by = auth.uid() or is_admin_role());

-- ── ai_analyses ─────────────────────────────────────────────────────────────
alter table ai_analyses enable row level security;

create policy "ai: read" on ai_analyses
  for select using (auth.role() = 'authenticated');

-- (No write policy — only the service role / SECURITY DEFINER triggers
-- write here, intentional. The pending-row trigger runs as definer.)

-- ── comments ────────────────────────────────────────────────────────────────
alter table comments enable row level security;

create policy "comments: read" on comments
  for select using (auth.role() = 'authenticated');

create policy "comments: write own" on comments
  for all using (auth.role() = 'authenticated' and auth.uid() = user_id)
  with check (auth.role() = 'authenticated' and auth.uid() = user_id);

-- ── audit_log ───────────────────────────────────────────────────────────────
alter table audit_log enable row level security;

create policy "audit: read" on audit_log
  for select using (auth.role() = 'authenticated');

-- (No write policy — definer functions are the only writers.)

-- ── user_documents ──────────────────────────────────────────────────────────
alter table user_documents enable row level security;

create policy "user_documents: read" on user_documents
  for select using (auth.role() = 'authenticated');

create policy "user_documents: admin write" on user_documents
  for all using (is_admin_role())
  with check (is_admin_role());

-- ── stakeholders ────────────────────────────────────────────────────────────
alter table stakeholders enable row level security;

create policy "stakeholders: read" on stakeholders
  for select using (auth.role() = 'authenticated');

create policy "stakeholders: admin write" on stakeholders
  for all using (is_admin_role())
  with check (is_admin_role());

-- ── suppliers (+ branches + contacts) ───────────────────────────────────────
alter table suppliers          enable row level security;
alter table supplier_branches  enable row level security;
alter table supplier_contacts  enable row level security;

create policy "suppliers: read" on suppliers
  for select using (auth.role() = 'authenticated');
create policy "suppliers: admin write" on suppliers
  for all using (is_admin_role())
  with check (is_admin_role());

create policy "supplier_branches: read" on supplier_branches
  for select using (auth.role() = 'authenticated');
create policy "supplier_branches: admin write" on supplier_branches
  for all using (is_admin_role())
  with check (is_admin_role());

create policy "supplier_contacts: read" on supplier_contacts
  for select using (auth.role() = 'authenticated');
create policy "supplier_contacts: admin write" on supplier_contacts
  for all using (is_admin_role())
  with check (is_admin_role());


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ §8. STORAGE BUCKETS + POLICIES                                           ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

insert into storage.buckets (id, name, public) values
  ('photos',         'photos',         false),
  ('user-documents', 'user-documents', false)
on conflict (id) do nothing;

-- Reset all our storage policies before recreating, in case the policy
-- bodies have changed shape.
drop policy if exists "photos: authed read"       on storage.objects;
drop policy if exists "photos: authed insert"     on storage.objects;
drop policy if exists "photos: authed update"     on storage.objects;
drop policy if exists "photos: authed delete"     on storage.objects;
drop policy if exists "user-docs: authed read"    on storage.objects;
drop policy if exists "user-docs: admin insert"   on storage.objects;
drop policy if exists "user-docs: admin delete"   on storage.objects;

-- ── photos bucket: any authed user can read + upload; only the original
--    uploader (storage.objects.owner = auth.uid()) can mutate or delete.
create policy "photos: authed read" on storage.objects
  for select using (bucket_id = 'photos' and auth.role() = 'authenticated');
create policy "photos: authed insert" on storage.objects
  for insert with check (bucket_id = 'photos' and auth.role() = 'authenticated');
create policy "photos: authed update" on storage.objects
  for update using (bucket_id = 'photos' and owner = auth.uid());
create policy "photos: authed delete" on storage.objects
  for delete using (bucket_id = 'photos' and owner = auth.uid());

-- ── user-documents bucket: anyone signed in can read; only admins write.
create policy "user-docs: authed read" on storage.objects
  for select using (bucket_id = 'user-documents' and auth.role() = 'authenticated');
create policy "user-docs: admin insert" on storage.objects
  for insert with check (bucket_id = 'user-documents' and is_admin_role());
create policy "user-docs: admin delete" on storage.objects
  for delete using (bucket_id = 'user-documents' and is_admin_role());


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ §9. REALTIME PUBLICATION MEMBERSHIPS                                     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ALTER PUBLICATION ADD TABLE doesn't have an "if not exists" form; the do-
-- block swallows the duplicate_object error so re-runs are safe.
do $$ begin alter publication supabase_realtime add table tasks;        exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table projects;     exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table photos;       exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table comments;     exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table ai_analyses;  exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table profiles;     exception when duplicate_object then null; end $$;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ §10. SANITY NOTICES                                                      ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

do $$
declare
  v_profiles int;
  v_projects int;
  v_tasks    int;
begin
  select count(*) into v_profiles from profiles;
  select count(*) into v_projects from projects;
  select count(*) into v_tasks    from tasks;

  raise notice '════════════════════════════════════════════════════════════';
  raise notice ' Schema reset complete.';
  raise notice '   profiles: %     projects: %     tasks: %',
                 v_profiles, v_projects, v_tasks;
  raise notice ' Next: visit /login → Create account.';
  raise notice ' The very first signup becomes company_admin automatically.';
  raise notice '════════════════════════════════════════════════════════════';
end $$;

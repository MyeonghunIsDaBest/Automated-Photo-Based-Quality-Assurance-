-- ─────────────────────────────────────────────────────────────────────────────
-- 0002_photos_and_zones.sql — extends the schema with the rest of the
-- entities the frontend already models: zones, photos, AI analysis,
-- comments, and a real audit_log.
--
-- Run AFTER 0001_init.sql. Idempotent like everything else in this folder.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Enums ────────────────────────────────────────────────────────────────────
do $$ begin
  create type note_type   as enum ('issue', 'accuracy_check', 'general');
exception when duplicate_object then null; end $$;

do $$ begin
  create type note_status as enum ('open', 'resolved');
exception when duplicate_object then null; end $$;

do $$ begin
  create type ai_action   as enum ('auto_updated', 'confirmed', 'skipped', 'pending');
exception when duplicate_object then null; end $$;

-- ── Zones ────────────────────────────────────────────────────────────────────
-- A "zone" is a chunk of the site (Level 1, North Wing, etc.) used to colour
-- bars on the Gantt and to group photos.
create table if not exists zones (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references projects(id) on delete cascade,
  name         text not null,
  description  text,
  color_code   text not null default '#64748b',
  created_at   timestamptz not null default now()
);

create index if not exists idx_zones_project_id on zones(project_id);

-- Tasks already had a zone_id column with no FK in 0001_init; add the FK now
-- (drop-and-recreate so this stays idempotent if the column changes later).
do $$ begin
  alter table tasks
    add constraint tasks_zone_id_fkey
    foreign key (zone_id) references zones(id) on delete set null;
exception when duplicate_object then null; end $$;

-- ── Photos ───────────────────────────────────────────────────────────────────
create table if not exists photos (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  task_id         uuid references tasks(id)   on delete set null,
  zone_id         uuid references zones(id)   on delete set null,
  uploaded_by     uuid references auth.users(id) on delete set null,
  filename        text not null,
  storage_path    text not null,                 -- key inside the `photos` bucket
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

create index if not exists idx_photos_project_id on photos(project_id);
create index if not exists idx_photos_task_id    on photos(task_id);
create index if not exists idx_photos_uploaded_at on photos(uploaded_at desc);

-- ── AI analyses ──────────────────────────────────────────────────────────────
-- One row per photo. Kept in its own table so re-running analysis (e.g. a
-- model upgrade) doesn't require touching the photo row.
create table if not exists ai_analyses (
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

create index if not exists idx_ai_analyses_photo_id on ai_analyses(photo_id);

-- ── Comments ─────────────────────────────────────────────────────────────────
-- Polymorphic against task / photo. Keep one of (task_id, photo_id) populated.
create table if not exists comments (
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

create index if not exists idx_comments_task_id  on comments(task_id);
create index if not exists idx_comments_photo_id on comments(photo_id);

-- ── Audit log ────────────────────────────────────────────────────────────────
-- Append-only. RLS denies UPDATE / DELETE for everyone except the service
-- role; the row is written by the trigger / RPC layer, never by the client.
create table if not exists audit_log (
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

create index if not exists idx_audit_log_entity   on audit_log(entity_type, entity_id);
create index if not exists idx_audit_log_project  on audit_log(project_id, created_at desc);

-- ── Row Level Security ───────────────────────────────────────────────────────
alter table zones        enable row level security;
alter table photos       enable row level security;
alter table ai_analyses  enable row level security;
alter table comments     enable row level security;
alter table audit_log    enable row level security;

drop policy if exists "zones: authed read"   on zones;
drop policy if exists "zones: authed write"  on zones;
drop policy if exists "photos: authed read"  on photos;
drop policy if exists "photos: authed write" on photos;
drop policy if exists "ai: authed read"      on ai_analyses;
drop policy if exists "ai: service write"    on ai_analyses;
drop policy if exists "comments: authed read"  on comments;
drop policy if exists "comments: authed write" on comments;
drop policy if exists "audit: authed read"   on audit_log;

create policy "zones: authed read" on zones
  for select using (auth.role() = 'authenticated');
create policy "zones: authed write" on zones
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "photos: authed read" on photos
  for select using (auth.role() = 'authenticated');
create policy "photos: authed write" on photos
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- AI analyses: anyone signed-in reads them, only the service role writes
-- (the analyzer Edge Function uses the service key).
create policy "ai: authed read" on ai_analyses
  for select using (auth.role() = 'authenticated');

create policy "comments: authed read" on comments
  for select using (auth.role() = 'authenticated');
create policy "comments: authed write" on comments
  for all using (auth.role() = 'authenticated' and auth.uid() = user_id)
  with check (auth.role() = 'authenticated' and auth.uid() = user_id);

-- Audit log: read for authed users, no INSERT/UPDATE/DELETE policies → only
-- the service role (and SECURITY DEFINER functions) can write.
create policy "audit: authed read" on audit_log
  for select using (auth.role() = 'authenticated');

-- ── RPCs ─────────────────────────────────────────────────────────────────────
-- Bumps a task's photo_count by 1. Called by the frontend after a successful
-- upload so the Gantt badge stays in sync without a round-trip read.
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

-- ── Realtime ─────────────────────────────────────────────────────────────────
-- Photos in the activity feed, comments in the side panel.
alter publication supabase_realtime add table photos;
alter publication supabase_realtime add table comments;
alter publication supabase_realtime add table ai_analyses;

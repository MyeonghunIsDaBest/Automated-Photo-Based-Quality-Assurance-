-- 20_diary_entries.sql
-- The Site Diary persistence table. The deployed site-diary-assistant Edge
-- Function has queried `diary_entries` since launch (date, description,
-- weather, temperature_f, personnel) but the table was never migrated — so
-- Sparky has had ZERO history context in production. This creates it; the
-- frontend dual-writes each entry here (Zustand stays the editing source of
-- truth) and subscribes to realtime so cross-device entries arrive live.
--
-- PK is `text` (not uuid) so client-generated ids (`diary_<ts>_<rand>`)
-- round-trip cleanly, giving realtime a stable key to dedupe local vs remote.
--
-- Sequence: 00_init … 19_project_status_snapshots, 20_diary_entries ← THIS.
create table if not exists public.diary_entries (
  id            text primary key,
  project_id    uuid not null references public.projects(id) on delete cascade,
  -- org_id-ready (roadmap P6 multi-tenant): nullable now, no FK until the
  -- organizations table lands, so future RLS activation is a backfill not a
  -- re-migration.
  org_id        uuid,
  date          date not null,
  description   text not null default '',
  weather       text check (weather in ('sunny','cloudy','rain','storm')),
  temperature_f numeric,
  personnel     jsonb not null default '[]',
  photo_ids     text[] not null default '{}',
  start_time    text,
  end_time      text,
  status        text check (status in ('signed','pending','flagged')) default 'pending',
  tags          text[] not null default '{}',
  created_by    text,
  created_at    timestamptz not null default now()
);

create index if not exists idx_diary_entries_project_date
  on public.diary_entries (project_id, date desc);

-- RLS. Read for any authenticated user (matches the project-scoped read model
-- used elsewhere). INSERT/UPDATE are needed because the frontend writes with
-- the anon/auth key (NOT the service-role key), unlike the AI tables which are
-- written only by Edge Functions. Project-membership enforcement in RLS is a
-- Stage-3 follow-up (P3.1); for now any authenticated user may write, matching
-- the current trust model of the other client-written tables.
alter table public.diary_entries enable row level security;
drop policy if exists "diary: read"   on public.diary_entries;
drop policy if exists "diary: insert" on public.diary_entries;
drop policy if exists "diary: update" on public.diary_entries;
create policy "diary: read"   on public.diary_entries for select using (auth.role() = 'authenticated');
create policy "diary: insert" on public.diary_entries for insert with check (auth.role() = 'authenticated');
create policy "diary: update" on public.diary_entries for update using (auth.role() = 'authenticated');

-- Realtime so a diary entry created in one window arrives in another.
-- ALTER PUBLICATION ADD TABLE has no "if not exists"; swallow the dup error.
do $$ begin
  alter publication supabase_realtime add table public.diary_entries;
exception when duplicate_object then null; end $$;

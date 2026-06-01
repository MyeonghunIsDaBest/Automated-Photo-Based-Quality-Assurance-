-- 23_warranties.sql
-- First procurement domain moved off the client-only Zustand store onto
-- Supabase (roadmap P1.5). Equipment + workmanship warranties with expiry,
-- optionally linked back to an invoice / order / line item. Written by the
-- frontend (anon/auth key) so it needs explicit insert/update/delete policies,
-- unlike the AI tables which only the service role writes.
--
-- Sequence: 00_init … 22_status_snapshot_narrative, 23_warranties ← THIS.
create table if not exists public.warranties (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  -- org_id-ready (roadmap P6 multi-tenant): nullable now, no FK until the
  -- organizations table lands, so future RLS activation is a backfill not a
  -- re-migration.
  org_id        uuid,
  description   text not null,
  supplier_name text not null default '',
  start_date    date not null,
  expiry_date   date not null,
  -- Optional linkage to the procurement chain (text refs — the linked rows
  -- live in tables migrated in later P1 steps; no FK yet to avoid ordering
  -- coupling).
  invoice_id    text,
  order_id      text,
  line_item_id  text,
  file_ref      text,
  notes         text,
  created_at    timestamptz not null default now()
);

create index if not exists idx_warranties_project on public.warranties (project_id, expiry_date);

-- RLS: read + write for any authenticated user (project-membership scoping is
-- the Stage-3 follow-up P3.1, matching the current trust model of the other
-- client-written tables).
alter table public.warranties enable row level security;
drop policy if exists "warranties: read"   on public.warranties;
drop policy if exists "warranties: insert" on public.warranties;
drop policy if exists "warranties: update" on public.warranties;
drop policy if exists "warranties: delete" on public.warranties;
create policy "warranties: read"   on public.warranties for select using (auth.role() = 'authenticated');
create policy "warranties: insert" on public.warranties for insert with check (auth.role() = 'authenticated');
create policy "warranties: update" on public.warranties for update using (auth.role() = 'authenticated');
create policy "warranties: delete" on public.warranties for delete using (auth.role() = 'authenticated');

-- Realtime so a warranty added on one device shows on another.
do $$ begin
  alter publication supabase_realtime add table public.warranties;
exception when duplicate_object then null; end $$;

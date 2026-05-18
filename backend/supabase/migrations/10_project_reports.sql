-- Persistent project reports.
--
-- Migration 09 added `project_config.report_cadence` ∈ none / weekly /
-- monthly but no scheduler ever read it. This migration adds the persistence
-- layer so the new `generate-reports` Edge Function can write a row per run,
-- and the Reports page can list "recent reports" from a real table instead of
-- only deriving them at view time.
--
-- Schema mirrors the frontend `Report` interface (`types/index.ts:381`) so a
-- row → camelCase mapper in `lib/api/reports.ts` is a 1:1 projection.
--
-- Sequence: 00_init … 09_project_config, 10_project_reports ← THIS.

create table if not exists public.project_reports (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null references public.projects(id) on delete cascade,
  report_type         text not null
    check (report_type in ('daily', 'weekly', 'monthly')),
  generated_at        timestamptz not null default now(),
  date_from           date not null,
  date_to             date not null,
  -- Optional pointer to a rendered PDF/CSV in Storage. Phase D-after may
  -- generate these on demand; today the JSON summary is the canonical record.
  storage_path        text,
  -- Snapshot of the metrics that drove this report. Kept as JSONB so the
  -- shape can evolve without a new migration.
  summary             jsonb not null default '{}'::jsonb,
  status              text not null default 'ready'
    check (status in ('queued', 'ready', 'failed')),
  -- Idempotency seam — the generator writes the run's date-range so the same
  -- weekly window can't accidentally double-insert.
  generation_run_id   text,
  failure_reason      text,

  constraint project_reports_date_window check (date_from <= date_to)
);

create index if not exists idx_project_reports_project_recent
  on public.project_reports (project_id, generated_at desc);

-- Idempotency: one report per (project, type, date_from) so a cron firing
-- twice on the same day for the same project doesn't double-insert.
create unique index if not exists ux_project_reports_unique_window
  on public.project_reports (project_id, report_type, date_from);

-- RLS. Read is open to any authenticated user (matches the existing read
-- policy on projects + project_config). The Edge Function writes via the
-- service-role key so no INSERT/UPDATE policy is required for write access
-- through the standard auth flow — those operations can't happen except
-- through service-role.
alter table public.project_reports enable row level security;

drop policy if exists "project_reports: read" on public.project_reports;
create policy "project_reports: read" on public.project_reports
  for select using (auth.role() = 'authenticated');

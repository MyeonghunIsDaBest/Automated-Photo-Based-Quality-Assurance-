-- Per-project configuration.
--
-- Every AI threshold, progression weight, branding token, and operating
-- mode the system uses is currently a code constant — CONFIDENCE_AUTO_UPDATE,
-- CONFIDENCE_REVIEW_QUEUE, PHASH_DUPLICATE_THRESHOLD, the 'mvp-stub@v0'
-- default model, the always-allowed manager force-floor, the not-yet-shipped
-- 40/25/35 progression weights, and so on. Two pilot sites with different
-- tolerance for AI auto-actions can't be served by the same deployment
-- without forking these.
--
-- This migration introduces a 1:1 sidecar to `projects`: one config row per
-- project, defaulting to today's hardcoded values verbatim so the day-0
-- behaviour is identical. The Edge Functions read these through the new
-- `_shared/loadProjectConfig.ts` helper (60s in-memory cache); the frontend
-- reads them through `lib/api/projectConfig.ts` + `useProjectConfig`.
--
-- Sequence: 00_init … 08_messaging_creator_read, 09_project_config ← THIS.

create table if not exists public.project_config (
  project_id uuid primary key references public.projects(id) on delete cascade,

  -- AI thresholds — decideAction.ts consumes these.
  ai_auto_update_threshold  numeric(4,3) not null default 0.85
    check (ai_auto_update_threshold between 0 and 1),
  ai_review_queue_threshold numeric(4,3) not null default 0.50
    check (ai_review_queue_threshold between 0 and 1),
  ai_default_model          text not null default 'mvp-stub@v0',

  -- Progression.
  progression_mode          text not null default 'human_assisted'
    check (progression_mode in ('manual', 'human_assisted', 'full_auto')),
  weight_checklist          int not null default 40 check (weight_checklist between 0 and 100),
  weight_photos             int not null default 25 check (weight_photos between 0 and 100),
  weight_ai                 int not null default 35 check (weight_ai between 0 and 100),
  target_photos_per_task    int not null default 3  check (target_photos_per_task between 1 and 50),
  manual_floor_allowed      boolean not null default true,

  -- Dedup.
  phash_threshold           int not null default 6 check (phash_threshold between 0 and 64),

  -- Branding (light). null = use the global emerald default.
  accent_color              text,
  logo_storage_path         text,

  -- Reports — cadence stored; the scheduler itself is a follow-up plan.
  report_cadence            text not null default 'none'
    check (report_cadence in ('none', 'weekly', 'monthly')),

  -- Audit.
  updated_by                uuid references auth.users(id) on delete set null,
  updated_at                timestamptz not null default now(),

  constraint project_config_weights_sum_100
    check (weight_checklist + weight_photos + weight_ai = 100),
  constraint project_config_review_le_auto
    check (ai_review_queue_threshold <= ai_auto_update_threshold)
);

-- Backfill: every existing project gets a default row. Idempotent.
insert into public.project_config (project_id)
select id from public.projects
on conflict (project_id) do nothing;

-- RLS. Read for any authenticated user (matches `projects: read` at
-- 00_init.sql:760). Update gated by `is_manager_or_above()` from 00_init.sql.
-- No INSERT / DELETE policies: rows are created by the trigger below and
-- removed by FK cascade when the parent project is deleted.
alter table public.project_config enable row level security;

drop policy if exists "project_config: read"   on public.project_config;
drop policy if exists "project_config: update" on public.project_config;

create policy "project_config: read" on public.project_config
  for select using (auth.role() = 'authenticated');

create policy "project_config: update" on public.project_config
  for update using (is_manager_or_above())
  with check (is_manager_or_above() and updated_by = auth.uid());

-- Auto-touch `updated_at` on every UPDATE.
create or replace function public.touch_project_config_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

drop trigger if exists trg_project_config_updated_at on public.project_config;
create trigger trg_project_config_updated_at
  before update on public.project_config
  for each row execute function public.touch_project_config_updated_at();

-- Auto-create a default config row whenever a project is created. Keeps the
-- 1:1 invariant without forcing the application to remember to write the
-- sidecar.
create or replace function public.create_project_config_for_new_project()
returns trigger
language plpgsql
as $$
begin
  insert into public.project_config (project_id) values (new.id)
    on conflict (project_id) do nothing;
  return new;
end
$$;

drop trigger if exists trg_create_project_config on public.projects;
create trigger trg_create_project_config
  after insert on public.projects
  for each row execute function public.create_project_config_for_new_project();

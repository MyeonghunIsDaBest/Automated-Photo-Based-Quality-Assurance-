-- ============================================================
-- 85) Quote schedule resources (Simpro quote "Schedule" tab)
-- ============================================================
-- Phase 1 Part 9 of the quote rework. The Schedule tab lets the office plan WHO
-- works the job and for how long: an employee (profile) scheduled to this quote
-- with hours + an optional date/start/finish, costed at a labour role's rate.
--
-- This is an internal RESOURCING/PLANNING view — it does NOT feed the quote total
-- (the Billable → Labour lines remain the costed source). resource_type carries
-- 'contractor'/'plant' for future use (no data model for those yet).
--
-- Manager-only (quoting construct). Additive + idempotent.
-- Depends: 00_init (is_manager_or_above), 64 (touch_updated_at()), 79 (quotes).
-- ============================================================

create table if not exists public.quote_schedule_resources (
  id             uuid primary key default gen_random_uuid(),
  quote_id       uuid not null references public.quotes(id) on delete cascade,
  resource_type  text not null default 'employee'
                   check (resource_type in ('employee','contractor','plant')),
  profile_id     uuid references auth.users(id) on delete set null,  -- the employee
  resource_label text,                                               -- display snapshot
  role           text,                                               -- labour role for the rate lookup
  hours          numeric(8,2) not null default 0,
  scheduled_date date,
  start_time     text,
  finish_time    text,
  sort_order     int not null default 0,
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists idx_quote_schedule_resources_quote on public.quote_schedule_resources(quote_id);

drop trigger if exists trg_quote_schedule_resources_touch on public.quote_schedule_resources;
create trigger trg_quote_schedule_resources_touch before update on public.quote_schedule_resources
  for each row execute function public.touch_updated_at();

comment on table public.quote_schedule_resources is
  'Resources (employees now; contractors/plant later) scheduled to a quote on the Schedule tab — hours + optional date/start/finish, costed at a labour role rate. Planning aid; does not feed the quote total.';

-- ── RLS: manager-or-above for read + write (quoting is manager-only) ──
alter table public.quote_schedule_resources enable row level security;
drop policy if exists quote_schedule_resources_mgr_all on public.quote_schedule_resources;
create policy quote_schedule_resources_mgr_all on public.quote_schedule_resources
  for all using (public.is_manager_or_above()) with check (public.is_manager_or_above());

notify pgrst, 'reload schema';

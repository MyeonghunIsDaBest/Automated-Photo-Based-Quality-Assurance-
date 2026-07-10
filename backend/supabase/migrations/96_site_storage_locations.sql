-- ============================================================
-- 96) Site & storage locations — stock lives where the work is
-- ============================================================
-- Luke's ask: project sites ("Luke's house build") and ad-hoc spots ("the
-- Elsternwick container") hold stock exactly like vans do — transfers in/out,
-- running tallies, movement history, map pins (mig 92 columns already exist).
-- A SITE can link to the job/project it serves; STORAGE is a free-standing
-- spot. Vans keep their driver + rego semantics; the worker "my van" rule
-- tightens so a site can never masquerade as someone's van.
--
-- This closes the parked "how do projects tie in" question: through STOCK
-- locations, not Gantt scaffolding.
--
-- Additive + idempotent. Depends: 87 (stock core), 92 (geo columns),
-- 63 (service_jobs), 70 (simpro_jobs), 00 (projects).
-- ============================================================

-- ── Widen the location type ──────────────────────────────────────────────────
alter table public.stock_locations drop constraint if exists stock_locations_type_check;
alter table public.stock_locations add constraint stock_locations_type_check
  check (type in ('factory','van','site','storage'));

comment on column public.stock_locations.type is
  'factory = the warehouse (one, seeded) · van = a worker''s vehicle (driver + rego) · site = a job/project site holding stock (may link to a job) · storage = a free-standing spot (container, lock-up).';

-- ── Optional job/project links for SITE locations ────────────────────────────
alter table public.stock_locations
  add column if not exists service_job_id uuid references public.service_jobs(id) on delete set null,
  add column if not exists simpro_job_id  uuid references public.simpro_jobs(id) on delete set null,
  add column if not exists project_id     uuid references public.projects(id) on delete set null;

create index if not exists idx_stock_locations_service_job on public.stock_locations(service_job_id);
create index if not exists idx_stock_locations_simpro_job on public.stock_locations(simpro_job_id);
create index if not exists idx_stock_locations_project on public.stock_locations(project_id);

-- One SITE per job: the client-side find-or-create ("Create site location" in
-- the job drawer) is select-then-insert, so two managers clicking at once
-- would otherwise create duplicates. The client retries its find on 23505.
create unique index if not exists uq_stock_locations_site_service_job
  on public.stock_locations(service_job_id) where type = 'site' and service_job_id is not null;
create unique index if not exists uq_stock_locations_site_simpro_job
  on public.stock_locations(simpro_job_id) where type = 'site' and simpro_job_id is not null;

-- ── Tighten the worker "my van" RLS helper ───────────────────────────────────
-- The mig-87 version matches ANY active location assigned to the caller; now
-- that sites/storage exist, a site row carrying assigned_worker_id would grant
-- that worker DB-level reads + usage-inserts against it while the van UI shows
-- nothing. Same body as 87, plus the type filter.
create or replace function public.is_my_van(loc uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.stock_locations
    where id = loc and assigned_worker_id = auth.uid() and is_active and type = 'van'
  );
$$;

notify pgrst, 'reload schema';

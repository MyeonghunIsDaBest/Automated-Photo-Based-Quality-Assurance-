-- ============================================================
-- 87) Stock & Inventory — core (locations + levels + movements)
-- ============================================================
-- Phase 1 of the multi-location stock system. The factory and each van are
-- stock LOCATIONS; every item has a per-location running tally (stock_levels);
-- every change is an immutable MOVEMENT (usage/receipt/transfer/adjustment/
-- stocktake) that a trigger applies to the tally. Items are `materials` flagged
-- is_stock_item (no duplicate catalogue).
--
-- Access: one driver per van — a worker sees/records only THEIR van; managers
-- see/act on all. The apply-delta trigger is SECURITY DEFINER so a worker's
-- usage insert can still move the tally (workers can't write stock_levels directly).
--
-- Additive + idempotent. Depends: 00_init (current_security_group,
-- is_manager_or_above), 64 (materials, touch_updated_at), 63 (service_jobs),
-- 70 (simpro_jobs).
-- ============================================================

-- ── Locations ────────────────────────────────────────────────────────────────
create table if not exists public.stock_locations (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  type               text not null default 'van' check (type in ('factory','van')),
  assigned_worker_id uuid references public.profiles(id) on delete set null,  -- van driver; null for factory
  rego               text,
  is_active          boolean not null default true,
  created_by         uuid references auth.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists idx_stock_locations_worker on public.stock_locations(assigned_worker_id);

drop trigger if exists trg_stock_locations_touch on public.stock_locations;
create trigger trg_stock_locations_touch before update on public.stock_locations
  for each row execute function public.touch_updated_at();

-- ── Per-location running tally (maintained ONLY by the movements trigger) ──
create table if not exists public.stock_levels (
  id          uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.stock_locations(id) on delete cascade,
  material_id uuid not null references public.materials(id) on delete cascade,
  qty         numeric(12,2) not null default 0,
  updated_at  timestamptz not null default now(),
  unique (location_id, material_id)
);
create index if not exists idx_stock_levels_material on public.stock_levels(material_id);

-- ── Movement ledger (the source of truth) ──
create table if not exists public.stock_movements (
  id                    uuid primary key default gen_random_uuid(),
  material_id           uuid not null references public.materials(id) on delete cascade,
  location_id           uuid not null references public.stock_locations(id) on delete cascade,
  qty_delta             numeric(12,2) not null,                 -- +receipt / −usage
  reason                text not null
                          check (reason in ('usage','receipt','transfer_out','transfer_in','adjustment','stocktake')),
  counterpart_location_id uuid references public.stock_locations(id) on delete set null,  -- transfers
  service_job_id        uuid references public.service_jobs(id) on delete set null,       -- usage → job
  simpro_job_id         uuid references public.simpro_jobs(id) on delete set null,        -- usage → job
  unit_cost             numeric(12,2),                          -- cost snapshot for valuation / job cost
  note                  text,
  created_by            uuid references auth.users(id) on delete set null,
  created_at            timestamptz not null default now()
);
create index if not exists idx_stock_movements_location on public.stock_movements(location_id);
create index if not exists idx_stock_movements_material on public.stock_movements(material_id);
create index if not exists idx_stock_movements_service_job on public.stock_movements(service_job_id);
create index if not exists idx_stock_movements_simpro_job on public.stock_movements(simpro_job_id);

comment on table public.stock_movements is
  'Immutable stock ledger. A trigger applies qty_delta to stock_levels. usage rows carry a job + unit_cost so a job''s materials cost = sum(qty*unit_cost).';

-- ── Apply each movement to the running tally (SECURITY DEFINER) ──
create or replace function public.apply_stock_movement() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.stock_levels (location_id, material_id, qty)
  values (new.location_id, new.material_id, new.qty_delta)
  on conflict (location_id, material_id)
  do update set qty = public.stock_levels.qty + new.qty_delta, updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_apply_stock_movement on public.stock_movements;
create trigger trg_apply_stock_movement after insert on public.stock_movements
  for each row execute function public.apply_stock_movement();

-- ── "Is this location the caller's van?" helper for worker RLS ──
create or replace function public.is_my_van(loc uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.stock_locations
    where id = loc and assigned_worker_id = auth.uid() and is_active
  );
$$;

-- ── RLS — workers: own van only; managers: all ──
alter table public.stock_locations enable row level security;
drop policy if exists stock_locations_select on public.stock_locations;
create policy stock_locations_select on public.stock_locations
  for select using (public.is_manager_or_above() or public.current_security_group() = 'worker');
drop policy if exists stock_locations_mgr_all on public.stock_locations;
create policy stock_locations_mgr_all on public.stock_locations
  for all using (public.is_manager_or_above()) with check (public.is_manager_or_above());

alter table public.stock_levels enable row level security;
drop policy if exists stock_levels_select on public.stock_levels;
create policy stock_levels_select on public.stock_levels
  for select using (public.is_manager_or_above() or public.is_my_van(location_id));
drop policy if exists stock_levels_mgr_all on public.stock_levels;
create policy stock_levels_mgr_all on public.stock_levels
  for all using (public.is_manager_or_above()) with check (public.is_manager_or_above());

alter table public.stock_movements enable row level security;
drop policy if exists stock_movements_select on public.stock_movements;
create policy stock_movements_select on public.stock_movements
  for select using (public.is_manager_or_above() or public.is_my_van(location_id));
drop policy if exists stock_movements_worker_usage on public.stock_movements;
create policy stock_movements_worker_usage on public.stock_movements
  for insert with check (
    public.current_security_group() = 'worker'
    and public.is_my_van(location_id)
    and reason = 'usage'
  );
drop policy if exists stock_movements_mgr_all on public.stock_movements;
create policy stock_movements_mgr_all on public.stock_movements
  for all using (public.is_manager_or_above()) with check (public.is_manager_or_above());

-- ── Seed the factory + backfill opening balances from the old single figure ──
-- (One-time: existing materials.stock_on_hand becomes a factory opening stocktake.
--  Idempotent via the guards; materials.stock_on_hand is deprecated hereafter.)
insert into public.stock_locations (name, type)
select 'Factory', 'factory'
where not exists (select 1 from public.stock_locations where type = 'factory');

insert into public.stock_movements (material_id, location_id, qty_delta, reason, note)
select m.id, f.id, m.stock_on_hand, 'stocktake', 'Opening balance (migrated)'
from public.materials m
cross join lateral (select id from public.stock_locations where type = 'factory' limit 1) f
where m.is_stock_item
  and coalesce(m.stock_on_hand, 0) <> 0
  and not exists (
    select 1 from public.stock_movements sm
    where sm.material_id = m.id and sm.note = 'Opening balance (migrated)'
  );

notify pgrst, 'reload schema';

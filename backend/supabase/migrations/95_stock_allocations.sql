-- ============================================================
-- 95) Job boxes — stock allocations (allocate → accept → accountability)
-- ============================================================
-- Luke's flow: a manager packs a "job box" of factory stock for a won job and
-- ALLOCATES it to the scheduled tech. Nothing moves yet — the tally only
-- changes when the tech ACCEPTS the box at pickup, which emits the ordinary
-- paired transfer movements (factory → their van). That accept is the
-- accountability moment: who took the box, and when.
--
-- Lifecycle: pending → accepted | declined | cancelled.
--   • accept  = SECURITY DEFINER RPC (assignee-only, idempotent) that inserts
--     the transfer_out/transfer_in pair per line. Workers can't insert raw
--     transfer movements (mig 87 RLS only allows their 'usage') — the ledger
--     stays immutable and the RPC is the single door.
--   • decline = assignee RPC with a note ("box short a breaker"); no stock moves.
--   • cancel  = manager update (pending only), done client-side under RLS.
-- A status trigger notifies the manager who packed the box (worker→manager
-- direction can't use notify_user(), which is manager-guarded).
--
-- Additive + idempotent. Depends: 87 (stock core), 88 (notifications/notify_user
-- pattern), 63 (service_jobs), 70 (simpro_jobs), 64 (materials).
-- ============================================================

-- ── Allocation headers ───────────────────────────────────────────────────────
create table if not exists public.stock_allocations (
  id                 uuid primary key default gen_random_uuid(),
  -- exactly one job reference (service/simpro pattern, as on stock_movements)
  service_job_id     uuid references public.service_jobs(id) on delete cascade,
  simpro_job_id      uuid references public.simpro_jobs(id) on delete cascade,
  source_location_id uuid not null references public.stock_locations(id) on delete cascade,
  -- normally null → resolved to the assignee's active van at accept time
  dest_location_id   uuid references public.stock_locations(id) on delete set null,
  assigned_to        uuid not null references public.profiles(id) on delete cascade,
  status             text not null default 'pending'
                       check (status in ('pending','accepted','declined','cancelled')),
  note               text,          -- manager note ("box on rack B")
  decline_note       text,          -- worker's reason when declining
  created_by         uuid references auth.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  accepted_at        timestamptz,
  constraint stock_allocations_one_job check ((service_job_id is null) <> (simpro_job_id is null))
);
create index if not exists idx_stock_allocations_service_job on public.stock_allocations(service_job_id);
create index if not exists idx_stock_allocations_simpro_job on public.stock_allocations(simpro_job_id);
create index if not exists idx_stock_allocations_assignee on public.stock_allocations(assigned_to, status);

drop trigger if exists trg_stock_allocations_touch on public.stock_allocations;
create trigger trg_stock_allocations_touch before update on public.stock_allocations
  for each row execute function public.touch_updated_at();

comment on table public.stock_allocations is
  'Job boxes: factory stock packed for a job, pending until the assigned tech accepts at pickup. Accept emits paired transfer movements via accept_stock_allocation() — the ledger itself stays immutable.';

-- ── Allocation lines ─────────────────────────────────────────────────────────
create table if not exists public.stock_allocation_lines (
  id            uuid primary key default gen_random_uuid(),
  allocation_id uuid not null references public.stock_allocations(id) on delete cascade,
  material_id   uuid not null references public.materials(id) on delete cascade,
  qty           numeric(12,2) not null check (qty > 0),
  unit_cost     numeric(12,2),   -- cost snapshot at allocation time
  sort_order    integer not null default 0
);
create index if not exists idx_stock_allocation_lines_alloc on public.stock_allocation_lines(allocation_id);

-- ── ACCEPT: assignee-only, idempotent, emits the transfer pair per line ──────
create or replace function public.accept_stock_allocation(p_allocation uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  a public.stock_allocations%rowtype;
  v_van uuid;
  l record;
begin
  select * into a from public.stock_allocations where id = p_allocation for update;
  if not found then
    raise exception 'job box not found';
  end if;
  -- IS DISTINCT FROM: a plain <> is NULL-permissive when auth.uid() is null
  -- (anon), which would skip the raise and run the definer body.
  if a.assigned_to is distinct from auth.uid() then
    raise exception 'only the assigned worker can accept this job box';
  end if;
  if a.status = 'accepted' then
    return;  -- idempotent: double-tap / retry is a no-op
  end if;
  if a.status <> 'pending' then
    raise exception 'job box is % — only pending boxes can be accepted', a.status;
  end if;

  -- Resolve the destination: explicit dest wins, else the assignee's van.
  v_van := a.dest_location_id;
  if v_van is null then
    select id into v_van from public.stock_locations
    where assigned_worker_id = a.assigned_to and is_active and type = 'van'
    limit 1;
  end if;
  if v_van is null then
    raise exception 'no active van is assigned to you — ask a manager to set your van first';
  end if;

  for l in
    select material_id, qty, unit_cost
    from public.stock_allocation_lines
    where allocation_id = a.id
    order by sort_order, id
  loop
    insert into public.stock_movements
      (material_id, location_id, qty_delta, reason, counterpart_location_id, unit_cost, note, created_by)
    values
      (l.material_id, a.source_location_id, -l.qty, 'transfer_out', v_van, l.unit_cost, 'Job box', auth.uid()),
      (l.material_id, v_van,                 l.qty, 'transfer_in',  a.source_location_id, l.unit_cost, 'Job box', auth.uid());
  end loop;

  update public.stock_allocations
  set status = 'accepted', dest_location_id = v_van, accepted_at = now()
  where id = a.id;
end;
$$;

-- ── DECLINE: assignee-only, note required by the UI (nullable here) ──────────
create or replace function public.decline_stock_allocation(p_allocation uuid, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  a public.stock_allocations%rowtype;
begin
  select * into a from public.stock_allocations where id = p_allocation for update;
  if not found then
    raise exception 'job box not found';
  end if;
  if a.assigned_to is distinct from auth.uid() then
    raise exception 'only the assigned worker can decline this job box';
  end if;
  if a.status = 'declined' then
    return;  -- idempotent
  end if;
  if a.status <> 'pending' then
    raise exception 'job box is % — only pending boxes can be declined', a.status;
  end if;

  update public.stock_allocations
  set status = 'declined', decline_note = coalesce(p_note, decline_note)
  where id = a.id;
end;
$$;

-- Signed-in users only — anon/public can never touch the definer RPCs
-- (matches the mig 65/76 convention for sensitive functions).
revoke execute on function public.accept_stock_allocation(uuid) from public, anon;
revoke execute on function public.decline_stock_allocation(uuid, text) from public, anon;
grant execute on function public.accept_stock_allocation(uuid) to authenticated;
grant execute on function public.decline_stock_allocation(uuid, text) to authenticated;

-- ── Worker→manager notification on accept/decline ────────────────────────────
-- (Direct insert: notify_user() is manager-guarded, and here the ACTOR is the
--  worker. SECURITY DEFINER so the insert clears the notifications RLS.)
create or replace function public.notify_allocation_status() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_worker text;
begin
  if old.status = 'pending' and new.status in ('accepted','declined') and new.created_by is not null then
    select nullif(trim(first_name || ' ' || last_name), '') into v_worker
    from public.profiles where id = new.assigned_to;
    insert into public.notifications (user_id, type, priority, title, message, metadata)
    values (
      new.created_by,
      'stock_allocation',
      case when new.status = 'declined' then 'high' else 'medium' end,
      case when new.status = 'accepted' then 'Job box accepted' else 'Job box declined' end,
      coalesce(v_worker, 'The assigned worker')
        || case when new.status = 'accepted' then ' accepted the job box.'
                else ' declined the job box' || coalesce(': ' || new.decline_note, '.') end,
      -- job refs let the bell deep-link the manager to the job's drawer
      jsonb_build_object('allocationId', new.id, 'status', new.status,
                         'serviceJobId', new.service_job_id, 'simproJobId', new.simpro_job_id)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_allocation_status on public.stock_allocations;
create trigger trg_notify_allocation_status after update on public.stock_allocations
  for each row execute function public.notify_allocation_status();

-- ── RLS — managers: all; assignee: read own (all writes go through the RPCs) ─
alter table public.stock_allocations enable row level security;
drop policy if exists stock_allocations_mgr_all on public.stock_allocations;
create policy stock_allocations_mgr_all on public.stock_allocations
  for all using (public.is_manager_or_above()) with check (public.is_manager_or_above());
drop policy if exists stock_allocations_assignee_select on public.stock_allocations;
create policy stock_allocations_assignee_select on public.stock_allocations
  for select using (assigned_to = auth.uid());

alter table public.stock_allocation_lines enable row level security;
drop policy if exists stock_allocation_lines_mgr_all on public.stock_allocation_lines;
create policy stock_allocation_lines_mgr_all on public.stock_allocation_lines
  for all using (public.is_manager_or_above()) with check (public.is_manager_or_above());
drop policy if exists stock_allocation_lines_assignee_select on public.stock_allocation_lines;
create policy stock_allocation_lines_assignee_select on public.stock_allocation_lines
  for select using (exists (
    select 1 from public.stock_allocations a
    where a.id = allocation_id and a.assigned_to = auth.uid()
  ));

notify pgrst, 'reload schema';

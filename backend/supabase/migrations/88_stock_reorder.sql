-- ============================================================
-- 88) Stock Phase 2 — reorder rules, settings, purchase orders, restock alert
-- ============================================================
-- Minimums + auto-restock. Each stocked item can have a company-wide min + target
-- + preferred wholesaler (stock_reorder_rules). When the company total drops
-- below min, the app drafts a restock purchase_order (kind='restock') to top back
-- up to target and alerts the nominated stock controller (stock_settings) via a
-- SECURITY DEFINER notify RPC. purchase_orders/purchase_order_items also back the
-- on-the-job PO path (Phase 3).
--
-- Manager-only. Additive + idempotent. Depends: 00_init (is_manager_or_above),
-- 64 (touch_updated_at, materials), 87 (stock_locations), 46 (notifications),
-- 0007 (suppliers), 63/70 (jobs).
-- ============================================================

-- ── Per-item reorder rules (company-wide thresholds) ──
create table if not exists public.stock_reorder_rules (
  material_id     uuid primary key references public.materials(id) on delete cascade,
  min_qty         numeric(12,2) not null default 0,
  target_qty      numeric(12,2) not null default 0,
  supplier_id     uuid references public.suppliers(id) on delete set null,
  reorder_enabled boolean not null default true,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

drop trigger if exists trg_stock_reorder_rules_touch on public.stock_reorder_rules;
create trigger trg_stock_reorder_rules_touch before update on public.stock_reorder_rules
  for each row execute function public.touch_updated_at();

-- ── Office-wide stock settings (singleton) ──
create table if not exists public.stock_settings (
  id                  int primary key default 1 check (id = 1),
  stock_controller_id uuid references public.profiles(id) on delete set null,  -- gets restock alerts
  auto_send           boolean not null default false,                          -- Phase 3: email PO without review
  updated_at          timestamptz not null default now()
);
insert into public.stock_settings (id) values (1) on conflict (id) do nothing;

drop trigger if exists trg_stock_settings_touch on public.stock_settings;
create trigger trg_stock_settings_touch before update on public.stock_settings
  for each row execute function public.touch_updated_at();

-- ── Purchase orders (restock now; on-the-job in Phase 3) ──
create sequence if not exists public.purchase_order_seq;

create table if not exists public.purchase_orders (
  id                     uuid primary key default gen_random_uuid(),
  number                 text not null unique default ('PO-' || lpad(nextval('public.purchase_order_seq')::text, 6, '0')),
  kind                   text not null default 'restock' check (kind in ('restock','job')),
  supplier_id            uuid references public.suppliers(id) on delete set null,
  destination_location_id uuid references public.stock_locations(id) on delete set null,  -- factory for restock
  service_job_id         uuid references public.service_jobs(id) on delete set null,      -- job POs
  simpro_job_id          uuid references public.simpro_jobs(id) on delete set null,
  status                 text not null default 'draft'
                           check (status in ('suggested','draft','sent','partial','received','cancelled')),
  expected_date          date,
  notes                  text,
  created_by             uuid references auth.users(id) on delete set null,
  sent_at                timestamptz,
  received_at            timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index if not exists idx_purchase_orders_status on public.purchase_orders(status);
create index if not exists idx_purchase_orders_supplier on public.purchase_orders(supplier_id);

drop trigger if exists trg_purchase_orders_touch on public.purchase_orders;
create trigger trg_purchase_orders_touch before update on public.purchase_orders
  for each row execute function public.touch_updated_at();

create table if not exists public.purchase_order_items (
  id           uuid primary key default gen_random_uuid(),
  po_id        uuid not null references public.purchase_orders(id) on delete cascade,
  material_id  uuid references public.materials(id) on delete set null,
  description  text,
  qty_ordered  numeric(12,2) not null default 0,
  qty_received numeric(12,2) not null default 0,
  unit_cost    numeric(12,2),
  sort_order   int not null default 0
);
create index if not exists idx_purchase_order_items_po on public.purchase_order_items(po_id);

-- ── Notify another user (restock alert). SECURITY DEFINER bypasses the self-only
--    RLS on notifications; guarded to managers so only the app's restock flow uses it. ──
create or replace function public.notify_user(
  p_user uuid, p_type text, p_priority text, p_title text, p_message text, p_metadata jsonb default '{}'::jsonb
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_manager_or_above() then
    raise exception 'not authorised';
  end if;
  if p_user is null then return; end if;
  insert into public.notifications (user_id, type, priority, title, message, metadata)
  values (p_user, p_type, coalesce(p_priority, 'medium'), p_title, p_message, coalesce(p_metadata, '{}'::jsonb));
end;
$$;

-- ── RLS — manager-only across the purchasing tables ──
alter table public.stock_reorder_rules enable row level security;
drop policy if exists stock_reorder_rules_mgr_all on public.stock_reorder_rules;
create policy stock_reorder_rules_mgr_all on public.stock_reorder_rules
  for all using (public.is_manager_or_above()) with check (public.is_manager_or_above());

alter table public.stock_settings enable row level security;
drop policy if exists stock_settings_mgr_all on public.stock_settings;
create policy stock_settings_mgr_all on public.stock_settings
  for all using (public.is_manager_or_above()) with check (public.is_manager_or_above());

alter table public.purchase_orders enable row level security;
drop policy if exists purchase_orders_mgr_all on public.purchase_orders;
create policy purchase_orders_mgr_all on public.purchase_orders
  for all using (public.is_manager_or_above()) with check (public.is_manager_or_above());

alter table public.purchase_order_items enable row level security;
drop policy if exists purchase_order_items_mgr_all on public.purchase_order_items;
create policy purchase_order_items_mgr_all on public.purchase_order_items
  for all using (public.is_manager_or_above()) with check (public.is_manager_or_above());

notify pgrst, 'reload schema';

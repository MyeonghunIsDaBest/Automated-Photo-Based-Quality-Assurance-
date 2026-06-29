-- ============================================================
-- 86) Customer assets + quote ↔ asset links (Simpro quote "Customer Assets" tab)
-- ============================================================
-- Phase 1 Part 10 of the quote rework. A register of a customer's serviceable
-- assets (solar inverters, batteries, switchboards, A/C units, EV chargers …)
-- with make/model/serial/location/install + warranty dates. The quote's Customer
-- Assets tab lists the customer's assets and links the ones this quote relates to
-- (quote_assets).
--
-- Manager-only (quoting construct). Additive + idempotent.
-- Depends: 00_init (is_manager_or_above), 64 (touch_updated_at()),
--          59 (customers/properties), 79 (quotes).
-- ============================================================

create table if not exists public.customer_assets (
  id             uuid primary key default gen_random_uuid(),
  customer_id    uuid not null references public.customers(id) on delete cascade,
  property_id    uuid references public.properties(id) on delete set null,
  name           text not null,
  asset_type     text,
  make           text,
  model          text,
  serial         text,
  location       text,
  install_date   date,
  warranty_until date,
  notes          text,
  is_active      boolean not null default true,
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists idx_customer_assets_customer on public.customer_assets(customer_id);

drop trigger if exists trg_customer_assets_touch on public.customer_assets;
create trigger trg_customer_assets_touch before update on public.customer_assets
  for each row execute function public.touch_updated_at();

comment on table public.customer_assets is
  'A customer''s serviceable assets (equipment on site). Surfaced on the quote Customer Assets tab and linked to quotes via quote_assets.';

-- Quote ↔ asset link (which assets a quote relates to).
create table if not exists public.quote_assets (
  id         uuid primary key default gen_random_uuid(),
  quote_id   uuid not null references public.quotes(id) on delete cascade,
  asset_id   uuid not null references public.customer_assets(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (quote_id, asset_id)
);
create index if not exists idx_quote_assets_quote on public.quote_assets(quote_id);
create index if not exists idx_quote_assets_asset on public.quote_assets(asset_id);

-- ── RLS: manager-or-above for read + write (quoting is manager-only) ──
alter table public.customer_assets enable row level security;
drop policy if exists customer_assets_mgr_all on public.customer_assets;
create policy customer_assets_mgr_all on public.customer_assets
  for all using (public.is_manager_or_above()) with check (public.is_manager_or_above());

alter table public.quote_assets enable row level security;
drop policy if exists quote_assets_mgr_all on public.quote_assets;
create policy quote_assets_mgr_all on public.quote_assets
  for all using (public.is_manager_or_above()) with check (public.is_manager_or_above());

notify pgrst, 'reload schema';

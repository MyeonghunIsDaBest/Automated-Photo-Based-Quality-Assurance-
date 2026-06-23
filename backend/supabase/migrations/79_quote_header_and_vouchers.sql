-- ============================================================
-- 79) Quote header fields (Simpro-style New Quote) + discount vouchers
-- ============================================================
-- Phase 1 Part 1 of the quote rework: the New-Quote creation wizard
-- (Main / Optional / Custom Fields, with Service|Project types). Adds the
-- quote-header columns the wizard collects, a flexible custom_fields JSONB bag
-- (mirrors how Simpro treats custom fields), and a discount_vouchers table
-- (generate + apply percentage vouchers, e.g. a 5% service voucher).
--
-- Additive + idempotent. Manager-only (quoting is manager-tier). This is the
-- CUSTOMER-facing commercial module — nothing here touches supplier `invoices`.
-- Depends: 00_init (profiles, is_manager_or_above()), 65_revenue_pack (quotes).
-- ============================================================

-- 1) Quote header columns ------------------------------------------------------
alter table public.quotes add column if not exists quote_type text not null default 'service'
  check (quote_type in ('service','project'));
alter table public.quotes add column if not exists stage               text;
alter table public.quotes add column if not exists cost_centre         text;
alter table public.quotes add column if not exists order_number        text;
alter table public.quotes add column if not exists due_date            date;
alter table public.quotes add column if not exists description         text;
alter table public.quotes add column if not exists salesperson_id      uuid references public.profiles(id) on delete set null;
alter table public.quotes add column if not exists project_manager_id  uuid references public.profiles(id) on delete set null;
alter table public.quotes add column if not exists technician_ids      uuid[] not null default '{}';
alter table public.quotes add column if not exists tags                text[] not null default '{}';
alter table public.quotes add column if not exists pricing_tier        text;
alter table public.quotes add column if not exists labour_overhead     numeric;
alter table public.quotes add column if not exists fee_pct             numeric not null default 0;
alter table public.quotes add column if not exists material_markup_pct numeric;  -- per-quote override; null = use settings default
alter table public.quotes add column if not exists discount_pct        numeric not null default 0;  -- Simpro discounts in %; resolved into discount_ex_gst at recompute
alter table public.quotes add column if not exists custom_fields       jsonb not null default '{}'::jsonb;
alter table public.quotes add column if not exists applied_voucher_code text;

-- 2) discount_vouchers ---------------------------------------------------------
create table if not exists public.discount_vouchers (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  label       text,
  percent     numeric not null check (percent >= 0 and percent <= 100),
  is_active   boolean not null default true,
  expires_at  date,
  max_uses    int,                       -- null = unlimited
  used_count  int not null default 0,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_discount_vouchers_code on public.discount_vouchers(code);

comment on table public.discount_vouchers is
  'Customer discount vouchers (e.g. a 5% service voucher). Applying one to a quote sets quotes.discount_pct + applied_voucher_code and bumps used_count.';

-- 3) RLS — manager-or-above for read + write (quoting is manager-only) ---------
alter table public.discount_vouchers enable row level security;
drop policy if exists discount_vouchers_mgr_all on public.discount_vouchers;
create policy discount_vouchers_mgr_all on public.discount_vouchers
  for all using (public.is_manager_or_above()) with check (public.is_manager_or_above());

notify pgrst, 'reload schema';

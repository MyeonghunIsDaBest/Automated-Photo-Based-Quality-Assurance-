-- ============================================================
-- 89) Stock Phase 3 — supplier (wholesaler) invoices
-- ============================================================
-- A wholesaler's invoice matched against a purchase order. Distinct from the
-- customer `invoices` table — never overload that for supplier bills.
--
-- Manager-only. Additive + idempotent. Depends: 00_init (is_manager_or_above),
-- 64 (touch_updated_at), 0007 (suppliers), 88 (purchase_orders).
-- ============================================================

create table if not exists public.supplier_invoices (
  id           uuid primary key default gen_random_uuid(),
  po_id        uuid references public.purchase_orders(id) on delete set null,
  supplier_id  uuid references public.suppliers(id) on delete set null,
  number       text,
  invoice_date date,
  amount       numeric(12,2),
  status       text not null default 'unmatched'
                 check (status in ('unmatched','matched','disputed','paid')),
  file_ref     text,
  notes        text,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_supplier_invoices_po on public.supplier_invoices(po_id);
create index if not exists idx_supplier_invoices_supplier on public.supplier_invoices(supplier_id);

drop trigger if exists trg_supplier_invoices_touch on public.supplier_invoices;
create trigger trg_supplier_invoices_touch before update on public.supplier_invoices
  for each row execute function public.touch_updated_at();

comment on table public.supplier_invoices is
  'Wholesaler invoices matched to a purchase_order (PO ↔ invoice). Separate from customer invoices.';

alter table public.supplier_invoices enable row level security;
drop policy if exists supplier_invoices_mgr_all on public.supplier_invoices;
create policy supplier_invoices_mgr_all on public.supplier_invoices
  for all using (public.is_manager_or_above()) with check (public.is_manager_or_above());

notify pgrst, 'reload schema';

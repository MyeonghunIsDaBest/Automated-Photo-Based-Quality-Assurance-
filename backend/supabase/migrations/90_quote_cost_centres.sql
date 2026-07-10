-- ============================================================
-- 90) Quote cost centres — named sections inside a quote
-- ============================================================
-- Boss brief: a quote is split into separately-priced COST CENTRES
-- (Switchboards / Lighting / Power…). The printed quote shows each as a
-- subheading with its itemised lines + a section subtotal, then one grand
-- total. Lines join a section via quote_items.section_id (null = the implicit
-- "General" section). Invoice lines carry a cost_centre LABEL snapshot so an
-- invoice groups the same way (and later renames don't rewrite history).
--
-- Distinct from quotes.cost_centre (mig 79) — that is a single free-text
-- header label and stays untouched.
--
-- Additive + idempotent. Depends: 65 (quotes/quote_items/customer_invoice_items,
-- is_manager_or_above, current_customer_id).
-- ============================================================

create table if not exists public.quote_sections (
  id         uuid primary key default gen_random_uuid(),
  quote_id   uuid not null references public.quotes(id) on delete cascade,
  name       text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_quote_sections_quote on public.quote_sections(quote_id);

comment on table public.quote_sections is
  'Named cost centres inside a quote (Switchboards / Lighting / …). quote_items.section_id links lines; null section = General.';

alter table public.quote_items
  add column if not exists section_id uuid references public.quote_sections(id) on delete set null;

-- Invoice lines snapshot the section NAME (label, not FK) for grouped invoices.
alter table public.customer_invoice_items
  add column if not exists cost_centre text;

-- ── RLS: mirrors quote_items — managers all; customers read sections of their
--    own non-draft quotes (needed if the portal ever renders a grouped quote). ──
alter table public.quote_sections enable row level security;
drop policy if exists quote_sections_mgr_all on public.quote_sections;
create policy quote_sections_mgr_all on public.quote_sections
  for all using (is_manager_or_above()) with check (is_manager_or_above());

drop policy if exists quote_sections_customer_select on public.quote_sections;
create policy quote_sections_customer_select on public.quote_sections
  for select using (
    exists (
      select 1 from public.quotes q
      where q.id = quote_sections.quote_id
        and q.customer_id = current_customer_id()
        and q.status <> 'draft'
    )
  );

notify pgrst, 'reload schema';

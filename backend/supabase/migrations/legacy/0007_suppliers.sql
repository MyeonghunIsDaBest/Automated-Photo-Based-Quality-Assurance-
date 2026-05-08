-- ─────────────────────────────────────────────────────────────────────────────
-- 0007_suppliers.sql — Suppliers, with multiple contacts and multiple
-- branches. Addresses are stored as jsonb to keep the schema compact and
-- because the spec treats them as opaque blobs (street/suburb/state/
-- postcode/country).
--
-- Run AFTER 0004_profiles.sql.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists suppliers (
  id                        uuid primary key default gen_random_uuid(),
  name                      text not null,
  abn                       text,
  website                   text,
  main_email                text,
  main_contact_number       text,
  main_contact_name         text,
  accounts_email            text,
  accounts_contact_number   text,
  accounts_contact_name     text,
  main_address              jsonb,
  postal_address            jsonb,
  notes                     text,
  created_by                uuid references auth.users(id) on delete set null,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create index if not exists idx_suppliers_name on suppliers(name);
create index if not exists idx_suppliers_abn  on suppliers(abn);

-- Branches first because supplier_contacts.branch_id references it.
create table if not exists supplier_branches (
  id                        uuid primary key default gen_random_uuid(),
  supplier_id               uuid not null references suppliers(id) on delete cascade,
  branch_name               text not null,
  email                     text,
  contact_number            text,
  contact_name              text,
  accounts_email            text,
  accounts_contact_number   text,
  accounts_contact_name     text,
  address                   jsonb,
  postal_address            jsonb,
  created_at                timestamptz not null default now()
);

create index if not exists idx_supplier_branches_supplier_id on supplier_branches(supplier_id);

create table if not exists supplier_contacts (
  id           uuid primary key default gen_random_uuid(),
  supplier_id  uuid not null references suppliers(id) on delete cascade,
  branch_id    uuid references supplier_branches(id) on delete set null,
  name         text not null,
  email        text,
  mobile       text,
  role         text,
  notes        text,
  created_at   timestamptz not null default now()
);

create index if not exists idx_supplier_contacts_supplier_id on supplier_contacts(supplier_id);
create index if not exists idx_supplier_contacts_branch_id   on supplier_contacts(branch_id);

create or replace function touch_supplier_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_suppliers_updated_at on suppliers;
create trigger trg_suppliers_updated_at
  before update on suppliers
  for each row execute function touch_supplier_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table suppliers          enable row level security;
alter table supplier_branches  enable row level security;
alter table supplier_contacts  enable row level security;

drop policy if exists "suppliers: authed read"          on suppliers;
drop policy if exists "suppliers: admin write"          on suppliers;
drop policy if exists "supplier_branches: authed read"  on supplier_branches;
drop policy if exists "supplier_branches: admin write"  on supplier_branches;
drop policy if exists "supplier_contacts: authed read"  on supplier_contacts;
drop policy if exists "supplier_contacts: admin write"  on supplier_contacts;

create policy "suppliers: authed read" on suppliers
  for select using (auth.role() = 'authenticated');
create policy "suppliers: admin write" on suppliers
  for all using (is_admin_role(auth.uid()))
  with check (is_admin_role(auth.uid()));

create policy "supplier_branches: authed read" on supplier_branches
  for select using (auth.role() = 'authenticated');
create policy "supplier_branches: admin write" on supplier_branches
  for all using (is_admin_role(auth.uid()))
  with check (is_admin_role(auth.uid()));

create policy "supplier_contacts: authed read" on supplier_contacts
  for select using (auth.role() = 'authenticated');
create policy "supplier_contacts: admin write" on supplier_contacts
  for all using (is_admin_role(auth.uid()))
  with check (is_admin_role(auth.uid()));

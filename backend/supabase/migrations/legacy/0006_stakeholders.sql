-- ─────────────────────────────────────────────────────────────────────────────
-- 0006_stakeholders.sql — Stakeholders are external contacts (clients,
-- consultants, council reps). They do NOT have logins; they're CRM-style
-- records owned by the project office.
--
-- Run AFTER 0004_profiles.sql.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists stakeholders (
  id           uuid primary key default gen_random_uuid(),
  company_name text not null,
  first_name   text not null,
  last_name    text not null,
  email        text,
  mobile       text,
  role         text,
  notes        text,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_stakeholders_company_name on stakeholders(company_name);
create index if not exists idx_stakeholders_email        on stakeholders(email);

create or replace function touch_stakeholder_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_stakeholders_updated_at on stakeholders;
create trigger trg_stakeholders_updated_at
  before update on stakeholders
  for each row execute function touch_stakeholder_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table stakeholders enable row level security;

drop policy if exists "stakeholders: authed read" on stakeholders;
drop policy if exists "stakeholders: admin write" on stakeholders;

create policy "stakeholders: authed read" on stakeholders
  for select using (auth.role() = 'authenticated');

create policy "stakeholders: admin write" on stakeholders
  for all using (is_admin_role(auth.uid()))
  with check (is_admin_role(auth.uid()));

-- Phase D-2 — Stakeholder extras
--
-- Adds two tables:
--   stakeholder_contacts  — additional people per company (the parent
--                           `stakeholders` row already carries one primary
--                           contact in first_name/last_name/email/mobile/role).
--   stakeholder_projects  — many-to-many junction between stakeholders and
--                           projects. Drives the "Linked projects" picker on
--                           the admin form. The existing `stakeholder`
--                           security_group can later use this for project-
--                           scoped read RLS — out of scope here.
--
-- Sequence in this repo:
--   00_init.sql, 01_security_group_expand.sql, 02_phase_c_seam.sql,
--   03_messaging.sql, 04_stakeholder_extras.sql ← THIS FILE.
--
-- Idempotency: every create/policy/index uses `if not exists` or `drop … if
-- exists` so the migration is re-runnable.

create table if not exists public.stakeholder_contacts (
  id              uuid primary key default gen_random_uuid(),
  stakeholder_id  uuid not null references public.stakeholders(id) on delete cascade,
  name            text not null,
  email           text,
  mobile          text,
  role            text,
  notes           text,
  created_at      timestamptz not null default now()
);
create index if not exists idx_stakeholder_contacts_stakeholder
  on public.stakeholder_contacts(stakeholder_id);

create table if not exists public.stakeholder_projects (
  stakeholder_id  uuid not null references public.stakeholders(id) on delete cascade,
  project_id      uuid not null references public.projects(id)     on delete cascade,
  created_at      timestamptz not null default now(),
  primary key (stakeholder_id, project_id)
);
create index if not exists idx_stakeholder_projects_project
  on public.stakeholder_projects(project_id);

alter table public.stakeholder_contacts enable row level security;
alter table public.stakeholder_projects enable row level security;

-- Open-for-authenticated for now. The admin UI is already gated by
-- `canManageStakeholders`; tightening RLS to mirror that is a follow-up
-- (the existing `stakeholders` table is also currently authenticated-write).
drop policy if exists "stakeholder_contacts: read"  on public.stakeholder_contacts;
drop policy if exists "stakeholder_contacts: write" on public.stakeholder_contacts;
create policy "stakeholder_contacts: read"  on public.stakeholder_contacts
  for select using (auth.role() = 'authenticated');
create policy "stakeholder_contacts: write" on public.stakeholder_contacts
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "stakeholder_projects: read"  on public.stakeholder_projects;
drop policy if exists "stakeholder_projects: write" on public.stakeholder_projects;
create policy "stakeholder_projects: read"  on public.stakeholder_projects
  for select using (auth.role() = 'authenticated');
create policy "stakeholder_projects: write" on public.stakeholder_projects
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

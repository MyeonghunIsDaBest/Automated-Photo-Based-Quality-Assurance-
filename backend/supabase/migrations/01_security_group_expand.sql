-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 01_security_group_expand.sql                                             ║
-- ║                                                                          ║
-- ║ Phase A — promote `stakeholder` and `supplier` to first-class            ║
-- ║ security_group values (they were previously normalised to `worker` in    ║
-- ║ handle_new_user). Adds linkage columns on profiles so admin-created      ║
-- ║ stakeholder/supplier accounts can be tied back to their org-wide        ║
-- ║ business records.                                                        ║
-- ║                                                                          ║
-- ║ DEFERRED (intentionally not in this migration):                          ║
-- ║   Per-project RLS scoping for stakeholder/supplier reads. The current   ║
-- ║   stakeholders/suppliers tables are org-wide directories (no project_id  ║
-- ║   column) — proper scoping needs `project_stakeholders` and             ║
-- ║   `project_suppliers` join tables. Until those land, UI-level filters    ║
-- ║   in lib/permissions.ts handle visibility; reads remain open across      ║
-- ║   authenticated users (consistent with existing tasks/photos policies). ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- §1. Expand the enum ──────────────────────────────────────────────────────
-- ALTER TYPE ADD VALUE is non-transactional — has to run outside a tx block.
-- The IF NOT EXISTS guards make this re-runnable.
alter type security_group add value if not exists 'stakeholder';
alter type security_group add value if not exists 'supplier';

-- §2. Profiles linkage columns ────────────────────────────────────────────
-- A stakeholder/supplier account is a real auth.users row; the FK ties them
-- back to the directory record so the UI can show their company name etc.
alter table profiles
  add column if not exists stakeholder_id uuid references stakeholders(id) on delete set null,
  add column if not exists supplier_id    uuid references suppliers(id)    on delete set null;

-- At most one linkage may be set (a profile is either a stakeholder OR a
-- supplier OR neither — never both).
do $$ begin
  alter table profiles
    add constraint profiles_single_business_link_chk
    check (stakeholder_id is null or supplier_id is null);
exception when duplicate_object then null; end $$;

create index if not exists idx_profiles_stakeholder_id on profiles(stakeholder_id)
  where stakeholder_id is not null;
create index if not exists idx_profiles_supplier_id on profiles(supplier_id)
  where supplier_id is not null;

-- §3. handle_new_user — keep self-signup path normalising stakeholder/  ────
--     supplier to `worker`. The new tiers stay admin-create-only; if a user
--     enters them in the form they're silently downgraded. This preserves
--     the security property: only admins can mint a real stakeholder/
--     supplier account (which then has the FK linkage written by the
--     admin-create-user Edge Function).
create or replace function handle_new_user() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requested   text;
  v_group       security_group;
  v_admin_count int;
begin
  v_requested := lower(coalesce(new.raw_user_meta_data->>'security_group', ''));

  v_group := case v_requested
    when 'site_manager'     then 'site_manager'::security_group
    when 'project_manager'  then 'project_manager'::security_group
    when 'construction_mgr' then 'construction_mgr'::security_group
    when 'worker'           then 'worker'::security_group
    -- stakeholder/supplier/company_admin/administrator from self-signup
    -- silently downgrade to worker. admin-create-user is the only path
    -- that mints those tiers (and writes the FK linkage too).
    else 'worker'::security_group
  end;

  select count(*) into v_admin_count
    from profiles
   where security_group in ('company_admin', 'administrator')
     and is_active;

  if v_admin_count = 0 then
    v_group := 'company_admin'::security_group;
  end if;

  insert into profiles (id, email, first_name, last_name, security_group)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'first_name', ''),
    coalesce(new.raw_user_meta_data->>'last_name', ''),
    v_group
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- §4. Notice ───────────────────────────────────────────────────────────────
do $$ begin
  raise notice
    '[01_security_group_expand] enum has stakeholder + supplier; profiles has linkage columns; handle_new_user updated';
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 0004_profiles.sql — security_group enum, profiles table extending
-- auth.users, automatic profile creation on signup, and helper functions
-- used by RLS in subsequent migrations.
--
-- Run AFTER 0003_storage.sql.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Enum ─────────────────────────────────────────────────────────────────────
do $$ begin
  create type security_group as enum (
    'company_admin',
    'administrator',
    'construction_mgr',
    'project_manager',
    'site_manager',
    'worker'
  );
exception when duplicate_object then null; end $$;

-- ── profiles table ───────────────────────────────────────────────────────────
-- One row per auth.users row. Extends Supabase's built-in users table with
-- the app-specific fields the spec calls for. Created automatically by the
-- trigger below, so the frontend never has to do a second insert.
create table if not exists profiles (
  id                       uuid primary key references auth.users(id) on delete cascade,
  email                    text not null,
  first_name               text not null default '',
  last_name                text not null default '',
  mobile                   text,
  emergency_contact_name   text,
  emergency_contact_email  text,
  emergency_contact_mobile text,
  security_group           security_group not null default 'worker',
  is_active                boolean not null default true,
  avatar_url               text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists idx_profiles_security_group on profiles(security_group);
create index if not exists idx_profiles_email          on profiles(email);

-- ── Helpers ──────────────────────────────────────────────────────────────────
-- Used by RLS in 0005/0006/0007 to gate writes to admin-only resources.
create or replace function is_admin_role(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
    where id = uid
      and security_group in ('company_admin', 'administrator')
      and is_active
  );
$$;

create or replace function is_company_admin(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
    where id = uid
      and security_group = 'company_admin'
      and is_active
  );
$$;

-- ── Auto-create profile on signup ────────────────────────────────────────────
-- New auth.users rows get a default profile so the rest of the app can
-- assume `profiles.id == auth.uid()` exists. The first/last names are
-- pulled from raw_user_meta_data if the frontend included them in the
-- signUp() call.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, first_name, last_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'first_name', ''),
    coalesce(new.raw_user_meta_data->>'last_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ── Touch updated_at ─────────────────────────────────────────────────────────
create or replace function touch_profile_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on profiles;
create trigger trg_profiles_updated_at
  before update on profiles
  for each row execute function touch_profile_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table profiles enable row level security;

drop policy if exists "profiles: read all"        on profiles;
drop policy if exists "profiles: self update"     on profiles;
drop policy if exists "profiles: admin update"    on profiles;
drop policy if exists "profiles: admin delete"    on profiles;

-- Anyone signed in can read every profile (needed for assignment dropdowns,
-- comment author headers, etc.). Tighten later if profile data becomes
-- sensitive.
create policy "profiles: read all" on profiles
  for select using (auth.role() = 'authenticated');

-- Self-update: users can change their own profile, but the security_group
-- column is locked unless they are admin (enforced by the WITH CHECK below
-- + a column-level guard in the admin update policy).
create policy "profiles: self update" on profiles
  for update using (auth.uid() = id)
  with check (
    auth.uid() = id
    and security_group = (select security_group from profiles where id = auth.uid())
  );

-- Admins (Company Admin or Administrator) can update any profile — including
-- the security_group column.
create policy "profiles: admin update" on profiles
  for update using (is_admin_role(auth.uid()))
  with check (is_admin_role(auth.uid()));

-- Only Company Admin can hard-delete profile rows. Soft delete via
-- is_active=false is preferred and goes through the admin update policy.
create policy "profiles: admin delete" on profiles
  for delete using (is_company_admin(auth.uid()));

-- ── Realtime ─────────────────────────────────────────────────────────────────
alter publication supabase_realtime add table profiles;

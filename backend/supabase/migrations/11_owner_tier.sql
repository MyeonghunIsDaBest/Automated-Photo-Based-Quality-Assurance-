-- Owner tier.
--
-- `company_admin` has been the top-tier security_group since 00_init.sql, but
-- there's no notion of a *founding* owner who can rescue other admins (reset
-- their passwords, edit their profiles) without going to Supabase Studio.
-- This migration adds an orthogonal `is_owner` flag on `profiles` so any
-- admin can be promoted to owner-tier independent of their security_group.
--
-- Why orthogonal (not a new enum value):
--   - security_group already drives the capability matrix. Adding 'owner'
--     to the enum would require touching every capability table + every gate.
--   - is_owner is a binary, app-level escalation — much simpler as a flag.
--
-- Multi-owner: allowed by design (no unique constraint). The UI guard against
-- "revoke the last owner" lives in the frontend + the admin-rescue-user Edge
-- function — Postgres just enforces the boolean.
--
-- Sequence: 00_init … 10_project_reports, 11_owner_tier ← THIS.

alter table public.profiles
  add column if not exists is_owner boolean not null default false;

-- Partial index — most profiles are not owners, so a sparse index is cheaper
-- than a full one. Drives the "list owners" / "owner badge" reads.
create index if not exists idx_profiles_is_owner
  on public.profiles (is_owner)
  where is_owner;

-- Seed the founding owner. Idempotent: `update` is a no-op if the row
-- doesn't exist yet (e.g. before the user has signed up) — the
-- `handle_new_user` trigger will mark them owner on their first signup
-- via the trigger update below.
update public.profiles
   set is_owner = true
 where email = 'myeonghun@seo.com';

-- SQL helper following the existing `is_admin_role()` / `is_company_admin()`
-- pattern. Returns true when the (optional) uid argument — defaulting to
-- auth.uid() — names an active profile with is_owner=true. Security definer
-- so RLS doesn't recurse when callers use this inside policies.
create or replace function public.is_owner(uid uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select is_owner
      from profiles
     where id = coalesce(uid, auth.uid())
       and is_active
  ), false);
$$;

-- Extend handle_new_user() so the very first signup that matches the
-- founding email auto-promotes to owner — same idiom as the existing
-- "first user becomes company_admin" promotion. Safe to re-run because
-- the function body is fully replaced.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_first_signup boolean;
begin
  -- Detect "first signup ever" by checking whether any other profile exists.
  -- Same logic as 00_init.sql's original handle_new_user.
  select not exists (select 1 from public.profiles where id <> new.id)
    into v_first_signup;

  insert into public.profiles (id, email, first_name, last_name, security_group, is_active, is_owner)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'first_name', ''),
    coalesce(new.raw_user_meta_data ->> 'last_name',  ''),
    case when v_first_signup then 'company_admin' else 'worker' end,
    true,
    -- Auto-promote the founding email OR the very-first signup.
    case
      when new.email = 'myeonghun@seo.com' then true
      when v_first_signup then true
      else false
    end
  )
  on conflict (id) do update
    set email          = excluded.email,
        first_name     = excluded.first_name,
        last_name      = excluded.last_name,
        is_active      = true,
        is_owner       = profiles.is_owner or excluded.is_owner;

  return new;
end
$$;

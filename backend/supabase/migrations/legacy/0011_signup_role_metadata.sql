-- ─────────────────────────────────────────────────────────────────────────────
-- 0011_signup_role_metadata.sql — let the registration form choose the new
-- user's `security_group` (worker / site_manager / project_manager / etc.)
-- by passing it through `raw_user_meta_data.security_group` at signup time.
--
-- SAFETY: the trigger refuses to set `company_admin` or `administrator` from
-- self-signup. Those two tiers can ONLY be assigned by:
--   1. The first user via /bootstrap-admin (calls claim_first_admin RPC).
--   2. An existing admin via the /admin dashboard (RLS-protected UPDATE).
-- This stops the demo signup form from being a self-elevation hole.
--
-- Run AFTER 0010. Idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function handle_new_user() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requested text;
  v_group     security_group;
begin
  v_requested := lower(coalesce(new.raw_user_meta_data->>'security_group', ''));

  -- Map sanctioned self-signup roles to enum values. Anything else (or the
  -- two privileged tiers) silently falls back to 'worker' so the form can't
  -- mint admins on its own.
  v_group := case v_requested
    when 'site_manager'     then 'site_manager'::security_group
    when 'project_manager'  then 'project_manager'::security_group
    when 'construction_mgr' then 'construction_mgr'::security_group
    when 'worker'           then 'worker'::security_group
    -- Stakeholders + suppliers aren't in the security_group enum (they live
    -- in their own tables). Demo users picking those at signup get a
    -- 'worker' security_group on the auth side; the admin can later add
    -- the matching record in the Stakeholders / Suppliers tab.
    else 'worker'::security_group
  end;

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

-- The trigger itself was created in 0004 — leave it alone, only the function
-- body changed.

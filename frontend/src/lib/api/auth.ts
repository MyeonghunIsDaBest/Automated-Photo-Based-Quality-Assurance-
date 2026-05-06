// Supabase auth wrappers. All functions throw on error; the caller is
// responsible for catching and surfacing it to the user.

import type { Session } from '@supabase/supabase-js';
import { supabase, supabaseConfigured } from '../supabase';
import type { Profile, SecurityGroup } from '../../types';

const NOT_CONFIGURED = new Error(
  'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in frontend/.env.local.',
);

interface ProfileRow {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  mobile: string | null;
  emergency_contact_name: string | null;
  emergency_contact_email: string | null;
  emergency_contact_mobile: string | null;
  security_group: SecurityGroup;
  is_active: boolean;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export function rowToProfile(r: ProfileRow): Profile {
  return {
    id: r.id,
    email: r.email,
    firstName: r.first_name,
    lastName: r.last_name,
    mobile: r.mobile ?? undefined,
    emergencyContactName: r.emergency_contact_name ?? undefined,
    emergencyContactEmail: r.emergency_contact_email ?? undefined,
    emergencyContactMobile: r.emergency_contact_mobile ?? undefined,
    securityGroup: r.security_group,
    isActive: r.is_active,
    avatarUrl: r.avatar_url ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function signIn(email: string, password: string): Promise<Session> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  if (!data.session) throw new Error('Sign-in succeeded but no session was returned.');
  return data.session;
}

// Roles a user is allowed to self-select on the signup form. Admin tiers
// (company_admin, administrator) and read-only client tiers (stakeholder,
// supplier) are NOT in this list — those are admin-create-only via the
// `admin-create-user` Edge Function. The handle_new_user trigger
// (01_security_group_expand.sql §3) downgrades any other value to 'worker'.
export type SignupRole =
  | 'worker'
  | 'site_manager'
  | 'project_manager'
  | 'construction_mgr';

// SELF-SERVICE registration only — for the public Login → "Create account"
// form. Do NOT call this from the admin panel: supabase.auth.signUp(...)
// auto-signs the new user in, which (with persistSession + localStorage
// session sync) silently logs the calling admin out as the new user. For
// admin-driven creation, use `adminCreateUser` in `lib/api/admin.ts` —
// that goes through the `admin-create-user` edge function and never
// touches the caller's session.
export async function signUp(
  email: string,
  password: string,
  firstName: string,
  lastName: string,
  role: SignupRole = 'worker',
): Promise<Session | null> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        first_name: firstName,
        last_name: lastName,
        security_group: role,
        requested_role: role,
      },
    },
  });
  if (error) throw error;
  return data.session;
}

export async function signOut(): Promise<void> {
  if (!supabaseConfigured()) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getSession(): Promise<Session | null> {
  if (!supabaseConfigured()) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

// Subscribes to auth state changes; returns the unsubscribe handle.
export function onAuthStateChange(
  cb: (session: Session | null) => void,
): { unsubscribe: () => void } {
  if (!supabaseConfigured()) return { unsubscribe: () => {} };
  const { data } = supabase.auth.onAuthStateChange((_event, session) => cb(session));
  return { unsubscribe: () => data.subscription.unsubscribe() };
}

// Loads the profile row for the currently signed-in user. Returns null if no
// session, or if the profile row hasn't materialised yet (the auth.users
// trigger creates one immediately, so this is rare in practice).
export async function getCurrentProfile(): Promise<Profile | null> {
  if (!supabaseConfigured()) return null;
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToProfile(data as ProfileRow) : null;
}

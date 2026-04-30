// CRUD wrappers for the `profiles` table. Admin writes are gated by RLS.

import { supabase, supabaseConfigured } from '../supabase';
import type { Profile, SecurityGroup } from '../../types';
import { rowToProfile } from './auth';

const NOT_CONFIGURED = new Error(
  'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in frontend/.env.local.',
);

export interface ProfilePatch {
  firstName?: string;
  lastName?: string;
  mobile?: string | null;
  emergencyContactName?: string | null;
  emergencyContactEmail?: string | null;
  emergencyContactMobile?: string | null;
  securityGroup?: SecurityGroup;
  isActive?: boolean;
  avatarUrl?: string | null;
}

function patchToRow(p: ProfilePatch): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (p.firstName !== undefined) row.first_name = p.firstName;
  if (p.lastName !== undefined) row.last_name = p.lastName;
  if (p.mobile !== undefined) row.mobile = p.mobile;
  if (p.emergencyContactName !== undefined) row.emergency_contact_name = p.emergencyContactName;
  if (p.emergencyContactEmail !== undefined) row.emergency_contact_email = p.emergencyContactEmail;
  if (p.emergencyContactMobile !== undefined) row.emergency_contact_mobile = p.emergencyContactMobile;
  if (p.securityGroup !== undefined) row.security_group = p.securityGroup;
  if (p.isActive !== undefined) row.is_active = p.isActive;
  if (p.avatarUrl !== undefined) row.avatar_url = p.avatarUrl;
  return row;
}

export async function listProfiles(): Promise<Profile[]> {
  if (!supabaseConfigured()) return [];
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => rowToProfile(r as Parameters<typeof rowToProfile>[0]));
}

export async function getProfile(id: string): Promise<Profile | null> {
  if (!supabaseConfigured()) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToProfile(data as Parameters<typeof rowToProfile>[0]) : null;
}

export async function updateProfile(id: string, patch: ProfilePatch): Promise<Profile> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { data, error } = await supabase
    .from('profiles')
    .update(patchToRow(patch))
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return rowToProfile(data as Parameters<typeof rowToProfile>[0]);
}

export async function setProfileSecurityGroup(
  id: string,
  group: SecurityGroup,
): Promise<Profile> {
  return updateProfile(id, { securityGroup: group });
}

// Soft-delete; preferred over hard-delete because audit log rows still
// reference the user_id.
export async function deactivateProfile(id: string): Promise<Profile> {
  return updateProfile(id, { isActive: false });
}

export async function reactivateProfile(id: string): Promise<Profile> {
  return updateProfile(id, { isActive: true });
}

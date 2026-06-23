// CRUD wrappers for the `profiles` table. Admin writes are gated by RLS.

import { supabase, supabaseConfigured } from '../supabase';
import type { Profile, SecurityGroup } from '../../types';
import { rowToProfile } from './auth';

const NOT_CONFIGURED = new Error(
  'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in frontend/.env.local.',
);

// Public bucket holding profile pictures. Layout: `avatars/{user_id}/{ts}.{ext}`.
// RLS (migration 54) only lets a user write into their own `{user_id}/` folder;
// reads are public so the URL renders anywhere without a signed request.
const AVATARS_BUCKET = 'avatars';
const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5 MB
const extOf = (name: string): string => (name.split('.').pop() || 'jpg').toLowerCase();

// Uploads an avatar image and returns its public URL. The caller persists the
// URL with `updateProfile(id, { avatarUrl })` and mirrors it into the store via
// `setCurrentAvatar`. Validates type + size up front so RLS/storage errors are
// rare and the message is human-readable.
export async function uploadAvatar(userId: string, file: File): Promise<string> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose an image file (JPG, PNG, GIF, or WebP).');
  }
  if (file.size > MAX_AVATAR_BYTES) {
    throw new Error('Image is too large — please keep it under 5 MB.');
  }
  const path = `${userId}/${Date.now()}.${extOf(file.name)}`;
  const { error } = await supabase.storage
    .from(AVATARS_BUCKET)
    .upload(path, file, { contentType: file.type || 'image/jpeg', upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from(AVATARS_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

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

/** Active profiles in the given security groups, sorted by name. Powers the
 *  quote Salesperson / Project Manager / Technician pickers. */
export async function listProfilesByRole(groups: SecurityGroup[]): Promise<Profile[]> {
  if (!supabaseConfigured() || groups.length === 0) return [];
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .in('security_group', groups)
    .eq('is_active', true)
    .order('first_name', { ascending: true });
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

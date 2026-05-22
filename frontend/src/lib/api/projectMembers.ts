// Typed CRUD + helpers for the `project_members` table (migration 16).
// Same conventions as `lib/api/tasks.ts` and `lib/api/projects.ts`:
//   - Throw on error.
//   - Falls back to the `useFeatureStore.projectMemberships` slice when
//     Supabase isn't configured, so the mock-mode demo experience works
//     without a backend.
//
// The store cache + the live DB are kept in lockstep:
//   - `inviteToProject` writes to Supabase, then upserts the returned row
//     into the cache (so an admin immediately sees the new Team row).
//   - `removeMember` does the same dance with a soft-delete.
//   - `acceptAllMyPendingInvites` calls the RPC and mirrors the stamp into
//     the cache so the next render sees `accepted_at`.

import { supabase, supabaseConfigured, isUuid } from '../supabase';
import { useFeatureStore } from '../../store/features';
import type { ProjectMember } from '../../types';

export interface ProjectMemberRow {
  id: string;
  project_id: string;
  user_id: string;
  invited_by: string | null;
  invited_at: string;
  accepted_at: string | null;
  removed_at: string | null;
  notes: string | null;
}

export function mapMemberRow(row: ProjectMemberRow): ProjectMember {
  return {
    id: row.id,
    projectId: row.project_id,
    userId: row.user_id,
    invitedBy: row.invited_by,
    invitedAt: row.invited_at,
    acceptedAt: row.accepted_at,
    removedAt: row.removed_at,
    notes: row.notes,
  };
}

const NOT_CONFIGURED = new Error(
  'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in frontend/.env.local.',
);

/** Active memberships for a given user. "Active" = removed_at IS NULL. */
export async function listMyMemberships(userId: string): Promise<ProjectMember[]> {
  if (!supabaseConfigured()) {
    const cache = useFeatureStore.getState().projectMemberships[userId] ?? [];
    return cache.filter((m) => !m.removedAt);
  }
  if (!isUuid(userId)) return [];
  const { data, error } = await supabase
    .from('project_members')
    .select('*')
    .eq('user_id', userId)
    .is('removed_at', null)
    .order('invited_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => mapMemberRow(row as ProjectMemberRow));
}

/** Every active member on a project — used by the admin Team section. */
export async function listProjectMembers(projectId: string): Promise<ProjectMember[]> {
  if (!supabaseConfigured()) {
    const cache = useFeatureStore.getState().projectMemberships;
    const flat: ProjectMember[] = [];
    for (const list of Object.values(cache)) {
      for (const m of list) {
        if (m.projectId === projectId && !m.removedAt) flat.push(m);
      }
    }
    return flat.sort((a, b) => a.invitedAt.localeCompare(b.invitedAt));
  }
  if (!isUuid(projectId)) return [];
  const { data, error } = await supabase
    .from('project_members')
    .select('*')
    .eq('project_id', projectId)
    .is('removed_at', null)
    .order('invited_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => mapMemberRow(row as ProjectMemberRow));
}

/** Insert a membership row. The DB RLS guards "admins/PMs only"; the UI
 *  should also gate the call site behind `canAdminProjects`. */
export async function inviteToProject(
  projectId: string,
  userId: string,
  note?: string,
): Promise<ProjectMember> {
  if (!supabaseConfigured()) {
    const row: ProjectMember = {
      id: `mem_${Date.now()}`,
      projectId,
      userId,
      invitedBy: null,    // mock mode doesn't track auth.uid()
      invitedAt: new Date().toISOString(),
      acceptedAt: null,
      removedAt: null,
      notes: note ?? null,
    };
    useFeatureStore.getState().upsertProjectMembership(row);
    return row;
  }
  const { data, error } = await supabase
    .from('project_members')
    .insert({
      project_id: projectId,
      user_id:    userId,
      notes:      note ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  const mapped = mapMemberRow(data as ProjectMemberRow);
  // Mirror into the cache so the admin's Team section updates instantly.
  useFeatureStore.getState().upsertProjectMembership(mapped);
  return mapped;
}

/** Soft-delete a membership. Sets `removed_at`; the DB unique index allows
 *  re-invites of the same (project, user) pair afterwards. */
export async function removeMember(membershipId: string): Promise<void> {
  if (!supabaseConfigured()) {
    useFeatureStore.getState().removeProjectMembership(membershipId);
    return;
  }
  const { error } = await supabase
    .from('project_members')
    .update({ removed_at: new Date().toISOString() })
    .eq('id', membershipId);
  if (error) throw error;
  useFeatureStore.getState().removeProjectMembership(membershipId);
}

/** Batch-accept every pending invite for the current user. Mirrors the
 *  `accept_all_my_pending_invites` RPC; returns the row count touched so the
 *  caller can decide whether to surface a toast (it doesn't, by design). */
export async function acceptAllMyPendingInvites(userId: string): Promise<number> {
  if (!supabaseConfigured()) {
    return useFeatureStore.getState().acceptUserPendingInvites(userId);
  }
  const { data, error } = await supabase.rpc('accept_all_my_pending_invites');
  if (error) throw error;
  // Refresh the cache for this user so subsequent reads see the new
  // `accepted_at` stamps without a separate fetch round-trip.
  const fresh = await listMyMemberships(userId);
  for (const m of fresh) {
    useFeatureStore.getState().upsertProjectMembership(m);
  }
  return typeof data === 'number' ? data : 0;
}

/** Single-row accept — kept for the admin-side "force re-accept" tooling.
 *  The implicit flow uses the batch helper above. */
export async function acceptInvite(membershipId: string): Promise<void> {
  if (!supabaseConfigured()) {
    // Mock mode: stamp acceptedAt on the matching row.
    const cache = useFeatureStore.getState().projectMemberships;
    for (const list of Object.values(cache)) {
      const row = list.find((m) => m.id === membershipId);
      if (row && !row.acceptedAt) {
        useFeatureStore.getState().upsertProjectMembership({
          ...row,
          acceptedAt: new Date().toISOString(),
        });
        return;
      }
    }
    return;
  }
  const { error } = await supabase.rpc('accept_project_invite', { p_id: membershipId });
  if (error) throw error;
}

// Re-export the helper so call sites that want a clean "no-op when no
// backend" path can use it without branching.
export const _NOT_CONFIGURED = NOT_CONFIGURED;

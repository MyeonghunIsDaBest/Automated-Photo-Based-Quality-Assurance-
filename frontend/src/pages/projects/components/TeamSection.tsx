// TeamSection — lists the active members on a project. Rendered inside
// ProjectDetailModal between the meta + the read-only Configuration panel.
//
// Admins/PMs (canAdminProjects) see an "+ Invite member" button and per-row
// remove × on hover. Workers/stakeholders see the list read-only.
//
// Reads `useFeatureStore.projectMemberships` directly so it stays reactive
// when a new invite lands or a member is removed without needing to refetch.

import { useEffect, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Trash2, UserPlus, Users } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '../../../components/ui/avatar';
import { Badge } from '../../../components/ui/badge';
import { useAppStore } from '../../../store';
import { useFeatureStore } from '../../../store/features';
import { canAdminProjects } from '../../../lib/permissions';
import { listProjectMembers, removeMember } from '../../../lib/api/projectMembers';
import { InviteMemberModal } from './InviteMemberModal';
import type { ProjectMember, SecurityGroup, User } from '../../../types';

interface TeamSectionProps {
  projectId: string;
  projectName: string;
}

const SECURITY_GROUP_LABEL: Partial<Record<SecurityGroup, string>> = {
  worker:           'Worker',
  stakeholder:      'Stakeholder',
  supplier:         'Supplier',
  site_manager:     'Site manager',
  project_manager:  'Project manager',
  construction_mgr: 'Construction manager',
  administrator:    'Administrator',
  company_admin:    'Company admin',
};

export function TeamSection({ projectId, projectName }: TeamSectionProps) {
  const currentProfile = useAppStore((s) => s.currentProfile);
  const users          = useAppStore((s) => s.users);
  const setNotification = useAppStore((s) => s.setNotification);
  const cache          = useFeatureStore((s) => s.projectMemberships);
  const upsert         = useFeatureStore((s) => s.upsertProjectMembership);

  const canInvite = canAdminProjects(currentProfile);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [busyMemberId, setBusyMemberId] = useState<string | null>(null);

  // Hydrate from Supabase once on mount + on projectId change. The store
  // slice is the canonical read; this just keeps it fresh.
  useEffect(() => {
    let cancelled = false;
    listProjectMembers(projectId)
      .then((rows) => {
        if (cancelled) return;
        for (const m of rows) upsert(m);
      })
      .catch(() => { /* best-effort */ });
    return () => {
      cancelled = true;
    };
  }, [projectId, upsert]);

  // Flatten the cache to "active members on this project" by walking every
  // user's list and pulling out the matching, non-removed rows.
  const members = useMemo<ProjectMember[]>(() => {
    const rows: ProjectMember[] = [];
    for (const list of Object.values(cache)) {
      for (const m of list) {
        if (m.projectId === projectId && !m.removedAt) rows.push(m);
      }
    }
    return rows.sort((a, b) => a.invitedAt.localeCompare(b.invitedAt));
  }, [cache, projectId]);

  const userById = useMemo(() => {
    const map = new Map<string, User>();
    for (const u of users) map.set(u.id, u);
    return map;
  }, [users]);

  const existingMemberUserIds = useMemo(
    () => new Set(members.map((m) => m.userId)),
    [members],
  );

  const handleRemove = async (member: ProjectMember) => {
    const user = userById.get(member.userId);
    const confirmed = window.confirm(
      `Remove ${user?.fullName ?? 'this member'} from ${projectName}?`,
    );
    if (!confirmed) return;
    setBusyMemberId(member.id);
    try {
      await removeMember(member.id);
      setNotification({
        type: 'success',
        message: `${user?.fullName ?? 'Member'} removed from the team.`,
      });
    } catch (err) {
      setNotification({
        type: 'error',
        message: err instanceof Error ? err.message : 'Could not remove member.',
      });
    } finally {
      setBusyMemberId(null);
    }
  };

  return (
    <>
      <div>
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-slate-400" />
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
              Team · {members.length}
            </p>
          </div>
          {canInvite && (
            <button
              type="button"
              onClick={() => setInviteOpen(true)}
              className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50/60 px-3 py-1 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
            >
              <UserPlus className="h-3 w-3" />
              Invite member
            </button>
          )}
        </div>

        {members.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-5 text-xs text-slate-500">
            {canInvite
              ? 'No one’s on this project yet. Click “Invite member” to add a worker, stakeholder, or supplier.'
              : 'No members yet.'}
          </p>
        ) : (
          <ul className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            {members.map((member, idx) => {
              const user = userById.get(member.userId);
              const inviter = member.invitedBy ? userById.get(member.invitedBy) : null;
              const initials = (user?.fullName ?? '?')
                .split(' ')
                .map((n) => n[0])
                .join('')
                .slice(0, 2)
                .toUpperCase();
              const roleLabel = user?.securityGroup
                ? SECURITY_GROUP_LABEL[user.securityGroup] ?? user.securityGroup
                : user?.role ?? 'member';
              const invitedDate = (() => {
                try {
                  return format(parseISO(member.invitedAt), 'MMM d, yyyy');
                } catch {
                  return null;
                }
              })();
              const isBusy = busyMemberId === member.id;
              const isFirst = idx === 0;

              return (
                <li
                  key={member.id}
                  className={`group flex items-center gap-3 px-4 py-3 transition-colors ${
                    isFirst ? '' : 'border-t border-slate-100'
                  } hover:bg-slate-50`}
                >
                  <Avatar className="h-8 w-8 flex-shrink-0">
                    <AvatarImage src={user?.avatar} />
                    <AvatarFallback className="text-[10px] font-medium">{initials}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {user?.fullName ?? '(unknown user)'}
                    </p>
                    <p className="truncate text-[11px] text-slate-500">
                      <span className="capitalize">{roleLabel}</span>
                      {inviter && ` · invited by ${inviter.fullName}`}
                      {invitedDate && ` · ${invitedDate}`}
                    </p>
                  </div>
                  {!member.acceptedAt && (
                    <Badge variant="secondary" className="text-[10px] uppercase tracking-wider">
                      Pending
                    </Badge>
                  )}
                  {canInvite && (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleRemove(member)}
                      aria-label={`Remove ${user?.fullName ?? 'member'}`}
                      className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-slate-400 opacity-0 transition-all hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 disabled:opacity-40"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <InviteMemberModal
        open={inviteOpen}
        projectId={projectId}
        projectName={projectName}
        existingMemberUserIds={existingMemberUserIds}
        onClose={() => setInviteOpen(false)}
        onInvited={(_member) => {
          /* The store mirror inside `inviteToProject` already updated the
             cache, so the list re-renders without us doing anything here. */
        }}
      />
    </>
  );
}

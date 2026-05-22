// InviteMemberModal — small picker that admins/PMs use to invite a user to
// a specific project. Lives inside the ProjectDetailModal's Team section
// (only mounted when canAdminProjects(currentProfile) is true).
//
// Flow:
//   1. Pick a user from the org directory, filtered to those not already on
//      this project's active member list.
//   2. Optional note (a one-liner about why — e.g. "Foreman on east elev").
//   3. Send → calls `inviteToProject` → mirrors the new ProjectMember into
//      the store slice and triggers the parent to re-read the members list.

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, UserPlus, X } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '../../../components/ui/avatar';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { useAppStore } from '../../../store';
import { inviteToProject } from '../../../lib/api/projectMembers';
import {
  modalCard, modalOverlay,
} from '../../../lib/motion/variants';
import type { ProjectMember, User, SecurityGroup } from '../../../types';

interface InviteMemberModalProps {
  open: boolean;
  projectId: string;
  projectName: string;
  /** IDs of users who already have an active membership on this project —
   *  filtered out of the picker. */
  existingMemberUserIds: ReadonlySet<string>;
  onClose: () => void;
  onInvited: (member: ProjectMember) => void;
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

export function InviteMemberModal({
  open, projectId, projectName, existingMemberUserIds, onClose, onInvited,
}: InviteMemberModalProps) {
  const users = useAppStore((s) => s.users);
  const setNotification = useAppStore((s) => s.setNotification);

  const [query, setQuery]       = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote]         = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Reset state whenever the modal is reopened so it doesn't remember the
  // last selection across invites.
  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedId(null);
      setNote('');
    }
  }, [open]);

  const candidates = useMemo<User[]>(() => {
    const q = query.trim().toLowerCase();
    return users
      .filter((u) => !existingMemberUserIds.has(u.id))
      .filter((u) => {
        if (!q) return true;
        return (
          u.fullName.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [users, existingMemberUserIds, query]);

  const selected = selectedId ? users.find((u) => u.id === selectedId) ?? null : null;

  const submit = async () => {
    if (!selected) return;
    setSubmitting(true);
    try {
      const row = await inviteToProject(projectId, selected.id, note.trim() || undefined);
      onInvited(row);
      setNotification({
        type: 'success',
        message: `Invited ${selected.fullName} to ${projectName}.`,
      });
      onClose();
    } catch (err) {
      setNotification({
        type: 'error',
        message: err instanceof Error ? err.message : 'Could not send the invite.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            variants={modalOverlay}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            variants={modalCard}
            initial="hidden"
            animate="visible"
            exit="exit"
            role="dialog"
            aria-modal="true"
            aria-label="Invite member"
            className="fixed inset-x-2 top-1/2 z-[61] mx-auto w-auto max-w-md -translate-y-1/2 overflow-hidden rounded-2xl bg-white shadow-2xl sm:inset-x-0"
          >
            <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div className="min-w-0">
                <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-slate-500">
                  Invite to project
                </p>
                <h3 className="mt-1 truncate text-base font-semibold text-slate-900">
                  {projectName}
                </h3>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="space-y-4 px-5 py-4">
              {/* Search box */}
              <label className="block">
                <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-slate-500">
                  Find user
                </span>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    autoFocus
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Name or email…"
                    className="w-full rounded-md border border-slate-200 bg-white pl-8 pr-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </label>

              {/* Candidate list */}
              <ul className="max-h-56 divide-y divide-slate-100 overflow-y-auto rounded-md border border-slate-200">
                {candidates.length === 0 && (
                  <li className="px-3 py-4 text-center text-xs text-slate-500">
                    {query
                      ? `No one matches “${query}”.`
                      : 'Everyone in your org is already on this project.'}
                  </li>
                )}
                {candidates.map((user) => {
                  const isSelected = user.id === selectedId;
                  const initials = user.fullName
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase();
                  const roleLabel = user.securityGroup
                    ? SECURITY_GROUP_LABEL[user.securityGroup] ?? user.securityGroup
                    : user.role;
                  return (
                    <li key={user.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(user.id)}
                        className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                          isSelected ? 'bg-emerald-50' : 'hover:bg-slate-50'
                        }`}
                      >
                        <Avatar className="h-8 w-8 flex-shrink-0">
                          <AvatarImage src={user.avatar} />
                          <AvatarFallback className="text-[10px] font-medium">{initials}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-900">{user.fullName}</p>
                          <p className="truncate text-[11px] text-slate-500">{user.email}</p>
                        </div>
                        <Badge variant="secondary" className="text-[10px] capitalize">{roleLabel}</Badge>
                      </button>
                    </li>
                  );
                })}
              </ul>

              {/* Note */}
              <label className="block">
                <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-slate-500">
                  Note (optional)
                </span>
                <textarea
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Why this person is being invited (visible to admins on the Team list)."
                  className="block w-full resize-none rounded-md border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </label>
            </div>

            <footer className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/50 px-5 py-3">
              <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={submitting}>
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!selected || submitting}
                onClick={submit}
              >
                <UserPlus className="mr-1.5 h-3.5 w-3.5" />
                {submitting ? 'Inviting…' : 'Send invite'}
              </Button>
            </footer>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

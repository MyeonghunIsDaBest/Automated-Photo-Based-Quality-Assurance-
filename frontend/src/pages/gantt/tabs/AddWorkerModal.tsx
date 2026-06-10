// AddWorkerModal — onboard field crew straight from the Crew tab.
//
// Two modes, gated by the caller's tier:
//   • Create worker (admin tier, canManageUsers): make a NEW low-access
//     'worker' account via adminCreateUser (edge fn — never clobbers the
//     admin's session), with an auto-generated temp password shown once, then
//     assign it to this project.
//   • Invite existing (PM+, canAdminProjects): pick one OR MORE existing org
//     users (checkbox multi-select) and assign them — all in the chosen capacity.
//
// Either way: inviteToProject creates the membership, and a best-effort,
// capacity-tailored welcome DM lands in the member's Messages tab. Their own
// client fires the bell via useProjectMembersRealtime (migration 45).

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Copy, Search, UserPlus, X } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '../../../components/ui/avatar';
import { Badge } from '../../../components/ui/badge';
import { useAppStore } from '../../../store';
import { inviteToProject } from '../../../lib/api/projectMembers';
import { adminCreateUser } from '../../../lib/api/admin';
import { sendProjectWelcomeDM } from '../../../lib/api/messaging';
import { modalCard, modalOverlay } from '../../../lib/motion/variants';
import { profileToUser, type Project, type User } from '../../../types';

export interface AddedMember { userId: string; name: string; role: string }

interface AddWorkerModalProps {
  open: boolean;
  project: Project;
  existingMemberUserIds: ReadonlySet<string>;
  /** Admin tier — may create brand-new worker accounts. */
  canCreate: boolean;
  /** PM+ — may assign existing org users. */
  canInviteExisting: boolean;
  onClose: () => void;
  onMemberAdded: (member: AddedMember) => void;
}

type Mode = 'create' | 'invite';

// Invite capacity (role-experiences) — HOW the person(s) join THIS project. It
// tailors the welcome DM + tells them where to land. Permissions still follow
// each account's security_group; capacity is the on-project intent/label.
// One capacity per role that can join a project's crew. Single admin tier
// (Company Admin) — Administrator is intentionally not offered here. Managers +
// admin land on the role-adaptive Dashboard (different lens); field/external
// roles get their cockpits.
type InviteCapacity =
  | 'worker' | 'project_manager' | 'construction_mgr'
  | 'company_admin' | 'supplier' | 'stakeholder';

const CAPACITY: Record<InviteCapacity, { label: string; lands: string; welcome: (p: string) => string }> = {
  worker:           { label: 'Worker',           lands: 'Home — clock in & upload photos',
    welcome: (p) => `You've been added to ${p} as crew. Open Home, clock in under Site Diary → Crew, and upload your site photos.` },
  project_manager:  { label: 'Project Manager',  lands: 'Dashboard — command + finance',
    welcome: (p) => `You've been added to ${p} as project manager. Plan, schedule, finance, and reports live on your Dashboard.` },
  construction_mgr: { label: 'Construction Mgr', lands: 'Dashboard — portfolio across projects',
    welcome: (p) => `You've been added to ${p} as construction manager. Oversee progress across your projects from your Dashboard.` },
  company_admin:    { label: 'Company Admin',    lands: 'Dashboard — full admin access',
    welcome: (p) => `You've been added to ${p} as company admin. You have full access from your Dashboard.` },
  supplier:         { label: 'Supplier',         lands: 'Supplier cockpit — your orders',
    welcome: (p) => `You've been added to ${p} as a supplier. Review and respond to your purchase orders in your Supplier workspace.` },
  stakeholder:      { label: 'Stakeholder',      lands: 'Sponsor cockpit — budget & progress',
    welcome: (p) => `You've been added to ${p} as a project sponsor. Track spend vs progress and review milestones in your Sponsor view.` },
};
const CAPACITY_ORDER: InviteCapacity[] = ['worker', 'project_manager', 'construction_mgr', 'company_admin', 'supplier', 'stakeholder'];

// Temp password: upper + lower + digit so it clears common policies; the worker
// resets it on first login. Ambiguous chars (0/O, 1/l/I) omitted for hand-off.
function genTempPassword(): string {
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const digit = '23456789';
  const all = lower + upper + digit;
  const pick = (set: string) => set[Math.floor(Math.random() * set.length)];
  let pw = pick(upper) + pick(lower) + pick(digit);
  for (let i = 0; i < 7; i++) pw += pick(all);
  return pw;
}

// Compact, warm button classes — consistent across the footer + success states
// (the shadcn Button read too large for this dense modal).
const btnPrimary = 'inline-flex items-center justify-center gap-1.5 rounded-full bg-[#2F8F5C] px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#246F47] disabled:cursor-not-allowed disabled:opacity-50';
const btnGhost = 'inline-flex items-center justify-center rounded-full border border-[#E6E1D4] bg-white px-3.5 py-1.5 text-[12.5px] font-semibold text-[#3A3A3A] transition-colors hover:bg-[#FAF8F2] disabled:opacity-50';

export function AddWorkerModal({
  open, project, existingMemberUserIds, canCreate, canInviteExisting, onClose, onMemberAdded,
}: AddWorkerModalProps) {
  const users = useAppStore((s) => s.users);
  const setNotification = useAppStore((s) => s.setNotification);

  const [mode, setMode] = useState<Mode>(canCreate ? 'create' : 'invite');
  const [submitting, setSubmitting] = useState(false);

  // Create-mode fields
  const [first, setFirst] = useState('');
  const [last, setLast]   = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  // Success state — temp password revealed once.
  const [created, setCreated] = useState<{ name: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // Invite-mode fields — multi-select.
  const [query, setQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [capacity, setCapacity] = useState<InviteCapacity>('worker');

  useEffect(() => {
    if (!open) return;
    setMode(canCreate ? 'create' : 'invite');
    setFirst(''); setLast(''); setEmail(''); setMobile('');
    setQuery(''); setSelectedIds(new Set()); setCapacity('worker');
    setCreated(null); setCopied(false);
  }, [open, canCreate]);

  const candidates = useMemo<User[]>(() => {
    const q = query.trim().toLowerCase();
    return users
      .filter((u) => !existingMemberUserIds.has(u.id))
      .filter((u) => !q || u.fullName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [users, existingMemberUserIds, query]);

  const toggle = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const emailValid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  const createValid = first.trim() && last.trim() && emailValid;
  const count = selectedIds.size;

  // Shared post-invite side-effects: capacity-tailored welcome DM (best-effort)
  // + roster callback.
  const afterInvite = async (userId: string, name: string, role: string, welcome?: string) => {
    try { await sendProjectWelcomeDM(userId, project.name, welcome); } catch { /* non-fatal */ }
    onMemberAdded({ userId, name, role });
  };

  const submitCreate = async () => {
    if (!createValid || submitting) return;
    setSubmitting(true);
    const password = genTempPassword();
    try {
      const profile = await adminCreateUser({
        email: email.trim(), password, firstName: first.trim(), lastName: last.trim(),
        securityGroup: 'worker', mobile: mobile.trim() || null,
      });
      await inviteToProject(project.id, profile.id);
      const asUser = profileToUser(profile);
      useAppStore.setState((s) => ({
        users: s.users.some((u) => u.id === asUser.id) ? s.users : [...s.users, asUser],
      }));
      await afterInvite(profile.id, asUser.fullName, 'Worker', CAPACITY.worker.welcome(project.name));
      setCreated({ name: asUser.fullName, password });
    } catch (err) {
      setNotification({ type: 'error', message: err instanceof Error ? err.message : 'Could not create the worker account.' });
    } finally {
      setSubmitting(false);
    }
  };

  // Invite everyone selected, in the chosen capacity. One toast summarises the
  // batch (added / already-on-project / errors).
  const submitInvite = async () => {
    const picked = users.filter((u) => selectedIds.has(u.id));
    if (picked.length === 0 || submitting) return;
    setSubmitting(true);
    let added = 0, dupes = 0;
    let firstError = '';
    for (const u of picked) {
      try {
        await inviteToProject(project.id, u.id, `Invited as ${CAPACITY[capacity].label}`);
        await afterInvite(u.id, u.fullName, String(u.securityGroup ?? u.role ?? 'Member'), CAPACITY[capacity].welcome(project.name));
        added++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        if (/duplicate|23505|already/i.test(msg)) dupes++;
        else if (!firstError) firstError = msg || `Could not add ${u.fullName}.`;
      }
    }
    setSubmitting(false);
    if (added > 0) {
      setNotification({
        type: 'success',
        message: `Added ${added} member${added === 1 ? '' : 's'} to ${project.name} as ${CAPACITY[capacity].label}${dupes ? ` (${dupes} already on it)` : ''}.`,
      });
      onClose();
    } else if (firstError) {
      setNotification({ type: 'error', message: firstError });
    } else if (dupes > 0) {
      setNotification({ type: 'info', message: 'Everyone selected is already on this project.' });
      onClose();
    }
  };

  const inputCls = 'w-full rounded-md border border-[#E6E1D4] bg-white px-3 py-2 text-sm shadow-sm focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]';

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            variants={modalOverlay} initial="hidden" animate="visible" exit="exit"
            className="fixed inset-0 z-[60] bg-[#1A1A1A]/40 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            variants={modalCard} initial="hidden" animate="visible" exit="exit"
            role="dialog" aria-modal="true" aria-label="Add to crew"
            className="fixed inset-x-2 top-1/2 z-[61] mx-auto max-h-[90dvh] w-auto max-w-md -translate-y-1/2 overflow-y-auto overscroll-contain rounded-[16px] bg-white shadow-2xl sm:inset-x-0"
          >
            <header className="flex items-center justify-between gap-3 border-b border-[#EFEBE0] px-5 py-3">
              <div className="min-w-0">
                <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-[#6B6B6B]">Add to crew</p>
                <h3 className="truncate text-[15px] font-semibold text-[#1A1A1A]">{project.name}</h3>
              </div>
              <button type="button" onClick={onClose} aria-label="Close" className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-[#A0A0A0] hover:bg-[#FAF8F2] hover:text-[#6B6B6B]">
                <X className="h-4 w-4" />
              </button>
            </header>

            {created ? (
              // ── Success: reveal the temp password once ──
              <div className="space-y-3 px-5 py-4">
                <div className="flex items-center gap-2 text-[#246F47]">
                  <Check className="h-4 w-4" />
                  <p className="text-sm font-semibold">{created.name} created &amp; added.</p>
                </div>
                <div className="rounded-lg border border-[#E6E1D4] bg-[#FAF8F2] p-3">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-[#6B6B6B]">Temporary password</p>
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <code className="font-mono text-[15px] font-semibold text-[#1A1A1A]">{created.password}</code>
                    <button
                      type="button"
                      onClick={() => { void navigator.clipboard?.writeText(created.password); setCopied(true); }}
                      className="inline-flex items-center gap-1 rounded-md border border-[#E6E1D4] bg-white px-2 py-1 text-[11px] font-medium text-[#3A3A3A] hover:bg-[#FAF8F2]"
                    >
                      {copied ? <Check className="h-3 w-3 text-[#246F47]" /> : <Copy className="h-3 w-3" />}
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <p className="mt-2 text-[11px] text-[#A0A0A0]">Share it with {created.name}. They sign in, land on Home, and change it. This won't be shown again.</p>
                </div>
                <div className="flex justify-end">
                  <button type="button" className={btnPrimary} onClick={onClose}>Done</button>
                </div>
              </div>
            ) : (
              <>
                {/* Mode toggle (only when both modes available) */}
                {canCreate && canInviteExisting && (
                  <div className="flex gap-1 px-5 pt-3">
                    {(['create', 'invite'] as Mode[]).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setMode(m)}
                        className={`rounded-full px-3 py-1 text-[12.5px] font-semibold transition-colors ${
                          mode === m ? 'bg-[#1A1A1A] text-white' : 'text-[#6B6B6B] hover:bg-[#FAF8F2]'
                        }`}
                      >
                        {m === 'create' ? 'Create worker' : 'Invite existing'}
                      </button>
                    ))}
                  </div>
                )}

                {mode === 'create' ? (
                  <div className="space-y-2.5 px-5 py-3.5">
                    <div className="grid grid-cols-2 gap-3">
                      <label className="block"><span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[#6B6B6B]">First name</span>
                        <input autoFocus value={first} onChange={(e) => setFirst(e.target.value)} className={inputCls} /></label>
                      <label className="block"><span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[#6B6B6B]">Last name</span>
                        <input value={last} onChange={(e) => setLast(e.target.value)} className={inputCls} /></label>
                    </div>
                    <label className="block"><span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[#6B6B6B]">Email</span>
                      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="worker@example.com" className={inputCls} /></label>
                    <label className="block"><span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[#6B6B6B]">Mobile (optional)</span>
                      <input value={mobile} onChange={(e) => setMobile(e.target.value)} className={inputCls} /></label>
                    <p className="text-[11px] text-[#A0A0A0]">Creates a low-access <span className="font-semibold text-[#3A3A3A]">Worker</span> account assigned to this project. A temp password is shown once.</p>
                  </div>
                ) : (
                  <div className="space-y-2.5 px-5 py-3.5">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#A0A0A0]" />
                      <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name or email…" className={`${inputCls} pl-8`} />
                    </div>
                    <ul className="max-h-44 divide-y divide-[#EFEBE0] overflow-y-auto rounded-md border border-[#E6E1D4]">
                      {candidates.length === 0 && (
                        <li className="px-3 py-4 text-center text-xs text-[#A0A0A0]">{query ? `No one matches “${query}”.` : 'Everyone in your org is already on this project.'}</li>
                      )}
                      {candidates.map((u) => {
                        const initials = u.fullName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
                        const checked = selectedIds.has(u.id);
                        return (
                          <li key={u.id}>
                            <button type="button" onClick={() => toggle(u.id)} className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors ${checked ? 'bg-[#E5F2EA]' : 'hover:bg-[#FAF8F2]'}`}>
                              <span className={`grid h-4 w-4 flex-shrink-0 place-items-center rounded-[5px] border transition-colors ${checked ? 'border-[#2F8F5C] bg-[#2F8F5C] text-white' : 'border-[#D8D2C4] bg-white'}`}>
                                {checked && <Check className="h-3 w-3" strokeWidth={3} />}
                              </span>
                              <Avatar className="h-7 w-7 flex-shrink-0"><AvatarImage src={u.avatar} /><AvatarFallback className="text-[10px] font-medium">{initials}</AvatarFallback></Avatar>
                              <div className="min-w-0 flex-1"><p className="truncate text-[13px] font-medium text-[#1A1A1A]">{u.fullName}</p><p className="truncate text-[11px] text-[#A0A0A0]">{u.email}</p></div>
                              <Badge variant="secondary" className="text-[10px] capitalize">{String(u.securityGroup ?? u.role ?? '')}</Badge>
                            </button>
                          </li>
                        );
                      })}
                    </ul>

                    {/* Invite capacity — applies to everyone selected. */}
                    {count > 0 && (
                      <div className="rounded-md border border-[#E6E1D4] bg-[#FAF8F2] p-2.5">
                        <div className="mb-1.5 flex items-center justify-between">
                          <span className="text-[11px] font-medium uppercase tracking-wider text-[#6B6B6B]">Joining as</span>
                          <span className="text-[11px] text-[#A0A0A0]">{count} selected</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {CAPACITY_ORDER.map((c) => {
                            const active = capacity === c;
                            return (
                              <button
                                key={c}
                                type="button"
                                onClick={() => setCapacity(c)}
                                className={`rounded-full px-2.5 py-1 text-[12px] font-semibold transition-colors ${
                                  active ? 'bg-[#2F8F5C] text-white' : 'border border-[#E6E1D4] bg-white text-[#3A3A3A] hover:bg-[#F0EDE4]'
                                }`}
                              >
                                {CAPACITY[c].label}
                              </button>
                            );
                          })}
                        </div>
                        <p className="mt-1.5 text-[11px] text-[#6B6B6B]">
                          Lands on <span className="font-medium text-[#1A1A1A]">{CAPACITY[capacity].lands}</span>. Permissions follow each account's role.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                <footer className="flex items-center justify-end gap-2 border-t border-[#EFEBE0] bg-[#FAF8F2]/50 px-4 py-2.5">
                  <button type="button" className={btnGhost} onClick={onClose} disabled={submitting}>Cancel</button>
                  {mode === 'create' ? (
                    <button type="button" className={btnPrimary} disabled={!createValid || submitting} onClick={submitCreate}>
                      <UserPlus className="h-3.5 w-3.5" />{submitting ? 'Creating…' : 'Create worker'}
                    </button>
                  ) : (
                    <button type="button" className={btnPrimary} disabled={count === 0 || submitting} onClick={submitInvite}>
                      <UserPlus className="h-3.5 w-3.5" />
                      {submitting ? 'Adding…' : count > 1 ? `Add ${count} as ${CAPACITY[capacity].label}` : count === 1 ? `Add as ${CAPACITY[capacity].label}` : 'Add to project'}
                    </button>
                  )}
                </footer>
              </>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

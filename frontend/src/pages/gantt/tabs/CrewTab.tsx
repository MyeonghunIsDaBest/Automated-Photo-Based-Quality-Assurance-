import { useEffect, useMemo, useState } from 'react';
import {
  Activity, AlertTriangle, BadgeCheck, CalendarClock, CheckCircle2, ChevronDown,
  FileSpreadsheet, LogIn, LogOut, Plus, Search, ShieldCheck, Timer, Trash2,
  Users, X, type LucideIcon,
} from 'lucide-react';
import { endOfWeek, format, parseISO, startOfWeek } from 'date-fns';
import type { Project } from '../../../types';
import {
  LedgerStatRow, StatusPill, FRAUNCES, cardShell, btnPrimary, btnGhost, type ToneKey,
} from '../components/ledger';
import { useAppStore } from '../../../store';
import { listProjectMembers } from '../../../lib/api/projectMembers';
import {
  listTimesheets, updateTimesheet, clockIn, clockOut,
  subscribeToProjectTimesheets, type Timesheet,
} from '../../../lib/api/timesheets';
import {
  listCertifications, createCertification, deleteCertification,
  subscribeToProjectCertifications, certExpiryState,
  type Certification, type CertKind, type CertExpiryState,
} from '../../../lib/api/certifications';
import { canAdminProjects, canManageUsers } from '../../../lib/permissions';
import { AddWorkerModal } from './AddWorkerModal';

// Stage 5 (Workforce) — the Crew register, now folded into the Site Diary as
// one of its sub-views. Three sections (Time clock · Timesheets · Certifications)
// under a shared warm stat strip, all wired to live Supabase data: project
// members → roster, the `timesheets` table → clock in/out + weekly grid, the
// `certifications` table → expiry tracking. No own page header — the Site Diary
// shell provides the page chrome.

interface CrewTabProps {
  project: Project;
  canEdit: boolean;
  canDelete: boolean;
}

type Section = 'timeclock' | 'timesheets' | 'certifications';
const SECTIONS: { id: Section; label: string; icon: LucideIcon }[] = [
  { id: 'timeclock',      label: 'Time clock',     icon: Timer },
  { id: 'timesheets',     label: 'Timesheets',     icon: FileSpreadsheet },
  { id: 'certifications', label: 'Certifications', icon: BadgeCheck },
];

interface RosterMember { userId: string; name: string; role: string }

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const todayIso = () => new Date().toISOString().slice(0, 10);
const round1 = (n: number) => Math.round(n * 10) / 10;

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';

const fmtElapsed = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
};

const fmtDuration = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} sec`;
  const m = Math.floor(s / 60);
  if (m < 60) return s % 60 === 0 ? `${m} min` : `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}h ${rem}m` : `${h}h`;
};

const shiftMs = (s: Timesheet, now: number) => {
  if (s.timeIn && !s.timeOut) return Math.max(0, now - new Date(s.timeIn).getTime());
  if (s.timeIn && s.timeOut)  return Math.max(0, new Date(s.timeOut).getTime() - new Date(s.timeIn).getTime());
  return Math.max(0, s.hours * 3_600_000);
};

export function CrewTab({ project, canEdit, canDelete }: CrewTabProps) {
  const currentUser = useAppStore((s) => s.currentUser);
  const currentProfile = useAppStore((s) => s.currentProfile);
  const users = useAppStore((s) => s.users);
  const setNotification = useAppStore((s) => s.setNotification);

  // Crew add-worker gating reads the *profile* (not the passed canEdit, which is
  // the site-diary write cap): PM+ may assign anyone; admins may also create new
  // worker accounts.
  const canAddCrew = canAdminProjects(currentProfile);
  const canCreateWorker = canManageUsers(currentProfile);
  const [addOpen, setAddOpen] = useState(false);

  const [tab, setTab] = useState<Section>('timeclock');
  const [members, setMembers] = useState<RosterMember[]>([]);
  const [sheets, setSheets] = useState<Timesheet[]>([]);
  const [certs, setCerts] = useState<Certification[]>([]);
  const [now, setNow] = useState(Date.now());
  const [acting, setActing] = useState<string | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const fallback = (): RosterMember[] => (currentUser
      ? [{ userId: currentUser.id, name: currentUser.fullName, role: String(currentUser.role ?? 'Member') }]
      : []);
    void listProjectMembers(project.id).then((ms) => {
      if (cancelled) return;
      const roster: RosterMember[] = ms.map((m) => {
        const u = users.find((x) => x.id === m.userId);
        return { userId: m.userId, name: u?.fullName ?? 'Unknown', role: String(u?.role ?? 'Member') };
      });
      if (currentUser && !roster.some((r) => r.userId === currentUser.id)) {
        roster.unshift({ userId: currentUser.id, name: currentUser.fullName, role: String(currentUser.role ?? 'Member') });
      }
      setMembers(roster);
    }).catch(() => { if (!cancelled) setMembers(fallback()); });
    return () => { cancelled = true; };
  }, [project.id, users, currentUser]);

  useEffect(() => {
    let cancelled = false;
    void listTimesheets(project.id).then((r) => { if (!cancelled) setSheets(r); }).catch(() => void 0);
    const unsub = subscribeToProjectTimesheets(project.id, {
      onInsert: (t) => setSheets((p) => (p.some((x) => x.id === t.id) ? p : [t, ...p])),
      onUpdate: (t) => setSheets((p) => p.map((x) => (x.id === t.id ? t : x))),
      onDelete: (id) => setSheets((p) => p.filter((x) => x.id !== id)),
    });
    return () => { cancelled = true; unsub(); };
  }, [project.id]);

  useEffect(() => {
    let cancelled = false;
    void listCertifications(project.id).then((r) => { if (!cancelled) setCerts(r); }).catch(() => void 0);
    const unsub = subscribeToProjectCertifications(project.id, {
      onInsert: (c) => setCerts((p) => (p.some((x) => x.id === c.id) ? p : [c, ...p])),
      onDelete: (id) => setCerts((p) => p.filter((x) => x.id !== id)),
    });
    return () => { cancelled = true; unsub(); };
  }, [project.id]);

  const openByName = useMemo(() => {
    const m = new Map<string, Timesheet>();
    for (const s of sheets) if (s.timeIn && !s.timeOut) m.set(s.workerName, s);
    return m;
  }, [sheets]);

  const today = todayIso();
  const { hoursToday, hoursWeek } = useMemo(() => {
    const ws = startOfWeek(new Date(now), { weekStartsOn: 1 });
    const we = endOfWeek(new Date(now), { weekStartsOn: 1 });
    let todayMs = 0, weekMs = 0;
    for (const s of sheets) {
      const ms = shiftMs(s, now);
      if (s.workDate === today) todayMs += ms;
      const d = parseISO(s.workDate);
      if (d >= ws && d <= we) weekMs += ms;
    }
    return { hoursToday: round1(todayMs / 3_600_000), hoursWeek: round1(weekMs / 3_600_000) };
  }, [sheets, today, now]);

  const certsExpiring = useMemo(
    () => certs.filter((c) => { const st = certExpiryState(c); return st === 'expiring' || st === 'expired'; }).length,
    [certs],
  );

  const canToggle = (userId: string) => canEdit || userId === currentUser?.id;
  const onSite = openByName.size;

  // ── Mutations (live data) ──────────────────────────────────────────────────
  const onClock = async (mem: RosterMember, note?: string) => {
    setActing(mem.userId);
    try {
      const open = openByName.get(mem.name);
      if (open && open.timeIn) {
        const ms = Date.now() - new Date(open.timeIn).getTime();
        const n = (note ?? open.notes ?? '').trim();
        const updated = await clockOut(open.id, open.timeIn, n || undefined);
        setSheets((p) => p.map((x) => (x.id === updated.id ? updated : x)));
        setNotification({ message: `${mem.name} clocked out — ${fmtDuration(ms)}`, type: 'success' });
      } else {
        const created = await clockIn(project.id, mem.name, currentUser?.id ?? undefined);
        setSheets((p) => (p.some((x) => x.id === created.id) ? p : [created, ...p]));
        setNotification({ message: `${mem.name} clocked in`, type: 'success' });
      }
    } catch (err) {
      setNotification({ message: err instanceof Error ? err.message : 'Clock action failed.', type: 'error' });
    } finally {
      setActing(null);
    }
  };

  const onSaveNote = (shift: Timesheet, text: string) => {
    const note = text.trim();
    if ((shift.notes ?? '') === note) return;
    setSheets((p) => p.map((x) => (x.id === shift.id ? { ...x, notes: note || undefined } : x)));
    void updateTimesheet(shift.id, { notes: note }).catch((err) =>
      setNotification({ message: err instanceof Error ? err.message : 'Could not save activity.', type: 'error' }),
    );
  };

  const onApprove = (ids: string[]) => {
    if (ids.length === 0) return;
    const set = new Set(ids);
    setSheets((p) => p.map((x) => (set.has(x.id) ? { ...x, status: 'approved' } : x)));
    void Promise.all(ids.map((id) => updateTimesheet(id, { status: 'approved', approvedBy: currentUser?.id ?? 'system' })))
      .catch((err) => setNotification({ message: err instanceof Error ? err.message : 'Could not approve hours.', type: 'error' }));
  };

  const onAddCert = async (input: { workerName: string; kind: CertKind; name: string; expiryDate?: string; required: boolean }) => {
    const created = await createCertification(project.id, { ...input, createdBy: currentUser?.id ?? 'system' });
    setCerts((p) => (p.some((x) => x.id === created.id) ? p : [created, ...p]));
  };

  const onRemoveCert = (c: Certification) => {
    const prev = certs;
    setCerts((l) => l.filter((x) => x.id !== c.id));
    void deleteCertification(c.id).catch((err) => {
      setCerts(prev);
      setNotification({ message: err instanceof Error ? err.message : 'Could not delete certification.', type: 'error' });
    });
  };

  return (
    <div className="editorial-root">
      {/* Crew KPI strip — same warm register strip used across the workspace. */}
      <LedgerStatRow
        stats={[
          { value: onSite,        label: 'On site now',    sub: `of ${members.length} on roster`, tone: onSite > 0 ? 'sage' : 'slate' },
          { value: hoursToday,    label: 'Hours today',    sub: 'logged so far',                  tone: 'ink' },
          { value: hoursWeek,     label: 'This week',      sub: 'across the crew',                tone: 'slate' },
          { value: certsExpiring, label: 'Certs expiring', sub: 'within 30 days',                 tone: certsExpiring > 0 ? 'amber' : 'sage' },
        ]}
      />

      {/* Section sub-nav + add worker */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex items-center gap-1 rounded-full border border-[#E6E1D4] bg-white p-1 shadow-[0_1px_2px_rgba(20,20,20,0.04)]">
          {SECTIONS.map(({ id, label, icon: Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
                  active ? 'bg-[#1A1A1A] text-white' : 'text-[#6B6B6B] hover:bg-[#FAF8F2] hover:text-[#1A1A1A]'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            );
          })}
        </div>
        {canAddCrew && (
          <button type="button" onClick={() => setAddOpen(true)} className={btnPrimary}>
            <Plus className="h-3.5 w-3.5" />
            Add worker
          </button>
        )}
      </div>

      {tab === 'timeclock' && (
        <TimeClockView members={members} sheets={sheets} now={now} acting={acting} canToggle={canToggle} onClock={onClock} onSaveNote={onSaveNote} />
      )}
      {tab === 'timesheets' && (
        <TimesheetsView sheets={sheets} members={members} now={now} canEdit={canEdit} onApprove={onApprove} />
      )}
      {tab === 'certifications' && (
        <CertificationsView certs={certs} canEdit={canEdit} canDelete={canDelete} onAdd={onAddCert} onRemove={onRemoveCert} />
      )}

      <AddWorkerModal
        open={addOpen}
        project={project}
        existingMemberUserIds={new Set(members.map((m) => m.userId))}
        canCreate={canCreateWorker}
        canInviteExisting={canAddCrew}
        onClose={() => setAddOpen(false)}
        onMemberAdded={(m) =>
          setMembers((prev) => (prev.some((x) => x.userId === m.userId) ? prev : [...prev, m]))
        }
      />
    </div>
  );
}

/* ───────────────────────────── Time clock ───────────────────────────────── */

function TimeClockView({
  members, sheets, now, acting, canToggle, onClock, onSaveNote,
}: {
  members: RosterMember[];
  sheets: Timesheet[];
  now: number;
  acting: string | null;
  canToggle: (userId: string) => boolean;
  onClock: (mem: RosterMember, note?: string) => void | Promise<void>;
  onSaveNote: (shift: Timesheet, text: string) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({});
  const today = todayIso();

  const openByName = useMemo(() => {
    const m = new Map<string, Timesheet>();
    for (const s of sheets) if (s.timeIn && !s.timeOut) m.set(s.workerName, s);
    return m;
  }, [sheets]);

  const { shiftsByName, weekHoursByName } = useMemo(() => {
    const ws = startOfWeek(new Date(now), { weekStartsOn: 1 });
    const we = endOfWeek(new Date(now), { weekStartsOn: 1 });
    const shiftsMap = new Map<string, Timesheet[]>();
    const weekMap = new Map<string, number>();
    for (const s of sheets) {
      if (s.workDate === today) {
        const arr = shiftsMap.get(s.workerName) ?? [];
        arr.push(s);
        shiftsMap.set(s.workerName, arr);
      }
      const d = parseISO(s.workDate);
      if (d >= ws && d <= we) weekMap.set(s.workerName, (weekMap.get(s.workerName) ?? 0) + shiftMs(s, now) / 3_600_000);
    }
    for (const arr of shiftsMap.values()) arr.sort((a, b) => (b.timeIn ?? '').localeCompare(a.timeIn ?? ''));
    return { shiftsByName: shiftsMap, weekHoursByName: weekMap };
  }, [sheets, today, now]);

  const toggleExpand = (name: string) =>
    setExpanded((p) => { const n = new Set(p); if (n.has(name)) n.delete(name); else n.add(name); return n; });

  if (members.length === 0) {
    return (
      <EmptyCrew icon={Users} title="No one on the roster yet."
        body="Invite people to this project (Admin → Team) and they'll show up here to clock in and out." />
    );
  }

  return (
    <div className="space-y-2.5">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#6B6B6B]">Roster</p>
      {members.map((mem, i) => {
        const open = openByName.get(mem.name);
        const shifts = shiftsByName.get(mem.name) ?? [];
        const todayMs = shifts.reduce((sum, s) => sum + shiftMs(s, now), 0);
        const hoursToday = round1(todayMs / 3_600_000);
        const hoursWeek = round1(weekHoursByName.get(mem.name) ?? 0);
        const pct = Math.min(100, Math.round((hoursToday / 8) * 100));
        const editable = canToggle(mem.userId);
        const isExpanded = expanded.has(mem.name);
        const draft = open ? (noteDraft[open.id] ?? open.notes ?? '') : '';
        const lastAction = open?.timeIn
          ? `On since ${format(new Date(open.timeIn), 'h:mm a')}`
          : (() => { const last = shifts.find((s) => s.timeOut); return last?.timeOut ? `Out ${format(new Date(last.timeOut), 'h:mm a')}` : 'Not clocked in today'; })();

        return (
          <div key={mem.userId} className={`sp-rise overflow-hidden ${cardShell}`} style={{ animationDelay: `${i * 45}ms` }}>
            <div className="flex flex-wrap items-center gap-4 p-4">
              <Avatar name={mem.name} online={!!open} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold text-[#1A1A1A]">{mem.name}</p>
                <p className="text-[12px] capitalize text-[#6B6B6B]">{mem.role.replace(/_/g, ' ')}</p>
                <div className="mt-2 flex items-center gap-2">
                  <span className="h-1.5 w-28 overflow-hidden rounded-full bg-[#F0EDE4]">
                    <span className="block h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: open ? 'linear-gradient(90deg,#246F47,#2F8F5C)' : '#C9C3B4' }} />
                  </span>
                  <span className="text-[11px] tabular-nums text-[#A0A0A0]">{hoursToday}h / 8h</span>
                </div>
              </div>

              {open ? (
                <div className="text-right">
                  <p className="tabular-nums text-[15px] font-semibold text-[#246F47]" style={{ fontFamily: FRAUNCES }}>{fmtElapsed(now - new Date(open.timeIn!).getTime())}</p>
                  <p className="text-[11px] text-[#6B6B6B]">{lastAction}</p>
                </div>
              ) : (
                <div className="hidden text-right sm:block">
                  <p className="text-[12px] text-[#6B6B6B]">{lastAction}</p>
                  <p className="text-[11px] tabular-nums text-[#A0A0A0]">{hoursWeek}h this week</p>
                </div>
              )}

              {editable ? (
                <button
                  type="button"
                  disabled={acting === mem.userId}
                  onClick={() => onClock(mem, open ? (noteDraft[open.id] ?? open.notes ?? '') : undefined)}
                  className={open ? btnGhost : btnPrimary}
                >
                  {open ? <><LogOut className="h-4 w-4" />Clock out</> : <><LogIn className="h-4 w-4" />Clock in</>}
                </button>
              ) : (
                <StatusPill tone={open ? 'sage' : 'slate'} className="px-2.5 py-1">{open ? 'On site' : 'Off site'}</StatusPill>
              )}

              {shifts.length > 0 && (
                <button
                  type="button"
                  onClick={() => toggleExpand(mem.name)}
                  aria-label={isExpanded ? 'Hide activity log' : 'Show activity log'}
                  aria-expanded={isExpanded}
                  className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[#A0A0A0] hover:bg-[#FAF8F2] hover:text-[#1A1A1A]"
                >
                  <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                </button>
              )}
            </div>

            {open && editable && (
              <div className="flex items-center gap-2 border-t border-[#EFEBE0] bg-[#FAF8F2]/60 px-4 py-2.5">
                <Activity className="h-3.5 w-3.5 flex-shrink-0 text-[#246F47]" />
                <input
                  value={draft}
                  onChange={(e) => setNoteDraft((p) => ({ ...p, [open.id]: e.target.value }))}
                  onBlur={() => onSaveNote(open, draft)}
                  placeholder="What are you working on? (e.g. Conduit pull — L13 east)"
                  className="min-w-0 flex-1 rounded-[10px] border border-[#E6E1D4] bg-white px-3 py-1.5 text-[13px] text-[#3A3A3A] placeholder:text-[#A0A0A0] focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]/30"
                />
              </div>
            )}
            {open && !editable && open.notes && (
              <p className="border-t border-[#EFEBE0] bg-[#FAF8F2]/60 px-4 py-2.5 text-[12px] text-[#3A3A3A]">
                <Activity className="mr-1 inline h-3 w-3 text-[#246F47]" />{open.notes}
              </p>
            )}

            {isExpanded && (
              <ul className="space-y-2 border-t border-[#EFEBE0] px-4 py-3">
                {shifts.map((s) => {
                  const live = !!s.timeIn && !s.timeOut;
                  return (
                    <li key={s.id} className="flex items-start gap-2.5 border-l border-[#EFEBE0] pl-3">
                      <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ background: live ? '#2F8F5C' : '#C9C3B4' }} />
                      <div className="min-w-0 flex-1">
                        <p className="tabular-nums text-[12px] text-[#3A3A3A]">
                          {s.timeIn ? format(new Date(s.timeIn), 'h:mm a') : '—'}
                          {' → '}
                          {s.timeOut ? format(new Date(s.timeOut), 'h:mm a') : <span className="text-[#246F47]">now</span>}
                          <span className="ml-2 text-[#A0A0A0]">· {fmtDuration(shiftMs(s, now))}</span>
                        </p>
                        {s.notes
                          ? <p className="text-[12px] text-[#6B6B6B]">{s.notes}</p>
                          : <p className="text-[12px] italic text-[#A0A0A0]">No activity logged.</p>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ───────────────────────────── Timesheets ───────────────────────────────── */

const TS_TONE: Record<'approved' | 'pending' | 'submitted', ToneKey> = {
  approved: 'sage', pending: 'amber', submitted: 'slate',
};

interface WeekRow {
  name: string;
  role?: string;
  days: number[];
  total: number;
  status: 'approved' | 'pending' | 'submitted';
  pendingIds: string[];
}

function TimesheetsView({
  sheets, members, now, canEdit, onApprove,
}: {
  sheets: Timesheet[];
  members: RosterMember[];
  now: number;
  canEdit: boolean;
  onApprove: (ids: string[]) => void;
}) {
  const [week, setWeek] = useState<'this' | 'last'>('this');

  const roleByName = useMemo(() => {
    const m = new Map<string, string>();
    for (const mem of members) m.set(mem.name, mem.role);
    return m;
  }, [members]);

  const { rows, dayTotals, grand, pendingCount, maxWeek, label } = useMemo(() => {
    const base = week === 'this' ? new Date(now) : new Date(now - 7 * 86_400_000);
    const ws = startOfWeek(base, { weekStartsOn: 1 });
    const we = endOfWeek(base, { weekStartsOn: 1 });
    const byWorker = new Map<string, WeekRow>();
    for (const s of sheets) {
      const d = parseISO(s.workDate);
      if (d < ws || d > we) continue;
      const idx = (d.getDay() + 6) % 7;
      const row = byWorker.get(s.workerName) ?? {
        name: s.workerName, role: roleByName.get(s.workerName), days: [0, 0, 0, 0, 0, 0, 0],
        total: 0, status: 'approved' as const, pendingIds: [],
      };
      row.days[idx] += s.hours;
      row.total += s.hours;
      if (s.status !== 'approved') {
        row.pendingIds.push(s.id);
        row.status = s.status === 'submitted' && row.status !== 'pending' ? 'submitted' : 'pending';
      }
      byWorker.set(s.workerName, row);
    }
    const list = [...byWorker.values()].sort((a, b) => b.total - a.total);
    const dTotals = DAYS.map((_, i) => round1(list.reduce((sum, r) => sum + r.days[i], 0)));
    return {
      rows: list,
      dayTotals: dTotals,
      grand: round1(dTotals.reduce((s, n) => s + n, 0)),
      pendingCount: list.reduce((s, r) => s + r.pendingIds.length, 0),
      maxWeek: Math.max(40, ...list.map((r) => r.total)),
      label: `${format(ws, 'MMM d')} – ${format(we, 'MMM d')}`,
    };
  }, [sheets, roleByName, week, now]);

  const allPendingIds = rows.flatMap((r) => r.pendingIds);

  return (
    <>
      <div className={`mb-4 flex flex-col gap-3 p-2.5 sm:flex-row sm:items-center sm:justify-between ${cardShell}`}>
        <div className="flex flex-wrap items-center gap-1">
          <Chip active={week === 'this'} onClick={() => setWeek('this')}>This week</Chip>
          <Chip active={week === 'last'} onClick={() => setWeek('last')}>Last week</Chip>
          <span className="ml-2 text-[12px] text-[#A0A0A0]">{label}</span>
        </div>
        <div className="flex items-center gap-3">
          {pendingCount > 0 && <StatusPill tone="amber" className="px-3 py-1.5">{pendingCount} awaiting approval</StatusPill>}
          {canEdit && allPendingIds.length > 0 && (
            <button type="button" onClick={() => onApprove(allPendingIds)} className={btnPrimary}>
              <CheckCircle2 className="h-4 w-4" />Approve all
            </button>
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyCrew icon={FileSpreadsheet} title="No hours logged this week."
          body="Once the crew clocks time on the Time clock tab, weekly timesheets build here for review and approval." />
      ) : (
        <div className={`sp-rise overflow-hidden ${cardShell}`}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-[13px]">
              <thead>
                <tr className="border-b border-[#E6E1D4] bg-[#FAF8F2] text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-[#6B6B6B]">
                  <th className="px-4 py-3">Worker</th>
                  {DAYS.map((d, i) => <th key={d} className={`px-2 py-3 text-center ${i >= 5 ? 'text-[#A0A0A0]' : ''}`}>{d}</th>)}
                  <th className="px-4 py-3 text-right">Week</th>
                  <th className="px-4 py-3">Status</th>
                  {canEdit && <th className="px-4 py-3" />}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, ri) => (
                  <tr key={r.name} className="sp-fade border-b border-[#EFEBE0] transition last:border-b-0 hover:bg-[#FAF8F2]" style={{ animationDelay: `${ri * 45}ms` }}>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-[#1A1A1A]">{r.name}</p>
                      {r.role && <p className="text-[11px] capitalize text-[#6B6B6B]">{r.role.replace(/_/g, ' ')}</p>}
                    </td>
                    {r.days.map((h, i) => (
                      <td key={i} className="px-2 py-2 text-center">
                        <span className="mx-auto flex h-8 w-9 items-center justify-center rounded-md text-[13px] tabular-nums" style={heatCell(h, i >= 5)}>
                          {h === 0 ? <span className="text-[#C9C3B4]">·</span> : round1(h)}
                        </span>
                      </td>
                    ))}
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <span className="hidden h-1.5 w-14 overflow-hidden rounded-full bg-[#F0EDE4] sm:block">
                          <span className="block h-full rounded-full bg-[#1A1A1A]/75" style={{ width: `${(r.total / maxWeek) * 100}%` }} />
                        </span>
                        <span className="font-semibold tabular-nums text-[#1A1A1A]">{round1(r.total)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3"><StatusPill tone={TS_TONE[r.status]} className="uppercase tracking-wider">{r.status}</StatusPill></td>
                    {canEdit && (
                      <td className="px-4 py-3 text-right">
                        {r.pendingIds.length > 0 && (
                          <button type="button" onClick={() => onApprove(r.pendingIds)} className="text-[12px] font-semibold text-[#246F47] hover:text-[#2F8F5C]">Approve</button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-[#E6E1D4] bg-[#FAF8F2] text-[13px]">
                  <td className="px-4 py-3 font-semibold text-[#6B6B6B]">Crew total</td>
                  {dayTotals.map((t, i) => <td key={i} className="px-2 py-3 text-center font-medium tabular-nums text-[#6B6B6B]">{t || '·'}</td>)}
                  <td className="px-4 py-3 text-right font-semibold tabular-nums text-[#1A1A1A]">{grand}</td>
                  <td className="px-4 py-3" colSpan={canEdit ? 2 : 1} />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

// Sage heat scaled by hours; weekends get a faint warm wash instead.
function heatCell(h: number, weekend: boolean): React.CSSProperties {
  if (h === 0) return { backgroundColor: weekend ? 'rgba(107,107,107,0.05)' : undefined };
  const a = Math.min(0.18, 0.05 + h / 60);
  return weekend
    ? { backgroundColor: `rgba(107,107,107,${a})`, color: '#3A3A3A' }
    : { backgroundColor: `rgba(47,143,92,${a})`, color: '#1c5236' };
}

/* ─────────────────────────── Certifications ─────────────────────────────── */

const CERT_KINDS: { id: CertKind; label: string }[] = [
  { id: 'white_card', label: 'White card' },
  { id: 'induction',  label: 'Induction' },
  { id: 'license',    label: 'Licence' },
  { id: 'ticket',     label: 'Ticket' },
  { id: 'other',      label: 'Other' },
];

const CERT_TONE: Record<CertExpiryState, ToneKey> = {
  expired: 'red', expiring: 'amber', valid: 'sage', none: 'slate',
};

function certView(c: Certification): { state: CertExpiryState; label: string } {
  const state = certExpiryState(c);
  if (state === 'expired') {
    const days = c.expiryDate ? Math.round((Date.now() - Date.parse(c.expiryDate)) / 86_400_000) : 0;
    return { state, label: days > 0 ? `Expired ${days}d ago` : 'Expired' };
  }
  if (state === 'expiring') {
    const days = c.expiryDate ? Math.max(0, Math.ceil((Date.parse(c.expiryDate) - Date.now()) / 86_400_000)) : 0;
    return { state, label: `Expires in ${days}d` };
  }
  if (state === 'none') return { state, label: 'No expiry' };
  return { state, label: 'Valid' };
}

function CertificationsView({
  certs, canEdit, canDelete, onAdd, onRemove,
}: {
  certs: Certification[];
  canEdit: boolean;
  canDelete: boolean;
  onAdd: (input: { workerName: string; kind: CertKind; name: string; expiryDate?: string; required: boolean }) => Promise<void>;
  onRemove: (c: Certification) => void;
}) {
  const [filter, setFilter] = useState<'all' | 'valid' | 'expiring' | 'expired'>('all');
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return certs.filter((c) => {
      const st = certExpiryState(c);
      const bucket = st === 'none' ? 'valid' : st;
      if (filter !== 'all' && bucket !== filter) return false;
      if (!q) return true;
      return `${c.workerName} ${c.name} ${c.kind}`.toLowerCase().includes(q);
    });
  }, [certs, filter, query]);

  return (
    <>
      <div className={`mb-4 flex flex-col gap-3 p-2.5 sm:flex-row sm:items-center sm:justify-between ${cardShell}`}>
        <div className="flex flex-wrap items-center gap-1">
          {(['all', 'valid', 'expiring', 'expired'] as const).map((f) => (
            <Chip key={f} active={filter === f} onClick={() => setFilter(f)}>{f === 'all' ? 'All certs' : f}</Chip>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative sm:w-64">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A0A0A0]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search holder, certification…"
              aria-label="Search certifications"
              className="w-full rounded-full border border-[#E6E1D4] bg-white py-2 pl-10 pr-3 text-[13px] text-[#3A3A3A] placeholder:text-[#A0A0A0] focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]/30"
            />
          </div>
          {canEdit && (
            <button type="button" onClick={() => setAdding((v) => !v)} className={adding ? btnGhost : btnPrimary}>
              {adding ? <><X className="h-4 w-4" />Cancel</> : <><Plus className="h-4 w-4" />Add</>}
            </button>
          )}
        </div>
      </div>

      {adding && canEdit && <AddCertForm onAdd={onAdd} onDone={() => setAdding(false)} />}

      {visible.length === 0 ? (
        <EmptyCrew
          icon={BadgeCheck}
          title={certs.length === 0 ? 'No certifications on file.' : 'No certifications match.'}
          body={certs.length === 0
            ? 'Add the tickets and licences your crew holds, and SiteProof will flag the ones nearing expiry.'
            : 'Try a different filter or search.'}
          action={certs.length === 0 && canEdit ? <button type="button" onClick={() => setAdding(true)} className={btnPrimary}><Plus className="h-4 w-4" />Add certification</button> : null}
        />
      ) : (
        <div className="space-y-2.5">
          {visible.map((c, i) => {
            const { state, label } = certView(c);
            const flagged = state === 'expired' || state === 'expiring';
            const t = CERT_TONE[state];
            return (
              <div
                key={c.id}
                className="sp-rise group flex items-center gap-4 rounded-[14px] border bg-white p-4 shadow-[0_1px_2px_rgba(20,20,20,0.04)] transition hover:shadow-md"
                style={{ animationDelay: `${i * 45}ms`, borderColor: flagged ? (state === 'expired' ? '#F3CFCF' : '#EAD9B0') : '#E6E1D4' }}
              >
                <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-full" style={{ backgroundColor: t === 'red' ? '#FBE5E5' : t === 'amber' ? '#F9EFD9' : '#E5F2EA', color: t === 'red' ? '#C44545' : t === 'amber' ? '#C8841E' : '#246F47' }}>
                  {flagged ? <AlertTriangle className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold text-[#1A1A1A]">
                    {c.name}
                    {c.required && <span className="ml-1.5 rounded bg-[#F0EDE4] px-1.5 py-0.5 text-[10px] font-medium text-[#6B6B6B]">required</span>}
                  </p>
                  <p className="truncate text-[12px] text-[#6B6B6B]">
                    {c.workerName} · {CERT_KINDS.find((k) => k.id === c.kind)?.label ?? c.kind}
                    {c.expiryDate && <> · <CalendarClock className="inline h-3 w-3" /> {format(parseISO(c.expiryDate), 'MMM d, yyyy')}</>}
                  </p>
                </div>
                <StatusPill tone={t}>{flagged ? <CalendarClock className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}{label}</StatusPill>
                {canDelete && (
                  <button
                    type="button"
                    onClick={() => onRemove(c)}
                    aria-label={`Delete ${c.name}`}
                    className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[#A0A0A0] opacity-0 transition hover:bg-[#FBE5E5] hover:text-[#C44545] group-hover:opacity-100 focus:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function AddCertForm({
  onAdd, onDone,
}: {
  onAdd: (input: { workerName: string; kind: CertKind; name: string; expiryDate?: string; required: boolean }) => Promise<void>;
  onDone: () => void;
}) {
  const setNotification = useAppStore((s) => s.setNotification);
  const [worker, setWorker] = useState('');
  const [kind, setKind] = useState<CertKind>('white_card');
  const [name, setName] = useState('');
  const [expiry, setExpiry] = useState('');
  const [required, setRequired] = useState(false);
  const [saving, setSaving] = useState(false);

  const FIELD = 'h-10 rounded-[10px] border border-[#E6E1D4] bg-white px-3 text-[13.5px] text-[#1A1A1A] placeholder:text-[#A0A0A0] focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]/30';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!worker.trim()) return setNotification({ message: 'Worker name is required.', type: 'error' });
    if (!name.trim()) return setNotification({ message: 'Certification name is required.', type: 'error' });
    setSaving(true);
    try {
      await onAdd({ workerName: worker.trim(), kind, name: name.trim(), expiryDate: expiry || undefined, required });
      onDone();
    } catch (err) {
      setNotification({ message: err instanceof Error ? err.message : 'Could not add certification.', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className={`sp-rise mb-3 flex flex-wrap items-end gap-2 p-3 ${cardShell}`}>
      <div className="min-w-[9rem] flex-1">
        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.1em] text-[#6B6B6B]">Worker</label>
        <input className={`w-full ${FIELD}`} value={worker} onChange={(e) => setWorker(e.target.value)} placeholder="Name" />
      </div>
      <div>
        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.1em] text-[#6B6B6B]">Type</label>
        <select value={kind} onChange={(e) => setKind(e.target.value as CertKind)} className={FIELD}>
          {CERT_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
        </select>
      </div>
      <div className="min-w-[9rem] flex-1">
        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.1em] text-[#6B6B6B]">Name / ref</label>
        <input className={`w-full ${FIELD}`} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. EWP licence" />
      </div>
      <div>
        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.1em] text-[#6B6B6B]">Expiry</label>
        <input type="date" className={`w-40 ${FIELD}`} value={expiry} onChange={(e) => setExpiry(e.target.value)} />
      </div>
      <label className="flex items-center gap-1.5 pb-2.5 text-[12px] text-[#3A3A3A]">
        <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} className="h-4 w-4 accent-[#2F8F5C]" />
        Required
      </label>
      <button type="submit" disabled={saving} className={btnPrimary}><Plus className="h-4 w-4" />{saving ? 'Adding…' : 'Add'}</button>
    </form>
  );
}

/* ───────────────────────── shared primitives ────────────────────────────── */

function EmptyCrew({ icon: Icon, title, body, action }: { icon: LucideIcon; title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className={`px-6 py-16 text-center ${cardShell}`}>
      <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-[#FAF8F2] text-[#2F8F5C]">
        <Icon className="h-7 w-7" strokeWidth={1.5} />
      </div>
      <h3 className="text-[22px] font-medium text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>{title}</h3>
      <p className="mx-auto mt-2 max-w-sm text-[13px] text-[#6B6B6B]">{body}</p>
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-[12.5px] font-medium capitalize transition-colors ${
        active ? 'bg-[#1A1A1A] text-white' : 'text-[#6B6B6B] hover:bg-[#FAF8F2] hover:text-[#1A1A1A]'
      }`}
    >
      {children}
    </button>
  );
}

function Avatar({ name, online }: { name: string; online?: boolean }) {
  return (
    <div className="relative flex-shrink-0">
      <div className="grid h-10 w-10 place-items-center rounded-full text-[12px] font-semibold" style={{ background: online ? '#E5F2EA' : '#F0EDE4', color: online ? '#246F47' : '#6B6B6B' }}>
        {initials(name)}
      </div>
      {online && <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-[#2F8F5C]" />}
    </div>
  );
}

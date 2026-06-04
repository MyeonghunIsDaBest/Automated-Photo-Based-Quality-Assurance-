import { useEffect, useMemo, useState } from 'react';
import { listProjectMembers } from '../api/projectMembers';
import { listTimesheets, subscribeToProjectTimesheets, type Timesheet } from '../api/timesheets';
import { useAppStore } from '../../store';

// Live crew snapshot for a project — the real roster (project_members ∩ the user
// directory) plus how many are clocked in right now (an open shift = timeIn set,
// timeOut null), wired to the same timesheets realtime the Crew tab uses. Shared
// so the Dashboard crew tile + Team roster read identical numbers to Site Diary →
// Crew (no more "73% of org users" guesswork).

export interface CrewMember { userId: string; name: string; role: string }

export function useProjectCrew(projectId: string | null | undefined): {
  roster: CrewMember[];
  total: number;
  onSite: number;
} {
  const users = useAppStore((s) => s.users);
  const currentUser = useAppStore((s) => s.currentUser);
  const [members, setMembers] = useState<CrewMember[]>([]);
  const [sheets, setSheets] = useState<Timesheet[]>([]);

  useEffect(() => {
    if (!projectId) { setMembers([]); return; }
    let cancelled = false;
    void listProjectMembers(projectId).then((ms) => {
      if (cancelled) return;
      const roster: CrewMember[] = ms.map((m) => {
        const u = users.find((x) => x.id === m.userId);
        return { userId: m.userId, name: u?.fullName ?? 'Member', role: String(u?.securityGroup ?? u?.role ?? 'Member') };
      });
      // Mirror the Crew tab: ensure the signed-in user shows even before the
      // members read resolves (their own membership row may still be loading).
      if (currentUser && !roster.some((r) => r.userId === currentUser.id)) {
        roster.unshift({ userId: currentUser.id, name: currentUser.fullName, role: String(currentUser.role ?? 'Member') });
      }
      setMembers(roster);
    }).catch(() => {
      if (!cancelled) {
        setMembers(currentUser ? [{ userId: currentUser.id, name: currentUser.fullName, role: 'Member' }] : []);
      }
    });
    return () => { cancelled = true; };
  }, [projectId, users, currentUser]);

  useEffect(() => {
    if (!projectId) { setSheets([]); return; }
    let cancelled = false;
    void listTimesheets(projectId).then((r) => { if (!cancelled) setSheets(r); }).catch(() => void 0);
    const unsub = subscribeToProjectTimesheets(projectId, {
      onInsert: (t) => setSheets((p) => (p.some((x) => x.id === t.id) ? p : [t, ...p])),
      onUpdate: (t) => setSheets((p) => p.map((x) => (x.id === t.id ? t : x))),
      onDelete: (id) => setSheets((p) => p.filter((x) => x.id !== id)),
    });
    return () => { cancelled = true; unsub(); };
  }, [projectId]);

  // On site = distinct workers with an open shift (matches CrewTab's openByName).
  const onSite = useMemo(() => {
    const open = new Set<string>();
    for (const s of sheets) if (s.timeIn && !s.timeOut) open.add(s.workerName);
    return open.size;
  }, [sheets]);

  return { roster: members, total: members.length, onSite };
}

// frontend/src/pages/gantt/tabs/SiteDiaryTab.tsx
//
// Site Diary tab — real-data shell. Reads DiaryEntries from the gantt
// store, derives the day's rollup + conditions, and owns the diary entry
// drawer + photo upload pickers. The previous demo fixtures have been
// removed; the page renders a true empty state when the project has no
// entries for the day.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Project, User } from '../../../types';
import type { DiaryEntry, WeatherKind } from '../types';
import { useGanttSideStore, useDiaryEntries, usePunchItems } from '../store';
import { subscribeToProjectDiary } from '../../../lib/api/diaryEntries';
import { isVisibleEntry } from './sitediary/diaryRowMapper';
import { ConditionsCard } from './sitediary/ConditionsCard';
import { DayRollupCard, type DayRollup } from './sitediary/DayRollupCard';
import { DayHeader } from './sitediary/DayHeader';
import { ProgressBar } from './sitediary/ProgressBar';
import { TimelineCard } from './sitediary/TimelineCard';
import { FabCamera } from './sitediary/FabCamera';
import { DiaryEntryDrawer } from './sitediary/DiaryEntryDrawer';

function nowHHmm(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

interface SiteDiaryTabProps {
  project: Project;
  currentUser: User | null;
  canEdit: boolean;
  canDelete: boolean;
}

// Sentinel for "drawer wants to open in new-entry mode" (no existing entry).
type DrawerTarget = DiaryEntry | 'new' | null;

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export function SiteDiaryTab({ project, currentUser }: SiteDiaryTabProps) {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  // ── Subscriptions ──────────────────────────────────────────────────────
  const allEntries = useDiaryEntries(project.id);
  const punchItems = usePunchItems(project.id);
  const addDiaryEntry = useGanttSideStore((s) => s.addDiaryEntry);
  const updateDiaryEntry = useGanttSideStore((s) => s.updateDiaryEntry);
  const upsertDiaryEntryFromRemote = useGanttSideStore((s) => s.upsertDiaryEntryFromRemote);

  // Ids that just arrived (via realtime) — drives the timeline slide-in + glow.
  // Each id self-expires after 1.5s so the highlight fades. Initial-render
  // entries are never here (the subscription only fires on post-mount INSERTs).
  const [newIds, setNewIds] = useState<Set<string>>(() => new Set());
  const markNew = useCallback((id: string) => {
    setNewIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    window.setTimeout(() => {
      setNewIds((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 1500);
  }, []);

  // ── Realtime: a diary entry created on another device/tab arrives here.
  //    Our own dual-written entries echo back too, but upsertDiaryEntryFromRemote
  //    dedupes by id so they don't double; markNew still flags them for the glow.
  useEffect(() => {
    const unsub = subscribeToProjectDiary(project.id, (entry) => {
      upsertDiaryEntryFromRemote(project.id, entry);
      markNew(entry.id);
    });
    return unsub;
  }, [project.id, upsertDiaryEntryFromRemote, markNew]);

  // Filter to today's entries that are visible (i.e. not conditions stubs).
  const todays = useMemo(
    () => allEntries.filter((e) => e.date === today && isVisibleEntry(e)),
    [allEntries, today],
  );

  // The "conditions row" entry for today — first matching entry on the day
  // (visible or stub). New entries get unshifted to the head, so this is
  // the most recently touched record.
  const dayConditionsEntry = useMemo(
    () => allEntries.find((e) => e.date === today) ?? null,
    [allEntries, today],
  );

  // ── Derived rollup ─────────────────────────────────────────────────────
  const rollup = useMemo<DayRollup>(() => {
    const uniqueWorkers = new Set<string>();
    let hours = 0;
    for (const e of todays) {
      for (const p of e.personnel) {
        if (p.workerId) uniqueWorkers.add(p.workerId);
        hours += p.hours ?? 0;
      }
    }
    return {
      headcount: uniqueWorkers.size,
      hoursLogged: hours,
      entries: todays.length,
      signedOffs: todays.filter((e) => (e.status ?? 'pending') === 'signed').length,
      totalForSignOff: todays.length,
      openPunchItems: punchItems.filter((p) => p.status === 'open').length,
    };
  }, [todays, punchItems]);

  // Common Works usage counts: last 7 days of entries, tag occurrences.
  const usageByName = useMemo(() => {
    const cutoff = new Date(today);
    cutoff.setTime(cutoff.getTime() - SEVEN_DAYS_MS);
    const cutoffISO = cutoff.toISOString().slice(0, 10);
    const counts: Record<string, number> = {};
    for (const e of allEntries) {
      if (e.date < cutoffISO) continue;
      for (const t of e.tags ?? []) {
        counts[t] = (counts[t] ?? 0) + 1;
      }
    }
    return counts;
  }, [allEntries, today]);

  // ── Drawer + pending photo state ───────────────────────────────────────
  const [drawerTarget, setDrawerTarget] = useState<DrawerTarget>(null);
  const [pendingPhoto, setPendingPhoto] = useState<File | null>(null);
  // Set when the user wants the New Entry drawer to auto-open the Sparky
  // assistant modal (e.g. clicked Ask Sparky in the empty state).
  const [autoOpenSparky, setAutoOpenSparky] = useState(false);

  const fabFileRef = useRef<HTMLInputElement | null>(null);
  const quickAddFileRef = useRef<HTMLInputElement | null>(null);

  // When we just created a new entry via quick-add or FAB, look it up by id
  // once it lands in the store and promote drawerTarget from 'new' → the
  // real DiaryEntry. Without this the drawer can't show photos / mutate
  // the entry until the user closes + re-opens.
  const pendingNewIdRef = useRef<string | null>(null);
  useEffect(() => {
    const pendingId = pendingNewIdRef.current;
    if (!pendingId) return;
    const found = allEntries.find((e) => e.id === pendingId);
    if (found) {
      pendingNewIdRef.current = null;
      setDrawerTarget(found);
    }
  }, [allEntries]);

  // If the drawer is open in edit mode, keep its `entry` prop fresh as the
  // store mutates underneath. Otherwise photo uploads triggered by the
  // FAB hand-off wouldn't re-render the drawer with the new photoId.
  useEffect(() => {
    if (!drawerTarget || drawerTarget === 'new') return;
    const latest = allEntries.find((e) => e.id === drawerTarget.id);
    if (latest && latest !== drawerTarget) setDrawerTarget(latest);
  }, [allEntries, drawerTarget]);

  // Empty-state "Ask Sparky" → open the New Entry drawer and auto-launch
  // the Sparky assistant modal inside it.
  const askSparky = useCallback(() => {
    setAutoOpenSparky(true);
    setDrawerTarget('new');
  }, []);

  const closeDrawer = useCallback(() => {
    setDrawerTarget(null);
    setPendingPhoto(null);
    setAutoOpenSparky(false);
  }, []);

  // ── Conditions handler — patches the most recent day entry or creates a
  //    silent stub if no entry exists yet.
  const handleConditionsChange = useCallback(
    (patch: { weather?: WeatherKind; temperatureF?: number | null }) => {
      const writePatch: Partial<DiaryEntry> = {};
      if (patch.weather !== undefined) writePatch.weather = patch.weather;
      if (patch.temperatureF !== undefined) {
        writePatch.temperatureF = patch.temperatureF == null ? undefined : patch.temperatureF;
      }
      if (dayConditionsEntry) {
        updateDiaryEntry(project.id, dayConditionsEntry.id, writePatch);
      } else {
        addDiaryEntry(project.id, {
          date: today,
          description: '',
          weather: patch.weather ?? 'sunny',
          temperatureF: patch.temperatureF == null ? undefined : patch.temperatureF,
          personnel: [],
          photoIds: [],
          createdBy: currentUser?.id ?? 'unknown',
        });
      }
    },
    [dayConditionsEntry, project.id, today, currentUser, addDiaryEntry, updateDiaryEntry],
  );

  // ── Quick add: typed text → minimal entry → open drawer to fill in details.
  const handleQuickAdd = useCallback(
    (text: string) => {
      if (!text) {
        setDrawerTarget('new');
        return;
      }
      const id = addDiaryEntry(project.id, {
        date: today,
        description: text,
        personnel: currentUser
          ? [{
              id: `pers_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              workerId: currentUser.id,
              workerName: currentUser.fullName,
              hours: 0,
              role: currentUser.role ?? 'worker',
              company: 'Casone Electrical',
            }]
          : [],
        photoIds: [],
        startTime: nowHHmm(),
        status: 'pending',
        tags: [],
        createdBy: currentUser?.id ?? 'unknown',
      });
      pendingNewIdRef.current = id;
      setDrawerTarget('new');                // promoted to real entry by the effect
    },
    [project.id, today, currentUser, addDiaryEntry],
  );

  // ── Photo upload entry points ─────────────────────────────────────────
  const openFabPicker = useCallback(() => fabFileRef.current?.click(), []);
  const openQuickAddPicker = useCallback(() => quickAddFileRef.current?.click(), []);

  const onPhotoFromFab = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;
    setPendingPhoto(files[0]);
    setDrawerTarget('new');
    if (fabFileRef.current) fabFileRef.current.value = '';
  }, []);
  const onPhotoFromQuickAdd = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;
    setPendingPhoto(files[0]);
    setDrawerTarget('new');
    if (quickAddFileRef.current) quickAddFileRef.current.value = '';
  }, []);

  // ── Render ────────────────────────────────────────────────────────────
  const conditionsWeather: WeatherKind = dayConditionsEntry?.weather ?? 'sunny';
  const conditionsTempF: number | null = dayConditionsEntry?.temperatureF ?? null;
  const quickAddInitials =
    currentUser?.fullName?.trim().split(/\s+/).filter(Boolean).slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase() || 'MT';

  return (
    <div className="-mx-4 sm:-mx-6 lg:-mx-8 bg-[#F4F1E8] min-h-[80vh]">
      {/* Slim header */}
      <div className="flex items-center gap-3 px-7 pt-5 pb-4">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-[#6B6B6B] font-medium">
          <span className="h-px w-5 bg-[#A0A0A0]" />
          WORKSPACE · SITE DIARY · {project.name.toUpperCase()}
        </div>
        <div className="flex-1" />
        <div className="text-[12.5px] text-[#6B6B6B]">
          Today:{' '}
          <strong className="text-[#1A1A1A] font-semibold">
            {new Date(today).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </strong>
          {' · '}
          <strong className={`font-semibold ${rollup.entries === 0 ? 'text-[#A0A0A0]' : 'text-[#1A1A1A]'}`}>
            {rollup.entries}
          </strong>{' '}
          {rollup.entries === 1 ? 'entry' : 'entries'}
          {' · '}
          <strong className={`font-semibold ${rollup.hoursLogged === 0 ? 'text-[#A0A0A0]' : 'text-[#1A1A1A]'}`}>
            {Math.round(rollup.hoursLogged * 10) / 10}h
          </strong>{' '}
          logged
        </div>
      </div>

      <main className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-5 px-7 pb-20">
        {/* LEFT COLUMN */}
        <aside className="space-y-4">
          <ConditionsCard
            weather={conditionsWeather}
            temperatureF={conditionsTempF}
            onChange={handleConditionsChange}
          />
          <DayRollupCard rollup={rollup} />
        </aside>

        {/* RIGHT COLUMN */}
        <section>
          <DayHeader
            projectName={project.name}
            todayISO={today}
            entryCount={rollup.entries}
            hoursLogged={rollup.hoursLogged}
            onNewEntry={() => setDrawerTarget('new')}
          />
          <ProgressBar hoursLogged={rollup.hoursLogged} headcount={rollup.headcount} />
          <TimelineCard
            entries={todays}
            newIds={newIds}
            quickAddInitials={quickAddInitials}
            onEntryClick={(e) => setDrawerTarget(e)}
            onQuickAdd={handleQuickAdd}
            onQuickAddPhoto={openQuickAddPicker}
            onNewEntry={() => setDrawerTarget('new')}
            onOpenSparky={askSparky}
          />
        </section>
      </main>

      <FabCamera onClick={openFabPicker} pulse={rollup.entries === 0} />

      {/* Hidden file inputs for the FAB + QuickAdd photo paths */}
      <input
        ref={fabFileRef}
        type="file"
        accept="image/*,video/mp4,video/quicktime"
        capture="environment"
        onChange={(e) => onPhotoFromFab(e.target.files)}
        className="hidden"
      />
      <input
        ref={quickAddFileRef}
        type="file"
        accept="image/*,video/mp4,video/quicktime"
        onChange={(e) => onPhotoFromQuickAdd(e.target.files)}
        className="hidden"
      />

      <DiaryEntryDrawer
        open={drawerTarget !== null}
        mode={drawerTarget === 'new' ? 'new' : 'edit'}
        entry={drawerTarget && drawerTarget !== 'new' ? drawerTarget : null}
        projectId={project.id}
        currentUser={currentUser}
        todayISO={today}
        pendingPhoto={pendingPhoto}
        usageByName={usageByName}
        autoOpenSparky={autoOpenSparky}
        onClose={closeDrawer}
      />
    </div>
  );
}

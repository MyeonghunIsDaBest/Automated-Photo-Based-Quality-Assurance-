import { useMemo } from 'react';
import { differenceInDays, isToday, isThisWeek, parseISO } from 'date-fns';
import { useAppStore } from './index';
import { useFeatureStore } from './features';
import { rolledUpPct, type Task } from '../types';

// Live KPIs derived from the actual store. Replaces the hardcoded
// `mockDashboardStats` / `dashboardStats` slice. Re-renders on every task
// or document change so the Dashboard, TopNav badge, and Reports stay in sync.
//
// Photos: previously read from useAppStore.photos, but new uploads from the
// Files page write to useFeatureStore.documents — the two stores never
// synced, so "Photos This Week" stayed at 0 forever. We now read straight
// from documents (filtered by type='photo' and the active project) so any
// upload is visible on the dashboard immediately.
export function useDashboardStats() {
  const project   = useAppStore((s) => s.project);
  const tasks     = useFeatureStore((s) => s.tasks);
  const documents = useFeatureStore((s) => s.documents);
  const photos    = useAppStore((s) => s.photos);

  return useMemo(() => {
    // Scoped to the active project. Leaf work units drive the % (phase anchors
    // are rolled up from these); the Tasks-Complete count below additionally
    // includes the phases themselves so the card reflects project structure.
    const leafTasks = tasks.filter(
      (t) => t.projectId === project.id && !t.isPhaseAnchor,
    );
    // "Tasks Complete" counts the project's structure — every phase (the 8
    // fixed + any custom) AND every sub-task — so a fresh project reads "0 / 8",
    // not "0 / 0". Anchor completion is rolled up from its children.
    const allUnits = tasks.filter((t) => t.projectId === project.id);
    const pctOf = (t: Task) => (t.isPhaseAnchor ? rolledUpPct(t, allUnits) : t.percentComplete);

    const totalTasks      = allUnits.length;
    const tasksComplete   = allUnits.filter((t) => pctOf(t) >= 100).length;
    const tasksInProgress = allUnits.filter((t) => { const p = pctOf(t); return p > 0 && p < 100; }).length;
    const delayedTasks    = allUnits.filter((t) => t.status === 'delayed').length;

    const overallProgress = leafTasks.length
      ? Math.round(leafTasks.reduce((sum, t) => sum + t.percentComplete, 0) / leafTasks.length)
      : 0;

    // Photos for the active project — union of the real `photos` table feed
    // (useAppStore.photos, where AI scans + uploads land via realtime) and the
    // Files-page documents (type='photo'). Counting only documents missed every
    // scanned photo. Deduped by id (the two id-spaces don't overlap).
    const photoDates: string[] = [];
    const seenPhotoIds = new Set<string>();
    for (const p of photos) {
      if (p.projectId === project.id && !seenPhotoIds.has(p.id)) {
        seenPhotoIds.add(p.id);
        photoDates.push(p.uploadedAt);
      }
    }
    for (const d of documents) {
      if (d.type === 'photo' && d.projectId === project.id && !seenPhotoIds.has(d.id)) {
        seenPhotoIds.add(d.id);
        photoDates.push(d.uploadedAt);
      }
    }
    const photosToday    = photoDates.filter(safeIsToday).length;
    const photosThisWeek = photoDates.filter(safeIsThisWeek).length;

    const daysRemaining = Math.max(0, differenceInDays(parseISO(project.endDate), new Date()));

    return {
      overallProgress,
      photosToday,
      photosThisWeek,
      tasksComplete,
      totalTasks,
      tasksInProgress,
      daysRemaining,
      delayedTasks,
    };
  }, [tasks, documents, photos, project]);
}

// Top in-progress tasks for the active project, closest to their end date.
// Project scoping was missing pre-Phase D-readiness; switching projects via
// the TopNav pill left the Dashboard showing tasks from the previous project
// until a manual refresh.
export function useActiveJobs(limit = 8): Task[] {
  const tasks = useFeatureStore((s) => s.tasks);
  const projectId = useAppStore((s) => s.project.id);
  return useMemo(() => {
    // The project's fixed construction phases (the 8 built-in anchors) ARE the
    // active jobs — shown even with no progress yet. Custom phases + sub-tasks
    // are intentionally excluded. Each anchor carries its rolled-up % so the
    // card reflects real child progress.
    const scoped = tasks.filter((t) => t.projectId === projectId);
    return scoped
      .filter((t) => t.isPhaseAnchor && !t.isCustom)
      .map((t) => ({ ...t, percentComplete: rolledUpPct(t, scoped) }))
      .sort((a, b) => parseISO(a.startDate).getTime() - parseISO(b.startDate).getTime())
      .slice(0, limit);
  }, [tasks, projectId, limit]);
}

// Upcoming tasks for the active project that haven't started yet, soonest
// first. Same project-scope fix as useActiveJobs.
export function useUpcomingTasks(limit = 4): Task[] {
  const tasks = useFeatureStore((s) => s.tasks);
  const projectId = useAppStore((s) => s.project.id);
  return useMemo(() => {
    return tasks
      .filter((t) => t.projectId === projectId)
      .filter((t) => t.status === 'not_started')
      .sort((a, b) => parseISO(a.startDate).getTime() - parseISO(b.startDate).getTime())
      .slice(0, limit);
  }, [tasks, projectId, limit]);
}

function safeIsToday(iso: string): boolean {
  try {
    return isToday(parseISO(iso));
  } catch {
    return false;
  }
}

function safeIsThisWeek(iso: string): boolean {
  try {
    return isThisWeek(parseISO(iso));
  } catch {
    return false;
  }
}
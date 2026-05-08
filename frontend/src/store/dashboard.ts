import { useMemo } from 'react';
import { differenceInDays, isToday, isThisWeek, parseISO } from 'date-fns';
import { useAppStore } from './index';
import { useFeatureStore } from './features';
import type { Task } from '../types';

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

  return useMemo(() => {
    const totalTasks = tasks.length;
    const overallProgress = totalTasks
      ? Math.round(tasks.reduce((sum, t) => sum + t.percentComplete, 0) / totalTasks)
      : 0;

    const tasksComplete   = tasks.filter((t) => t.status === 'complete').length;
    const tasksInProgress = tasks.filter((t) => t.status === 'in_progress').length;
    const delayedTasks    = tasks.filter((t) => t.status === 'delayed').length;

    // Photos for the active project, derived from the documents collection.
    const projectPhotos = documents.filter(
      (d) => d.type === 'photo' && d.projectId === project.id,
    );
    const photosToday    = projectPhotos.filter((p) => safeIsToday(p.uploadedAt)).length;
    const photosThisWeek = projectPhotos.filter((p) => safeIsThisWeek(p.uploadedAt)).length;

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
  }, [tasks, documents, project]);
}

// Top in-progress tasks for the active project, closest to their end date.
// Project scoping was missing pre-Phase D-readiness; switching projects via
// the TopNav pill left the Dashboard showing tasks from the previous project
// until a manual refresh.
export function useActiveJobs(limit = 3): Task[] {
  const tasks = useFeatureStore((s) => s.tasks);
  const projectId = useAppStore((s) => s.project.id);
  return useMemo(() => {
    return tasks
      .filter((t) => t.projectId === projectId)
      .filter((t) => t.status === 'in_progress' || t.status === 'delayed')
      .sort((a, b) => parseISO(a.endDate).getTime() - parseISO(b.endDate).getTime())
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
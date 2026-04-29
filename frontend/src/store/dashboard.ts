import { useMemo } from 'react';
import { differenceInDays, isToday, isThisWeek, parseISO } from 'date-fns';
import { useAppStore } from './index';
import { useFeatureStore } from './features';
import type { Task } from '../types';

// Live KPIs derived from the actual store. Replaces the hardcoded
// `mockDashboardStats` / `dashboardStats` slice. Re-renders on every task
// or photo change so the Dashboard, TopNav badge, and Reports stay in sync.
export function useDashboardStats() {
  const project = useAppStore((s) => s.project);
  const photos = useAppStore((s) => s.photos);
  const tasks = useFeatureStore((s) => s.tasks);

  return useMemo(() => {
    const totalTasks = tasks.length;
    const overallProgress = totalTasks
      ? Math.round(tasks.reduce((sum, t) => sum + t.percentComplete, 0) / totalTasks)
      : 0;

    const tasksComplete = tasks.filter((t) => t.status === 'complete').length;
    const tasksInProgress = tasks.filter((t) => t.status === 'in_progress').length;
    const delayedTasks = tasks.filter((t) => t.status === 'delayed').length;

    const photosToday = photos.filter((p) => safeIsToday(p.uploadedAt)).length;
    const photosThisWeek = photos.filter((p) => safeIsThisWeek(p.uploadedAt)).length;

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
  }, [tasks, photos, project]);
}

// Top 3 in-progress tasks closest to their end date — replaces the hardcoded
// `activeJobs` array on the Dashboard.
export function useActiveJobs(limit = 3): Task[] {
  const tasks = useFeatureStore((s) => s.tasks);
  return useMemo(() => {
    return [...tasks]
      .filter((t) => t.status === 'in_progress' || t.status === 'delayed')
      .sort((a, b) => parseISO(a.endDate).getTime() - parseISO(b.endDate).getTime())
      .slice(0, limit);
  }, [tasks, limit]);
}

// Upcoming tasks that haven't started yet, soonest first.
export function useUpcomingTasks(limit = 4): Task[] {
  const tasks = useFeatureStore((s) => s.tasks);
  return useMemo(() => {
    return [...tasks]
      .filter((t) => t.status === 'not_started')
      .sort((a, b) => parseISO(a.startDate).getTime() - parseISO(b.startDate).getTime())
      .slice(0, limit);
  }, [tasks, limit]);
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

import { useMemo } from 'react';
import { differenceInDays, parseISO } from 'date-fns';
import { useProjectsListStore } from '../../pages/projects/store';
import { useFeatureStore } from '../../store/features';
import { plannedPctNow } from '../../components/charts/PlannedVsActualTrend';

// Portfolio rollup (Tier role-experiences, Phase 1) — the Construction Manager's
// multi-project oversight band. Pure derive from data already in the client:
//   • project list + status + dates → from the projects store (all org projects
//     for a manager/admin, loaded by loadProjects()).
//   • per-project progress → averaged from the tasks store, BUT only projects
//     whose tasks are currently loaded (the active + previously-visited ones)
//     have a real number; others read `null` and the UI shows "—" rather than
//     faking 0%. A backend rollup is the future upgrade for all-project progress.
//   • scheduled position → plannedPctNow(start,end): where the linear schedule
//     says a project SHOULD be today, available for every project from its dates.

export interface PortfolioRow {
  id: string;
  name: string;
  client?: string;
  status: string;
  /** Where the linear schedule says the project should be by today (0–100). */
  scheduledPct: number;
  /** Averaged leaf-task % — null when this project's tasks aren't loaded yet. */
  progress: number | null;
  daysRemaining: number;
  behind: boolean;
}

export interface PortfolioRollup {
  total: number;
  byStatus: Record<string, number>;
  /** Projects flagged behind (delayed status, or recorded progress < schedule). */
  behind: number;
  rows: PortfolioRow[];
}

export function usePortfolioRollup(): PortfolioRollup {
  const projects = useProjectsListStore((s) => s.projects);
  const tasks = useFeatureStore((s) => s.tasks);

  return useMemo(() => {
    const byStatus: Record<string, number> = {};
    const rows: PortfolioRow[] = projects.map((p) => {
      byStatus[p.status] = (byStatus[p.status] ?? 0) + 1;

      const leaf = tasks.filter((t) => t.projectId === p.id && !t.isPhaseAnchor);
      const progress = leaf.length
        ? Math.round(leaf.reduce((s, t) => s + t.percentComplete, 0) / leaf.length)
        : null;

      let scheduledPct = 0;
      try { scheduledPct = plannedPctNow(p.startDate, p.endDate); } catch { /* bad dates */ }

      let daysRemaining = 0;
      try { daysRemaining = Math.max(0, differenceInDays(parseISO(p.endDate), new Date())); } catch { /* bad dates */ }

      // "Behind" = recorded progress trails where the schedule says it should be
      // by today (>5% gap). Project status has no 'delayed' value, so this is the
      // signal. null progress (unloaded project) isn't flagged either way.
      const behind = progress != null && progress < scheduledPct - 5;

      return { id: p.id, name: p.name, client: p.client, status: p.status, scheduledPct, progress, daysRemaining, behind };
    });

    return {
      total: projects.length,
      byStatus,
      behind: rows.filter((r) => r.behind).length,
      rows,
    };
  }, [projects, tasks]);
}

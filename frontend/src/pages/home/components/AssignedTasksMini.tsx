// AssignedTasksMini — top-5 assigned-to-me tasks across the worker's invited
// projects. Worker-variant only (the role config gates this section).
//
// Each row: status dot + task name + project label + percent. Click opens
// the TaskDrawer via the existing `?task=` deep-link.

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useFeatureStore } from '../../../store/features';
import { useProjectsListStore } from '../../projects/store';
import type { Task, TaskStatus } from '../../../types';

interface AssignedTasksMiniProps {
  /** ID of the signed-in user — tasks are filtered to `assigneeId === userId`. */
  userId: string | undefined;
  /** Only tasks belonging to these project IDs are shown. Usually the worker's
   *  invited project list. */
  projectIds: string[];
}

const STATUS_DOT: Record<TaskStatus, string> = {
  not_started: 'bg-slate-400',
  in_progress: 'bg-blue-500',
  complete:    'bg-emerald-500',
  delayed:     'bg-red-500',
  blocked:     'bg-amber-500',
};

const MAX_ROWS = 5;

export default function AssignedTasksMini({ userId, projectIds }: AssignedTasksMiniProps) {
  const tasks    = useFeatureStore((s) => s.tasks);
  const projects = useProjectsListStore((s) => s.projects);

  const rows = useMemo<{ task: Task; projectName: string }[]>(() => {
    if (!userId || projectIds.length === 0) return [];
    const projectSet = new Set(projectIds);
    const projectNameById = new Map(projects.map((p) => [p.id, p.name]));
    return tasks
      .filter((t) => projectSet.has(t.projectId))
      .filter((t) => t.assigneeId === userId)
      .filter((t) => t.status !== 'complete')
      .sort((a, b) => a.endDate.localeCompare(b.endDate))
      .slice(0, MAX_ROWS)
      .map((task) => ({ task, projectName: projectNameById.get(task.projectId) ?? '—' }));
  }, [tasks, projects, userId, projectIds]);

  return (
    <section aria-labelledby="todays-brief-heading">
      <div className="flex items-center justify-between gap-3">
        <p
          id="todays-brief-heading"
          className="text-[11px] font-medium uppercase tracking-[0.22em] text-slate-500"
        >
          Today’s brief
        </p>
        {rows.length > 0 && (
          <p className="text-xs tabular-nums text-slate-400">
            {rows.length} assigned · earliest due first
          </p>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-white px-5 py-6 text-sm text-slate-500">
          Nothing’s assigned to you yet. Tasks land here once your site manager
          tags you on the Gantt.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {rows.map(({ task, projectName }) => (
            <li key={task.id}>
              <Link
                to={`/gantt?project=${task.projectId}&tab=tasks&task=${task.id}`}
                className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-slate-50"
              >
                <span
                  className={`h-2 w-2 flex-shrink-0 rounded-full ${STATUS_DOT[task.status]}`}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {task.name}
                  </p>
                  <p className="truncate text-xs text-slate-500">{projectName}</p>
                </div>
                <span className="tabular-nums text-xs font-medium text-slate-700">
                  {task.percentComplete}%
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

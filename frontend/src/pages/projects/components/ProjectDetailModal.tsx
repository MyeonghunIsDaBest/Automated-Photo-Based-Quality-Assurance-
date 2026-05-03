import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pencil, X, ListChecks, ArrowUpRight, Truck, Plus } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Badge } from '../../../components/ui/badge';
import { useAppStore } from '../../../store';
import { useFeatureStore } from '../../../store/features';
import { canEditProjects } from '../../../lib/permissions';
import { useProjectsListStore } from '../store';
import { Project, ProjectStatus } from '../types';
import type { Task, TaskStatus } from '../../../types';
import { SupplierOrderModal } from './SupplierOrderModal';

interface ProjectDetailModalProps {
  project: Project | null;
  onClose: () => void;
}

const STATUS_OPTIONS: { value: ProjectStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'on_hold', label: 'On Hold' },
  { value: 'completed', label: 'Completed' },
  { value: 'archived', label: 'Archived' },
];

const STATUS_LABEL: Record<ProjectStatus, string> = {
  active: 'Active',
  on_hold: 'On Hold',
  completed: 'Completed',
  archived: 'Archived',
};

const STATUS_BADGE: Record<ProjectStatus, string> = {
  active: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  on_hold: 'border-amber-200 bg-amber-50 text-amber-700',
  completed: 'border-blue-200 bg-blue-50 text-blue-700',
  archived: 'border-slate-200 bg-slate-50 text-slate-600',
};

const STATUS_ACCENT: Record<ProjectStatus, string> = {
  active: '#0F766E',
  on_hold: '#B45309',
  completed: '#1E40AF',
  archived: '#0F172A',
};

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const daysBetween = (a: string, b: string) => {
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return Math.max(0, Math.round(ms / 86_400_000));
};

interface DraftState {
  name: string;
  client: string;
  status: ProjectStatus;
  startDate: string;
  endDate: string;
  percentComplete: number;
  tasksComplete: number;
  tasksPending: number;
  tasksOutstanding: number;
}

const fromProject = (p: Project): DraftState => ({
  name: p.name,
  client: p.client,
  status: p.status,
  startDate: p.startDate,
  endDate: p.endDate,
  percentComplete: p.percentComplete,
  tasksComplete: p.tasksComplete,
  tasksPending: p.tasksPending,
  tasksOutstanding: p.tasksOutstanding,
});

export function ProjectDetailModal({ project, onClose }: ProjectDetailModalProps) {
  const navigate = useNavigate();
  const currentUser = useAppStore((s) => s.currentUser);
  const setActiveProject = useProjectsListStore((s) => s.setActiveProject);
  const allTasks = useFeatureStore((s) => s.tasks);
  const updateProject = useProjectsListStore((s) => s.updateProject);
  const canEdit = canEditProjects(currentUser);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [orderModalOpen, setOrderModalOpen] = useState(false);

  const projectTasks = useMemo(
    () => (project ? allTasks.filter((t) => t.projectId === project.id) : []),
    [allTasks, project?.id],
  );

  const openInGantt = (taskId?: string) => {
    if (!project) return;
    setActiveProject(project.id);
    onClose();
    // Hand the deep link off to the Gantt page; it currently doesn't read
    // the query string, so this is informational only — the user lands on
    // the Gantt with the right project already selected.
    navigate(taskId ? `/gantt?task=${taskId}` : '/gantt');
  };

  useEffect(() => {
    if (project) {
      setDraft(fromProject(project));
      setEditing(false);
      setError(null);
    } else {
      setDraft(null);
    }
  }, [project?.id]);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  if (!project || !draft) return null;

  const totalDuration = daysBetween(project.startDate, project.endDate);
  const daysRemaining = daysBetween(today, project.endDate);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!draft.name.trim()) return setError('Project name is required.');
    if (!draft.client.trim()) return setError('Client name is required.');
    if (!draft.startDate || !draft.endDate) return setError('Start and end dates are required.');
    if (new Date(draft.startDate) > new Date(draft.endDate)) {
      return setError('End date must be after start date.');
    }
    if (draft.percentComplete < 0 || draft.percentComplete > 100) {
      return setError('Percent complete must be between 0 and 100.');
    }
    if (draft.tasksComplete < 0 || draft.tasksPending < 0 || draft.tasksOutstanding < 0) {
      return setError('Task counts cannot be negative.');
    }

    updateProject(project.id, {
      name: draft.name.trim(),
      client: draft.client.trim(),
      status: draft.status,
      startDate: draft.startDate,
      endDate: draft.endDate,
      percentComplete: draft.percentComplete,
      tasksComplete: draft.tasksComplete,
      tasksPending: draft.tasksPending,
      tasksOutstanding: draft.tasksOutstanding,
    });
    setEditing(false);
  };

  const handleCancel = () => {
    setDraft(fromProject(project));
    setError(null);
    setEditing(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-2 sm:p-4">
      <div
        className="flex h-full max-h-[95vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-xl sm:h-auto sm:max-h-[90vh]"
        style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}
      >
        {/* Header */}
        <div className="relative overflow-hidden border-b border-slate-200">
          <div
            className="absolute left-0 top-0 h-0.5 w-full"
            style={{ backgroundColor: STATUS_ACCENT[project.status] }}
          />
          <div className="flex items-start justify-between gap-4 px-6 py-5">
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-slate-500">
                Project · {editing ? 'Editing' : 'Overview'}
              </p>
              <h2
                className="mt-1 truncate text-2xl font-medium text-slate-900"
                style={{ fontFamily: "'Fraunces', Georgia, serif", letterSpacing: '-0.02em' }}
              >
                {project.name}
              </h2>
              <p className="mt-0.5 text-sm text-slate-500">{project.client}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {editing ? (
          /* ─── Edit form ─── */
          <form onSubmit={handleSave} className="flex flex-1 flex-col overflow-hidden">
            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Project Name">
                  <Input
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  />
                </Field>
                <Field label="Client">
                  <Input
                    value={draft.client}
                    onChange={(e) => setDraft({ ...draft, client: e.target.value })}
                  />
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Status">
                  <select
                    value={draft.status}
                    onChange={(e) => setDraft({ ...draft, status: e.target.value as ProjectStatus })}
                    className="block h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    {STATUS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Start Date">
                  <Input
                    type="date"
                    value={draft.startDate}
                    onChange={(e) => setDraft({ ...draft, startDate: e.target.value })}
                  />
                </Field>
                <Field label="End Date">
                  <Input
                    type="date"
                    value={draft.endDate}
                    onChange={(e) => setDraft({ ...draft, endDate: e.target.value })}
                  />
                </Field>
              </div>

              <Field label="Percent Complete">
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={draft.percentComplete}
                    onChange={(e) => setDraft({ ...draft, percentComplete: Number(e.target.value) })}
                    className="flex-1 accent-emerald-600"
                  />
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={draft.percentComplete}
                    onChange={(e) =>
                      setDraft({ ...draft, percentComplete: Number(e.target.value) })
                    }
                    className="w-20"
                  />
                </div>
              </Field>

              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Tasks Complete">
                  <Input
                    type="number"
                    min={0}
                    value={draft.tasksComplete}
                    onChange={(e) =>
                      setDraft({ ...draft, tasksComplete: Number(e.target.value) })
                    }
                  />
                </Field>
                <Field label="Tasks Pending">
                  <Input
                    type="number"
                    min={0}
                    value={draft.tasksPending}
                    onChange={(e) =>
                      setDraft({ ...draft, tasksPending: Number(e.target.value) })
                    }
                  />
                </Field>
                <Field label="Tasks Outstanding">
                  <Input
                    type="number"
                    min={0}
                    value={draft.tasksOutstanding}
                    onChange={(e) =>
                      setDraft({ ...draft, tasksOutstanding: Number(e.target.value) })
                    }
                  />
                </Field>
              </div>

              {error && (
                <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {error}
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50/50 px-6 py-3">
              <Button type="button" variant="outline" onClick={handleCancel}>
                Cancel
              </Button>
              <Button type="submit">Save changes</Button>
            </div>
          </form>
        ) : (
          /* ─── Read-only view ─── */
          <>
            <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
              <div className="grid gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 sm:grid-cols-2">
                <ReadCell label="Status">
                  <span
                    className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[project.status]}`}
                  >
                    {STATUS_LABEL[project.status]}
                  </span>
                </ReadCell>
                <ReadCell label="Days Remaining">
                  <p className="text-2xl font-medium text-slate-900" style={{ fontFamily: "'Fraunces', Georgia, serif", fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.04em' }}>
                    {daysRemaining}
                  </p>
                  <p className="text-xs text-slate-400">of {totalDuration} total</p>
                </ReadCell>
                <ReadCell label="Start Date">
                  <p className="text-sm font-medium text-slate-900">{fmtDate(project.startDate)}</p>
                </ReadCell>
                <ReadCell label="End Date">
                  <p className="text-sm font-medium text-slate-900">{fmtDate(project.endDate)}</p>
                </ReadCell>
              </div>

              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
                  Progress
                </p>
                <div className="mt-2 flex items-center gap-3">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-2 rounded-full bg-emerald-500 transition-all"
                      style={{ width: `${project.percentComplete}%` }}
                    />
                  </div>
                  <span className="tabular-nums text-sm font-medium text-slate-700">
                    {project.percentComplete}%
                  </span>
                </div>
              </div>

              <div className="grid gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 sm:grid-cols-3">
                <StatBlock label="Complete" value={project.tasksComplete} accent="#0F766E" />
                <StatBlock label="Pending" value={project.tasksPending} accent="#B45309" />
                <StatBlock label="Outstanding" value={project.tasksOutstanding} accent="#DC2626" />
              </div>

              {/* ── Tasks attached to this project ── */}
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ListChecks className="h-4 w-4 text-slate-400" />
                    <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
                      Tasks ({projectTasks.length})
                    </p>
                  </div>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => setOrderModalOpen(true)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1 text-[11px] font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50"
                    >
                      <Truck className="h-3.5 w-3.5" />
                      Place supplier order
                    </button>
                  )}
                </div>

                {projectTasks.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-6 text-center">
                    <p className="text-sm text-slate-500">
                      No tasks on the schedule yet.
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      Tasks created from the Gantt page or via supplier orders show up here.
                    </p>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => openInGantt()}
                        className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-700"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add first task
                      </button>
                    )}
                  </div>
                ) : (
                  <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
                    {projectTasks.slice(0, 8).map((task) => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        onClick={() => openInGantt(task.id)}
                      />
                    ))}
                    {projectTasks.length > 8 && (
                      <li className="bg-slate-50/50 px-4 py-2 text-center text-[11px] text-slate-500">
                        +{projectTasks.length - 8} more — open the Gantt for the full schedule.
                      </li>
                    )}
                  </ul>
                )}

                <button
                  type="button"
                  onClick={() => openInGantt()}
                  className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-800"
                >
                  Open in Gantt
                  <ArrowUpRight className="h-3 w-3" />
                </button>
              </div>

              {!canEdit && (
                <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                  You're viewing this project in read-only mode. Editing is reserved for the
                  internal team.
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50/50 px-6 py-3">
              <Button type="button" variant="outline" onClick={onClose}>
                Close
              </Button>
              {canEdit && (
                <Button type="button" onClick={() => setEditing(true)}>
                  <Pencil className="mr-1.5 h-3.5 w-3.5" />
                  Edit details
                </Button>
              )}
            </div>
          </>
        )}
      </div>

      <SupplierOrderModal
        open={orderModalOpen}
        project={project}
        onClose={() => setOrderModalOpen(false)}
      />
    </div>
  );
}

const TASK_STATUS_BADGE: Record<TaskStatus, string> = {
  not_started: 'border-slate-200 bg-slate-50 text-slate-600',
  in_progress: 'border-blue-200 bg-blue-50 text-blue-700',
  complete:    'border-emerald-200 bg-emerald-50 text-emerald-700',
  delayed:     'border-red-200 bg-red-50 text-red-700',
  blocked:     'border-amber-200 bg-amber-50 text-amber-700',
};

function TaskRow({ task, onClick }: { task: Task; onClick: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-900">{task.name}</p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {fmtDate(task.startDate)} → {fmtDate(task.endDate)} · {task.phase}
          </p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-3">
          <div className="hidden sm:flex w-24 items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-1.5 rounded-full bg-emerald-500"
                style={{ width: `${task.percentComplete}%` }}
              />
            </div>
            <span className="tabular-nums text-[11px] text-slate-500">
              {task.percentComplete}%
            </span>
          </div>
          <Badge
            variant="outline"
            className={`text-[10px] uppercase tracking-wider ${TASK_STATUS_BADGE[task.status]}`}
          >
            {task.status.replace('_', ' ')}
          </Badge>
        </div>
      </button>
    </li>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-700">{label}</label>
      {children}
    </div>
  );
}

function ReadCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-white p-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.15em] text-slate-500">{label}</p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function StatBlock({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="relative overflow-hidden bg-white p-4">
      <div className="absolute left-0 top-0 h-px w-8" style={{ backgroundColor: accent }} />
      <p className="text-[11px] font-medium uppercase tracking-[0.15em] text-slate-500">{label}</p>
      <p
        className="mt-2 text-3xl font-medium text-slate-900"
        style={{ fontFamily: "'Fraunces', Georgia, serif", fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.04em' }}
      >
        {value}
      </p>
    </div>
  );
}

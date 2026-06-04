import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pencil, X, ListChecks, ArrowUpRight, Truck, Plus, Sliders } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Badge } from '../../../components/ui/badge';
import { useAppStore } from '../../../store';
import { useFeatureStore } from '../../../store/features';
import { canEditProjects } from '../../../lib/permissions';
import { useProjectConfig } from '../../../lib/hooks/useProjectConfig';
import { useProjectsListStore } from '../store';
import { Project, ProjectStatus } from '../types';
import type { Task, TaskStatus, ProjectConfig } from '../../../types';
import { SupplierOrderModal } from './SupplierOrderModal';
import { TeamSection } from './TeamSection';
import { FRAUNCES } from '../../gantt/components/ledger';

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

// Warm status badge classes using arbitrary values
const STATUS_BADGE: Record<ProjectStatus, string> = {
  active:    'border-[#A8D0B8] bg-[#E5F2EA] text-[#246F47]',
  on_hold:   'border-[#F0D5A8] bg-[#F9EFD9] text-[#C8841E]',
  completed: 'border-[#C8D3DA] bg-[#EEF1F4] text-[#5B6B7B]',
  archived:  'border-[#E6E1D4] bg-[#F0EDE4] text-[#6B6B6B]',
};

const STATUS_ACCENT: Record<ProjectStatus, string> = {
  active:    '#2F8F5C',
  on_hold:   '#C8841E',
  completed: '#5B6B7B',
  archived:  '#A0A0A0',
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1A1A1A]/50 p-2 sm:p-4">
      <div
        className="flex h-full max-h-[95dvh] w-full max-w-3xl flex-col overflow-hidden rounded-[14px] bg-white shadow-[0_8px_28px_rgba(20,20,20,0.12)] sm:h-auto sm:max-h-[90dvh]"
        style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}
      >
        {/* Header */}
        <div className="relative overflow-hidden border-b border-[#E6E1D4]">
          <div
            className="absolute left-0 top-0 h-0.5 w-full"
            style={{ backgroundColor: STATUS_ACCENT[project.status] }}
          />
          <div className="flex items-start justify-between gap-4 px-6 py-5">
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[#6B6B6B]">
                Project · {editing ? 'Editing' : 'Overview'}
              </p>
              <h2
                className="mt-1 truncate text-2xl font-medium text-[#1A1A1A]"
                style={{ fontFamily: FRAUNCES, letterSpacing: '-0.02em' }}
              >
                {project.name}
              </h2>
              <p className="mt-0.5 text-sm text-[#6B6B6B]">{project.client}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-[#6B6B6B] hover:bg-[#F0EDE4]"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {editing ? (
          /* ─── Edit form ─── */
          <form onSubmit={handleSave} className="flex flex-1 flex-col overflow-hidden">
            <div className="editorial-scrollbox flex-1 space-y-5 px-6 py-5">
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
                    className="block h-9 w-full rounded-md border border-[#E6E1D4] bg-white px-3 text-sm shadow-sm focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]"
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
                    className="flex-1 accent-[#2F8F5C]"
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
                <p className="rounded-md border border-[#FBE5E5] bg-[#FBE5E5] px-3 py-2 text-xs text-[#C44545]">
                  {error}
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-[#E6E1D4] bg-[#FAF8F2] px-6 py-3">
              <Button type="button" variant="outline" onClick={handleCancel}>
                Cancel
              </Button>
              <Button type="submit">Save changes</Button>
            </div>
          </form>
        ) : (
          /* ─── Read-only view ─── */
          <>
            <div className="editorial-scrollbox flex-1 space-y-6 px-6 py-5">
              <div className="grid gap-px overflow-hidden rounded-[14px] border border-[#E6E1D4] bg-[#E6E1D4] sm:grid-cols-2">
                <ReadCell label="Status">
                  <span
                    className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[project.status]}`}
                  >
                    {STATUS_LABEL[project.status]}
                  </span>
                </ReadCell>
                <ReadCell label="Days Remaining">
                  <p className="text-2xl font-medium text-[#1A1A1A]" style={{ fontFamily: FRAUNCES, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.04em' }}>
                    {daysRemaining}
                  </p>
                  <p className="text-xs text-[#A0A0A0]">of {totalDuration} total</p>
                </ReadCell>
                <ReadCell label="Start Date">
                  <p className="text-sm font-medium text-[#1A1A1A]">{fmtDate(project.startDate)}</p>
                </ReadCell>
                <ReadCell label="End Date">
                  <p className="text-sm font-medium text-[#1A1A1A]">{fmtDate(project.endDate)}</p>
                </ReadCell>
              </div>

              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#6B6B6B]">
                  Progress
                </p>
                <div className="mt-2 flex items-center gap-3">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#F0EDE4]">
                    <div
                      className="h-2 rounded-full transition-all"
                      style={{ width: `${project.percentComplete}%`, backgroundColor: STATUS_ACCENT[project.status] }}
                    />
                  </div>
                  <span className="text-sm font-medium text-[#3A3A3A]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {project.percentComplete}%
                  </span>
                </div>
              </div>

              <div className="grid gap-px overflow-hidden rounded-[14px] border border-[#E6E1D4] bg-[#E6E1D4] sm:grid-cols-3">
                <StatBlock label="Complete" value={project.tasksComplete} accent="#2F8F5C" />
                <StatBlock label="Pending" value={project.tasksPending} accent="#C8841E" />
                <StatBlock label="Outstanding" value={project.tasksOutstanding} accent="#C44545" />
              </div>

              {/* ── Tasks attached to this project ── */}
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ListChecks className="h-4 w-4 text-[#A0A0A0]" />
                    <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#6B6B6B]">
                      Tasks ({projectTasks.length})
                    </p>
                  </div>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => setOrderModalOpen(true)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-[#E6E1D4] px-3 py-1 text-[11px] font-medium text-[#3A3A3A] transition-colors hover:border-[#D8D2C4] hover:bg-[#FAF8F2]"
                    >
                      <Truck className="h-3.5 w-3.5" />
                      Place supplier order
                    </button>
                  )}
                </div>

                {projectTasks.length === 0 ? (
                  <div className="rounded-[14px] border border-dashed border-[#E6E1D4] bg-[#FAF8F2] px-4 py-6 text-center">
                    <p className="text-sm text-[#6B6B6B]">
                      No tasks on the schedule yet.
                    </p>
                    <p className="mt-1 text-xs text-[#A0A0A0]">
                      Tasks created from the Gantt page or via supplier orders show up here.
                    </p>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => openInGantt()}
                        className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#2F8F5C] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#246F47]"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add first task
                      </button>
                    )}
                  </div>
                ) : (
                  <ul className="divide-y divide-[#EFEBE0] overflow-hidden rounded-[14px] border border-[#E6E1D4]">
                    {projectTasks.slice(0, 8).map((task) => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        onClick={() => openInGantt(task.id)}
                      />
                    ))}
                    {projectTasks.length > 8 && (
                      <li className="bg-[#FAF8F2] px-4 py-2 text-center text-[11px] text-[#6B6B6B]">
                        +{projectTasks.length - 8} more — open the Gantt for the full schedule.
                      </li>
                    )}
                  </ul>
                )}

                <button
                  type="button"
                  onClick={() => openInGantt()}
                  className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-[#246F47] hover:text-[#2F8F5C]"
                >
                  Open in Gantt
                  <ArrowUpRight className="h-3 w-3" />
                </button>
              </div>

              {/* ── Team — per-project membership list + invite affordance ── */}
              <TeamSection projectId={project.id} projectName={project.name} />

              {/* ── Configuration (read-only mirror of /admin → Project config) ── */}
              <ConfigPanel projectId={project.id} />

              {!canEdit && (
                <p className="rounded-[14px] border border-[#E6E1D4] bg-[#FAF8F2] px-3 py-2 text-xs text-[#6B6B6B]">
                  You're viewing this project in read-only mode. Editing is reserved for the
                  internal team.
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-[#E6E1D4] bg-[#FAF8F2] px-6 py-3">
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
  not_started: 'border-[#E6E1D4] bg-[#F0EDE4] text-[#6B6B6B]',
  in_progress: 'border-[#C8D3DA] bg-[#EEF1F4] text-[#5B6B7B]',
  complete:    'border-[#A8D0B8] bg-[#E5F2EA] text-[#246F47]',
  delayed:     'border-[#FBE5E5] bg-[#FBE5E5] text-[#C44545]',
  blocked:     'border-[#F0D5A8] bg-[#F9EFD9] text-[#C8841E]',
};

function TaskRow({ task, onClick }: { task: Task; onClick: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[#FAF8F2]"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-[#1A1A1A]">{task.name}</p>
          <p className="mt-0.5 text-[11px] text-[#6B6B6B]">
            {fmtDate(task.startDate)} → {fmtDate(task.endDate)} · {task.phase}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <div className="hidden sm:flex w-24 items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#F0EDE4]">
              <div
                className="h-1.5 rounded-full bg-[#2F8F5C]"
                style={{ width: `${task.percentComplete}%` }}
              />
            </div>
            <span className="text-[11px] text-[#6B6B6B]" style={{ fontVariantNumeric: 'tabular-nums' }}>
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
      <label className="mb-1 block text-xs font-medium text-[#3A3A3A]">{label}</label>
      {children}
    </div>
  );
}

function ReadCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-white p-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.15em] text-[#6B6B6B]">{label}</p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

// Read-only Configuration panel. Mirrors the columns admins edit via
// /admin → Project config so non-admins see what's set without an edit
// affordance. Reuses `useProjectConfig` so the cache stays warm between
// surfaces.
function ConfigPanel({ projectId }: { projectId: string }) {
  const { config, isLoading } = useProjectConfig(projectId);
  if (isLoading || !config) return null;
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <Sliders className="h-4 w-4 text-[#A0A0A0]" />
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#6B6B6B]">Configuration</p>
      </div>
      <div className="grid gap-px overflow-hidden rounded-[14px] border border-[#E6E1D4] bg-[#E6E1D4] sm:grid-cols-3">
        <ConfigCell label="Auto-update ≥" value={config.aiAutoUpdateThreshold.toFixed(2)} />
        <ConfigCell label="Review queue ≥" value={config.aiReviewQueueThreshold.toFixed(2)} />
        <ConfigCell label="Default model" value={config.aiDefaultModel} mono />
        <ConfigCell label="Progression" value={describeProgressionMode(config.progressionMode)} />
        <ConfigCell label="Manager force-floor" value={config.manualFloorAllowed ? 'Allowed' : 'Disabled'} />
        <ConfigCell label="Dedup distance" value={`${config.phashThreshold}`} />
        <ConfigCell label="Accent" value={config.accentColor ?? 'Default (sage)'} dot={config.accentColor ?? '#2F8F5C'} />
        <ConfigCell label="Logo" value={config.logoStoragePath ?? '—'} mono />
        <ConfigCell label="Report cadence" value={describeReportCadence(config.reportCadence)} />
      </div>
    </div>
  );
}

function describeProgressionMode(m: ProjectConfig['progressionMode']): string {
  switch (m) {
    case 'manual':         return 'Manual slider';
    case 'human_assisted': return 'Human-assisted';
    case 'full_auto':      return 'Full auto';
  }
}

function describeReportCadence(c: ProjectConfig['reportCadence']): string {
  switch (c) {
    case 'none':    return 'Off';
    case 'weekly':  return 'Weekly';
    case 'monthly': return 'Monthly';
  }
}

function ConfigCell({ label, value, mono, dot }: { label: string; value: string; mono?: boolean; dot?: string }) {
  return (
    <div className="bg-white p-3">
      <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-[#6B6B6B]">{label}</p>
      <p className={`mt-1 flex items-center gap-2 text-sm text-[#1A1A1A] ${mono ? 'font-mono text-xs' : ''}`}>
        {dot && (
          <span
            className="inline-block h-2.5 w-2.5 rounded-full border border-[#E6E1D4]"
            style={{ backgroundColor: dot }}
            aria-hidden
          />
        )}
        <span className="truncate">{value}</span>
      </p>
    </div>
  );
}

function StatBlock({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="relative overflow-hidden bg-white p-4">
      <div className="absolute left-0 top-0 h-px w-8" style={{ backgroundColor: accent }} />
      <p className="text-[11px] font-medium uppercase tracking-[0.15em] text-[#6B6B6B]">{label}</p>
      <p
        className="mt-2 text-3xl font-medium text-[#1A1A1A]"
        style={{ fontFamily: FRAUNCES, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.04em' }}
      >
        {value}
      </p>
    </div>
  );
}

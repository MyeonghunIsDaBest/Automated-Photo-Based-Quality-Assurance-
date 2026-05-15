import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowUpRight, Calendar, Clock, Pin, Trash2, X } from 'lucide-react';
import type { Project, ProjectStatus } from '../types';
import { useProjectsListStore } from '../store';
import { useFeatureStore } from '../../../store/features';
import { deleteProject as apiDeleteProject } from '../../../lib/api/projects';
import { supabaseConfigured } from '../../../lib/supabase';

// Demo / generated projects live entirely in the client store — they have
// non-UUID IDs ("project_demo_inflight", "proj_<timestamp>") and were never
// inserted into Supabase. Calling `delete from projects where id = …`
// against the real DB rejects with "invalid input syntax for type uuid"
// before it can no-op, so we skip the Supabase round-trip for these and
// just splice them out of local state.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isServerProject(id: string): boolean {
  return UUID_RE.test(id);
}

// ProjectsListTab is now a pure card-renderer. State (filter, search, sort,
// pin, recently-opened) lives on Projects.tsx and arrives as already-filtered
// props. Earlier passes had this component own search/filter/sort internally
// via useTableState + FilterPills + SortableHeader; lifting that out fixed
// the duplicate-toolbar problem when Projects.tsx grew its own toolbar.

interface ProjectsListTabProps {
  projects: Project[];
  onOpen?: (projectId: string) => void;
  pinnedIds?: Set<string>;
  onTogglePin?: (projectId: string) => void;
  /** Most-recently-opened project id — gets a "Last opened" chip. */
  mostRecentId?: string | null;
  /** Tells the card which secondary stat to highlight (e.g. "tasks_outstanding"
   *  sort puts an emphasis on outstanding count). Decorative only. */
  sortMode?: string;
  /** Owner-only — when true, every card gets a trash icon that opens a
   *  confirmation modal and removes the project from local state + Supabase. */
  canDelete?: boolean;
}

const STATUS_META: Record<ProjectStatus, {
  label: string;
  pillClass: string;
  dot: string;
  accent: string;
}> = {
  active:    { label: 'Active',    pillClass: 'bg-emerald-50 text-emerald-800', dot: '#10B981', accent: '#0F766E' },
  on_hold:   { label: 'On Hold',   pillClass: 'bg-amber-50 text-amber-800',     dot: '#F59E0B', accent: '#B45309' },
  completed: { label: 'Completed', pillClass: 'bg-slate-100 text-slate-600',    dot: '#64748B', accent: '#1E40AF' },
  archived:  { label: 'Archived',  pillClass: 'bg-slate-100 text-slate-500',    dot: '#94A3B8', accent: '#475569' },
};

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function daysToEnd(endIso: string): number {
  return Math.round((Date.parse(endIso) - Date.now()) / 86_400_000);
}

export function ProjectsListTab({
  projects,
  onOpen,
  pinnedIds,
  onTogglePin,
  mostRecentId,
  sortMode,
  canDelete,
}: ProjectsListTabProps) {
  const [pendingDelete, setPendingDelete] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      // Only hit Supabase for real (UUID-keyed) projects. Demo / generated
      // copies have client-only IDs and would crash the DB call with an
      // invalid-uuid error before doing anything useful.
      if (supabaseConfigured() && isServerProject(pendingDelete.id)) {
        await apiDeleteProject(pendingDelete.id);
      }
      // Splice from local state in both modes so the UI updates instantly.
      useProjectsListStore.setState((s) => ({
        projects: s.projects.filter((x) => x.id !== pendingDelete.id),
        activeProjectId:
          s.activeProjectId === pendingDelete.id
            ? s.projects.find((x) => x.id !== pendingDelete.id)?.id ?? null
            : s.activeProjectId,
      }));
      useFeatureStore.setState((s) => ({
        tasks: s.tasks.filter((t) => t.projectId !== pendingDelete.id),
      }));
      setPendingDelete(null);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Delete failed.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((p) => (
          <ProjectCard
            key={p.id}
            project={p}
            pinned={pinnedIds?.has(p.id) ?? false}
            isMostRecent={mostRecentId === p.id}
            highlightOutstanding={sortMode === 'tasks_outstanding'}
            onOpen={() => onOpen?.(p.id)}
            onTogglePin={onTogglePin ? () => onTogglePin(p.id) : undefined}
            onDelete={canDelete ? () => setPendingDelete(p) : undefined}
          />
        ))}
      </div>

      {pendingDelete && (
        <DeleteProjectModal
          project={pendingDelete}
          busy={deleting}
          error={deleteError}
          onCancel={() => {
            if (deleting) return;
            setPendingDelete(null);
            setDeleteError(null);
          }}
          onConfirm={handleConfirmDelete}
        />
      )}
    </>
  );
}

function DeleteProjectModal({
  project, busy, error, onCancel, onConfirm,
}: {
  project: Project;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [typed, setTyped] = useState('');
  const required = project.name;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="text-base font-semibold text-slate-900">Delete project</h3>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="space-y-3 px-5 py-4 text-sm text-slate-600">
          <p>
            You're about to permanently delete{' '}
            <strong className="text-slate-900">{project.name}</strong> and every
            task, photo, comment, and audit entry attached to it.
          </p>
          <p>
            Type the project name to confirm:
          </p>
          <input
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={required}
            disabled={busy}
            className="block w-full rounded-md border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
          />
          {error && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </p>
          )}
        </div>
        <footer className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/50 px-5 py-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="inline-flex h-9 items-center rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy || typed !== required}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-red-600 px-3 text-xs font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {busy ? 'Deleting…' : 'Delete project'}
          </button>
        </footer>
      </div>
    </div>
  );
}

interface ProjectCardProps {
  project: Project;
  pinned: boolean;
  isMostRecent: boolean;
  highlightOutstanding: boolean;
  onOpen: () => void;
  onTogglePin?: () => void;
  onDelete?: () => void;
}

function ProjectCard({
  project: p,
  pinned,
  isMostRecent,
  highlightOutstanding,
  onOpen,
  onTogglePin,
  onDelete,
}: ProjectCardProps) {
  const meta = STATUS_META[p.status];
  const remaining = daysToEnd(p.endDate);
  const overdue = remaining < 0 && p.status !== 'completed' && p.status !== 'archived';
  const soon = !overdue && remaining <= 30 && p.status !== 'completed';

  return (
    // `layout` enables FLIP so pinning/unpinning floats the card to its new
    // grid slot via a tween instead of snapping. Hover already lifts via the
    // -translate utility, so no whileHover here.
    <motion.article
      layout
      transition={{ type: 'spring', damping: 28, stiffness: 280 }}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      aria-label={`Open ${p.name}, ${meta.label}, ${p.percentComplete}% complete`}
      className={`group relative cursor-pointer overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-elev-1 transition-[border-color,box-shadow] hover:border-slate-400 hover:shadow-elev-2 focus-visible:border-slate-900 focus-visible:outline-none ${pinned ? 'ring-1 ring-emerald-200' : ''}`}
    >
      {/* Status accent strip across the top */}
      <div
        className="absolute inset-x-0 top-0 h-[1.5px] transition-all group-hover:h-[2.5px]"
        style={{ backgroundColor: meta.accent }}
        aria-hidden
      />

      {/* Pin + delete controls — top-right, revealed on hover (pin stays
          visible when active). Delete is owner-only, comes in via prop. */}
      <div className="absolute right-3 top-3 z-10 flex items-center gap-1">
        {onTogglePin && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onTogglePin(); }}
            aria-label={pinned ? 'Unpin project' : 'Pin project to top'}
            aria-pressed={pinned}
            title={pinned ? 'Unpin' : 'Pin to top'}
            className={`grid h-7 w-7 place-items-center rounded-full transition-opacity ${
              pinned
                ? 'bg-emerald-50 text-emerald-700'
                : 'text-slate-300 opacity-0 hover:bg-slate-100 hover:text-slate-700 group-hover:opacity-100 focus:opacity-100'
            }`}
          >
            <Pin
              className={`h-3.5 w-3.5 ${pinned ? 'fill-emerald-700' : ''}`}
              aria-hidden
            />
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            aria-label="Delete project"
            title="Delete project"
            className="grid h-7 w-7 place-items-center rounded-full text-slate-300 opacity-100 hover:bg-red-50 hover:text-red-600 focus:opacity-100 md:opacity-0 md:group-hover:opacity-100"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}
      </div>

      <div className="p-5">
        {/* Eyebrow row: status pill + optional last-opened chip */}
        <div className="flex flex-wrap items-center gap-2 text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 ${meta.pillClass}`}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: meta.dot }}
              aria-hidden
            />
            {meta.label}
          </span>
          {isMostRecent && (
            <span className="inline-flex items-center gap-1 text-emerald-700">
              <Clock className="h-3 w-3" aria-hidden /> Last opened
            </span>
          )}
        </div>

        {/* Title + client */}
        <h3
          className="display mt-3 text-xl font-medium leading-tight text-slate-900"
          style={{ textWrap: 'balance' }}
        >
          {p.name}
        </h3>
        <p className="mt-1 truncate text-sm text-slate-500">{p.client}</p>

        {/* Progress */}
        <div className="mt-5">
          <div className="flex items-baseline justify-between">
            <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">
              Progress
            </span>
            <span className="num text-sm font-medium text-slate-900">
              {p.percentComplete}%
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${p.percentComplete}%`,
                backgroundColor: meta.accent,
              }}
            />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
            <span className="num">{p.tasksComplete} done</span>
            <span className="text-slate-300">·</span>
            <span className="num">{p.tasksPending} in progress</span>
            <span className="text-slate-300">·</span>
            <span
              className={`num ${
                highlightOutstanding ? 'font-semibold text-amber-700' : ''
              }`}
            >
              {p.tasksOutstanding} to start
            </span>
          </div>
        </div>

        {/* Schedule */}
        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-[11px]">
          <span className="inline-flex items-center gap-1.5 text-slate-500">
            <Calendar className="h-3 w-3 text-slate-400" aria-hidden />
            <span className="num">{fmtDate(p.startDate)}</span>
            <span className="text-slate-300">→</span>
            <span className="num">{fmtDate(p.endDate)}</span>
          </span>
          {p.status !== 'completed' && p.status !== 'archived' && (
            <span
              className={`num font-medium ${
                overdue ? 'text-rose-700' : soon ? 'text-amber-700' : 'text-slate-500'
              }`}
            >
              {overdue
                ? `${Math.abs(remaining)}d overdue`
                : remaining === 0
                  ? 'Due today'
                  : `${remaining}d left`}
            </span>
          )}
        </div>

        {/* Hover affordance */}
        <ArrowUpRight
          className="absolute bottom-4 right-4 h-3.5 w-3.5 text-slate-300 opacity-0 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-emerald-600 group-hover:opacity-100"
          aria-hidden
        />
      </div>
    </motion.article>
  );
}

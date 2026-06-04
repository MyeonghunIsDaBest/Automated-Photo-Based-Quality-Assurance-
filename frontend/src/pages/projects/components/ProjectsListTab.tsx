import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowUpRight, Calendar, Clock, Pin, Trash2, X } from 'lucide-react';
import type { Project, ProjectStatus } from '../types';
import { useProjectsListStore } from '../store';
import { useFeatureStore } from '../../../store/features';
import { deleteProject as apiDeleteProject } from '../../../lib/api/projects';
import { supabaseConfigured } from '../../../lib/supabase';
import { FRAUNCES } from '../../gantt/components/ledger';
import { HEALTH_META, type ProjectHealthInfo } from '../lib/health';

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
  /** Per-project momentum/health, keyed by project id (see lib/health). */
  healthById?: Map<string, ProjectHealthInfo>;
}

const STATUS_META: Record<ProjectStatus, {
  label: string;
  fg: string;
  bg: string;
  dot: string;
  accent: string;
}> = {
  active:    { label: 'Active',    fg: '#246F47', bg: '#E5F2EA', dot: '#2F8F5C', accent: '#2F8F5C' },
  on_hold:   { label: 'On Hold',   fg: '#C8841E', bg: '#F9EFD9', dot: '#D69A2E', accent: '#C8841E' },
  completed: { label: 'Completed', fg: '#5B6B7B', bg: '#EEF1F4', dot: '#6B7A8F', accent: '#5B6B7B' },
  archived:  { label: 'Archived',  fg: '#6B6B6B', bg: '#F0EDE4', dot: '#A0A0A0', accent: '#A0A0A0' },
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
  healthById,
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
            health={healthById?.get(p.id)}
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#1A1A1A]/40 p-4 backdrop-blur-sm"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-[14px] bg-white shadow-[0_8px_28px_rgba(20,20,20,0.12)]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-[#EFEBE0] px-5 py-4">
          <h3 className="text-base font-semibold text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>Delete project</h3>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-[#A0A0A0] hover:bg-[#F0EDE4] hover:text-[#3A3A3A] disabled:opacity-40"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="space-y-3 px-5 py-4 text-sm text-[#3A3A3A]">
          <p>
            You're about to permanently delete{' '}
            <strong className="text-[#1A1A1A]">{project.name}</strong> and every
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
            className="block w-full rounded-md border border-[#E6E1D4] px-3 py-2 text-sm shadow-sm focus:border-[#C44545] focus:outline-none focus:ring-1 focus:ring-[#C44545]"
          />
          {error && (
            <p className="rounded-md border border-[#FBE5E5] bg-[#FBE5E5] px-3 py-2 text-xs text-[#C44545]">
              {error}
            </p>
          )}
        </div>
        <footer className="flex items-center justify-end gap-2 border-t border-[#EFEBE0] bg-[#FAF8F2] px-5 py-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="inline-flex h-9 items-center rounded-full border border-[#E6E1D4] bg-white px-3 text-xs font-medium text-[#3A3A3A] hover:bg-[#FAF8F2] disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy || typed !== required}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#C44545] px-3 text-xs font-medium text-white hover:bg-[#a33636] disabled:cursor-not-allowed disabled:opacity-50"
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
  health?: ProjectHealthInfo;
  onOpen: () => void;
  onTogglePin?: () => void;
  onDelete?: () => void;
}

function ProjectCard({
  project: p,
  pinned,
  isMostRecent,
  highlightOutstanding,
  health,
  onOpen,
  onTogglePin,
  onDelete,
}: ProjectCardProps) {
  // Active projects lead with momentum (on track / caution / delayed) — chip,
  // top accent, and progress bar all take its colour, so a stalled job reads as
  // red at a glance. Non-active projects keep the lifecycle status + colour.
  const isActive = p.status === 'active';
  const healthMeta = health ? HEALTH_META[health.health] : null;
  const meta = isActive && healthMeta ? healthMeta : STATUS_META[p.status];
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
      className={`group relative cursor-pointer overflow-hidden rounded-[14px] border border-[#E6E1D4] bg-white shadow-[0_1px_2px_rgba(20,20,20,0.04)] transition-[border-color,box-shadow] hover:border-[#D8D2C4] hover:shadow-[0_4px_12px_rgba(20,20,20,0.08)] focus-visible:border-[#1A1A1A] focus-visible:outline-none ${pinned ? 'ring-1 ring-[#A8D0B8]' : ''}`}
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
                ? 'bg-[#E5F2EA] text-[#246F47]'
                : 'text-[#D8D2C4] opacity-0 hover:bg-[#F0EDE4] hover:text-[#3A3A3A] group-hover:opacity-100 focus:opacity-100'
            }`}
          >
            <Pin
              className={`h-3.5 w-3.5 ${pinned ? 'fill-[#246F47]' : ''}`}
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
            className="grid h-7 w-7 place-items-center rounded-full text-[#D8D2C4] opacity-100 hover:bg-[#FBE5E5] hover:text-[#C44545] focus:opacity-100 md:opacity-0 md:group-hover:opacity-100"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}
      </div>

      <div className="p-5">
        {/* Eyebrow row: status pill + optional last-opened chip */}
        <div className="flex flex-wrap items-center gap-2 text-[10px] font-medium uppercase tracking-[0.18em] text-[#6B6B6B]">
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5"
            style={{ color: meta.fg, backgroundColor: meta.bg }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: meta.dot }}
              aria-hidden
            />
            {meta.label}
          </span>
          {isMostRecent && (
            <span className="inline-flex items-center gap-1 text-[#246F47]">
              <Clock className="h-3 w-3" aria-hidden /> Last opened
            </span>
          )}
          {isActive && health?.daysSinceUpdate != null && health.daysSinceUpdate > 0 && (
            <span
              className="inline-flex items-center gap-1"
              style={{ color: health.health === 'on_track' ? '#A0A0A0' : (healthMeta?.fg ?? '#6B6B6B') }}
              title="Days since the latest task update"
            >
              <Clock className="h-3 w-3" aria-hidden />
              {health.daysSinceUpdate}d quiet
            </span>
          )}
        </div>

        {/* Title + client */}
        <h3
          className="mt-3 text-xl font-medium leading-tight text-[#1A1A1A]"
          style={{ textWrap: 'balance', fontFamily: FRAUNCES }}
        >
          {p.name}
        </h3>
        <p className="mt-1 truncate text-sm text-[#6B6B6B]">{p.client}</p>

        {/* Progress */}
        <div className="mt-5">
          <div className="flex items-baseline justify-between">
            <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#6B6B6B]">
              Progress
            </span>
            <span className="text-sm font-medium text-[#1A1A1A]" style={{ fontFamily: FRAUNCES, fontVariantNumeric: 'tabular-nums' }}>
              {p.percentComplete}%
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#F0EDE4]">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${p.percentComplete}%`,
                backgroundColor: meta.accent,
              }}
            />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-[#6B6B6B]">
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{p.tasksComplete} done</span>
            <span className="text-[#D8D2C4]">·</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{p.tasksPending} in progress</span>
            <span className="text-[#D8D2C4]">·</span>
            <span
              style={{ fontVariantNumeric: 'tabular-nums' }}
              className={highlightOutstanding ? 'font-semibold text-[#C8841E]' : ''}
            >
              {p.tasksOutstanding} to start
            </span>
          </div>
        </div>

        {/* Schedule */}
        <div className="mt-4 flex items-center justify-between border-t border-[#EFEBE0] pt-3 text-[11px]">
          <span className="inline-flex items-center gap-1.5 text-[#6B6B6B]">
            <Calendar className="h-3 w-3 text-[#A0A0A0]" aria-hidden />
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtDate(p.startDate)}</span>
            <span className="text-[#D8D2C4]">→</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtDate(p.endDate)}</span>
          </span>
          {p.status !== 'completed' && p.status !== 'archived' && (
            <span
              className="font-medium"
              style={{
                fontVariantNumeric: 'tabular-nums',
                color: overdue ? '#C44545' : soon ? '#C8841E' : '#6B6B6B',
              }}
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
          className="absolute bottom-4 right-4 h-3.5 w-3.5 text-[#D8D2C4] opacity-0 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[#2F8F5C] group-hover:opacity-100"
          aria-hidden
        />
      </div>
    </motion.article>
  );
}

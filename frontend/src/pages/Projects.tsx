import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowUpRight, ChevronDown, Plus, Search, X } from 'lucide-react';
import { useAppStore } from '../store';
import { fadeUp, staggerContainer } from '../lib/motion/variants';
import { canCreateProject, canDeleteProject } from '../lib/permissions';
import { useProjectsListStore } from './projects/store';
import { ProjectsListTab } from './projects/components/ProjectsListTab';
import { NewProjectModal } from './projects/components/NewProjectModal';
import { ErrorBoundary } from '../components/ui/ErrorBoundary';
import type { Project, ProjectStatus } from './projects/types';

// The Projects page is the directory + the toolbar that drives it. Cards
// themselves live in ProjectsListTab, which is now a dumb renderer.
//
// State that used to live inside ProjectsListTab (status filter, search,
// sort) is hoisted here so we can:
//  - drive the status filter from the stat tiles at the top
//  - add a named sort dropdown alongside the column-header pattern
//  - add pin-to-top + recently-opened, both persisted to localStorage

type StatusFilter = 'all' | ProjectStatus;
type SortMode =
  | 'recent'
  | 'progress'
  | 'progress_low'
  | 'end_date'
  | 'name'
  | 'tasks_outstanding';

const SORT_OPTIONS: { id: SortMode; label: string }[] = [
  { id: 'recent',            label: 'Recently opened' },
  { id: 'progress',          label: 'Progress · most done first' },
  { id: 'progress_low',      label: 'Progress · least done first' },
  { id: 'end_date',          label: 'Due date · soonest' },
  { id: 'name',              label: 'Name A → Z' },
  { id: 'tasks_outstanding', label: 'Outstanding tasks · most' },
];

const STATUS_LABEL: Record<ProjectStatus, string> = {
  active:    'Active',
  on_hold:   'On Hold',
  completed: 'Completed',
  archived:  'Archived',
};

const PINNED_KEY = 'siteproof:projects:pinned:v1';
const RECENT_KEY = 'siteproof:projects:recent:v1';

function readSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}
function writeSet(key: string, s: Set<string>) {
  try { localStorage.setItem(key, JSON.stringify([...s])); } catch { /* quota */ }
}
function readArr(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
function writeArr(key: string, a: string[]) {
  try { localStorage.setItem(key, JSON.stringify(a)); } catch { /* quota */ }
}

export default function Projects() {
  const { tasks, currentProfile } = useAppStore();
  const projects = useProjectsListStore((s) => s.projects);
  const setActiveProject = useProjectsListStore((s) => s.setActiveProject);
  const navigate = useNavigate();
  // Owner-tier gate — create / delete sit on the same tier as rescue, force-
  // progress, and ownership grants. Non-owners see read-only chrome.
  const canCreate = canCreateProject(currentProfile);
  const canDelete = canDeleteProject(currentProfile);

  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(() => readSet(PINNED_KEY));
  const [recentlyOpened, setRecentlyOpened] = useState<string[]>(() => readArr(RECENT_KEY));

  const searchRef = useRef<HTMLInputElement>(null);

  // `/` focuses inbox-style search; Esc blurs. Doesn't fire while another
  // input is already focused so users can type "/" inside the search field
  // without triggering the shortcut.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const active = document.activeElement as HTMLElement | null;
      const inField =
        !!active && ['INPUT', 'TEXTAREA'].includes(active.tagName);
      if (e.key === '/' && !inField) {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === 'Escape' && active === searchRef.current) {
        searchRef.current?.blur();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Persist pinned + recent so they survive reloads.
  useEffect(() => { writeSet(PINNED_KEY, pinnedIds); }, [pinnedIds]);
  useEffect(() => { writeArr(RECENT_KEY, recentlyOpened); }, [recentlyOpened]);

  // Re-derive each project's task counts and progress from the live tasks
  // store. The static fields on the Project record become stale the moment
  // anyone creates or edits a task, so always trust the tasks store.
  const projectsWithProgress = useMemo<Project[]>(() => {
    return projects.map((p) => {
      const owned = tasks.filter((t) => t.projectId === p.id);
      if (owned.length === 0) return p;
      const tasksComplete = owned.filter((t) => t.status === 'complete').length;
      const tasksPending = owned.filter((t) => t.status === 'in_progress').length;
      const tasksOutstanding = owned.length - tasksComplete - tasksPending;
      const percentComplete = Math.round(
        owned.reduce((sum, t) => sum + t.percentComplete, 0) / owned.length,
      );
      return { ...p, tasksComplete, tasksPending, tasksOutstanding, percentComplete };
    });
  }, [projects, tasks]);

  // Aggregate stats — computed over ALL projects (not the filtered set), so
  // clicking a stat tile reveals what's hidden, not what's already shown.
  const stats = useMemo(() => {
    const active    = projectsWithProgress.filter((p) => p.status === 'active').length;
    const onHold    = projectsWithProgress.filter((p) => p.status === 'on_hold').length;
    const completed = projectsWithProgress.filter((p) => p.status === 'completed').length;
    return { active, onHold, completed, totalTasks: tasks.length };
  }, [projectsWithProgress, tasks]);

  // Filter → search → sort → pinned-first. Pinned float regardless of sort.
  const visibleProjects = useMemo(() => {
    let list = projectsWithProgress;
    if (statusFilter !== 'all') list = list.filter((p) => p.status === statusFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.client.toLowerCase().includes(q),
      );
    }
    const recentIndex = (id: string) => {
      const i = recentlyOpened.indexOf(id);
      return i === -1 ? Number.MAX_SAFE_INTEGER : i;
    };
    const sorted = [...list].sort((a, b) => {
      switch (sortMode) {
        case 'recent':            return recentIndex(a.id) - recentIndex(b.id);
        case 'progress':          return b.percentComplete - a.percentComplete;
        case 'progress_low':      return a.percentComplete - b.percentComplete;
        case 'end_date':          return Date.parse(a.endDate) - Date.parse(b.endDate);
        case 'name':              return a.name.localeCompare(b.name);
        case 'tasks_outstanding': return b.tasksOutstanding - a.tasksOutstanding;
        default:                  return 0;
      }
    });
    // Stable partition: pinned first, otherwise sort order intact.
    return sorted.sort(
      (a, b) => (pinnedIds.has(a.id) ? 0 : 1) - (pinnedIds.has(b.id) ? 0 : 1),
    );
  }, [projectsWithProgress, statusFilter, search, sortMode, pinnedIds, recentlyOpened]);

  const mostRecentId = recentlyOpened[0] ?? null;

  const togglePin = (id: string) => {
    setPinnedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleOpenProject = (id: string) => {
    setRecentlyOpened((prev) => [id, ...prev.filter((x) => x !== id)].slice(0, 8));
    setActiveProject(id);
    navigate('/gantt');
  };

  const toggleStatusFilter = (status: ProjectStatus) =>
    setStatusFilter((prev) => (prev === status ? 'all' : status));

  const clearFilters = () => { setStatusFilter('all'); setSearch(''); };
  const filtersActive = statusFilter !== 'all' || search.trim() !== '';

  return (
    <motion.div
      className="editorial-root min-h-full bg-[#FAFAF7]"
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
    >
      {/* ─── Editorial Header ─── */}
      <motion.header variants={fadeUp} className="relative overflow-hidden border-b border-slate-200/70 bg-white">
        <div className="grid-bg absolute inset-0 opacity-50" />
        <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-emerald-100/40 blur-3xl" />

        <div className="relative px-4 pt-8 pb-6 sm:px-8 sm:pt-10">
          <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:gap-6">
            <div className="min-w-0">
              <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
                <span className="inline-block h-px w-6 bg-slate-400" />
                Workspace · Projects
              </div>
              <h1
                className="display text-2xl font-medium leading-tight text-slate-900 sm:text-4xl md:text-5xl"
                style={{ textWrap: 'balance' }}
              >
                The <em className="font-normal italic text-emerald-700">portfolio</em>.
              </h1>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-slate-500 sm:text-[15px]">
                Every site, every milestone, every dependency — tracked from groundbreaking
                through handover, in one place.
              </p>
            </div>

            {canCreate ? (
              <div className="flex flex-wrap items-center gap-2 self-start">
                <button
                  type="button"
                  onClick={() => setNewProjectOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-emerald-700"
                >
                  <Plus className="h-3.5 w-3.5" />
                  New project
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 self-start rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.15em] text-slate-500">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-slate-400" />
                Owner-only access
              </div>
            )}
          </div>

          {/* Stat strip — tiles are interactive: click filters by status. */}
          <div className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 md:grid-cols-4">
            <StatTile
              label="Active"
              value={stats.active}
              caption={`${projects.length} total`}
              accent="#0F766E"
              active={statusFilter === 'active'}
              onClick={() => toggleStatusFilter('active')}
            />
            <StatTile
              label="On Hold"
              value={stats.onHold}
              caption="Paused or pending input"
              accent="#B45309"
              active={statusFilter === 'on_hold'}
              onClick={() => toggleStatusFilter('on_hold')}
            />
            <StatTile
              label="Completed"
              value={stats.completed}
              caption="Closed and archived"
              accent="#1E40AF"
              active={statusFilter === 'completed'}
              onClick={() => toggleStatusFilter('completed')}
            />
            <StatTile
              label="Tasks tracked"
              value={stats.totalTasks}
              caption="Across every project"
              accent="#0F172A"
            />
          </div>
        </div>
      </motion.header>

      {/* ─── Directory toolbar + grid ─── */}
      <motion.div variants={fadeUp} className="space-y-5 px-4 py-6 sm:px-8 sm:py-8">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[240px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or client…"
              className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-12 text-sm transition-colors focus:border-slate-400 focus:outline-none"
            />
            {search ? (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-900"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : (
              <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] tabular-nums text-slate-400">
                /
              </kbd>
            )}
          </div>

          <SortMenu sortMode={sortMode} onChange={setSortMode} />

          <p className="ml-auto text-[11px] text-slate-400">
            <span className="tabular-nums text-slate-700">{visibleProjects.length}</span>
            {' '}of{' '}
            <span className="tabular-nums">{projectsWithProgress.length}</span> shown
          </p>
        </div>

        {/* Active-filter chips with one-click clear. */}
        {filtersActive && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-500">Filtering by:</span>
            {statusFilter !== 'all' && (
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-slate-700 transition-colors hover:border-slate-400"
              >
                Status · {STATUS_LABEL[statusFilter]}
                <X className="h-3 w-3 text-slate-400" />
              </button>
            )}
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-slate-700 transition-colors hover:border-slate-400"
              >
                Search · &ldquo;{search}&rdquo;
                <X className="h-3 w-3 text-slate-400" />
              </button>
            )}
            <button
              type="button"
              onClick={clearFilters}
              className="text-[11px] font-medium text-emerald-700 hover:underline"
            >
              Clear all
            </button>
          </div>
        )}

        {/* List or empty-state */}
        {visibleProjects.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-center">
            <p className="display text-xl text-slate-900">No projects match.</p>
            <p className="mt-1 text-sm text-slate-500">
              {projectsWithProgress.length === 0
                ? 'There are no projects yet — create one to get started.'
                : 'Try clearing the filters above.'}
            </p>
            {filtersActive && (
              <button
                type="button"
                onClick={clearFilters}
                className="mt-3 text-xs font-medium text-emerald-700 hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <ErrorBoundary label="Projects · list">
            <ProjectsListTab
              projects={visibleProjects}
              onOpen={handleOpenProject}
              pinnedIds={pinnedIds}
              onTogglePin={togglePin}
              mostRecentId={mostRecentId}
              sortMode={sortMode}
              canDelete={canDelete}
            />
          </ErrorBoundary>
        )}
      </motion.div>

      <NewProjectModal
        open={newProjectOpen}
        onClose={() => setNewProjectOpen(false)}
      />
    </motion.div>
  );
}

// ─── Pieces ────────────────────────────────────────────────────────────

function StatTile({
  label, value, caption, accent, active, onClick,
}: {
  label: string;
  value: number;
  caption: string;
  accent: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const inner = (
    <>
      <div
        className="absolute left-0 top-0 h-1 w-12 rounded-br-full"
        style={{ backgroundColor: accent }}
      />
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.15em] text-slate-500">
          {label}
        </p>
        {active && (
          <span className="text-[9px] font-medium uppercase tracking-[0.18em] text-emerald-700">
            Filtering
          </span>
        )}
      </div>
      <p className="num mt-2 text-4xl font-medium text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-400">{caption}</p>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={!!active}
        className={`group relative overflow-hidden bg-white p-5 text-left transition-colors hover:bg-slate-50 ${
          active ? 'bg-slate-50' : ''
        }`}
      >
        {inner}
        <ArrowUpRight className="absolute right-3 top-3 h-3.5 w-3.5 text-slate-300 opacity-0 transition-opacity group-hover:opacity-100" />
      </button>
    );
  }

  return (
    <div className="relative overflow-hidden bg-white p-5">
      {inner}
    </div>
  );
}

function SortMenu({
  sortMode, onChange,
}: { sortMode: SortMode; onChange: (m: SortMode) => void }) {
  const [open, setOpen] = useState(false);
  const active = SORT_OPTIONS.find((s) => s.id === sortMode);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex h-10 items-center gap-1.5 rounded-lg border px-3 text-sm transition-colors ${
          open
            ? 'border-slate-900 bg-slate-900 text-white'
            : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400'
        }`}
      >
        <span className="text-[11px] uppercase tracking-[0.15em]">Sort</span>
        <span className="font-medium">{active?.label}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-20"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-full z-30 mt-1 w-64 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
            <div className="border-b border-slate-100 px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">
              Sort projects by
            </div>
            {SORT_OPTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => { onChange(s.id); setOpen(false); }}
                className={`flex w-full items-center justify-between px-3 py-2 text-left text-[13px] transition-colors hover:bg-slate-50 ${
                  s.id === sortMode ? 'bg-slate-50 font-medium text-slate-900' : 'text-slate-700'
                }`}
              >
                {s.label}
                {s.id === sortMode && (
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

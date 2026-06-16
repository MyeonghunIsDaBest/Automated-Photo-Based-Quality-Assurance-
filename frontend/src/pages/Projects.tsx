import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Activity, ChevronDown, Download, Plus, Search, X } from 'lucide-react';
import { useAppStore } from '../store';
import { fadeUp, staggerContainer } from '../lib/motion/variants';
import { canCreateProject, canDeleteProject } from '../lib/permissions';
import { useProjectsListStore } from './projects/store';
import { ProjectsListTab } from './projects/components/ProjectsListTab';
import { NewProjectModal } from './projects/components/NewProjectModal';
import { ErrorBoundary } from '../components/ui/ErrorBoundary';
import { FRAUNCES } from './gantt/components/ledger';
import type { Project } from './projects/types';
import {
  projectHealthInfo,
  HEALTH_META,
  type ProjectHealth,
  type ProjectHealthInfo,
} from './projects/lib/health';

// The Projects page is the directory + the toolbar that drives it. Cards
// themselves live in ProjectsListTab, which is now a dumb renderer.
//
// State that used to live inside ProjectsListTab (status filter, search,
// sort) is hoisted here so we can:
//  - drive the status filter from the stat tiles at the top
//  - add a named sort dropdown alongside the column-header pattern
//  - add pin-to-top + recently-opened, both persisted to localStorage

type HealthFilter = 'all' | ProjectHealth;
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

const PINNED_KEY  = 'siteproof:projects:pinned:v1';
const RECENT_KEY  = 'siteproof:projects:recent:v1';   // legacy: string[]
const RECENT_KEY2 = 'siteproof:projects:recent:v2';   // current: {id,ts}[]

/** Shape stored in v2 localStorage. */
export interface RecentEntry { id: string; ts: number; }

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

/** Read v2 recent list, with v1 migration fallback (no timestamps for old entries). */
function readRecent(): RecentEntry[] {
  try {
    const raw2 = localStorage.getItem(RECENT_KEY2);
    if (raw2) {
      const parsed = JSON.parse(raw2);
      if (Array.isArray(parsed)) return parsed as RecentEntry[];
    }
    // Migrate from v1: convert legacy string[] to entries without timestamps.
    const raw1 = localStorage.getItem(RECENT_KEY);
    if (raw1) {
      const ids = JSON.parse(raw1);
      if (Array.isArray(ids)) return (ids as string[]).map((id) => ({ id, ts: 0 }));
    }
  } catch { /* ignore */ }
  return [];
}
function writeRecent(entries: RecentEntry[]) {
  try { localStorage.setItem(RECENT_KEY2, JSON.stringify(entries)); } catch { /* quota */ }
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
  const [healthFilter, setHealthFilter] = useState<HealthFilter>('all');
  const [search, setSearch] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(() => readSet(PINNED_KEY));
  const [recentlyOpened, setRecentlyOpened] = useState<RecentEntry[]>(() => readRecent());

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
  useEffect(() => { writeRecent(recentlyOpened); }, [recentlyOpened]);

  // Re-derive each project's task counts and progress from the live tasks
  // store. The static fields on the Project record become stale the moment
  // anyone creates or edits a task, so always trust the tasks store.
  const projectsWithProgress = useMemo<Project[]>(() => {
    return projects.map((p) => {
      const owned = tasks.filter((t) => t.projectId === p.id);
      if (owned.length === 0) return { ...p, tasksBlocked: p.tasksBlocked ?? 0 };
      const tasksComplete = owned.filter((t) => t.status === 'complete').length;
      const tasksPending = owned.filter((t) => t.status === 'in_progress').length;
      const tasksBlocked = owned.filter((t) => t.status === 'blocked').length;
      const tasksOutstanding = owned.length - tasksComplete - tasksPending - tasksBlocked;
      const percentComplete = Math.round(
        owned.reduce((sum, t) => sum + t.percentComplete, 0) / owned.length,
      );
      return { ...p, tasksComplete, tasksPending, tasksBlocked, tasksOutstanding, percentComplete };
    });
  }, [projects, tasks]);

  // Per-project health (momentum) — derived from the most recent task update.
  // active + updated this week = on track · 4–6 days quiet = caution · 7d+ with
  // no progress = delayed · on_hold = paused · completed/archived = done.
  const healthById = useMemo(() => {
    const m = new Map<string, ProjectHealthInfo>();
    for (const p of projectsWithProgress) {
      const lastMs = tasks.reduce<number | null>((max, t) => {
        if (t.projectId !== p.id) return max;
        const ms = Date.parse(t.lastUpdated);
        if (Number.isNaN(ms)) return max;
        return max == null ? ms : Math.max(max, ms);
      }, null);
      m.set(p.id, projectHealthInfo(p.status, lastMs));
    }
    return m;
  }, [projectsWithProgress, tasks]);

  // Aggregate stats — computed over ALL projects (not the filtered set), so
  // clicking a stat tile reveals what's hidden, not what's already shown.
  const stats = useMemo(() => {
    let onTrack = 0, caution = 0, delayed = 0, paused = 0, done = 0;
    let runwaySum = 0, runwayCount = 0;
    for (const p of projectsWithProgress) {
      switch (healthById.get(p.id)?.health) {
        case 'on_track': onTrack += 1; break;
        case 'caution':  caution += 1; break;
        case 'delayed':  delayed += 1; break;
        case 'paused':   paused  += 1; break;
        case 'done':     done    += 1; break;
      }
      // Runway = days left, averaged across active sites only.
      if (p.status === 'active') {
        const days = Math.round((Date.parse(p.endDate) - Date.now()) / 86_400_000);
        if (Number.isFinite(days)) { runwaySum += days; runwayCount += 1; }
      }
    }
    const activeSites = onTrack + caution + delayed;
    const openTasks = tasks.filter((t) => t.status !== 'complete').length;
    const avgRunway = runwayCount ? Math.round(runwaySum / runwayCount) : 0;
    const healthyPct = activeSites ? Math.round((onTrack / activeSites) * 100) : 100;
    return {
      onTrack, caution, delayed, paused, done,
      total: projectsWithProgress.length, totalTasks: tasks.length,
      activeSites, openTasks, avgRunway, healthyPct,
    };
  }, [projectsWithProgress, healthById, tasks]);

  // 4-week runway trend — honestly RECONSTRUCTED from real project end dates:
  // runway on day t = avg(endDate − t) across currently-active projects whose
  // window still covered t. No fake data: with a stable portfolio this is the
  // true "shrinks one day per day" line; kinks appear where windows end.
  const runwaySpark = useMemo(() => {
    const active = projectsWithProgress.filter((p) => p.status === 'active');
    if (active.length === 0) return undefined;
    const ends = active
      .map((p) => Date.parse(p.endDate))
      .filter((ms) => Number.isFinite(ms));
    if (ends.length === 0) return undefined;
    const now = new Date();
    const todayMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const DAY = 86_400_000;
    const points: number[] = [];
    for (let back = 27; back >= 0; back--) {
      const t = todayMs - back * DAY;
      const remaining = ends.filter((e) => e >= t).map((e) => Math.round((e - t) / DAY));
      if (remaining.length === 0) continue;
      points.push(Math.round(remaining.reduce((a, b) => a + b, 0) / remaining.length));
    }
    return points.length >= 2 ? points : undefined;
  }, [projectsWithProgress]);

  // Filter → search → sort → pinned-first. Pinned float regardless of sort.
  const visibleProjects = useMemo(() => {
    let list = projectsWithProgress;
    if (healthFilter !== 'all') list = list.filter((p) => healthById.get(p.id)?.health === healthFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.client.toLowerCase().includes(q),
      );
    }
    const recentIndex = (id: string) => {
      const i = recentlyOpened.findIndex((e) => e.id === id);
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
  }, [projectsWithProgress, healthFilter, healthById, search, sortMode, pinnedIds, recentlyOpened]);

  // Map project id → RecentEntry so the card can render "last opened N days ago".
  const recentById = useMemo(() => {
    const m = new Map<string, RecentEntry>();
    for (const e of recentlyOpened) m.set(e.id, e);
    return m;
  }, [recentlyOpened]);

  const togglePin = (id: string) => {
    setPinnedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleOpenProject = (id: string) => {
    setRecentlyOpened((prev) => [{ id, ts: Date.now() }, ...prev.filter((e) => e.id !== id)].slice(0, 8));
    setActiveProject(id);
    navigate('/gantt');
  };

  const toggleHealthFilter = (h: ProjectHealth) =>
    setHealthFilter((prev) => (prev === h ? 'all' : h));

  const clearFilters = () => { setHealthFilter('all'); setSearch(''); };
  const filtersActive = healthFilter !== 'all' || search.trim() !== '';

  // Export the whole portfolio (not just the filtered view) to CSV — name,
  // client, lifecycle, health, progress, task split, and dates. Pure client-
  // side; no backend round-trip needed.
  const handleExport = () => {
    const header = ['Project', 'Client', 'Status', 'Health', 'Progress %', 'Done', 'In progress', 'To start', 'Start', 'End'];
    const lines = projectsWithProgress.map((p) => {
      const hKey = healthById.get(p.id)?.health;
      return [
        p.name, p.client, p.status, hKey ? HEALTH_META[hKey].label : '',
        String(p.percentComplete), String(p.tasksComplete), String(p.tasksPending),
        String(p.tasksOutstanding), p.startDate, p.endDate,
      ];
    });
    const csv = [header, ...lines]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `projects-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <motion.div
      className="editorial-root min-h-full bg-[#FAF8F2]"
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
    >
      {/* ─── Editorial Header ─── */}
      <motion.header variants={fadeUp} className="relative overflow-hidden border-b border-[#E6E1D4] bg-white">
        <div className="grid-bg absolute inset-0 opacity-50" />
        <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-[#E5F2EA]/40 blur-3xl" />

        <div className="relative mx-auto w-full max-w-[1400px] px-4 pt-8 pb-6 sm:px-8 sm:pt-10">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            {/* Identity + portfolio stats */}
            <div className="min-w-0">
              <div className="mb-3 flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-[#6B6B6B]">
                <span className="inline-block h-px w-6 bg-[#A0A0A0]" />
                Portfolio
                <span className="text-[#D8D2C4]">·</span>
                {/* Small-caps green status per mock — inherits the parent's
                    uppercase + wide tracking instead of opting out of it. */}
                <span className="inline-flex items-center gap-1.5 text-[#246F47]">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#A8D0B8] opacity-75" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#2F8F5C]" />
                  </span>
                  Live · as of today
                </span>
              </div>

              <h1
                className="text-3xl font-medium leading-[0.95] tracking-tight text-[#1A1A1A] sm:text-5xl"
                style={{ fontFamily: FRAUNCES, letterSpacing: '-0.02em' }}
              >
                Projects
              </h1>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-[#6B6B6B] sm:text-[15px]">
                Every site you're running, with live health and progress at a glance — so
                nothing quietly slips.
              </p>

              {/* Portfolio stats */}
              <div className="mt-6 flex flex-wrap items-center gap-x-7 gap-y-3">
                <HeroStat value={`${stats.activeSites}`} label="Active sites" />
                <span className="hidden h-8 w-px bg-[#E6E1D4] sm:block" aria-hidden />
                <HeroStat value={`${stats.openTasks}`} label="Open tasks" />
                <span className="hidden h-8 w-px bg-[#E6E1D4] sm:block" aria-hidden />
                <HeroStat
                  value={`${stats.avgRunway}d`}
                  label={runwaySpark ? 'Avg. runway · 4-wk trend' : 'Avg. runway'}
                  spark={runwaySpark}
                />
              </div>
            </div>

            {/* Actions + live health */}
            <div className="flex shrink-0 flex-col gap-4 lg:w-[360px] lg:items-end">
              <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                <button
                  type="button"
                  onClick={handleExport}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[#E6E1D4] bg-white px-4 py-2 text-xs font-medium text-[#3A3A3A] transition-colors hover:border-[#1A1A1A] hover:bg-[#1A1A1A] hover:text-white"
                >
                  <Download className="h-3.5 w-3.5" />
                  Export
                </button>
                {canCreate ? (
                  <button
                    type="button"
                    onClick={() => setNewProjectOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-full bg-[#2F8F5C] px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-[#246F47]"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    New project
                  </button>
                ) : (
                  <span className="inline-flex items-center gap-2 rounded-full border border-[#E6E1D4] bg-white px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.15em] text-[#6B6B6B]">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#A0A0A0]" />
                    Owner-only
                  </span>
                )}
              </div>

              <PortfolioHealthCard
                onTrack={stats.onTrack}
                caution={stats.caution}
                delayed={stats.delayed}
                healthyPct={stats.healthyPct}
                activeFilter={healthFilter}
                onFilter={toggleHealthFilter}
              />
            </div>
          </div>
        </div>
      </motion.header>

      {/* ─── Directory toolbar + grid ─── */}
      <motion.div variants={fadeUp} className="mx-auto w-full max-w-[1400px] space-y-5 px-4 py-6 sm:px-8 sm:py-8">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 sm:min-w-60">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A0A0A0]" />
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or client…"
              className="h-10 w-full rounded-lg border border-[#E6E1D4] bg-white pl-10 pr-12 text-base transition-colors focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C] sm:text-sm"
            />
            {search ? (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-[#A0A0A0] hover:bg-[#F0EDE4] hover:text-[#1A1A1A]"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : (
              <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border border-[#E6E1D4] bg-[#FAF8F2] px-1.5 py-0.5 text-[10px] tabular-nums text-[#A0A0A0]">
                /
              </kbd>
            )}
          </div>

          <SortMenu sortMode={sortMode} onChange={setSortMode} />

          <p className="ml-auto text-[11px] text-[#A0A0A0]">
            <span className="tabular-nums text-[#3A3A3A]">{visibleProjects.length}</span>
            {' '}of{' '}
            <span className="tabular-nums">{projectsWithProgress.length}</span> shown
          </p>
        </div>

        {/* Active-filter chips with one-click clear. */}
        {filtersActive && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-[#6B6B6B]">Filtering by:</span>
            {healthFilter !== 'all' && (
              <button
                type="button"
                onClick={() => setHealthFilter('all')}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#E6E1D4] bg-white px-2.5 py-0.5 text-[#3A3A3A] transition-colors hover:border-[#D8D2C4]"
              >
                Health · {HEALTH_META[healthFilter].label}
                <X className="h-3 w-3 text-[#A0A0A0]" />
              </button>
            )}
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#E6E1D4] bg-white px-2.5 py-0.5 text-[#3A3A3A] transition-colors hover:border-[#D8D2C4]"
              >
                Search · &ldquo;{search}&rdquo;
                <X className="h-3 w-3 text-[#A0A0A0]" />
              </button>
            )}
            <button
              type="button"
              onClick={clearFilters}
              className="text-[11px] font-medium text-[#246F47] hover:underline"
            >
              Clear all
            </button>
          </div>
        )}

        {/* List or empty-state */}
        {visibleProjects.length === 0 ? (
          <div className="rounded-[14px] border border-dashed border-[#E6E1D4] bg-white py-16 text-center shadow-[0_1px_2px_rgba(20,20,20,0.04)]">
            <p className="text-xl text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>No projects match.</p>
            <p className="mt-1 text-sm text-[#6B6B6B]">
              {projectsWithProgress.length === 0
                ? 'There are no projects yet — create one to get started.'
                : 'Try clearing the filters above.'}
            </p>
            {filtersActive && (
              <button
                type="button"
                onClick={clearFilters}
                className="mt-3 text-xs font-medium text-[#246F47] hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <ErrorBoundary label="Projects · list">
            <ProjectsListTab
              projects={visibleProjects}
              healthById={healthById}
              onOpen={handleOpenProject}
              pinnedIds={pinnedIds}
              onTogglePin={togglePin}
              recentById={recentById}
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

/** Tiny inline trend line (mock: declining runway with an end dot). Pure SVG,
 *  no chart lib. Scales to the points' own min/max; flat series renders a
 *  midline. */
function Sparkline({ points }: { points: number[] }) {
  const W = 64;
  const H = 18;
  const PAD = 2;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min;
  const x = (i: number) => PAD + (i / (points.length - 1)) * (W - PAD * 2);
  const y = (v: number) =>
    span === 0 ? H / 2 : PAD + (1 - (v - min) / span) * (H - PAD * 2);
  const path = points.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  const lastX = x(points.length - 1);
  const lastY = y(points[points.length - 1]);
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden className="mb-0.5 shrink-0">
      <polyline
        points={path}
        fill="none"
        stroke="#2F8F5C"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={lastX} cy={lastY} r="2" fill="#2F8F5C" />
    </svg>
  );
}

function HeroStat({ value, label, spark }: { value: string; label: string; spark?: number[] }) {
  return (
    <div>
      <div className="flex items-end gap-2">
        <p
          className="text-3xl font-medium leading-none text-[#1A1A1A]"
          style={{ fontFamily: FRAUNCES, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.03em' }}
        >
          {value}
        </p>
        {spark && spark.length >= 2 && <Sparkline points={spark} />}
      </div>
      <p className="mt-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-[#A0A0A0]">
        {label}
      </p>
    </div>
  );
}

// Live portfolio-health summary — a segmented bar (on track / caution / delayed
// across active sites) + a legend that doubles as the health filter.
function PortfolioHealthCard({
  onTrack, caution, delayed, healthyPct, activeFilter, onFilter,
}: {
  onTrack: number;
  caution: number;
  delayed: number;
  healthyPct: number;
  activeFilter: HealthFilter;
  onFilter: (h: ProjectHealth) => void;
}) {
  const active = onTrack + caution + delayed;
  const pct = (n: number) => (active ? (n / active) * 100 : 0);
  const legend: { key: ProjectHealth; label: string; count: number; color: string }[] = [
    { key: 'on_track', label: 'On track', count: onTrack, color: HEALTH_META.on_track.dot },
    { key: 'caution',  label: 'Caution',  count: caution, color: HEALTH_META.caution.dot },
    { key: 'delayed',  label: 'Delayed',  count: delayed, color: HEALTH_META.delayed.dot },
  ];

  return (
    <div className="w-full rounded-[14px] border border-[#E6E1D4] bg-white p-4 shadow-[0_1px_2px_rgba(20,20,20,0.04)]">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-[#6B6B6B]">
          <Activity className="h-3.5 w-3.5 text-[#2F8F5C]" aria-hidden />
          Portfolio health
        </span>
        <span className="text-sm text-[#A0A0A0]">
          <span className="font-medium text-[#1A1A1A]" style={{ fontFamily: FRAUNCES, fontVariantNumeric: 'tabular-nums' }}>
            {healthyPct}%
          </span>{' '}
          healthy
        </span>
      </div>

      <div className="mt-3 flex h-2 w-full overflow-hidden rounded-full bg-[#F0EDE4]">
        {onTrack > 0 && <div className="h-full" style={{ width: `${pct(onTrack)}%`, backgroundColor: HEALTH_META.on_track.accent }} />}
        {caution > 0 && <div className="h-full" style={{ width: `${pct(caution)}%`, backgroundColor: HEALTH_META.caution.accent }} />}
        {delayed > 0 && <div className="h-full" style={{ width: `${pct(delayed)}%`, backgroundColor: HEALTH_META.delayed.accent }} />}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {legend.map((l) => {
          const on = activeFilter === l.key;
          return (
            <button
              key={l.key}
              type="button"
              onClick={() => onFilter(l.key)}
              aria-pressed={on}
              title={`Filter by ${l.label.toLowerCase()}`}
              className={`inline-flex items-center gap-1.5 text-xs transition-colors ${
                on ? 'font-semibold text-[#1A1A1A]' : 'text-[#6B6B6B] hover:text-[#1A1A1A]'
              }`}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: l.color }} aria-hidden />
              <span className="tabular-nums font-medium text-[#1A1A1A]">{l.count}</span>
              {l.label}
            </button>
          );
        })}
      </div>
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
            ? 'border-[#1A1A1A] bg-[#1A1A1A] text-white'
            : 'border-[#E6E1D4] bg-white text-[#3A3A3A] hover:border-[#D8D2C4]'
        }`}
      >
        <span className="text-[11px] uppercase tracking-[0.15em]">Sort</span>
        <span className="hidden max-w-[140px] truncate font-medium sm:inline">{active?.label}</span>
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
          <div className="absolute right-0 top-full z-30 mt-1 w-64 overflow-hidden rounded-[14px] border border-[#E6E1D4] bg-white shadow-[0_8px_28px_rgba(20,20,20,0.12)]">
            <div className="border-b border-[#EFEBE0] px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-[#6B6B6B]">
              Sort projects by
            </div>
            {SORT_OPTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => { onChange(s.id); setOpen(false); }}
                className={`flex w-full items-center justify-between px-3 py-2 text-left text-[13px] transition-colors hover:bg-[#FAF8F2] ${
                  s.id === sortMode ? 'bg-[#FAF8F2] font-medium text-[#1A1A1A]' : 'text-[#3A3A3A]'
                }`}
              >
                {s.label}
                {s.id === sortMode && (
                  <span className="h-1.5 w-1.5 rounded-full bg-[#2F8F5C]" />
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

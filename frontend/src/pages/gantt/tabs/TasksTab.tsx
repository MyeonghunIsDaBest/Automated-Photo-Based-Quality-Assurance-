import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowDown, ArrowUp, ArrowUpDown, CalendarRange, CheckCheck, CheckSquare,
  Image as ImageIcon, KanbanSquare, ListChecks, Lock, Plus,
  Square, Tag, Trash2, User as UserIcon, X,
} from 'lucide-react';
import {
  differenceInDays, endOfWeek, format, parseISO, startOfWeek,
} from 'date-fns';
import type { Task, TaskStatus, Zone, User, Project } from '../../../types';
import { Card, CardContent } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import TaskDrawer from './TaskDrawer';
import { TabHeader } from '../components/TabHeader';
import { EmptyState } from '../components/EmptyState';
import MockAnalysisButton from '../../../components/mockAi/MockAnalysisButton';

interface TasksTabProps {
  project: Project;
  tasks: Task[];
  zones: Zone[];
  currentUser: User | null;
  canEdit: boolean;
  canDelete: boolean;
  onCreateTask: (newTask: Omit<Task, 'id' | 'photoCount' | 'lastUpdated' | 'updateSource'>) => Promise<void> | void;
  onSaveTask:   (task: Task) => Promise<void> | void;
  onDeleteTask: (taskId: string) => Promise<void> | void;
  /** Connectedness pass: when set, opens the matching task drawer on mount.
   *  Silent skip if the task isn't in the current `tasks` list (the URL is
   *  stale or pointing to a deleted entity). The Gantt page reads `?task=`
   *  via `useUrlHydration` and forwards it here. */
  initialOpenTaskId?: string | null;
  /** Called when the drawer is dismissed. The parent uses this to clear
   *  `initialOpenTaskId`, otherwise switching tabs and back re-opens the
   *  drawer on every TasksTab remount. */
  onDrawerClose?: () => void;
}

type ViewMode = 'board' | 'list' | 'mine';
type SortKey = 'name' | 'phase' | 'startDate' | 'endDate' | 'percentComplete' | 'status';
type SortDir = 'asc' | 'desc';

const STATUS_BADGE: Record<Task['status'], string> = {
  not_started: 'border-slate-200 bg-slate-50 text-slate-600',
  in_progress: 'border-blue-200 bg-blue-50 text-blue-700',
  complete:    'border-emerald-200 bg-emerald-50 text-emerald-700',
  delayed:     'border-red-200 bg-red-50 text-red-700',
  blocked:     'border-amber-200 bg-amber-50 text-amber-700',
};

const STATUS_DOT: Record<Task['status'], string> = {
  not_started: 'bg-slate-400',
  in_progress: 'bg-blue-500',
  complete:    'bg-emerald-500',
  delayed:     'bg-red-500',
  blocked:     'bg-amber-500',
};

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: 'not_started', label: 'Not Started' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'blocked',     label: 'Blocked' },
  { value: 'delayed',     label: 'Delayed' },
  { value: 'complete',    label: 'Complete' },
];

const FILTERS = [
  { id: 'mine',          label: 'Mine' },
  { id: 'open',          label: 'Open' },
  { id: 'blocked',       label: 'Blocked' },
  { id: 'overdue',       label: 'Overdue' },
  { id: 'due_this_week', label: 'Due this week' },
  { id: 'has_photos',    label: 'Has photos' },
  { id: 'no_assignee',   label: 'No assignee' },
] as const;
type FilterId = typeof FILTERS[number]['id'];

const VIEW_MODES: { id: ViewMode; label: string; icon: typeof KanbanSquare }[] = [
  { id: 'board', label: 'Board',   icon: KanbanSquare },
  { id: 'list',  label: 'List',    icon: ListChecks },
  { id: 'mine',  label: 'My Work', icon: UserIcon },
];

const BOARD_COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: 'not_started', label: 'Not Started' },
  { status: 'in_progress', label: 'In Progress' },
  { status: 'blocked',     label: 'Blocked' },
  { status: 'complete',    label: 'Complete' },
];

export function TasksTab({
  project, tasks, zones, currentUser, canEdit, canDelete,
  onCreateTask, onSaveTask, onDeleteTask, initialOpenTaskId, onDrawerClose,
}: TasksTabProps) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<ViewMode>('board');
  const [filters, setFilters] = useState<Set<FilterId>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>('startDate');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [drawerTask, setDrawerTask] = useState<Task | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'edit' | 'create'>('edit');

  // ── Bulk-select state ────────────────────────────────────────────────
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<null | 'shift' | 'status' | 'assignee' | 'delete'>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  // Filter then sort.
  const filtered = useMemo(() => {
    const today = new Date();
    const weekStart = startOfWeek(today, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(today, { weekStartsOn: 1 });

    return tasks.filter((t) => {
      if (filters.has('mine') && t.assigneeId !== currentUser?.id) return false;
      if (filters.has('open') && t.status === 'complete') return false;
      if (filters.has('blocked') && t.status !== 'blocked') return false;
      if (filters.has('overdue')) {
        if (parseISO(t.endDate) >= today || t.percentComplete >= 100) return false;
      }
      if (filters.has('due_this_week')) {
        const end = parseISO(t.endDate);
        if (end < weekStart || end > weekEnd) return false;
      }
      if (filters.has('has_photos') && t.photoCount === 0) return false;
      if (filters.has('no_assignee') && t.assigneeId) return false;
      return true;
    });
  }, [tasks, filters, currentUser?.id]);

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [filtered, sortKey, sortDir]);

  // The pool of tasks the bulk bar can act on — the union of currently
  // visible tasks. Filter changes don't drop selections (so a user can
  // switch filters mid-bulk), but bulk actions only apply to the selected
  // subset, not the visible subset.
  const selectedTasks = useMemo(
    () => tasks.filter((t) => selected.has(t.id)),
    [tasks, selected],
  );

  const toggleFilter = (id: FilterId) => {
    setFilters((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  const sortIcon = (key: SortKey) => {
    if (sortKey !== key) return <ArrowUpDown className="h-3 w-3 text-slate-300" />;
    return sortDir === 'asc'
      ? <ArrowUp className="h-3 w-3 text-slate-700" />
      : <ArrowDown className="h-3 w-3 text-slate-700" />;
  };

  // ── Selection helpers ────────────────────────────────────────────────
  const toggleSelected = (taskId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(taskId) ? next.delete(taskId) : next.add(taskId);
      return next;
    });
  };

  const selectAllVisible = () => {
    const ids = sorted.map((t) => t.id);
    const allSelected = ids.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) ids.forEach((id) => next.delete(id));
      else             ids.forEach((id) => next.add(id));
      return next;
    });
  };

  const selectAllInStatus = (status: TaskStatus) => {
    const ids = sorted.filter((t) => t.status === status).map((t) => t.id);
    if (ids.length === 0) return;
    const allSelected = ids.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) ids.forEach((id) => next.delete(id));
      else             ids.forEach((id) => next.add(id));
      return next;
    });
  };

  const clearSelection = () => {
    setSelected(new Set());
    setBulkAction(null);
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    clearSelection();
  };

  // ESC key clears selection / exits select mode.
  useEffect(() => {
    if (!selectMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') exitSelectMode();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectMode]);

  // ── Drawer handlers ──────────────────────────────────────────────────
  const openTask = (t: Task) => {
    if (selectMode) {
      toggleSelected(t.id);
      return;
    }
    setDrawerTask(t);
    setDrawerMode('edit');
    setDrawerOpen(true);
  };

  // Connectedness pass: open the deep-linked task drawer once on mount + when
  // the tasks list catches up. Guarded so it fires exactly once per
  // initialOpenTaskId so the drawer doesn't slam shut and re-open on every
  // task-store update. Stale / missing IDs are a silent skip per the URL
  // schema's "deleted entity" rule.
  const hydratedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!initialOpenTaskId) return;
    if (hydratedRef.current === initialOpenTaskId) return;
    const found = tasks.find((t) => t.id === initialOpenTaskId);
    if (!found) return;
    hydratedRef.current = initialOpenTaskId;
    openTask(found);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialOpenTaskId, tasks]);

  // Connectedness pass: deep-link from a task's photo-count badge to a
  // gallery filtered by that task. Defined here so BoardView (and any other
  // sub-view that surfaces photo_count) can call it without taking a
  // dependency on react-router.
  const viewPhotos = (taskId: string) => {
    navigate(`/gallery?project=${project.id}&task=${taskId}`);
  };

  const openCreate = () => {
    setDrawerTask(null);
    setDrawerMode('create');
    setDrawerOpen(true);
  };

  // Drag/drop status advance (Board mode).
  const handleDrop = async (taskId: string, newStatus: TaskStatus) => {
    if (selectMode) return; // disable DnD while bulk-selecting
    const t = tasks.find((x) => x.id === taskId);
    if (!t || t.status === newStatus) return;
    const nextPct =
      newStatus === 'complete'    ? 100 :
      newStatus === 'not_started' ? 0   :
                                    t.percentComplete;
    await onSaveTask({ ...t, status: newStatus, percentComplete: nextPct });
  };

  // ── Bulk action runners ──────────────────────────────────────────────
  const runBulkStatus = async (status: TaskStatus) => {
    setBulkBusy(true);
    try {
      // Fire updates in parallel; each routes through the shared mutation
      // path so realtime echoes work normally.
      await Promise.all(
        selectedTasks.map((t) =>
          onSaveTask({
            ...t,
            status,
            percentComplete:
              status === 'complete'    ? 100 :
              status === 'not_started' ? 0   :
                                         t.percentComplete,
          }),
        ),
      );
      clearSelection();
      setSelectMode(false);
    } finally {
      setBulkBusy(false);
    }
  };

  const runBulkShift = async (days: number) => {
    if (!Number.isFinite(days) || days === 0) {
      setBulkAction(null);
      return;
    }
    setBulkBusy(true);
    try {
      await Promise.all(
        selectedTasks.map((t) => {
          const start = new Date(parseISO(t.startDate).getTime() + days * 86_400_000);
          const end = new Date(parseISO(t.endDate).getTime() + days * 86_400_000);
          return onSaveTask({
            ...t,
            startDate: start.toISOString().slice(0, 10),
            endDate: end.toISOString().slice(0, 10),
          });
        }),
      );
      clearSelection();
      setSelectMode(false);
    } finally {
      setBulkBusy(false);
    }
  };

  const runBulkAssignee = async (assigneeId: string) => {
    setBulkBusy(true);
    try {
      await Promise.all(
        selectedTasks.map((t) =>
          onSaveTask({ ...t, assigneeId: assigneeId || undefined }),
        ),
      );
      clearSelection();
      setSelectMode(false);
    } finally {
      setBulkBusy(false);
    }
  };

  const runBulkDelete = async () => {
    setBulkBusy(true);
    try {
      // Delete sequentially so a failure mid-batch still removes the ones
      // before it. Parallel would be faster but harder to recover from.
      for (const t of selectedTasks) {
        // eslint-disable-next-line no-await-in-loop
        await onDeleteTask(t.id);
      }
      clearSelection();
      setSelectMode(false);
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <>
      <TabHeader
        eyebrow={`Workspace · Tasks · ${project.name}`}
        title="Every task at a glance."
        description="Plan in Board, audit in List, focus in My Work. Tap any card to open the drawer — or hit Select to operate on many at once."
        action={
          canEdit ? (
            <div className="flex flex-wrap items-center gap-2">
              <MockAnalysisButton projectId={project.id} variant="compact" viewHref="/gantt?tab=review" />
              <Button
                variant={selectMode ? 'default' : 'outline'}
                onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
                className={selectMode ? '' : 'whitespace-nowrap'}
              >
                <CheckCheck className="mr-2 h-4 w-4" />
                {selectMode ? `Selecting · ${selected.size}` : 'Select'}
              </Button>
              <Button onClick={openCreate}>
                <Plus className="mr-2 h-4 w-4" />
                New Task
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <MockAnalysisButton projectId={project.id} variant="compact" viewHref="/gantt?tab=review" />
              <Badge variant="secondary" className="gap-1.5 px-3 py-1.5">
                <Lock className="h-3.5 w-3.5" />
                Read-only
              </Badge>
            </div>
          )
        }
      />

      {/* View mode toggle + filter chips */}
      <Card className="mb-4">
        <CardContent className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="-mx-1 overflow-x-auto px-1">
            <div className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white p-1 shadow-sm">
              {VIEW_MODES.map((vm) => {
                const Icon = vm.icon;
                const isActive = mode === vm.id;
                return (
                  <button
                    key={vm.id}
                    type="button"
                    onClick={() => setMode(vm.id)}
                    className={`flex flex-shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                      isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {vm.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="-mx-1 overflow-x-auto px-1">
            <div className="inline-flex items-center gap-1.5">
              {FILTERS.map((f) => {
                const isOn = filters.has(f.id);
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => toggleFilter(f.id)}
                    className={`flex-shrink-0 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                      isOn
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {f.label}
                  </button>
                );
              })}
              {filters.size > 0 && (
                <button
                  type="button"
                  onClick={() => setFilters(new Set())}
                  className="flex-shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-xs text-slate-500 hover:text-slate-900"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Body */}
      {sorted.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              icon={CheckSquare}
              title={tasks.length === 0 ? `No tasks on ${project.name}.` : 'No tasks match these filters.'}
              description={
                tasks.length === 0
                  ? 'Create one to start tracking. Photos uploaded against a task move its bar forward.'
                  : 'Loosen the filters or clear them to see everything.'
              }
              action={
                canEdit && tasks.length === 0 ? (
                  <Button onClick={openCreate}>
                    <Plus className="mr-2 h-4 w-4" />
                    Create first task
                  </Button>
                ) : null
              }
            />
          </CardContent>
        </Card>
      ) : mode === 'board' ? (
        <BoardView
          tasks={sorted}
          zones={zones}
          onOpenTask={openTask}
          onDropTask={handleDrop}
          canEdit={canEdit}
          selectMode={selectMode}
          selected={selected}
          onSelectAllInStatus={selectAllInStatus}
          onViewPhotos={viewPhotos}
        />
      ) : mode === 'list' ? (
        <ListView
          tasks={sorted}
          zones={zones}
          onOpenTask={openTask}
          handleSort={handleSort}
          sortIcon={sortIcon}
          selectMode={selectMode}
          selected={selected}
          onSelectAllVisible={selectAllVisible}
        />
      ) : (
        <MyWorkView
          tasks={sorted}
          zones={zones}
          currentUser={currentUser}
          onOpenTask={openTask}
          openCreate={openCreate}
          canEdit={canEdit}
          selectMode={selectMode}
          selected={selected}
        />
      )}

      <TaskDrawer
        task={drawerMode === 'edit' ? drawerTask : null}
        isOpen={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          // Clear hydration sentinel so the drawer can be re-deep-linked, and
          // tell the parent to drop the captured `?task=` so it doesn't fire
          // again the next time the user clicks the Tasks tab.
          hydratedRef.current = null;
          onDrawerClose?.();
        }}
        onSave={onSaveTask}
        onCreate={onCreateTask}
        onDelete={onDeleteTask}
        zones={zones}
        projectId={project.id}
        currentUser={currentUser}
        readOnly={!canEdit}
        canDelete={canDelete}
      />

      {/* Selection summary bar (slides in from the bottom) */}
      {selectMode && (
        <SelectionBar
          count={selected.size}
          onClear={clearSelection}
          onCancel={exitSelectMode}
          onAction={(a) => setBulkAction(a)}
          canDelete={canDelete}
          busy={bulkBusy}
        />
      )}

      {/* Bulk action modals */}
      {bulkAction === 'shift' && (
        <ShiftDatesModal
          count={selected.size}
          onClose={() => setBulkAction(null)}
          onConfirm={(days) => runBulkShift(days)}
          busy={bulkBusy}
        />
      )}
      {bulkAction === 'status' && (
        <StatusModal
          count={selected.size}
          onClose={() => setBulkAction(null)}
          onConfirm={(s) => runBulkStatus(s)}
          busy={bulkBusy}
        />
      )}
      {bulkAction === 'assignee' && (
        <AssigneeModal
          count={selected.size}
          tasks={selectedTasks}
          onClose={() => setBulkAction(null)}
          onConfirm={(id) => runBulkAssignee(id)}
          busy={bulkBusy}
        />
      )}
      {bulkAction === 'delete' && (
        <DeleteConfirmModal
          count={selected.size}
          onClose={() => setBulkAction(null)}
          onConfirm={runBulkDelete}
          busy={bulkBusy}
        />
      )}
    </>
  );
}

// ─── Selection bar (sticky bottom) ──────────────────────────────────────────

function SelectionBar({
  count, onClear, onCancel, onAction, canDelete, busy,
}: {
  count: number;
  onClear: () => void;
  onCancel: () => void;
  onAction: (a: 'shift' | 'status' | 'assignee' | 'delete') => void;
  canDelete: boolean;
  busy: boolean;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 px-3 pb-3 sm:px-6 sm:pb-6"
         style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0.75rem)' }}>
      <div className="mx-auto flex max-w-3xl flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl sm:flex-row sm:items-center sm:p-3">
        <div className="flex items-center gap-2 px-2 py-1">
          <span
            className="text-base font-semibold tabular-nums text-slate-900"
            style={{ fontFamily: "'Fraunces', Georgia, serif" }}
          >
            {count}
          </span>
          <span className="text-xs text-slate-500">selected</span>
          {count > 0 && (
            <button
              type="button"
              onClick={onClear}
              className="ml-1 text-[11px] text-slate-400 underline-offset-2 hover:text-slate-700 hover:underline"
            >
              Clear
            </button>
          )}
        </div>

        <div className="-mx-1 overflow-x-auto px-1 sm:mx-0 sm:flex-1 sm:px-0">
          <div className="inline-flex items-center gap-1.5">
            <BulkBtn
              icon={CalendarRange}
              label="Shift dates"
              onClick={() => onAction('shift')}
              disabled={count === 0 || busy}
            />
            <BulkBtn
              icon={Tag}
              label="Set status"
              onClick={() => onAction('status')}
              disabled={count === 0 || busy}
            />
            <BulkBtn
              icon={UserIcon}
              label="Reassign"
              onClick={() => onAction('assignee')}
              disabled={count === 0 || busy}
            />
            {canDelete && (
              <BulkBtn
                icon={Trash2}
                label="Delete"
                onClick={() => onAction('delete')}
                disabled={count === 0 || busy}
                tone="danger"
              />
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="ml-auto inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40"
          aria-label="Exit select mode"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function BulkBtn({
  icon: Icon, label, onClick, disabled, tone = 'default',
}: {
  icon: typeof CalendarRange;
  label: string;
  onClick: () => void;
  disabled: boolean;
  tone?: 'default' | 'danger';
}) {
  const cls = tone === 'danger'
    ? 'border-red-200 text-red-600 hover:bg-red-50 disabled:border-slate-200 disabled:text-slate-400'
    : 'border-slate-200 text-slate-700 hover:bg-slate-50 disabled:text-slate-400';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border bg-white px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${cls}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

// ─── Bulk action modals ─────────────────────────────────────────────────────

function ModalShell({
  title, body, footer, onClose,
}: {
  title: string;
  body: React.ReactNode;
  footer: React.ReactNode;
  onClose: () => void;
}) {
  // Close on backdrop click, ESC swallowed by selection-bar effect higher up.
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-2 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90dvh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl sm:max-h-none"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="editorial-scrollbox flex-1 px-5 py-4">{body}</div>
        <footer className="flex flex-shrink-0 items-center justify-end gap-2 border-t border-slate-100 px-5 py-3">
          {footer}
        </footer>
      </div>
    </div>
  );
}

function ShiftDatesModal({
  count, onClose, onConfirm, busy,
}: {
  count: number;
  onClose: () => void;
  onConfirm: (days: number) => void;
  busy: boolean;
}) {
  const [days, setDays] = useState('1');
  const [direction, setDirection] = useState<'forward' | 'back'>('forward');

  const finalDays = (direction === 'back' ? -1 : 1) * (Number(days) || 0);

  return (
    <ModalShell
      title="Shift dates"
      onClose={onClose}
      body={
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Move <strong>{count}</strong> task{count === 1 ? '' : 's'} by the chosen interval.
            Both start and end dates shift together.
          </p>
          <div className="flex items-center gap-2">
            <div className="inline-flex items-center rounded-full border border-slate-200 p-1">
              {(['back', 'forward'] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDirection(d)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    direction === d ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {d === 'back' ? '← Earlier' : 'Later →'}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1">
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={days}
                onChange={(e) => setDays(e.target.value)}
                className="w-20 rounded-md border border-slate-200 px-3 py-2 text-center text-sm tabular-nums shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
              <span className="text-sm text-slate-600">days</span>
            </div>
          </div>
          <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <strong>Preview:</strong>{' '}
            {finalDays === 0
              ? 'No change.'
              : `${count} task${count === 1 ? '' : 's'} will shift ${Math.abs(finalDays)} day${Math.abs(finalDays) === 1 ? '' : 's'} ${finalDays > 0 ? 'forward' : 'earlier'}.`}
          </p>
        </div>
      }
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button
            onClick={() => onConfirm(finalDays)}
            disabled={busy || finalDays === 0}
          >
            {busy ? 'Shifting…' : 'Apply shift'}
          </Button>
        </>
      }
    />
  );
}

function StatusModal({
  count, onClose, onConfirm, busy,
}: {
  count: number;
  onClose: () => void;
  onConfirm: (s: TaskStatus) => void;
  busy: boolean;
}) {
  const [status, setStatus] = useState<TaskStatus>('in_progress');

  return (
    <ModalShell
      title="Set status"
      onClose={onClose}
      body={
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Set the status for <strong>{count}</strong> task{count === 1 ? '' : 's'}.
            Marking as <em>Complete</em> sets % to 100; <em>Not Started</em> resets to 0.
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {STATUS_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  status === opt.value
                    ? 'border-slate-900 bg-slate-50'
                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="bulk-status"
                  value={opt.value}
                  checked={status === opt.value}
                  onChange={() => setStatus(opt.value)}
                  className="h-3.5 w-3.5 accent-emerald-600"
                />
                <span className={`h-2 w-2 rounded-full ${STATUS_DOT[opt.value]}`} />
                {opt.label}
              </label>
            ))}
          </div>
        </div>
      }
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={() => onConfirm(status)} disabled={busy}>
            {busy ? 'Updating…' : 'Apply'}
          </Button>
        </>
      }
    />
  );
}

function AssigneeModal({
  count, tasks: selectedTasks, onClose, onConfirm, busy,
}: {
  count: number;
  tasks: Task[];
  onClose: () => void;
  onConfirm: (assigneeId: string) => void;
  busy: boolean;
}) {
  const [assigneeId, setAssigneeId] = useState('');

  // Build the candidate list from existing assignees on the project — gives
  // a sane dropdown in lieu of a real members-of-project query.
  const candidates = useMemo(() => {
    const seen = new Set<string>();
    const out: { id: string }[] = [];
    for (const t of selectedTasks) {
      if (!t.assigneeId || seen.has(t.assigneeId)) continue;
      seen.add(t.assigneeId);
      out.push({ id: t.assigneeId });
    }
    return out;
  }, [selectedTasks]);

  return (
    <ModalShell
      title="Reassign tasks"
      onClose={onClose}
      body={
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Assign <strong>{count}</strong> task{count === 1 ? '' : 's'} to a user.
            Type a user ID (the proper member picker lands once Admin → Users is wired).
          </p>
          <input
            type="text"
            value={assigneeId}
            onChange={(e) => setAssigneeId(e.target.value)}
            placeholder="user_id (e.g. usr_4f2a)"
            className="block w-full rounded-md border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
          {candidates.length > 0 && (
            <div>
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-slate-500">
                Currently in selection
              </p>
              <div className="flex flex-wrap gap-1.5">
                {candidates.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setAssigneeId(c.id)}
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                      assigneeId === c.id
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {c.id}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setAssigneeId('')}
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    assigneeId === ''
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  (unassign)
                </button>
              </div>
            </div>
          )}
        </div>
      }
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={() => onConfirm(assigneeId.trim())} disabled={busy}>
            {busy ? 'Saving…' : 'Apply'}
          </Button>
        </>
      }
    />
  );
}

function DeleteConfirmModal({
  count, onClose, onConfirm, busy,
}: {
  count: number;
  onClose: () => void;
  onConfirm: () => void;
  busy: boolean;
}) {
  const [typed, setTyped] = useState('');
  const required = String(count);
  const matches = typed === required;

  return (
    <ModalShell
      title={`Delete ${count} task${count === 1 ? '' : 's'}?`}
      onClose={onClose}
      body={
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            This permanently removes the selected tasks and any photos / comments
            attached to them. To confirm, type{' '}
            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">{required}</span>{' '}
            below.
          </p>
          <input
            type="text"
            inputMode="numeric"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={required}
            className="block w-full rounded-md border border-slate-200 px-3 py-2 text-sm tabular-nums shadow-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
          />
        </div>
      }
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy || !matches}
            className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 active:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
            {busy ? 'Deleting…' : `Delete ${count}`}
          </button>
        </>
      }
    />
  );
}

// ─── Board view ────────────────────────────────────────────────────────────

function BoardView({
  tasks, zones, onOpenTask, onDropTask, canEdit,
  selectMode, selected, onSelectAllInStatus, onViewPhotos,
}: {
  tasks: Task[];
  zones: Zone[];
  onOpenTask: (t: Task) => void;
  onDropTask: (taskId: string, newStatus: TaskStatus) => void;
  canEdit: boolean;
  selectMode: boolean;
  selected: Set<string>;
  onSelectAllInStatus: (s: TaskStatus) => void;
  onViewPhotos: (taskId: string) => void;
}) {
  const grouped = useMemo(() => {
    const out: Record<TaskStatus, Task[]> = {
      not_started: [], in_progress: [], blocked: [], delayed: [], complete: [],
    };
    for (const t of tasks) (out[t.status] ?? out.not_started).push(t);
    return out;
  }, [tasks]);

  const [dragOver, setDragOver] = useState<TaskStatus | null>(null);

  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
      <div className="flex min-w-[720px] gap-3">
        {BOARD_COLUMNS.map((col) => {
          const columnTasks = grouped[col.status] ?? [];
          const columnIds = columnTasks.map((t) => t.id);
          const allInColumnSelected = columnIds.length > 0 && columnIds.every((id) => selected.has(id));

          return (
            <div
              key={col.status}
              onDragOver={(e) => {
                if (canEdit && !selectMode) { e.preventDefault(); setDragOver(col.status); }
              }}
              onDragLeave={() => setDragOver((c) => (c === col.status ? null : c))}
              onDrop={(e) => {
                if (!canEdit || selectMode) return;
                const id = e.dataTransfer.getData('text/plain');
                if (id) onDropTask(id, col.status);
                setDragOver(null);
              }}
              className={`flex w-72 flex-shrink-0 flex-col rounded-xl border bg-slate-50/50 p-2 transition-colors ${
                dragOver === col.status ? 'border-emerald-400 bg-emerald-50/50' : 'border-slate-200'
              }`}
            >
              <header className="mb-2 flex items-center justify-between px-2 py-1">
                <button
                  type="button"
                  onClick={() => selectMode && onSelectAllInStatus(col.status)}
                  className={`flex items-center gap-2 rounded-md px-1 py-0.5 -ml-1 ${
                    selectMode ? 'cursor-pointer hover:bg-slate-100' : 'cursor-default'
                  }`}
                  disabled={!selectMode || columnTasks.length === 0}
                >
                  {selectMode && (
                    allInColumnSelected
                      ? <CheckSquare className="h-3.5 w-3.5 text-emerald-600" />
                      : <Square className="h-3.5 w-3.5 text-slate-400" />
                  )}
                  <span className={`h-2 w-2 rounded-full ${STATUS_DOT[col.status]}`} />
                  <h3 className="text-sm font-medium text-slate-900">{col.label}</h3>
                </button>
                <span className="tabular-nums text-xs text-slate-500">{columnTasks.length}</span>
              </header>

              <div className="flex flex-col gap-2">
                {columnTasks.map((t) => {
                  const zone = zones.find((z) => z.id === t.zoneId);
                  const isSel = selected.has(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      draggable={canEdit && !selectMode}
                      onDragStart={(e) => e.dataTransfer.setData('text/plain', t.id)}
                      onClick={() => onOpenTask(t)}
                      className={`relative cursor-pointer rounded-lg border bg-white p-3 text-left shadow-sm transition-all hover:shadow-md ${
                        isSel ? 'border-emerald-500 ring-2 ring-emerald-200' : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      {selectMode && (
                        <div className="mb-2 flex items-center gap-2">
                          {isSel
                            ? <CheckSquare className="h-4 w-4 text-emerald-600" />
                            : <Square className="h-4 w-4 text-slate-400" />}
                          <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
                            Tap to {isSel ? 'unselect' : 'select'}
                          </span>
                        </div>
                      )}

                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 flex-1 text-sm font-medium text-slate-900">{t.name}</p>
                        {zone && (
                          <span
                            className="h-2 w-2 flex-shrink-0 rounded-full"
                            style={{ backgroundColor: zone.colorCode }}
                            title={zone.name}
                          />
                        )}
                      </div>
                      <p className="mt-1 text-[11px] capitalize text-slate-500">{t.phase}</p>
                      <div className="mt-2 flex items-center gap-2">
                        <div className="h-1 flex-1 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-1 rounded-full bg-emerald-500"
                            style={{ width: `${t.percentComplete}%` }}
                          />
                        </div>
                        <span className="tabular-nums text-[10px] text-slate-500">{t.percentComplete}%</span>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400">
                        <span>{format(parseISO(t.endDate), 'MMM d')}</span>
                        {t.photoCount > 0 && (
                          /* Connectedness pass: photo_count is now a deep
                             link to the gallery filtered by this task. The
                             card itself is a <button>; nesting another
                             <button> would be invalid, so use role=link with
                             a click + keyboard handler. stopPropagation keeps
                             the parent card's open-drawer click from firing. */
                          <span
                            role="link"
                            tabIndex={0}
                            aria-label={`View ${t.photoCount} photos for ${t.name}`}
                            className="inline-flex cursor-pointer items-center gap-1 rounded px-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-300"
                            onClick={(e) => {
                              e.stopPropagation();
                              onViewPhotos(t.id);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                e.stopPropagation();
                                onViewPhotos(t.id);
                              }
                            }}
                          >
                            <ImageIcon className="h-3 w-3" />
                            {t.photoCount}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
                {columnTasks.length === 0 && (
                  <p className="px-2 py-3 text-center text-[11px] text-slate-400">Empty</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── List view ─────────────────────────────────────────────────────────────

function ListView({
  tasks, zones, onOpenTask, handleSort, sortIcon,
  selectMode, selected, onSelectAllVisible,
}: {
  tasks: Task[];
  zones: Zone[];
  onOpenTask: (t: Task) => void;
  handleSort: (k: SortKey) => void;
  sortIcon: (k: SortKey) => React.ReactNode;
  selectMode: boolean;
  selected: Set<string>;
  onSelectAllVisible: () => void;
}) {
  const allVisibleSelected = tasks.length > 0 && tasks.every((t) => selected.has(t.id));

  return (
    <Card>
      <CardContent className="p-0">
        {/* Mobile cards */}
        <ul className="divide-y divide-slate-100 md:hidden">
          {tasks.map((t) => {
            const isSel = selected.has(t.id);
            return (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => onOpenTask(t)}
                  className={`flex w-full flex-col gap-2 px-4 py-3 text-left transition-colors ${
                    isSel ? 'bg-emerald-50 hover:bg-emerald-100' : 'hover:bg-slate-50 active:bg-slate-100'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {selectMode && (
                      isSel
                        ? <CheckSquare className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-600" />
                        : <Square    className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-slate-900">{t.name}</p>
                      <p className="truncate text-[11px] capitalize text-slate-500">
                        {t.phase}
                        {t.zoneId && <> · {zones.find((z) => z.id === t.zoneId)?.name ?? 'Unknown zone'}</>}
                      </p>
                    </div>
                    <Badge variant="outline" className={`flex-shrink-0 text-[10px] uppercase tracking-wider ${STATUS_BADGE[t.status]}`}>
                      {t.status.replace('_', ' ')}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${t.percentComplete}%` }} />
                    </div>
                    <span className="flex-shrink-0 tabular-nums text-xs text-slate-600">{t.percentComplete}%</span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    {format(parseISO(t.startDate), 'MMM d')} → {format(parseISO(t.endDate), 'MMM d, yyyy')}
                  </p>
                </button>
              </li>
            );
          })}
        </ul>

        {/* Desktop table */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/60 text-left text-[11px] font-medium uppercase tracking-wider text-slate-500">
                {selectMode && (
                  <th className="px-4 py-3">
                    <button
                      type="button"
                      onClick={onSelectAllVisible}
                      className="inline-flex items-center text-slate-700 hover:text-slate-900"
                      aria-label="Select all visible"
                    >
                      {allVisibleSelected
                        ? <CheckSquare className="h-3.5 w-3.5 text-emerald-600" />
                        : <Square    className="h-3.5 w-3.5 text-slate-400" />}
                    </button>
                  </th>
                )}
                <SortHeader label="Task"   onClick={() => handleSort('name')}            icon={sortIcon('name')} />
                <SortHeader label="Phase"  onClick={() => handleSort('phase')}           icon={sortIcon('phase')} />
                <SortHeader label="Start"  onClick={() => handleSort('startDate')}       icon={sortIcon('startDate')} />
                <SortHeader label="End"    onClick={() => handleSort('endDate')}         icon={sortIcon('endDate')} />
                <SortHeader label="%"      onClick={() => handleSort('percentComplete')} icon={sortIcon('percentComplete')} />
                <SortHeader label="Status" onClick={() => handleSort('status')}          icon={sortIcon('status')} />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tasks.map((t) => {
                const isSel = selected.has(t.id);
                return (
                  <tr
                    key={t.id}
                    onClick={() => onOpenTask(t)}
                    className={`cursor-pointer transition-colors ${
                      isSel ? 'bg-emerald-50 hover:bg-emerald-100' : 'hover:bg-slate-50'
                    }`}
                  >
                    {selectMode && (
                      <td className="px-4 py-3">
                        {isSel
                          ? <CheckSquare className="h-3.5 w-3.5 text-emerald-600" />
                          : <Square    className="h-3.5 w-3.5 text-slate-400" />}
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{t.name}</p>
                      {t.zoneId && (
                        <p className="text-[11px] text-slate-500">
                          {zones.find((z) => z.id === t.zoneId)?.name ?? 'Unknown zone'}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 capitalize text-slate-600">{t.phase}</td>
                    <td className="px-4 py-3 text-slate-600">{format(parseISO(t.startDate), 'MMM d, yyyy')}</td>
                    <td className="px-4 py-3 text-slate-600">{format(parseISO(t.endDate), 'MMM d, yyyy')}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">
                          <div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${t.percentComplete}%` }} />
                        </div>
                        <span className="tabular-nums text-xs text-slate-600">{t.percentComplete}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className={`text-[10px] uppercase tracking-wider ${STATUS_BADGE[t.status]}`}>
                        {t.status.replace('_', ' ')}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── My Work view ──────────────────────────────────────────────────────────

function MyWorkView({
  tasks, zones, currentUser, onOpenTask, openCreate, canEdit,
  selectMode, selected,
}: {
  tasks: Task[];
  zones: Zone[];
  currentUser: User | null;
  onOpenTask: (t: Task) => void;
  openCreate: () => void;
  canEdit: boolean;
  selectMode: boolean;
  selected: Set<string>;
}) {
  const mine = useMemo(
    () => tasks.filter((t) => t.assigneeId === currentUser?.id),
    [tasks, currentUser?.id],
  );

  const buckets = useMemo(() => {
    const today = new Date();
    const weekEnd = endOfWeek(today, { weekStartsOn: 1 });
    const out = { overdue: [] as Task[], today: [] as Task[], thisWeek: [] as Task[], later: [] as Task[] };
    for (const t of mine) {
      const end = parseISO(t.endDate);
      const days = differenceInDays(end, today);
      if (days < 0 && t.percentComplete < 100) out.overdue.push(t);
      else if (days === 0)                     out.today.push(t);
      else if (end <= weekEnd)                 out.thisWeek.push(t);
      else                                     out.later.push(t);
    }
    return out;
  }, [mine]);

  if (mine.length === 0) {
    return (
      <Card>
        <CardContent className="p-6">
          <EmptyState
            icon={UserIcon}
            title={currentUser ? `Nothing assigned to ${currentUser.fullName}.` : 'Sign in to see your work.'}
            description="Tasks assigned to you appear here, grouped by due date. Open one and tap an assignee field to claim it."
            action={canEdit ? <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Create task</Button> : null}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <BucketSection title="Overdue"   tone="red"   items={buckets.overdue}  zones={zones} onOpenTask={onOpenTask} selectMode={selectMode} selected={selected} />
      <BucketSection title="Today"     tone="amber" items={buckets.today}    zones={zones} onOpenTask={onOpenTask} selectMode={selectMode} selected={selected} />
      <BucketSection title="This week" tone="blue"  items={buckets.thisWeek} zones={zones} onOpenTask={onOpenTask} selectMode={selectMode} selected={selected} />
      <BucketSection title="Later"     tone="slate" items={buckets.later}    zones={zones} onOpenTask={onOpenTask} selectMode={selectMode} selected={selected} />
    </div>
  );
}

function BucketSection({
  title, tone, items, zones, onOpenTask, selectMode, selected,
}: {
  title: string;
  tone: 'red' | 'amber' | 'blue' | 'slate';
  items: Task[];
  zones: Zone[];
  onOpenTask: (t: Task) => void;
  selectMode: boolean;
  selected: Set<string>;
}) {
  if (items.length === 0) return null;
  const tones = {
    red:   'text-red-700 bg-red-50',
    amber: 'text-amber-700 bg-amber-50',
    blue:  'text-blue-700 bg-blue-50',
    slate: 'text-slate-600 bg-slate-50',
  }[tone];

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${tones}`}>
          {title}
        </span>
        <span className="text-xs text-slate-500">{items.length}</span>
      </div>
      <Card>
        <CardContent className="p-0">
          <ul className="divide-y divide-slate-100">
            {items.map((t) => {
              const isSel = selected.has(t.id);
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => onOpenTask(t)}
                    className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
                      isSel ? 'bg-emerald-50 hover:bg-emerald-100' : 'hover:bg-slate-50'
                    }`}
                  >
                    {selectMode && (
                      isSel
                        ? <CheckSquare className="h-4 w-4 flex-shrink-0 text-emerald-600" />
                        : <Square    className="h-4 w-4 flex-shrink-0 text-slate-400" />
                    )}
                    <span className={`h-2 w-2 flex-shrink-0 rounded-full ${STATUS_DOT[t.status]}`} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900">{t.name}</p>
                      <p className="truncate text-[11px] text-slate-500">
                        {format(parseISO(t.endDate), 'MMM d, yyyy')}
                        {t.zoneId && <> · {zones.find((z) => z.id === t.zoneId)?.name}</>}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-1 w-16 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-1 rounded-full bg-emerald-500" style={{ width: `${t.percentComplete}%` }} />
                      </div>
                      <span className="tabular-nums text-[10px] text-slate-500">{t.percentComplete}%</span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function SortHeader({
  label, icon, onClick,
}: { label: string; icon: React.ReactNode; onClick: () => void }) {
  return (
    <th className="px-4 py-3">
      <button type="button" onClick={onClick} className="inline-flex items-center gap-1 transition-colors hover:text-slate-900">
        {label}
        {icon}
      </button>
    </th>
  );
}
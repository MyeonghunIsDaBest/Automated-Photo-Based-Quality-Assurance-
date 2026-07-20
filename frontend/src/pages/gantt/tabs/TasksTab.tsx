import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, CalendarRange, Check, CheckCheck, CheckSquare, ChevronDown, ChevronRight,
  Lock, Pencil, Plus, Search, Sparkles, Square, Tag, Trash2,
  User as UserIcon, X,
} from 'lucide-react';
import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns';
import {
  type Task, type TaskStatus, type Zone, type User, type Project,
  type ConstructionPhase, rolledUpPct,
} from '../../../types';
import { Card, CardContent } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import TaskDrawer from './TaskDrawer';
import { LedgerHeader, StatusPill, btnPrimary, btnGhost, inputField } from '../components/ledger';
import { EmptyState } from '../components/EmptyState';
import { useTaskAiSignal } from '../../../lib/hooks/useTaskAiSignal';
import CountUp from '../../../components/ui/CountUp';
import {
  makeTimeWindow, monthHeaders, dayHeaders, weekHeaders, quarterHeaders, weekTicks,
  weekendIntervals, taskBarPosition, xPositionPct, timelineMinWidthPx,
  type GanttZoom, type TimeWindow,
} from '../../../lib/construction/ganttLayout';
import GanttToolbar from '../../../components/ui/GanttToolbar';
import PhaseEditModal from './PhaseEditModal';
import { phaseColor } from '../../../lib/construction/phaseColors';
import { tasksForPhase } from '../../../lib/construction/phaseTaskCatalog';

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
  initialOpenTaskId?: string | null;
  onDrawerClose?: () => void;
}

const STATUS_DOT: Record<TaskStatus, string> = {
  not_started: 'bg-[#C9BBA0]',
  in_progress: 'bg-[#C8841E]',
  complete:    'bg-[#2F8F5C]',
  delayed:     'bg-[#C44545]',
  blocked:     'bg-[#5A6470]',
};

const STATUS_BAR_BG: Record<TaskStatus, string> = {
  not_started: 'bg-[#C9BBA0]',
  in_progress: 'bg-[#D69A2E]',
  complete:    'bg-[#2F8F5C]',
  delayed:     'bg-[#C44545]',
  blocked:     'bg-[#5A6470]',
};

// At-risk = explicitly delayed/blocked, or overdue (end date past, not done).
// Date strings are ISO YYYY-MM-DD so the lexical compare is chronological.
function isAtRisk(t: Task): boolean {
  if (t.isPhaseAnchor) return false;
  if (t.status === 'delayed' || t.status === 'blocked') return true;
  return t.status !== 'complete' && t.endDate < new Date().toISOString().slice(0, 10);
}

// Custom phases (migration 44) have no entry in the 8-colour construction
// palette, so they draw from this set — assigned stably per anchor id so a
// phase keeps its colour across renders. Hues sit apart from the built-in 8.
const CUSTOM_PALETTE = ['#0D9488', '#7C3AED', '#DB2777', '#0891B2', '#9333EA', '#4F46E5'];
function customColorFor(t: Task): string {
  let h = 0;
  for (let i = 0; i < t.id.length; i++) h = (h * 31 + t.id.charCodeAt(i)) >>> 0;
  return CUSTOM_PALETTE[h % CUSTOM_PALETTE.length];
}

// Display label + colours for a phase anchor — built-ins from the construction
// palette (keyed by phase enum), custom phases by their name + assigned colour.
function phaseDisplay(t: Task): { label: string; color: string; tint: string; fill: string } {
  if (t.isCustom) {
    const color = customColorFor(t);
    return { label: t.name || 'Untitled phase', color, tint: `${color}1A`, fill: `${color}99` };
  }
  const pc = phaseColor(t.phase);
  return { label: pc.label, color: pc.color, tint: pc.tint, fill: pc.fill };
}

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: 'not_started', label: 'Not Started' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'blocked',     label: 'Blocked' },
  { value: 'delayed',     label: 'Delayed' },
  { value: 'complete',    label: 'Complete' },
];

const FILTERS = [
  { id: 'mine',        label: 'Mine' },
  { id: 'open',        label: 'Open' },
  { id: 'blocked',     label: 'Blocked' },
  { id: 'has_photos',  label: 'Has photos' },
  { id: 'no_assignee', label: 'No assignee' },
] as const;
type FilterId = typeof FILTERS[number]['id'];

const PHASE_ORDER: ConstructionPhase[] = [
  'excavation', 'foundation', 'framing', 'roofing',
  'electrical', 'plumbing', 'drywall', 'finishing',
];

// Each Gantt row is a fixed height so the left list pane and the right timeline
// pane stay in sync without absolute-positioning gymnastics. 42px keeps the
// original slim look while giving the list rows room for a name + a thin
// progress bar on a second line.
const ROW_HEIGHT_PX = 42;

// Width of the left pane on desktop. Picked so the longest sub-task name
// ("Sand & texture") fits with breathing room without crowding the timeline.
const LEFT_PANE_WIDTH_PX = 304;

interface RenderItem {
  kind: 'anchor' | 'child' | 'inline-add' | 'empty';
  task?: Task;
  // For anchor rows
  rolledPct?: number;
  isCollapsed?: boolean;
  childCount?: number;
  // For inline-add and empty placeholders
  parentAnchor?: Task;
  emptyLabel?: string;
}

export function TasksTab({
  project, tasks, zones, currentUser, canEdit, canDelete,
  onCreateTask, onSaveTask, onDeleteTask, initialOpenTaskId, onDrawerClose,
}: TasksTabProps) {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<Set<FilterId>>(new Set());
  const [drawerTask, setDrawerTask] = useState<Task | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'edit' | 'create'>('edit');
  const [addPhaseOpen, setAddPhaseOpen] = useState(false);

  // "Add tasks" picker target — the phase anchor we're adding sub-tasks to
  // (catalog multi-select + custom add). Replaces the old inline free-text add.
  const [tasksModalAnchor, setTasksModalAnchor] = useState<Task | null>(null);

  // Pencil-icon target — when set, opens the phase-scoped batch edit modal.
  const [phaseToEdit, setPhaseToEdit] = useState<Task | null>(null);

  // Collapsed phase anchors — by default everything is expanded.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // Inline "+ Add sub-task" — at most one open at a time.
  const [addingFor, setAddingFor] = useState<string | null>(null);

  // ── Bulk-select state ────────────────────────────────────────────────
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<null | 'shift' | 'status' | 'assignee' | 'delete'>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  // Phase anchors keyed by phase + everything-else bucket.
  const { anchorsByPhase, orphanTasks, customAnchors } = useMemo(() => {
    const anchors = new Map<ConstructionPhase, Task>();
    const customs: Task[] = [];
    const orphans: Task[] = [];
    for (const t of tasks) {
      if (t.isPhaseAnchor) {
        // Custom phases (migration 44) are anchors too, but keyed by identity —
        // never into anchorsByPhase, or they'd clobber a built-in sharing their
        // placeholder `phase` value.
        if (t.isCustom) customs.push(t);
        else anchors.set(t.phase, t);
      } else if (!t.parentTaskId) {
        orphans.push(t);
      }
    }
    customs.sort((a, b) => a.startDate.localeCompare(b.startDate) || a.name.localeCompare(b.name));
    return { anchorsByPhase: anchors, orphanTasks: orphans, customAnchors: customs };
  }, [tasks]);

  // Filter is applied to leaves only; anchors stay visible as scaffolding.
  const passesFilter = (t: Task): boolean => {
    if (filters.has('mine') && t.assigneeId !== currentUser?.id) return false;
    if (filters.has('open') && t.status === 'complete') return false;
    if (filters.has('blocked') && t.status !== 'blocked') return false;
    if (filters.has('has_photos') && t.photoCount === 0) return false;
    if (filters.has('no_assignee') && t.assigneeId) return false;
    return true;
  };

  const visibleChildrenFor = (anchorId: string): Task[] => {
    return tasks
      .filter((t) => t.parentTaskId === anchorId && passesFilter(t))
      .sort((a, b) => a.startDate.localeCompare(b.startDate));
  };

  const visibleOrphans = useMemo(
    () => orphanTasks.filter(passesFilter).sort((a, b) => a.startDate.localeCompare(b.startDate)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orphanTasks, filters, currentUser?.id],
  );

  const selectedTasks = useMemo(
    () => tasks.filter((t) => selected.has(t.id)),
    [tasks, selected],
  );

  // Timeline window — project range by default, with optional user override
  // via the GanttToolbar's custom-range picker. The override lives in this
  // component (not the store) because it's intentionally view-state: it
  // shouldn't persist across sessions or sync across users.
  const projectWindow = useMemo<TimeWindow>(
    () => makeTimeWindow(project.startDate, project.endDate),
    [project.startDate, project.endDate],
  );
  const [windowOverride, setWindowOverride] = useState<TimeWindow | null>(null);
  const [zoom, setZoom] = useState<GanttZoom>('month');
  const timeWindow = windowOverride ?? projectWindow;
  const hasCustomRange = windowOverride !== null;

  // The right-pane scroll container is referenced by the Today button —
  // scrolling the today-line into view requires a ref because nothing else
  // pushes that scroll position.
  const timelineScrollRef = useRef<HTMLDivElement | null>(null);
  // We mark the today-line with this attribute so the Today button can find
  // it with `querySelector('[data-today-line]')` and call `scrollIntoView`.
  const todayLineRef = useRef<HTMLDivElement | null>(null);

  // Axis headers depend on the zoom level. Per the design, ranges keep the
  // same percentage math — only the labels change.
  const months = useMemo(() => monthHeaders(timeWindow), [timeWindow]);
  const days   = useMemo(() => (zoom === 'day' ? dayHeaders(timeWindow) : []), [zoom, timeWindow]);
  const weeks  = useMemo(() => (zoom === 'week' ? weekHeaders(timeWindow) : []), [zoom, timeWindow]);
  const quarters = useMemo(() => (zoom === 'quarter' ? quarterHeaders(timeWindow) : []), [zoom, timeWindow]);
  // Weekly day-of-month ticks for the month-zoom sub-axis — exact dates, not
  // just the month band.
  const monthTicks = useMemo(() => (zoom === 'month' ? weekTicks(timeWindow) : []), [zoom, timeWindow]);
  const weekends = useMemo(
    () => ((zoom === 'day' || zoom === 'week') ? weekendIntervals(timeWindow) : []),
    [zoom, timeWindow],
  );
  const todayPct = useMemo(() => xPositionPct(new Date(), timeWindow), [timeWindow]);
  const todayVisible = todayPct >= 0 && todayPct <= 100;

  const handleScrollToToday = () => {
    if (!todayLineRef.current) return;
    // `scrollIntoView` with `inline: 'center'` centres the today-line in its
    // closest horizontally-scrolling ancestor. The split-pane right side
    // doesn't currently scroll (it fills its column), so this is a no-op
    // unless the project window is wide enough to force horizontal scroll
    // — but the call is harmless either way and future-proofs the affordance.
    todayLineRef.current.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  };

  // Phase rows in canonical order, then orphans, with their visible children
  // flattened in collapse-aware order. This is the single source of truth
  // that both panes iterate — guarantees vertical alignment.
  const phaseRows = useMemo(
    () => [
      ...PHASE_ORDER
        .map((phase) => anchorsByPhase.get(phase))
        .filter((a): a is Task => !!a),
      ...customAnchors,
    ],
    [anchorsByPhase, customAnchors],
  );

  const renderItems = useMemo<RenderItem[]>(() => {
    const items: RenderItem[] = [];
    for (const anchor of phaseRows) {
      const children = visibleChildrenFor(anchor.id);
      items.push({
        kind: 'anchor',
        task: anchor,
        rolledPct: rolledUpPct(anchor, tasks),
        isCollapsed: collapsed.has(anchor.id),
        childCount: children.length,
      });
      if (!collapsed.has(anchor.id)) {
        for (const c of children) items.push({ kind: 'child', task: c });
        if (addingFor === anchor.id && canEdit) {
          items.push({ kind: 'inline-add', parentAnchor: anchor });
        } else if (children.length === 0) {
          items.push({
            kind: 'empty',
            parentAnchor: anchor,
            emptyLabel: filters.size > 0
              ? 'No matching sub-tasks in this phase.'
              : 'No tasks yet — add from the list.',
          });
        }
      }
    }
    for (const t of visibleOrphans) {
      items.push({ kind: 'child', task: t });
    }
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phaseRows, collapsed, addingFor, canEdit, filters, tasks, visibleOrphans]);

  const totalLeaves = tasks.filter((t) => !t.isPhaseAnchor).length;

  // ── Handlers ─────────────────────────────────────────────────────────
  const toggleFilter = (id: FilterId) => {
    setFilters((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelected = (taskId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(taskId) ? next.delete(taskId) : next.add(taskId);
      return next;
    });
  };

  const toggleCollapsed = (phaseId: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(phaseId) ? next.delete(phaseId) : next.add(phaseId);
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

  useEffect(() => {
    if (!selectMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') exitSelectMode();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectMode]);

  const openTask = (t: Task) => {
    if (selectMode) {
      if (t.isPhaseAnchor) return;
      toggleSelected(t.id);
      return;
    }
    setDrawerTask(t);
    setDrawerMode('edit');
    setDrawerOpen(true);
  };

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

  // viewPhotos kept available via the task drawer's Photos sub-tab — no
  // inline deep-link from the new split-pane Gantt rows. If we want it back,
  // wire a button on the timeline bar tooltip.
  void navigate;

  // Create a custom phase (migration 44): a top-level anchor displayed by name
  // and fillable with sub-tasks. Placeholder `phase` value — custom phases group
  // by identity, not the construction enum.
  const createPhase = async (name: string, startDate: string, endDate: string) => {
    const durationDays = Math.max(1, differenceInCalendarDays(parseISO(endDate), parseISO(startDate)) + 1);
    await onCreateTask({
      projectId: project.id,
      name: name.trim(),
      phase: 'finishing',
      startDate,
      endDate,
      durationDays,
      percentComplete: 0,
      status: 'not_started',
      dependencies: [],
      notes: [],
      isPhaseAnchor: true,
      isCustom: true,
    });
    setAddPhaseOpen(false);
  };

  // Delete a custom phase + its sub-tasks (children first, to avoid orphans).
  const handleDeletePhase = async (anchor: Task) => {
    const children = tasks.filter((t) => t.parentTaskId === anchor.id);
    for (const c of children) {
      // eslint-disable-next-line no-await-in-loop
      await onDeleteTask(c.id);
    }
    await onDeleteTask(anchor.id);
  };

  const createSubTask = async (anchor: Task, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    // Default to a short ~2-week window at the phase's start (clamped to the
    // phase end) instead of inheriting the anchor's full span — a fresh sub-task
    // shouldn't stretch the whole timeline. Editable afterwards in the drawer.
    const startDate = anchor.startDate;
    const phaseEnd = parseISO(anchor.endDate);
    const proposedEnd = addDays(parseISO(startDate), 13);
    const endDate = format(proposedEnd < phaseEnd ? proposedEnd : phaseEnd, 'yyyy-MM-dd');
    const durationDays = Math.max(1, differenceInCalendarDays(parseISO(endDate), parseISO(startDate)) + 1);
    await onCreateTask({
      projectId: project.id,
      parentTaskId: anchor.id,
      name: trimmed,
      phase: anchor.phase,
      startDate,
      endDate,
      durationDays,
      percentComplete: 0,
      status: 'not_started',
      dependencies: [],
      notes: [],
      isPhaseAnchor: false,
    });
    setAddingFor(null);
  };

  // The "Other task" modal sets a phase but no parent. Nest the new task under
  // that phase's anchor so it lands in the phase group (like inline-add) instead
  // of dropping to the bottom as an orphan — that's why a freshly-created task
  // wasn't appearing under its phase in the chart.
  const handleCreateTask = (
    input: Omit<Task, 'id' | 'photoCount' | 'lastUpdated' | 'updateSource'>,
  ) => {
    if (!input.isPhaseAnchor && !input.parentTaskId) {
      const anchor = anchorsByPhase.get(input.phase);
      if (anchor) return onCreateTask({ ...input, parentTaskId: anchor.id });
    }
    return onCreateTask(input);
  };

  // ── Bulk action runners ──────────────────────────────────────────────
  const runBulkStatus = async (status: TaskStatus) => {
    setBulkBusy(true);
    try {
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
      for (const t of selectedTasks) {
        if (t.isPhaseAnchor) continue;
        // eslint-disable-next-line no-await-in-loop
        await onDeleteTask(t.id);
      }
      clearSelection();
      setSelectMode(false);
    } finally {
      setBulkBusy(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────

  return (
    <>
      <LedgerHeader
        kicker="TSK"
        icon={CheckSquare}
        eyebrow={`Tasks · ${project.name}`}
        title="Schedule & drawings."
        meta="Eight phases with their milestones, paired with the drawings and permits that back them."
        actions={
          canEdit ? (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
                className={selectMode ? btnPrimary : btnGhost}
              >
                <CheckCheck className="h-3.5 w-3.5" />
                {selectMode ? `Selecting · ${selected.size}` : 'Select'}
              </button>
              <button type="button" onClick={() => setAddPhaseOpen(true)} className={btnPrimary}>
                <Plus className="h-3.5 w-3.5" />
                Add phase
              </button>
            </div>
          ) : (
            <StatusPill tone="slate" className="px-2.5 py-1"><Lock className="h-3 w-3" /> Read-only</StatusPill>
          )
        }
      />

      {/* Filter chips */}
      <Card className="mb-3">
        <CardContent className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-[11px] text-[#6B6B6B]">
            {phaseRows.length} phase{phaseRows.length === 1 ? '' : 's'} · {totalLeaves} task{totalLeaves === 1 ? '' : 's'} on this project.
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
                    className={`flex-shrink-0 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                      isOn
                        ? 'border-[#1A1A1A] bg-[#1A1A1A] text-white'
                        : 'border-[#E6E1D4] text-[#6B6B6B] hover:border-[#D6CDB7] hover:bg-[#FAF8F2]'
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
                  className="flex-shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] text-[#6B6B6B] hover:text-[#1A1A1A]"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Gantt body */}
      {phaseRows.length === 0 && visibleOrphans.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              icon={CheckSquare}
              title={`No tasks on ${project.name} yet.`}
              description="This project's phase anchors haven't loaded yet. Refresh if this persists, or add a custom phase below."
              action={
                canEdit ? (
                  <Button size="sm" onClick={() => setAddPhaseOpen(true)}>
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    Add phase
                  </Button>
                ) : null
              }
            />
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Schedule controls — zoom, custom range, scroll-to-today.
              Mounted ABOVE the split-pane card so the cosmetic Excel-like look
              of the chart itself is preserved. */}
          <div className="hidden md:block">
            <GanttToolbar
              projectWindow={projectWindow}
              activeWindow={timeWindow}
              hasCustomRange={hasCustomRange}
              zoom={zoom}
              onZoomChange={setZoom}
              onRangeChange={(s, e) => setWindowOverride(makeTimeWindow(s, e))}
              onRangeReset={() => setWindowOverride(null)}
              onScrollToToday={handleScrollToToday}
              todayInRange={todayVisible}
            />
          </div>

          {/* Desktop — split-pane Gantt */}
          <Card className="hidden md:block">
            <CardContent className="p-0">
              <div className="flex">
                {/* ─── Left pane: task list ─── */}
                <div
                  className="flex-shrink-0 border-r border-[#EFEBE0]"
                  style={{ width: LEFT_PANE_WIDTH_PX }}
                >
                  {/* Left header: "Task" label */}
                  <div
                    className="flex items-center border-b border-[#EFEBE0] bg-[#FAF8F2]/60 px-3 text-[10px] font-medium uppercase tracking-wider text-[#6B6B6B]"
                    style={{ height: ROW_HEIGHT_PX }}
                  >
                    Task
                  </div>

                  {renderItems.map((item, idx) => (
                    <LeftRowRender
                      key={leftKey(item, idx)}
                      item={item}
                      zones={zones}
                      isSelected={item.task ? selected.has(item.task.id) : false}
                      selectMode={selectMode}
                      canEdit={canEdit}
                      onToggleCollapse={() =>
                        item.task && toggleCollapsed(item.task.id)
                      }
                      onAddSubTask={() => {
                        const a = item.task ?? item.parentAnchor;
                        if (a) setTasksModalAnchor(a);
                      }}
                      onEditPhase={() =>
                        item.task && setPhaseToEdit(item.task)
                      }
                      onDeletePhase={() =>
                        item.task && handleDeletePhase(item.task)
                      }
                      onOpenTask={() =>
                        item.task && openTask(item.task)
                      }
                      onSubmitInlineAdd={(name) =>
                        item.parentAnchor && createSubTask(item.parentAnchor, name)
                      }
                      onCancelInlineAdd={() => setAddingFor(null)}
                    />
                  ))}
                </div>

                {/* ─── Right pane: timeline ─── */}
                {/* overflow-x-auto on the outer pane + an inner wrapper with
                     min-width = totalDays × pxPerDay keeps axis labels
                     legible. At month/quarter zoom (or short windows) the
                     min-width is below the natural pane width so nothing
                     scrolls; at day/week zoom on a multi-month window the
                     timeline grows past the viewport and scrolls horizontally
                     while the left pane stays anchored. */}
                <div ref={timelineScrollRef} className="relative min-w-0 flex-1 overflow-x-auto">
                  <div
                    className="relative"
                    style={{ minWidth: timelineMinWidthPx(zoom, timeWindow.totalDays) }}
                  >
                  {/* Axis — labels follow the current zoom. The label set
                       cycles between day / week / month / quarter but the
                       positioning math is identical (percentages over the
                       window's totalDays). */}
                  <div
                    className="relative border-b border-[#EFEBE0] bg-[#FAF8F2]/60"
                    style={{ height: ROW_HEIGHT_PX }}
                  >
                    {zoom === 'day' && days.map((d) => (
                      <div
                        key={d.label}
                        className={`absolute top-0 flex h-full flex-col items-center justify-center gap-0.5 border-l text-center ${
                          d.isToday ? 'border-[#2F8F5C]/30 bg-[#E5F2EA]/60' : 'border-[#EFEBE0]'
                        }`}
                        style={{ left: `${d.leftPct}%`, width: `${d.widthPct}%` }}
                        title={d.label}
                      >
                        <span className={`text-[9px] font-semibold uppercase leading-none ${
                          d.isToday ? 'text-[#246F47]' : d.isWeekend ? 'text-[#C4BCA8]' : 'text-[#A0A0A0]'
                        }`}>
                          {d.weekday}
                        </span>
                        <span className={`flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[11px] font-semibold tabular-nums leading-none ${
                          d.isToday ? 'bg-[#2F8F5C] text-white' : d.isWeekend ? 'text-[#A0A0A0]' : 'text-[#3A3A3A]'
                        }`}>
                          {d.short}
                        </span>
                      </div>
                    ))}
                    {zoom === 'week' && weeks.map((w) => (
                      <div
                        key={`${w.short}-${w.leftPct}`}
                        className="absolute top-0 flex h-full items-center border-l border-[#EFEBE0] px-2 text-[10px] font-medium uppercase tracking-wider text-[#6B6B6B]"
                        style={{ left: `${w.leftPct}%`, width: `${w.widthPct}%` }}
                        title={w.label}
                      >
                        {w.short}
                      </div>
                    ))}
                    {zoom === 'month' && (
                      <>
                        {months.map((m) => (
                          <div
                            key={m.label}
                            className="absolute top-0 flex h-[22px] items-center border-l border-[#EFEBE0] px-2 text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]"
                            style={{ left: `${m.leftPct}%`, width: `${m.widthPct}%` }}
                          >
                            {m.short}
                          </div>
                        ))}
                        {monthTicks.map((t) => (
                          <div
                            key={`mtick-${t.leftPct}`}
                            className="absolute bottom-1 flex -translate-x-1/2 flex-col items-center"
                            style={{ left: `${t.leftPct}%` }}
                          >
                            <span className="text-[9px] tabular-nums leading-none text-[#A0A0A0]">{t.day}</span>
                            <span aria-hidden className="mt-[3px] h-1.5 w-px bg-[#D6CDB7]" />
                          </div>
                        ))}
                      </>
                    )}
                    {zoom === 'quarter' && quarters.map((q) => (
                      <div
                        key={`${q.short}-${q.leftPct}`}
                        className="absolute top-0 flex h-full items-center border-l border-[#EFEBE0] px-2 text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]"
                        style={{ left: `${q.leftPct}%`, width: `${q.widthPct}%` }}
                      >
                        {q.label}
                      </div>
                    ))}
                  </div>

                  {/* Weekend shading — faint columns behind everything. Only
                       drawn at day/week zoom; at month+ the columns would be
                       sub-pixel and add visual noise. z-0 puts them beneath
                       bars (z-default) and the today-line (z-10). */}
                  {weekends.map((w, i) => (
                    <div
                      key={`weekend-${i}`}
                      className="pointer-events-none absolute z-0 bg-[#EFEBE0]/60"
                      style={{
                        left: `${w.leftPct}%`,
                        width: `${w.widthPct}%`,
                        top: ROW_HEIGHT_PX,
                        bottom: 0,
                      }}
                      aria-hidden
                    />
                  ))}

                  {/* Today column — faint full-height highlight at day zoom so
                       "now" reads as a column, echoing the boxed header cell. */}
                  {zoom === 'day' && (() => {
                    const t = days.find((d) => d.isToday);
                    return t ? (
                      <div
                        className="pointer-events-none absolute z-0 bg-[#E5F2EA]/55"
                        style={{ left: `${t.leftPct}%`, width: `${t.widthPct}%`, top: ROW_HEIGHT_PX, bottom: 0 }}
                        aria-hidden
                      />
                    ) : null;
                  })()}

                  {/* Vertical gridlines at each axis division — gives the body
                       a real schedule-grid feel. z-0 behind the bars; shows
                       through the transparent task rows (same treatment as the
                       weekend shading). Skipped at day zoom — too dense. */}
                  {zoom !== 'day' &&
                    (zoom === 'week'
                      ? weeks.map((w) => w.leftPct)
                      : zoom === 'quarter'
                      ? quarters.map((q) => q.leftPct)
                      : months.map((m) => m.leftPct)
                    ).map((lp, i) =>
                      i === 0 ? null : (
                        <div
                          key={`grid-${i}`}
                          className="pointer-events-none absolute z-0 w-px bg-[#EFEBE0]"
                          style={{ left: `${lp}%`, top: ROW_HEIGHT_PX, bottom: 0 }}
                          aria-hidden
                        />
                      ),
                    )}

                  {/* Today vertical line — soft pulse so it reads as alive,
                       not stuck. Gradient avoids the static "is it broken?" feel. */}
                  {todayVisible && (
                    <div
                      ref={todayLineRef}
                      data-today-line
                      className="pointer-events-none absolute z-10 w-[1.5px] bg-[#2F8F5C]/70"
                      style={{
                        left: `${todayPct}%`,
                        top: ROW_HEIGHT_PX,
                        bottom: 0,
                      }}
                      aria-hidden="true"
                      title="Today"
                    />
                  )}

                  {/* Today marker chip — anchors the pulse line to a label so
                       it reads as "now", not a random divider. */}
                  {todayVisible && (
                    <div
                      className="pointer-events-none absolute z-20 -translate-x-1/2 rounded-full bg-[#2F8F5C] px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.12em] text-white shadow-sm"
                      style={{ left: `${todayPct}%`, top: 4 }}
                    >
                      Today
                    </div>
                  )}

                  {/* Rows */}
                  {renderItems.map((item, idx) => (
                    <TimelineRowRender
                      key={timelineKey(item, idx)}
                      item={item}
                      window={timeWindow}
                      onOpenTask={openTask}
                    />
                  ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Mobile — list view (timeline hidden; bars fall back to inline) */}
          <Card className="md:hidden">
            <CardContent className="p-0">
              <ul className="divide-y divide-[#EFEBE0]">
                {renderItems.map((item, idx) => (
                  <MobileRow
                    key={`m-${leftKey(item, idx)}`}
                    item={item}
                    zones={zones}
                    canEdit={canEdit}
                    onToggleCollapse={() =>
                      item.task && toggleCollapsed(item.task.id)
                    }
                    onEditPhase={() =>
                      item.task && setPhaseToEdit(item.task)
                    }
                    onAddSubTask={() => {
                      const a = item.task ?? item.parentAnchor;
                      if (a) setTasksModalAnchor(a);
                    }}
                    onOpenTask={() =>
                      item.task && openTask(item.task)
                    }
                    onSubmitInlineAdd={(name) =>
                      item.parentAnchor && createSubTask(item.parentAnchor, name)
                    }
                    onCancelInlineAdd={() => setAddingFor(null)}
                  />
                ))}
              </ul>
            </CardContent>
          </Card>
        </>
      )}

      <TaskDrawer
        task={drawerMode === 'edit' ? drawerTask : null}
        isOpen={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          hydratedRef.current = null;
          onDrawerClose?.();
        }}
        onSave={onSaveTask}
        onCreate={handleCreateTask}
        onDelete={onDeleteTask}
        zones={zones}
        projectId={project.id}
        currentUser={currentUser}
        readOnly={!canEdit}
        canDelete={canDelete && !(drawerTask?.isPhaseAnchor ?? false)}
      />

      {addPhaseOpen && (
        <AddPhaseModal
          onClose={() => setAddPhaseOpen(false)}
          onCreate={createPhase}
        />
      )}

      {tasksModalAnchor && (
        <AddTasksModal
          anchor={tasksModalAnchor}
          catalog={tasksModalAnchor.isCustom ? [] : tasksForPhase(tasksModalAnchor.phase)}
          existingNames={new Set(
            tasks
              .filter((t) => t.parentTaskId === tasksModalAnchor.id)
              .map((t) => t.name.trim().toLowerCase()),
          )}
          onClose={() => setTasksModalAnchor(null)}
          onConfirm={async (names) => {
            for (const n of names) {
              // eslint-disable-next-line no-await-in-loop
              await createSubTask(tasksModalAnchor, n);
            }
            setTasksModalAnchor(null);
          }}
        />
      )}

      {phaseToEdit && (
        <PhaseEditModal
          anchor={phaseToEdit}
          tasks={tasks}
          canEdit={canEdit}
          onClose={() => setPhaseToEdit(null)}
          onSaveTask={onSaveTask}
          onCreateTask={onCreateTask}
          onDeleteTask={onDeleteTask}
          projectId={project.id}
        />
      )}

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

// Stable React keys for the two parallel iterations.
function leftKey(item: RenderItem, idx: number): string {
  if (item.kind === 'anchor' && item.task) return `a-${item.task.id}`;
  if (item.kind === 'child' && item.task) return `c-${item.task.id}`;
  if (item.kind === 'inline-add' && item.parentAnchor) return `add-${item.parentAnchor.id}`;
  if (item.kind === 'empty' && item.parentAnchor) return `e-${item.parentAnchor.id}`;
  return `i-${idx}`;
}
function timelineKey(item: RenderItem, idx: number): string {
  return `t-${leftKey(item, idx)}`;
}

// ─── Left pane row (desktop) ─────────────────────────────────────────────────

function LeftRowRender({
  item, zones, isSelected, selectMode, canEdit,
  onToggleCollapse, onAddSubTask, onEditPhase, onDeletePhase, onOpenTask,
  onSubmitInlineAdd, onCancelInlineAdd,
}: {
  item: RenderItem;
  zones: Zone[];
  isSelected: boolean;
  selectMode: boolean;
  canEdit: boolean;
  onToggleCollapse: () => void;
  onAddSubTask: () => void;
  onEditPhase: () => void;
  onDeletePhase: () => void;
  onOpenTask: () => void;
  onSubmitInlineAdd: (name: string) => void;
  onCancelInlineAdd: () => void;
}) {
  if (item.kind === 'anchor' && item.task) {
    return (
      <LeftAnchorRow
        anchor={item.task}
        rolledPct={item.rolledPct ?? 0}
        isCollapsed={item.isCollapsed ?? false}
        onToggle={onToggleCollapse}
        onAddSubTask={canEdit ? onAddSubTask : undefined}
        onEdit={item.task.isCustom ? undefined : onEditPhase}
        onDelete={canEdit && item.task.isCustom ? onDeletePhase : undefined}
      />
    );
  }
  if (item.kind === 'child' && item.task) {
    return (
      <LeftChildRow
        task={item.task}
        zones={zones}
        isSelected={isSelected}
        selectMode={selectMode}
        onOpen={onOpenTask}
      />
    );
  }
  if (item.kind === 'inline-add' && item.parentAnchor) {
    return (
      <InlineAddRow
        anchor={item.parentAnchor}
        onSubmit={onSubmitInlineAdd}
        onCancel={onCancelInlineAdd}
      />
    );
  }
  if (item.kind === 'empty') {
    return (
      <div
        className="flex items-center pl-9 pr-3"
        style={{ height: ROW_HEIGHT_PX }}
      >
        {canEdit ? (
          <button
            type="button"
            onClick={onAddSubTask}
            className="inline-flex items-center gap-1 rounded text-[11px] text-[#6B6B6B] transition-colors hover:text-[#246F47]"
          >
            <Plus className="h-3 w-3" />
            {item.emptyLabel}
          </button>
        ) : (
          <span className="text-[11px] text-[#A0A0A0]">{item.emptyLabel}</span>
        )}
      </div>
    );
  }
  return null;
}

function LeftAnchorRow({
  anchor, rolledPct, isCollapsed, onToggle, onAddSubTask, onEdit, onDelete,
}: {
  anchor: Task;
  rolledPct: number;
  isCollapsed: boolean;
  onToggle: () => void;
  onAddSubTask?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const disp = phaseDisplay(anchor);
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <div
      className="group flex items-center gap-1.5 border-b border-[#EFEBE0] bg-white px-2 hover:bg-[#FAF8F2]"
      style={{ height: ROW_HEIGHT_PX }}
    >
      <button
        type="button"
        onClick={onToggle}
        className="inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded text-[#6B6B6B] hover:bg-[#EFEBE0] hover:text-[#3A3A3A]"
        aria-label={isCollapsed ? 'Expand phase' : 'Collapse phase'}
      >
        {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>
      <span
        aria-hidden
        className="inline-block h-2 w-2 flex-shrink-0 rounded-full"
        style={{ backgroundColor: disp.color }}
      />
      <div className="min-w-0 flex-1">
        <p className={`truncate text-[13px] font-semibold leading-tight text-[#1A1A1A] ${anchor.isCustom ? '' : 'capitalize'}`}>{disp.label}</p>
        <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-[#EFEBE0]">
          <div
            className="h-full rounded-full transition-[width] duration-700 ease-out"
            style={{ width: `${rolledPct}%`, backgroundColor: disp.color }}
          />
        </div>
      </div>
      {confirmDelete ? (
        <span className="flex flex-shrink-0 items-center gap-1">
          <span className="text-[10px] text-[#C44545]">Delete?</span>
          <button type="button" onClick={() => { setConfirmDelete(false); onDelete?.(); }} className="inline-flex h-6 items-center rounded bg-[#C44545] px-1.5 text-[10px] font-semibold text-white hover:bg-[#A93636]">Yes</button>
          <button type="button" onClick={() => setConfirmDelete(false)} className="inline-flex h-6 items-center rounded border border-[#E6E1D4] px-1.5 text-[10px] font-medium text-[#6B6B6B] hover:bg-[#FAF8F2]">No</button>
        </span>
      ) : (
        <>
          <span className="flex-shrink-0 tabular-nums text-[11px] font-semibold text-[#3A3A3A]">
            <CountUp value={rolledPct} />%
          </span>
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex h-6 w-6 flex-shrink-0 scale-95 items-center justify-center rounded text-[#A0A0A0] opacity-0 transition-all hover:bg-[#E5F2EA] hover:text-[#246F47] group-hover:scale-100 group-hover:opacity-100 focus:scale-100 focus:opacity-100"
              aria-label={`Manage ${disp.label} phase`}
              title="Manage phase"
            >
              <Pencil className="h-3 w-3" />
            </button>
          )}
          {onAddSubTask && (
            <button
              type="button"
              onClick={onAddSubTask}
              className="inline-flex h-6 w-6 flex-shrink-0 scale-95 items-center justify-center rounded text-[#A0A0A0] opacity-0 transition-all hover:bg-[#E5F2EA] hover:text-[#246F47] group-hover:scale-100 group-hover:opacity-100 focus:scale-100 focus:opacity-100"
              aria-label={`Add sub-task to ${disp.label}`}
              title="Add sub-task"
            >
              <Plus className="h-3 w-3" />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="inline-flex h-6 w-6 flex-shrink-0 scale-95 items-center justify-center rounded text-[#A0A0A0] opacity-0 transition-all hover:bg-[#FBE5E5] hover:text-[#C44545] group-hover:scale-100 group-hover:opacity-100 focus:scale-100 focus:opacity-100"
              aria-label={`Delete ${disp.label} phase`}
              title="Delete phase"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </>
      )}
    </div>
  );
}

function LeftChildRow({
  task, zones, isSelected, selectMode, onOpen,
}: {
  task: Task;
  zones: Zone[];
  isSelected: boolean;
  selectMode: boolean;
  onOpen: () => void;
}) {
  const aiSignal = useTaskAiSignal(task.id);
  const [shimmer, setShimmer] = useState(false);
  const lastSampleRef = useRef(aiSignal.sampleSize);
  const zone = zones.find((z) => z.id === task.zoneId);

  // Trigger the shimmer when a new ai_analyses row lands for this task. The
  // old "currently analysing" pulse used the mock runner's transient store;
  // real AI is fire-and-forget server-side, so the sample-size increment is
  // now the only observable "AI just touched this task" signal.
  useEffect(() => {
    const grew = aiSignal.sampleSize > lastSampleRef.current;
    lastSampleRef.current = aiSignal.sampleSize;
    if (grew) {
      setShimmer(true);
      const t = setTimeout(() => setShimmer(false), 1200);
      return () => clearTimeout(t);
    }
  }, [aiSignal.sampleSize]);

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex w-full items-center gap-1.5 border-b border-[#EFEBE0] px-2 pl-8 text-left transition-colors ${
        isSelected ? 'bg-[#E5F2EA] hover:bg-[#D6EADE]' : 'hover:bg-[#FAF8F2]'
      }`}
      style={{ height: ROW_HEIGHT_PX }}
    >
      {selectMode && (
        isSelected
          ? <CheckSquare className="h-3.5 w-3.5 flex-shrink-0 text-[#246F47]" />
          : <Square className="h-3.5 w-3.5 flex-shrink-0 text-[#A0A0A0]" />
      )}
      <span
        className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${STATUS_DOT[task.status]}`}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate text-[12px] text-[#3A3A3A]">{task.name}</span>
          {isAtRisk(task) && <AlertTriangle className="h-3 w-3 flex-shrink-0 text-[#C8841E]" aria-label="At risk" />}
          {aiSignal.sampleSize > 0 && (
            <span
              className={`inline-flex flex-shrink-0 items-center gap-0.5 rounded px-1 text-[10px] font-medium text-[#6B3FA0] ${
                shimmer
                  ? 'animate-ai-shimmer bg-gradient-to-r from-[#EFE7FB] via-[#DCC8F0] to-[#EFE7FB]'
                  : 'bg-[#EFE7FB]'
              }`}
              title={`AI signal across ${aiSignal.sampleSize} analyses`}
            >
              <Sparkles className="h-2.5 w-2.5" />
              {aiSignal.signalPct}
            </span>
          )}
          {zone && (
            <span
              className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
              style={{ backgroundColor: zone.colorCode }}
              title={zone.name}
            />
          )}
        </div>
        <div className="mt-1 flex items-center gap-1.5">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-[#EFEBE0]">
            <div
              className={`h-full rounded-full transition-[width] duration-700 ease-out ${STATUS_BAR_BG[task.status]}`}
              style={{ width: `${task.percentComplete}%` }}
            />
          </div>
          <span className="flex-shrink-0 tabular-nums text-[10px] text-[#A0A0A0]">{task.percentComplete}%</span>
        </div>
      </div>
    </button>
  );
}

// ─── Right pane row (desktop) ────────────────────────────────────────────────

function TimelineRowRender({
  item, window, onOpenTask,
}: {
  item: RenderItem;
  window: TimeWindow;
  onOpenTask?: (t: Task) => void;
}) {
  // Empty / inline-add rows on the right pane get just a blank slot so the
  // vertical alignment with the left pane holds.
  if (item.kind === 'empty' || item.kind === 'inline-add') {
    return (
      <div
        className="border-b border-[#EFEBE0]"
        style={{ height: ROW_HEIGHT_PX }}
      />
    );
  }

  if (!item.task) return null;

  const pos = taskBarPosition(item.task, window);
  const leftPct = Math.max(0, Math.min(100, pos.leftPct));
  const widthPct = Math.max(0.5, Math.min(100 - leftPct, pos.widthPct));

  // ── Phase anchor — slim tinted band; built-in palette or custom colour. ──
  if (item.kind === 'anchor') {
    const rolled = item.rolledPct ?? 0;
    const disp = phaseDisplay(item.task);
    return (
      <div
        className="relative border-b border-[#EFEBE0] bg-white"
        style={{ height: ROW_HEIGHT_PX }}
      >
        <div
          className="absolute top-1/2 -translate-y-1/2 overflow-hidden rounded-md"
          style={{
            left: `${leftPct}%`,
            width: `${widthPct}%`,
            height: 18,
            borderWidth: 1,
            borderStyle: 'solid',
            borderColor: disp.color,
            backgroundColor: disp.tint,
          }}
          title={`${disp.label} · ${rolled}%`}
        >
          <div
            className="h-full transition-[width] duration-700 ease-out"
            style={{ width: `${rolled}%`, backgroundColor: disp.fill }}
          />
        </div>
        {widthPct < 90 && (
          <span
            className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-[10px] font-semibold tabular-nums"
            style={{ left: `calc(${leftPct + widthPct}% + 6px)`, color: disp.color }}
          >
            {rolled}%
          </span>
        )}
      </div>
    );
  }

  // ── Child task — slim status bar (original look), kept clickable → drawer.
  //    % shows beside; at-risk tasks always surface a ⚠ there too. ──
  const task = item.task;
  const atRisk = isAtRisk(task);
  const clickable = !!onOpenTask;
  const showMeta = widthPct < 86 || atRisk;
  return (
    <div
      className="relative border-b border-[#EFEBE0]"
      style={{ height: ROW_HEIGHT_PX }}
    >
      <button
        type="button"
        disabled={!clickable}
        onClick={clickable ? () => onOpenTask!(task) : undefined}
        className={`absolute top-1/2 -translate-y-1/2 overflow-hidden rounded bg-[#E6E1D4]/70 ${
          clickable ? 'cursor-pointer transition-shadow hover:shadow-[0_1px_5px_rgba(20,20,20,0.18)]' : 'cursor-default'
        }`}
        style={{ left: `${leftPct}%`, width: `${widthPct}%`, height: 12 }}
        title={`${task.name} · ${task.percentComplete}%`}
      >
        <div
          className={`h-full transition-[width] duration-700 ease-out ${STATUS_BAR_BG[task.status]}`}
          style={{ width: `${task.percentComplete}%` }}
        />
      </button>
      {showMeta && (
        <span
          className="pointer-events-none absolute top-1/2 flex -translate-y-1/2 items-center gap-1 text-[10px] font-medium tabular-nums text-[#A0A0A0]"
          style={{ left: `calc(${leftPct + widthPct}% + 6px)` }}
        >
          {task.percentComplete}%
          {atRisk && <AlertTriangle className="h-3 w-3 flex-shrink-0 text-[#C8841E]" aria-label="At risk" />}
        </span>
      )}
    </div>
  );
}

// ─── Mobile row (single column, timeline collapsed) ──────────────────────────

function MobileRow({
  item, zones, canEdit,
  onToggleCollapse, onEditPhase, onAddSubTask, onOpenTask,
  onSubmitInlineAdd, onCancelInlineAdd,
}: {
  item: RenderItem;
  zones: Zone[];
  canEdit: boolean;
  onToggleCollapse: () => void;
  onEditPhase: () => void;
  onAddSubTask: () => void;
  onOpenTask: () => void;
  onSubmitInlineAdd: (name: string) => void;
  onCancelInlineAdd: () => void;
}) {
  if (item.kind === 'anchor' && item.task) {
    const rolled = item.rolledPct ?? 0;
    const disp = phaseDisplay(item.task);
    return (
      <li className="flex items-center gap-2 bg-white px-3 py-2.5">
        <button
          type="button"
          onClick={onToggleCollapse}
          className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-[#6B6B6B] hover:bg-[#EFEBE0]"
          aria-label={item.isCollapsed ? 'Expand phase' : 'Collapse phase'}
        >
          {item.isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        <div className="min-w-0 flex-1">
          <p className={`flex items-center gap-1.5 truncate text-sm font-semibold text-[#1A1A1A] ${item.task.isCustom ? '' : 'capitalize'}`}>
            <span
              aria-hidden
              className="inline-block h-2 w-2 flex-shrink-0 rounded-full"
              style={{ backgroundColor: disp.color }}
            />
            {disp.label}
          </p>
          <div className="mt-1 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#EFEBE0]">
              <div
                className="h-1.5 rounded-full transition-[width] duration-700 ease-out"
                style={{
                  width: `${rolled}%`,
                  backgroundColor: disp.color,
                }}
              />
            </div>
            <span className="tabular-nums text-[11px] text-[#6B6B6B]"><CountUp value={rolled} />%</span>
          </div>
        </div>
        {!item.task.isCustom && (
          <button
            type="button"
            onClick={onEditPhase}
            className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-[#A0A0A0] hover:bg-[#E5F2EA] hover:text-[#246F47]"
            aria-label="Manage phase"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
        {canEdit && (
          <button
            type="button"
            onClick={onAddSubTask}
            className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-[#A0A0A0] hover:bg-[#E5F2EA] hover:text-[#246F47]"
            aria-label="Add sub-task"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </li>
    );
  }
  if (item.kind === 'child' && item.task) {
    const task = item.task;
    const zone = zones.find((z) => z.id === task.zoneId);
    return (
      <li>
        <button
          type="button"
          onClick={onOpenTask}
          className="flex w-full items-center gap-2 px-3 py-2 pl-9 text-left hover:bg-[#FAF8F2]"
        >
          <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${STATUS_DOT[task.status]}`} />
          <span className="min-w-0 flex-1 truncate text-[13px] text-[#3A3A3A]">{task.name}</span>
          {isAtRisk(task) && <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 text-[#C8841E]" aria-label="At risk" />}
          <span className="flex-shrink-0 tabular-nums text-[11px] text-[#6B6B6B]">{task.percentComplete}%</span>
          {zone && (
            <span
              className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
              style={{ backgroundColor: zone.colorCode }}
              title={zone.name}
            />
          )}
        </button>
      </li>
    );
  }
  if (item.kind === 'inline-add' && item.parentAnchor) {
    return (
      <InlineAddRow
        anchor={item.parentAnchor}
        onSubmit={onSubmitInlineAdd}
        onCancel={onCancelInlineAdd}
      />
    );
  }
  if (item.kind === 'empty') {
    return (
      <li className="px-3 py-2 pl-9 text-[11px] text-[#A0A0A0]">
        {item.emptyLabel}
      </li>
    );
  }
  return null;
}

// ─── Inline add-sub-task row ──────────────────────────────────────────────────

function InlineAddRow({
  anchor, onSubmit, onCancel,
}: {
  anchor: Task;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  return (
    <div
      className="flex items-center gap-1.5 border-b border-[#EFEBE0] bg-[#E5F2EA]/40 px-2 pl-8"
      style={{ height: ROW_HEIGHT_PX }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onSubmit(name);
        }}
        className="flex w-full items-center gap-1.5"
      >
        <Plus className="h-3 w-3 flex-shrink-0 text-[#246F47]" />
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onCancel();
          }}
          placeholder={`Sub-task under ${anchor.phase}…`}
          className="min-w-0 flex-1 rounded border border-[#9DCBB0] bg-white px-2 py-0.5 text-[12px] shadow-sm focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]"
        />
        <button
          type="submit"
          disabled={!name.trim()}
          className="inline-flex h-6 items-center rounded bg-[#2F8F5C] px-2 text-[11px] font-medium text-white hover:bg-[#246F47] disabled:opacity-40"
        >
          Add
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded text-[#A0A0A0] hover:bg-[#EFEBE0]"
          aria-label="Cancel"
        >
          <X className="h-3 w-3" />
        </button>
      </form>
    </div>
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
      <div className="mx-auto flex max-w-3xl flex-col gap-2 rounded-2xl border border-[#E6E1D4] bg-white p-2 shadow-2xl sm:flex-row sm:items-center sm:p-3">
        <div className="flex items-center gap-2 px-2 py-1">
          <span
            className="text-base font-semibold tabular-nums text-[#1A1A1A]"
            style={{ fontFamily: "'Fraunces', Georgia, serif" }}
          >
            {count}
          </span>
          <span className="text-xs text-[#6B6B6B]">selected</span>
          {count > 0 && (
            <button
              type="button"
              onClick={onClear}
              className="ml-1 text-[11px] text-[#A0A0A0] underline-offset-2 hover:text-[#3A3A3A] hover:underline"
            >
              Clear
            </button>
          )}
        </div>

        <div className="-mx-1 overflow-x-auto px-1 sm:mx-0 sm:flex-1 sm:px-0">
          <div className="inline-flex items-center gap-1.5">
            <BulkBtn icon={CalendarRange} label="Shift dates" onClick={() => onAction('shift')} disabled={count === 0 || busy} />
            <BulkBtn icon={Tag} label="Set status" onClick={() => onAction('status')} disabled={count === 0 || busy} />
            <BulkBtn icon={UserIcon} label="Reassign" onClick={() => onAction('assignee')} disabled={count === 0 || busy} />
            {canDelete && (
              <BulkBtn icon={Trash2} label="Delete" onClick={() => onAction('delete')} disabled={count === 0 || busy} tone="danger" />
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="ml-auto inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md text-[#A0A0A0] hover:bg-[#EFEBE0] hover:text-[#6B6B6B] disabled:opacity-40"
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
    ? 'border-[#F0C9C9] text-[#C44545] hover:bg-[#FBE5E5] disabled:border-[#E6E1D4] disabled:text-[#A0A0A0]'
    : 'border-[#E6E1D4] text-[#3A3A3A] hover:bg-[#FAF8F2] disabled:text-[#A0A0A0]';
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

// ─── New phase modal (custom phases) ────────────────────────────────────────

function AddPhaseModal({
  onClose, onCreate,
}: {
  onClose: () => void;
  onCreate: (name: string, startDate: string, endDate: string) => Promise<void> | void;
}) {
  const DAY = 86_400_000;
  const [name, setName] = useState('');
  const [start, setStart] = useState(() => new Date().toISOString().slice(0, 10));
  const [end, setEnd] = useState(() => new Date(Date.now() + 30 * DAY).toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const dateError = end < start ? 'End date is before start date.' : null;
  const canSubmit = name.trim().length > 0 && !dateError && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try { await onCreate(name, start, end); } finally { setBusy(false); }
  };

  return (
    <ModalShell
      title="New phase"
      onClose={onClose}
      body={
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[#6B6B6B]">Phase name</span>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
              placeholder="e.g. Solar & battery"
              className={inputField}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-[#6B6B6B]">Start</span>
              <input
                type="date"
                value={start}
                max={end || undefined}
                onChange={(e) => setStart(e.target.value)}
                className={inputField}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-[#6B6B6B]">End</span>
              <input
                type="date"
                value={end}
                min={start || undefined}
                onChange={(e) => setEnd(e.target.value)}
                className={inputField}
              />
            </label>
          </div>
          {dateError && <p className="text-xs text-[#C44545]">{dateError}</p>}
          <p className="text-[11px] text-[#6B6B6B]">
            Creates a top-level phase you can fill with sub-tasks — its progress rolls up from the sub-tasks you add.
          </p>
        </div>
      }
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={() => void submit()} disabled={!canSubmit}>{busy ? 'Creating…' : 'Create phase'}</Button>
        </>
      }
    />
  );
}

// ─── "Add tasks" picker — multi-select from the phase's catalog + custom add.
// Replaces the old inline free-text "+". Catalog comes from
// `phaseTaskCatalog.ts` (seeded, editable per job/client); custom phases pass an
// empty catalog and get just the custom-add field.
function AddTasksModal({
  anchor, catalog, existingNames, onClose, onConfirm,
}: {
  anchor: Task;
  catalog: string[];
  existingNames: Set<string>;
  onClose: () => void;
  onConfirm: (names: string[]) => Promise<void> | void;
}) {
  const disp = phaseDisplay(anchor);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);

  // Hide catalog entries already added as sub-tasks under this phase.
  const available = useMemo(
    () => catalog.filter((n) => !existingNames.has(n.trim().toLowerCase())),
    [catalog, existingNames],
  );
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? available.filter((n) => n.toLowerCase().includes(q)) : available;
  }, [available, search]);

  const toggle = (name: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });

  const customTrimmed = custom.trim();
  const total = selected.size + (customTrimmed ? 1 : 0);

  const submit = async () => {
    if (total === 0 || busy) return;
    const names = [...selected];
    if (customTrimmed) names.push(customTrimmed);
    setBusy(true);
    try { await onConfirm(names); } finally { setBusy(false); }
  };

  return (
    <ModalShell
      title={`Add tasks · ${disp.label}`}
      onClose={onClose}
      body={
        <div className="space-y-3">
          {catalog.length > 0 ? (
            <>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#A0A0A0]" />
                <input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search tasks…"
                  className="w-full rounded-md border border-[#E6E1D4] bg-white py-2 pl-8 pr-3 text-sm shadow-sm focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]"
                />
              </div>
              <ul className="max-h-60 divide-y divide-[#EFEBE0] overflow-y-auto rounded-md border border-[#E6E1D4]">
                {visible.length === 0 && (
                  <li className="px-3 py-4 text-center text-xs text-[#A0A0A0]">
                    {available.length === 0 ? 'Every preset task is already added.' : `No tasks match “${search}”.`}
                  </li>
                )}
                {visible.map((name) => {
                  const checked = selected.has(name);
                  return (
                    <li key={name}>
                      <button
                        type="button"
                        onClick={() => toggle(name)}
                        className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors ${checked ? 'bg-[#E5F2EA]' : 'hover:bg-[#FAF8F2]'}`}
                      >
                        <span className={`grid h-4 w-4 flex-shrink-0 place-items-center rounded-[5px] border transition-colors ${checked ? 'border-[#2F8F5C] bg-[#2F8F5C] text-white' : 'border-[#D8D2C4] bg-white'}`}>
                          {checked && <Check className="h-3 w-3" strokeWidth={3} />}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[13px] text-[#1A1A1A]">{name}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <p className="text-[11px] text-[#A0A0A0]">No preset tasks for this phase — add a custom one below.</p>
          )}

          <label className="block">
            <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[#6B6B6B]">Add a custom task</span>
            <input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
              placeholder="e.g. Client-specific switchboard relocation"
              className="w-full rounded-md border border-[#E6E1D4] bg-white px-3 py-2 text-sm shadow-sm focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]"
            />
          </label>
        </div>
      }
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={() => void submit()} disabled={total === 0 || busy}>
            {busy ? 'Adding…' : total > 0 ? `Add ${total} task${total === 1 ? '' : 's'}` : 'Add tasks'}
          </Button>
        </>
      }
    />
  );
}

// ─── Bulk action modals (unchanged from prior version) ─────────────────────

function ModalShell({
  title, body, footer, onClose,
}: {
  title: string;
  body: React.ReactNode;
  footer: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#1A1A1A]/40 p-2 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90dvh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl sm:max-h-none"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-[#EFEBE0] px-5 py-4">
          <h3 className="text-base font-semibold text-[#1A1A1A]">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-[#A0A0A0] hover:bg-[#EFEBE0] hover:text-[#6B6B6B]"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="editorial-scrollbox flex-1 px-5 py-4">{body}</div>
        <footer className="flex flex-shrink-0 items-center justify-end gap-2 border-t border-[#EFEBE0] px-5 py-3">
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
          <p className="text-sm text-[#6B6B6B]">
            Move <strong>{count}</strong> task{count === 1 ? '' : 's'} by the chosen interval.
            Both start and end dates shift together.
          </p>
          <div className="flex items-center gap-2">
            <div className="inline-flex items-center rounded-full border border-[#E6E1D4] p-1">
              {(['back', 'forward'] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDirection(d)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    direction === d ? 'bg-[#1A1A1A] text-white' : 'text-[#6B6B6B] hover:bg-[#FAF8F2]'
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
                className="w-20 rounded-md border border-[#E6E1D4] px-3 py-2 text-center text-sm tabular-nums shadow-sm focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]"
              />
              <span className="text-sm text-[#6B6B6B]">days</span>
            </div>
          </div>
          <p className="rounded-md bg-[#FAF8F2] px-3 py-2 text-xs text-[#6B6B6B]">
            <strong>Preview:</strong>{' '}
            {finalDays === 0
              ? 'No change.'
              : `${count} task${count === 1 ? '' : 's'} will shift ${Math.abs(finalDays)} day${Math.abs(finalDays) === 1 ? '' : 's'} ${finalDays > 0 ? 'forward' : 'earlier'}.`}
          </p>
        </div>
      }
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button size="sm" onClick={() => onConfirm(finalDays)} disabled={busy || finalDays === 0}>
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
          <p className="text-sm text-[#6B6B6B]">
            Set the status for <strong>{count}</strong> task{count === 1 ? '' : 's'}.
            Marking as <em>Complete</em> sets % to 100; <em>Not Started</em> resets to 0.
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {STATUS_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  status === opt.value
                    ? 'border-[#1A1A1A] bg-[#FAF8F2]'
                    : 'border-[#E6E1D4] hover:border-[#D6CDB7] hover:bg-[#FAF8F2]'
                }`}
              >
                <input
                  type="radio"
                  name="bulk-status"
                  value={opt.value}
                  checked={status === opt.value}
                  onChange={() => setStatus(opt.value)}
                  className="h-3.5 w-3.5 accent-[#2F8F5C]"
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
          <Button variant="outline" size="sm" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button size="sm" onClick={() => onConfirm(status)} disabled={busy}>
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
          <p className="text-sm text-[#6B6B6B]">
            Assign <strong>{count}</strong> task{count === 1 ? '' : 's'} to a user.
          </p>
          <input
            type="text"
            value={assigneeId}
            onChange={(e) => setAssigneeId(e.target.value)}
            placeholder="user_id (e.g. usr_4f2a)"
            className="block w-full rounded-md border border-[#E6E1D4] px-3 py-2 text-sm shadow-sm focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]"
          />
          {candidates.length > 0 && (
            <div>
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-[#6B6B6B]">
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
                        ? 'border-[#1A1A1A] bg-[#1A1A1A] text-white'
                        : 'border-[#E6E1D4] text-[#6B6B6B] hover:border-[#D6CDB7] hover:bg-[#FAF8F2]'
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
                      ? 'border-[#1A1A1A] bg-[#1A1A1A] text-white'
                      : 'border-[#E6E1D4] text-[#6B6B6B] hover:border-[#D6CDB7] hover:bg-[#FAF8F2]'
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
          <Button variant="outline" size="sm" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button size="sm" onClick={() => onConfirm(assigneeId.trim())} disabled={busy}>
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
          <p className="text-sm text-[#6B6B6B]">
            This permanently removes the selected tasks and any photos / comments
            attached to them. Phase anchors are skipped automatically.
            To confirm, type{' '}
            <span className="rounded bg-[#EFEBE0] px-1.5 py-0.5 font-mono text-xs">{required}</span>{' '}
            below.
          </p>
          <input
            type="text"
            inputMode="numeric"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={required}
            className="block w-full rounded-md border border-[#E6E1D4] bg-white px-3 py-2 text-sm tabular-nums shadow-sm focus:border-[#C44545] focus:outline-none focus:ring-1 focus:ring-[#C44545]"
          />
        </div>
      }
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose} disabled={busy}>Cancel</Button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy || !matches}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#C44545] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#B03D3D] active:bg-[#9A3535] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
            {busy ? 'Deleting…' : `Delete ${count}`}
          </button>
        </>
      }
    />
  );
}

// Helper to silence unused-imports linter for Card on the mobile-fallback path
// (Card is consumed by both desktop and mobile branches above — kept here so
// the import line stays visibly necessary).
export type _TasksTabCardRef = typeof Card;

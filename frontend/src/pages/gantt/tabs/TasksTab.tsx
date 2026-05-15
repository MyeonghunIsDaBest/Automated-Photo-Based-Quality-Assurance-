import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CalendarRange, CheckCheck, CheckSquare, ChevronDown, ChevronRight,
  Lock, Pencil, Plus, Sparkles, Square, Tag, Trash2,
  User as UserIcon, X,
} from 'lucide-react';
import { parseISO } from 'date-fns';
import {
  type Task, type TaskStatus, type Zone, type User, type Project,
  type ConstructionPhase, rolledUpPct,
} from '../../../types';
import { Card, CardContent } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import TaskDrawer from './TaskDrawer';
import { TabHeader } from '../components/TabHeader';
import { EmptyState } from '../components/EmptyState';
import MockAnalysisButton from '../../../components/mockAi/MockAnalysisButton';
import { useTaskAiSignal } from '../../../lib/hooks/useTaskAiSignal';
import { useMockAiUiStore } from '../../../store/mockAiUi';
import CountUp from '../../../components/ui/CountUp';
import {
  makeTimeWindow, monthHeaders, dayHeaders, weekHeaders, quarterHeaders,
  weekendIntervals, taskBarPosition, xPositionPct,
  type GanttZoom, type TimeWindow,
} from '../../../lib/construction/ganttLayout';
import GanttToolbar from '../../../components/ui/GanttToolbar';
import PhaseEditModal from './PhaseEditModal';

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
  not_started: 'bg-slate-400',
  in_progress: 'bg-blue-500',
  complete:    'bg-emerald-500',
  delayed:     'bg-red-500',
  blocked:     'bg-amber-500',
};

const STATUS_BAR_BG: Record<TaskStatus, string> = {
  not_started: 'bg-slate-300',
  in_progress: 'bg-blue-400',
  complete:    'bg-emerald-500',
  delayed:     'bg-red-400',
  blocked:     'bg-amber-400',
};

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

// Each Gantt row is exactly 36px tall so the left list pane and the right
// timeline pane stay in sync without absolute-positioning gymnastics.
const ROW_HEIGHT_PX = 36;

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
  const { anchorsByPhase, orphanTasks } = useMemo(() => {
    const anchors = new Map<ConstructionPhase, Task>();
    const orphans: Task[] = [];
    for (const t of tasks) {
      if (t.isPhaseAnchor) anchors.set(t.phase, t);
      else if (!t.parentTaskId) orphans.push(t);
    }
    return { anchorsByPhase: anchors, orphanTasks: orphans };
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
    () => PHASE_ORDER
      .map((phase) => anchorsByPhase.get(phase))
      .filter((a): a is Task => !!a),
    [anchorsByPhase],
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
              : 'No sub-tasks yet. Click + to add one.',
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

  const openCreate = () => {
    setDrawerTask(null);
    setDrawerMode('create');
    setDrawerOpen(true);
  };

  const createSubTask = async (anchor: Task, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    await onCreateTask({
      projectId: project.id,
      parentTaskId: anchor.id,
      name: trimmed,
      phase: anchor.phase,
      startDate: anchor.startDate,
      endDate: anchor.endDate,
      durationDays: anchor.durationDays,
      percentComplete: 0,
      status: 'not_started',
      dependencies: [],
      notes: [],
      isPhaseAnchor: false,
    });
    setAddingFor(null);
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
      <TabHeader
        eyebrow={`Workspace · Tasks · ${project.name}`}
        title="Construction schedule"
        description="Eight phases, pre-seeded. Each phase has its canonical milestones — click the pencil to manage progress, or expand to see the timeline."
        action={
          canEdit ? (
            <div className="flex flex-wrap items-center gap-2">
              <MockAnalysisButton projectId={project.id} variant="compact" viewHref="/gantt?tab=review" />
              <Button
                variant={selectMode ? 'default' : 'outline'}
                size="sm"
                onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
              >
                <CheckCheck className="mr-1.5 h-3.5 w-3.5" />
                {selectMode ? `Selecting · ${selected.size}` : 'Select'}
              </Button>
              <Button size="sm" onClick={openCreate}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Other task
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <MockAnalysisButton projectId={project.id} variant="compact" viewHref="/gantt?tab=review" />
              <Badge variant="secondary" className="gap-1.5 px-2.5 py-1 text-[11px]">
                <Lock className="h-3 w-3" />
                Read-only
              </Badge>
            </div>
          )
        }
      />

      {/* Filter chips */}
      <Card className="mb-3">
        <CardContent className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-[11px] text-slate-500">
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
                  className="flex-shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] text-slate-500 hover:text-slate-900"
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
              description="This project hasn't been seeded with the eight construction phases. Try Generate demo project from the Projects page, or create a one-off task."
              action={
                canEdit ? (
                  <Button size="sm" onClick={openCreate}>
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    Create task
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
                  className="flex-shrink-0 border-r border-slate-100"
                  style={{ width: LEFT_PANE_WIDTH_PX }}
                >
                  {/* Left header: "Task" label */}
                  <div
                    className="flex items-center border-b border-slate-100 bg-slate-50/60 px-3 text-[10px] font-medium uppercase tracking-wider text-slate-500"
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
                      onAddSubTask={() =>
                        item.task && setAddingFor(item.task.id)
                      }
                      onEditPhase={() =>
                        item.task && setPhaseToEdit(item.task)
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
                <div ref={timelineScrollRef} className="relative min-w-0 flex-1 overflow-hidden">
                  {/* Axis — labels follow the current zoom. The label set
                       cycles between day / week / month / quarter but the
                       positioning math is identical (percentages over the
                       window's totalDays). */}
                  <div
                    className="relative border-b border-slate-100 bg-slate-50/60"
                    style={{ height: ROW_HEIGHT_PX }}
                  >
                    {zoom === 'day' && days.map((d) => (
                      <div
                        key={d.label}
                        className={`absolute top-0 flex h-full items-center justify-center border-l border-slate-100 text-[10px] font-medium tabular-nums ${
                          d.isWeekend ? 'text-slate-400' : 'text-slate-600'
                        }`}
                        style={{ left: `${d.leftPct}%`, width: `${d.widthPct}%` }}
                        title={d.label}
                      >
                        {d.short}
                      </div>
                    ))}
                    {zoom === 'week' && weeks.map((w) => (
                      <div
                        key={`${w.short}-${w.leftPct}`}
                        className="absolute top-0 flex h-full items-center border-l border-slate-100 px-2 text-[10px] font-medium uppercase tracking-wider text-slate-500"
                        style={{ left: `${w.leftPct}%`, width: `${w.widthPct}%` }}
                        title={w.label}
                      >
                        {w.short}
                      </div>
                    ))}
                    {zoom === 'month' && months.map((m) => (
                      <div
                        key={m.label}
                        className="absolute top-0 flex h-full items-center border-l border-slate-100 px-2 text-[10px] font-medium uppercase tracking-wider text-slate-500"
                        style={{ left: `${m.leftPct}%`, width: `${m.widthPct}%` }}
                      >
                        {m.short}
                      </div>
                    ))}
                    {zoom === 'quarter' && quarters.map((q) => (
                      <div
                        key={`${q.short}-${q.leftPct}`}
                        className="absolute top-0 flex h-full items-center border-l border-slate-100 px-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500"
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
                      className="pointer-events-none absolute z-0 bg-slate-100/60"
                      style={{
                        left: `${w.leftPct}%`,
                        width: `${w.widthPct}%`,
                        top: ROW_HEIGHT_PX,
                        bottom: 0,
                      }}
                      aria-hidden
                    />
                  ))}

                  {/* Today vertical line — soft pulse so it reads as alive,
                       not stuck. Gradient avoids the static "is it broken?" feel. */}
                  {todayVisible && (
                    <div
                      ref={todayLineRef}
                      data-today-line
                      className="pointer-events-none absolute z-10 w-px animate-today-pulse bg-gradient-to-b from-emerald-500/0 via-emerald-500/70 to-emerald-500/0"
                      style={{
                        left: `${todayPct}%`,
                        top: ROW_HEIGHT_PX,
                        bottom: 0,
                      }}
                      aria-hidden="true"
                      title="Today"
                    />
                  )}

                  {/* Rows */}
                  {renderItems.map((item, idx) => (
                    <TimelineRowRender
                      key={timelineKey(item, idx)}
                      item={item}
                      window={timeWindow}
                    />
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Mobile — list view (timeline hidden; bars fall back to inline) */}
          <Card className="md:hidden">
            <CardContent className="p-0">
              <ul className="divide-y divide-slate-100">
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
                    onAddSubTask={() =>
                      item.task && setAddingFor(item.task.id)
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
        onCreate={onCreateTask}
        onDelete={onDeleteTask}
        zones={zones}
        projectId={project.id}
        currentUser={currentUser}
        readOnly={!canEdit}
        canDelete={canDelete && !(drawerTask?.isPhaseAnchor ?? false)}
      />

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
  onToggleCollapse, onAddSubTask, onEditPhase, onOpenTask,
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
        onEdit={onEditPhase}
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
        className="flex items-center pl-9 pr-3 text-[11px] text-slate-400"
        style={{ height: ROW_HEIGHT_PX }}
      >
        {item.emptyLabel}
      </div>
    );
  }
  return null;
}

function LeftAnchorRow({
  anchor, rolledPct, isCollapsed, onToggle, onAddSubTask, onEdit,
}: {
  anchor: Task;
  rolledPct: number;
  isCollapsed: boolean;
  onToggle: () => void;
  onAddSubTask?: () => void;
  onEdit: () => void;
}) {
  return (
    <div
      className="group flex items-center gap-1.5 border-b border-slate-100 bg-white px-2 hover:bg-slate-50"
      style={{ height: ROW_HEIGHT_PX }}
    >
      <button
        type="button"
        onClick={onToggle}
        className="inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded text-slate-500 hover:bg-slate-100 hover:text-slate-700"
        aria-label={isCollapsed ? 'Expand phase' : 'Collapse phase'}
      >
        {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>
      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold capitalize text-slate-900">
        {anchor.phase}
      </span>
      <span className="flex-shrink-0 tabular-nums text-[11px] font-medium text-slate-700">
        <CountUp value={rolledPct} />%
      </span>
      <button
        type="button"
        onClick={onEdit}
        className="inline-flex h-6 w-6 flex-shrink-0 scale-95 items-center justify-center rounded text-slate-400 opacity-0 transition-all hover:bg-emerald-50 hover:text-emerald-700 group-hover:scale-100 group-hover:opacity-100 focus:scale-100 focus:opacity-100"
        aria-label={`Manage ${anchor.phase} phase`}
        title="Manage phase"
      >
        <Pencil className="h-3 w-3" />
      </button>
      {onAddSubTask && (
        <button
          type="button"
          onClick={onAddSubTask}
          className="inline-flex h-6 w-6 flex-shrink-0 scale-95 items-center justify-center rounded text-slate-400 opacity-0 transition-all hover:bg-emerald-50 hover:text-emerald-700 group-hover:scale-100 group-hover:opacity-100 focus:scale-100 focus:opacity-100"
          aria-label={`Add sub-task to ${anchor.phase}`}
          title="Add sub-task"
        >
          <Plus className="h-3 w-3" />
        </button>
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
  const isAnalysing = useMockAiUiStore((s) => s.currentlyAnalysingTaskId === task.id);
  const [shimmer, setShimmer] = useState(false);
  const lastSampleRef = useRef(aiSignal.sampleSize);
  const zone = zones.find((z) => z.id === task.zoneId);

  useEffect(() => {
    const grew = aiSignal.sampleSize > lastSampleRef.current;
    lastSampleRef.current = aiSignal.sampleSize;
    if (isAnalysing || grew) {
      setShimmer(true);
      const t = setTimeout(() => setShimmer(false), 1200);
      return () => clearTimeout(t);
    }
  }, [isAnalysing, aiSignal.sampleSize]);

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex w-full items-center gap-1.5 border-b border-slate-100 px-2 pl-8 text-left transition-colors ${
        isSelected ? 'bg-emerald-50 hover:bg-emerald-100' : 'hover:bg-slate-50'
      }`}
      style={{ height: ROW_HEIGHT_PX }}
    >
      {selectMode && (
        isSelected
          ? <CheckSquare className="h-3.5 w-3.5 flex-shrink-0 text-emerald-600" />
          : <Square className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
      )}
      <span
        className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${STATUS_DOT[task.status]}`}
        aria-hidden
      />
      <span className="min-w-0 flex-1 truncate text-[12px] text-slate-700">
        {task.name}
      </span>
      {aiSignal.sampleSize > 0 && (
        <span
          className={`inline-flex flex-shrink-0 items-center gap-0.5 rounded px-1 text-[10px] font-medium text-violet-700 ${
            shimmer
              ? 'animate-ai-shimmer bg-gradient-to-r from-violet-50 via-violet-200 to-violet-50'
              : 'bg-violet-50'
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
    </button>
  );
}

// ─── Right pane row (desktop) ────────────────────────────────────────────────

function TimelineRowRender({
  item, window,
}: {
  item: RenderItem;
  window: TimeWindow;
}) {
  // Empty / inline-add rows on the right pane get just a blank slot so the
  // vertical alignment with the left pane holds.
  if (item.kind === 'empty' || item.kind === 'inline-add') {
    return (
      <div
        className="border-b border-slate-100"
        style={{ height: ROW_HEIGHT_PX }}
      />
    );
  }

  if (!item.task) return null;

  const pos = taskBarPosition(item.task, window);
  const leftPct = Math.max(0, Math.min(100, pos.leftPct));
  const widthPct = Math.max(0.5, Math.min(100 - leftPct, pos.widthPct));

  if (item.kind === 'anchor') {
    const rolled = item.rolledPct ?? 0;
    return (
      <div
        className="relative border-b border-slate-100 bg-white"
        style={{ height: ROW_HEIGHT_PX }}
      >
        <div
          className="absolute top-1/2 -translate-y-1/2 overflow-hidden rounded-md border border-emerald-300 bg-emerald-50"
          style={{
            left: `${leftPct}%`,
            width: `${widthPct}%`,
            height: 18,
          }}
        >
          <div
            className="h-full bg-emerald-400/60 transition-[width] duration-700 ease-out"
            style={{ width: `${rolled}%` }}
          />
        </div>
      </div>
    );
  }

  // child
  const task = item.task;
  return (
    <div
      className="relative border-b border-slate-100"
      style={{ height: ROW_HEIGHT_PX }}
    >
      <div
        className="absolute top-1/2 -translate-y-1/2 overflow-hidden rounded bg-slate-200/70"
        style={{
          left: `${leftPct}%`,
          width: `${widthPct}%`,
          height: 12,
        }}
        title={`${task.name} · ${task.percentComplete}%`}
      >
        <div
          className={`h-full transition-[width] duration-700 ease-out ${STATUS_BAR_BG[task.status]}`}
          style={{ width: `${task.percentComplete}%` }}
        />
      </div>
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
    return (
      <li className="flex items-center gap-2 bg-white px-3 py-2.5">
        <button
          type="button"
          onClick={onToggleCollapse}
          className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
          aria-label={item.isCollapsed ? 'Expand phase' : 'Collapse phase'}
        >
          {item.isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold capitalize text-slate-900">{item.task.phase}</p>
          <div className="mt-1 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
              <div className="h-1.5 rounded-full bg-emerald-500 transition-[width] duration-700 ease-out" style={{ width: `${rolled}%` }} />
            </div>
            <span className="tabular-nums text-[11px] text-slate-600"><CountUp value={rolled} />%</span>
          </div>
        </div>
        <button
          type="button"
          onClick={onEditPhase}
          className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-emerald-50 hover:text-emerald-700"
          aria-label="Manage phase"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        {canEdit && (
          <button
            type="button"
            onClick={onAddSubTask}
            className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-emerald-50 hover:text-emerald-700"
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
          className="flex w-full items-center gap-2 px-3 py-2 pl-9 text-left hover:bg-slate-50"
        >
          <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${STATUS_DOT[task.status]}`} />
          <span className="min-w-0 flex-1 truncate text-[13px] text-slate-700">{task.name}</span>
          <span className="flex-shrink-0 tabular-nums text-[11px] text-slate-500">{task.percentComplete}%</span>
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
      <li className="px-3 py-2 pl-9 text-[11px] text-slate-400">
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
      className="flex items-center gap-1.5 border-b border-slate-100 bg-emerald-50/40 px-2 pl-8"
      style={{ height: ROW_HEIGHT_PX }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onSubmit(name);
        }}
        className="flex w-full items-center gap-1.5"
      >
        <Plus className="h-3 w-3 flex-shrink-0 text-emerald-600" />
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onCancel();
          }}
          placeholder={`Sub-task under ${anchor.phase}…`}
          className="min-w-0 flex-1 rounded border border-emerald-300 bg-white px-2 py-0.5 text-[12px] shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        />
        <button
          type="submit"
          disabled={!name.trim()}
          className="inline-flex h-6 items-center rounded bg-emerald-600 px-2 text-[11px] font-medium text-white hover:bg-emerald-700 disabled:opacity-40"
        >
          Add
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded text-slate-400 hover:bg-slate-100"
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
          <p className="text-sm text-slate-600">
            Assign <strong>{count}</strong> task{count === 1 ? '' : 's'} to a user.
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
          <p className="text-sm text-slate-600">
            This permanently removes the selected tasks and any photos / comments
            attached to them. Phase anchors are skipped automatically.
            To confirm, type{' '}
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
          <Button variant="outline" size="sm" onClick={onClose} disabled={busy}>Cancel</Button>
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

// Helper to silence unused-imports linter for Card on the mobile-fallback path
// (Card is consumed by both desktop and mobile branches above — kept here so
// the import line stays visibly necessary).
export type _TasksTabCardRef = typeof Card;

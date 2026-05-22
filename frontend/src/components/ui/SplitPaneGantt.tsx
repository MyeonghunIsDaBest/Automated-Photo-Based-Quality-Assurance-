// SplitPaneGantt — read-only schedule visualisation that mirrors the TasksTab
// split-pane look (left list grouped by phase anchor with rolled-up %; right
// timeline with positioned bars, month axis, today line, AI signal chip).
//
// Used by ReviewQueueTab to give the AI-Analysis hub the same rich Gantt
// context the Tasks tab carries, without the editing/inline-add affordances
// of the live editor. The chip shimmer + bar pulse fire when a new
// ai_analyses row lands for a task (sampleSize increment), matching the
// TasksTab behaviour now that real analyze-photo drives the signal.

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Sparkles } from 'lucide-react';
import { rolledUpPct, type Task, type Zone, type TaskStatus } from '../../types';
import { Card, CardContent } from './card';
import {
  makeTimeWindow,
  monthHeaders,
  taskBarPosition,
  xPositionPct,
  type TimeWindow,
} from '../../lib/construction/ganttLayout';
import { useTaskAiSignal } from '../../lib/hooks/useTaskAiSignal';
import { phaseColor } from '../../lib/construction/phaseColors';
import CountUp from './CountUp';

interface SplitPaneGanttProps {
  tasks: Task[];
  zones: Zone[];
  /** Project window start (ISO YYYY-MM-DD or full ISO). */
  startDate: string;
  endDate: string;
  /** Task IDs to outline with the emerald pulse ring — typically a single ID
   *  while a Mock-AI batch walks through analyses. */
  highlightedTaskIds?: string[];
  /** Optional row click — receives the underlying task. Omit to render fully
   *  non-interactive rows. */
  onTaskClick?: (task: Task) => void;
  /** CSS max-height for the scrollable rows area. The month axis stays sticky
   *  at the top so scrolling the body doesn't lose schedule orientation.
   *  Default `60vh`. */
  maxHeight?: string;
}

const ROW_HEIGHT_PX = 36;
const AXIS_HEIGHT_PX = 36;

const STATUS_DOT: Record<TaskStatus, string> = {
  not_started: 'bg-slate-300',
  in_progress: 'bg-blue-500',
  complete:    'bg-emerald-500',
  delayed:     'bg-red-500',
  blocked:     'bg-amber-500',
};

const STATUS_BAR_BG: Record<TaskStatus, string> = {
  not_started: 'bg-slate-400/70',
  in_progress: 'bg-blue-500',
  complete:    'bg-emerald-500',
  delayed:     'bg-red-500',
  blocked:     'bg-amber-500',
};

const HIGHLIGHT_RING =
  'ring-2 ring-emerald-400 ring-offset-1 ring-offset-white animate-pulse';

type Row =
  | { kind: 'anchor'; anchor: Task; rolled: number }
  | { kind: 'child'; task: Task };

export function SplitPaneGantt({
  tasks,
  zones,
  startDate,
  endDate,
  highlightedTaskIds,
  onTaskClick,
  maxHeight = '60vh',
}: SplitPaneGanttProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // Group by phase anchor. Anchors are isPhaseAnchor=true rows with no
  // parentTaskId; children point at anchors via parentTaskId.
  const phases = useMemo(() => {
    const anchors = tasks
      .filter((t) => t.isPhaseAnchor)
      .sort((a, b) => a.startDate.localeCompare(b.startDate));
    return anchors.map((anchor) => ({
      anchor,
      children: tasks
        .filter((t) => t.parentTaskId === anchor.id)
        .sort((a, b) => a.startDate.localeCompare(b.startDate)),
      rolled: rolledUpPct(anchor, tasks),
    }));
  }, [tasks]);

  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];
    for (const p of phases) {
      out.push({ kind: 'anchor', anchor: p.anchor, rolled: p.rolled });
      if (!collapsed.has(p.anchor.id)) {
        for (const c of p.children) out.push({ kind: 'child', task: c });
      }
    }
    return out;
  }, [phases, collapsed]);

  const timeWindow = useMemo(
    () => makeTimeWindow(startDate, endDate),
    [startDate, endDate],
  );
  const months = useMemo(() => monthHeaders(timeWindow), [timeWindow]);
  const todayPct = useMemo(() => xPositionPct(new Date(), timeWindow), [timeWindow]);
  const todayVisible = todayPct >= 0 && todayPct <= 100;

  const highlightSet = useMemo(
    () => new Set(highlightedTaskIds ?? []),
    [highlightedTaskIds],
  );

  const toggleCollapse = (anchorId: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(anchorId)) next.delete(anchorId);
      else next.add(anchorId);
      return next;
    });
  };

  if (phases.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <p className="text-sm text-slate-500">
            No phase anchors on this project yet. Add tasks under the Tasks tab to see them appear here.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        {/* Desktop split-pane */}
        <div
          className="relative hidden overflow-y-auto md:block"
          style={{ maxHeight }}
        >
          <div className="flex">
            {/* Left list pane */}
            <div className="w-[304px] flex-shrink-0 border-r border-slate-200">
              <div
                className="sticky top-0 z-20 border-b border-slate-200 bg-white"
                style={{ height: AXIS_HEIGHT_PX }}
              >
                <p className="flex h-full items-center px-2 text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">
                  Phase · task
                </p>
              </div>
              {rows.map((row, idx) =>
                row.kind === 'anchor' ? (
                  <LeftAnchorRow
                    key={`la-${row.anchor.id}-${idx}`}
                    anchor={row.anchor}
                    rolled={row.rolled}
                    isCollapsed={collapsed.has(row.anchor.id)}
                    onToggle={() => toggleCollapse(row.anchor.id)}
                  />
                ) : (
                  <LeftChildRow
                    key={`lc-${row.task.id}-${idx}`}
                    task={row.task}
                    zones={zones}
                    onClick={onTaskClick ? () => onTaskClick(row.task) : undefined}
                  />
                ),
              )}
            </div>

            {/* Right timeline pane */}
            <div className="relative min-w-0 flex-1">
              {/* Sticky month axis */}
              <div
                className="sticky top-0 z-20 border-b border-slate-100 bg-white"
                style={{ height: AXIS_HEIGHT_PX }}
              >
                {months.map((m) => (
                  <div
                    key={m.label}
                    className="absolute top-0 flex h-full items-center border-l border-slate-100 px-2 text-[10px] font-medium uppercase tracking-wider text-slate-500"
                    style={{ left: `${m.leftPct}%`, width: `${m.widthPct}%` }}
                  >
                    {m.short}
                  </div>
                ))}
              </div>

              {/* Today vertical line — soft pulse, spans below the axis. */}
              {todayVisible && (
                <div
                  className="pointer-events-none absolute z-10 w-px animate-today-pulse bg-gradient-to-b from-emerald-500/0 via-emerald-500/70 to-emerald-500/0"
                  style={{
                    left: `${todayPct}%`,
                    top: AXIS_HEIGHT_PX,
                    bottom: 0,
                  }}
                  aria-hidden
                  title="Today"
                />
              )}

              {rows.map((row, idx) =>
                row.kind === 'anchor' ? (
                  <TimelineAnchorRow
                    key={`ta-${row.anchor.id}-${idx}`}
                    anchor={row.anchor}
                    rolled={row.rolled}
                    window={timeWindow}
                    highlight={highlightSet.has(row.anchor.id)}
                  />
                ) : (
                  <TimelineChildRow
                    key={`tc-${row.task.id}-${idx}`}
                    task={row.task}
                    window={timeWindow}
                    highlight={highlightSet.has(row.task.id)}
                  />
                ),
              )}
            </div>
          </div>
        </div>

        {/* Mobile — single-column grouped list. Timeline pane only renders on
            desktop; phones get a denser phase summary so the entire schedule
            stays one-thumb-scrollable. */}
        <ul className="divide-y divide-slate-100 md:hidden">
          {phases.map((p) => (
            <MobileGroup
              key={`mg-${p.anchor.id}`}
              phase={p}
              isCollapsed={collapsed.has(p.anchor.id)}
              onToggle={() => toggleCollapse(p.anchor.id)}
              onTaskClick={onTaskClick}
            />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

// ─── Left pane rows ─────────────────────────────────────────────────────────

function LeftAnchorRow({
  anchor, rolled, isCollapsed, onToggle,
}: {
  anchor: Task;
  rolled: number;
  isCollapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className="flex items-center gap-1.5 border-b border-slate-100 bg-white px-2 hover:bg-slate-50"
      style={{ height: ROW_HEIGHT_PX }}
    >
      <button
        type="button"
        onClick={onToggle}
        className="inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded text-slate-500 hover:bg-slate-100 hover:text-slate-700"
        aria-label={isCollapsed ? 'Expand phase' : 'Collapse phase'}
      >
        {isCollapsed
          ? <ChevronRight className="h-3.5 w-3.5" />
          : <ChevronDown className="h-3.5 w-3.5" />}
      </button>
      <span
        aria-hidden
        className="inline-block h-2 w-2 flex-shrink-0 rounded-full"
        style={{ backgroundColor: phaseColor(anchor.phase).color }}
      />
      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold capitalize text-slate-900">
        {anchor.phase}
      </span>
      <span className="flex-shrink-0 tabular-nums text-[11px] font-medium text-slate-700">
        <CountUp value={rolled} />%
      </span>
    </div>
  );
}

function LeftChildRow({
  task, zones, onClick,
}: {
  task: Task;
  zones: Zone[];
  onClick?: () => void;
}) {
  const aiSignal = useTaskAiSignal(task.id);
  const [shimmer, setShimmer] = useState(false);
  const lastSampleRef = useRef(aiSignal.sampleSize);
  const zone = zones.find((z) => z.id === task.zoneId);

  useEffect(() => {
    const grew = aiSignal.sampleSize > lastSampleRef.current;
    lastSampleRef.current = aiSignal.sampleSize;
    if (grew) {
      setShimmer(true);
      const t = setTimeout(() => setShimmer(false), 1200);
      return () => clearTimeout(t);
    }
  }, [aiSignal.sampleSize]);

  const content = (
    <>
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
      <span className="flex-shrink-0 tabular-nums text-[10px] text-slate-500">
        {task.percentComplete}%
      </span>
      {zone && (
        <span
          className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
          style={{ backgroundColor: zone.colorCode }}
          title={zone.name}
        />
      )}
    </>
  );

  const baseClass = `flex w-full items-center gap-1.5 border-b border-slate-100 px-2 pl-8 text-left`;
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${baseClass} transition-colors hover:bg-slate-50`}
        style={{ height: ROW_HEIGHT_PX }}
      >
        {content}
      </button>
    );
  }
  return (
    <div className={baseClass} style={{ height: ROW_HEIGHT_PX }}>
      {content}
    </div>
  );
}

// ─── Right pane rows ────────────────────────────────────────────────────────

function TimelineAnchorRow({
  anchor, rolled, window: w, highlight,
}: {
  anchor: Task;
  rolled: number;
  window: TimeWindow;
  highlight: boolean;
}) {
  const pos = taskBarPosition(anchor, w);
  const leftPct = Math.max(0, Math.min(100, pos.leftPct));
  const widthPct = Math.max(0.5, Math.min(100 - leftPct, pos.widthPct));
  const palette = phaseColor(anchor.phase);
  return (
    <div
      className="relative border-b border-slate-100 bg-white"
      style={{ height: ROW_HEIGHT_PX }}
    >
      <div
        className={`absolute top-1/2 -translate-y-1/2 overflow-hidden rounded-md ${
          highlight ? HIGHLIGHT_RING : ''
        }`}
        style={{
          left: `${leftPct}%`,
          width: `${widthPct}%`,
          height: 18,
          borderWidth: 1,
          borderStyle: 'solid',
          borderColor: palette.color,
          backgroundColor: palette.tint,
        }}
        title={`${anchor.phase} · ${rolled}%`}
      >
        <div
          className="h-full transition-[width] duration-700 ease-out"
          style={{ width: `${rolled}%`, backgroundColor: palette.fill }}
        />
      </div>
    </div>
  );
}

function TimelineChildRow({
  task, window: w, highlight,
}: {
  task: Task;
  window: TimeWindow;
  highlight: boolean;
}) {
  const pos = taskBarPosition(task, w);
  const leftPct = Math.max(0, Math.min(100, pos.leftPct));
  const widthPct = Math.max(0.5, Math.min(100 - leftPct, pos.widthPct));
  return (
    <div
      className="relative border-b border-slate-100"
      style={{ height: ROW_HEIGHT_PX }}
    >
      <div
        className={`absolute top-1/2 -translate-y-1/2 overflow-hidden rounded bg-slate-200/70 ${
          highlight ? HIGHLIGHT_RING : ''
        }`}
        style={{ left: `${leftPct}%`, width: `${widthPct}%`, height: 12 }}
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

// ─── Mobile group ───────────────────────────────────────────────────────────

function MobileGroup({
  phase, isCollapsed, onToggle, onTaskClick,
}: {
  phase: { anchor: Task; children: Task[]; rolled: number };
  isCollapsed: boolean;
  onToggle: () => void;
  onTaskClick?: (task: Task) => void;
}) {
  return (
    <li className="bg-white px-3 py-3">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2"
      >
        {isCollapsed
          ? <ChevronRight className="h-4 w-4 flex-shrink-0 text-slate-500" />
          : <ChevronDown className="h-4 w-4 flex-shrink-0 text-slate-500" />}
        <span
          aria-hidden
          className="inline-block h-2 w-2 flex-shrink-0 rounded-full"
          style={{ backgroundColor: phaseColor(phase.anchor.phase).color }}
        />
        <span className="flex-1 truncate text-left text-sm font-semibold capitalize text-slate-900">
          {phase.anchor.phase}
        </span>
        <span className="tabular-nums text-[11px] text-slate-600">
          <CountUp value={phase.rolled} />%
        </span>
      </button>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-1.5 rounded-full transition-[width] duration-700 ease-out"
          style={{
            width: `${phase.rolled}%`,
            backgroundColor: phaseColor(phase.anchor.phase).color,
          }}
        />
      </div>
      {!isCollapsed && (
        <ul className="mt-2 space-y-1 pl-6">
          {phase.children.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={onTaskClick ? () => onTaskClick(c) : undefined}
                disabled={!onTaskClick}
                className="flex w-full items-center gap-2 rounded py-1 text-left hover:bg-slate-50 disabled:cursor-default disabled:hover:bg-transparent"
              >
                <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${STATUS_DOT[c.status]}`} />
                <span className="min-w-0 flex-1 truncate text-[12px] text-slate-700">{c.name}</span>
                <span className="tabular-nums text-[10px] text-slate-500">{c.percentComplete}%</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

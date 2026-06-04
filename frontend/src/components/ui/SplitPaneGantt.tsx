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
import { useAppStore } from '../../store';
import { Card, CardContent } from './card';
import {
  makeTimeWindow,
  monthHeaders,
  weekTicks,
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
const AXIS_HEIGHT_PX = 44;

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

const HIGHLIGHT_RING =
  'ring-2 ring-emerald-400 ring-offset-1 ring-offset-white animate-pulse';

// Custom phases (migration 44) aren't in the 8-colour construction palette —
// show them by name + a stable colour, mirroring the Tasks tab.
const CUSTOM_PHASE_PALETTE = ['#0D9488', '#7C3AED', '#DB2777', '#0891B2', '#9333EA', '#4F46E5'];
function anchorDisp(t: Task): { label: string; color: string; tint: string; fill: string } {
  if (t.isCustom) {
    let h = 0;
    for (let i = 0; i < t.id.length; i++) h = (h * 31 + t.id.charCodeAt(i)) >>> 0;
    const color = CUSTOM_PHASE_PALETTE[h % CUSTOM_PHASE_PALETTE.length];
    return { label: t.name || 'Untitled phase', color, tint: `${color}1A`, fill: `${color}99` };
  }
  const pc = phaseColor(t.phase);
  return { label: pc.label, color: pc.color, tint: pc.tint, fill: pc.fill };
}

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

  // Opt-in "scheduling board" density (#16). Default OFF keeps the original
  // compact Gantt untouched; ON adds assignee avatars + named/duration labels
  // to each task row — the denser planning-board look, as a zoom you choose.
  const [boardView, setBoardView] = useState(false);
  const users = useAppStore((s) => s.users);
  const initialsFor = (assigneeId?: string): string | null => {
    if (!assigneeId) return null;
    const u = users.find((x) => x.id === assigneeId);
    if (!u?.fullName) return null;
    return u.fullName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
  };

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
  const ticks  = useMemo(() => weekTicks(timeWindow), [timeWindow]);
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
          <p className="text-sm text-[#6B6B6B]">
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
            <div className="w-[304px] flex-shrink-0 border-r border-[#E6E1D4]">
              <div
                className="sticky top-0 z-20 flex items-center justify-between gap-1 border-b border-[#E6E1D4] bg-white px-2"
                style={{ height: AXIS_HEIGHT_PX }}
              >
                <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#6B6B6B]">
                  Phase · task
                </span>
                <div className="inline-flex flex-shrink-0 items-center rounded-full border border-[#E6E1D4] p-0.5" role="group" aria-label="Gantt density">
                  {([['Compact', false], ['Board', true]] as const).map(([label, on]) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setBoardView(on)}
                      aria-pressed={boardView === on}
                      className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide transition-colors ${
                        boardView === on ? 'bg-[#1A1A1A] text-white' : 'text-[#6B6B6B] hover:text-[#1A1A1A]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
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
                    boardView={boardView}
                    initials={initialsFor(row.task.assigneeId)}
                    onClick={onTaskClick ? () => onTaskClick(row.task) : undefined}
                  />
                ),
              )}
            </div>

            {/* Right timeline pane */}
            <div className="relative min-w-0 flex-1">
              {/* Sticky month axis */}
              <div
                className="sticky top-0 z-20 border-b border-[#EFEBE0] bg-white"
                style={{ height: AXIS_HEIGHT_PX }}
              >
                {months.map((m) => (
                  <div
                    key={m.label}
                    className="absolute top-0 flex h-[22px] items-center border-l border-[#EFEBE0] px-2 text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]"
                    style={{ left: `${m.leftPct}%`, width: `${m.widthPct}%` }}
                  >
                    {m.short}
                  </div>
                ))}
                {ticks.map((t) => (
                  <div
                    key={`tick-${t.leftPct}`}
                    className="absolute bottom-1 flex -translate-x-1/2 flex-col items-center"
                    style={{ left: `${t.leftPct}%` }}
                  >
                    <span className="text-[9px] tabular-nums leading-none text-[#A0A0A0]">{t.day}</span>
                    <span aria-hidden className="mt-[3px] h-1.5 w-px bg-[#D6CDB7]" />
                  </div>
                ))}
                {todayVisible && (
                  <div
                    className="pointer-events-none absolute z-20 -translate-x-1/2 rounded-full bg-[#2F8F5C] px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.12em] text-white shadow-sm"
                    style={{ left: `${todayPct}%`, top: 4 }}
                  >
                    Today
                  </div>
                )}
              </div>

              {/* Today vertical line — solid sage, spans below the axis. */}
              {todayVisible && (
                <div
                  className="pointer-events-none absolute z-10 w-[1.5px] bg-[#2F8F5C]/70"
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
                    boardView={boardView}
                  />
                ),
              )}
            </div>
          </div>
        </div>

        {/* Mobile — single-column grouped list. Timeline pane only renders on
            desktop; phones get a denser phase summary so the entire schedule
            stays one-thumb-scrollable. */}
        <ul className="divide-y divide-[#EFEBE0] md:hidden">
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
      className="flex items-center gap-1.5 border-b border-[#EFEBE0] bg-white px-2 hover:bg-[#FAF8F2]"
      style={{ height: ROW_HEIGHT_PX }}
    >
      <button
        type="button"
        onClick={onToggle}
        className="inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded text-[#6B6B6B] hover:bg-[#EFEBE0] hover:text-[#3A3A3A]"
        aria-label={isCollapsed ? 'Expand phase' : 'Collapse phase'}
      >
        {isCollapsed
          ? <ChevronRight className="h-3.5 w-3.5" />
          : <ChevronDown className="h-3.5 w-3.5" />}
      </button>
      <span
        aria-hidden
        className="inline-block h-2 w-2 flex-shrink-0 rounded-full"
        style={{ backgroundColor: anchorDisp(anchor).color }}
      />
      <span className={`min-w-0 flex-1 truncate text-[13px] font-semibold text-[#1A1A1A] ${anchor.isCustom ? '' : 'capitalize'}`}>
        {anchorDisp(anchor).label}
      </span>
      <span className="flex-shrink-0 tabular-nums text-[11px] font-medium text-[#3A3A3A]">
        <CountUp value={rolled} />%
      </span>
    </div>
  );
}

function LeftChildRow({
  task, zones, onClick, boardView = false, initials = null,
}: {
  task: Task;
  zones: Zone[];
  onClick?: () => void;
  boardView?: boolean;
  initials?: string | null;
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
      {boardView && (
        <span
          className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full text-[8px] font-bold ${
            initials ? 'bg-[#E5F2EA] text-[#246F47]' : 'bg-[#F0EDE4] text-[#A0A0A0]'
          }`}
          title={initials ? 'Assignee' : 'Unassigned'}
        >
          {initials ?? '–'}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate text-[12px] text-[#3A3A3A]">
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
      <span className="flex-shrink-0 tabular-nums text-[10px] text-[#6B6B6B]">
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

  const baseClass = `flex w-full items-center gap-1.5 border-b border-[#EFEBE0] px-2 pl-8 text-left`;
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${baseClass} transition-colors hover:bg-[#FAF8F2]`}
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
  const palette = anchorDisp(anchor);
  return (
    <div
      className="relative border-b border-[#EFEBE0] bg-white"
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
        title={`${palette.label} · ${rolled}%`}
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
  task, window: w, highlight, boardView = false,
}: {
  task: Task;
  window: TimeWindow;
  highlight: boolean;
  boardView?: boolean;
}) {
  const pos = taskBarPosition(task, w);
  const leftPct = Math.max(0, Math.min(100, pos.leftPct));
  const widthPct = Math.max(0.5, Math.min(100 - leftPct, pos.widthPct));
  // In board mode, place the name+duration label after the bar — unless the bar
  // ends in the right ~third, where we right-align it before the bar so it
  // never runs off the pane.
  const labelAfter = leftPct + widthPct <= 62;
  return (
    <div
      className="relative border-b border-[#EFEBE0]"
      style={{ height: ROW_HEIGHT_PX }}
    >
      <div
        className={`absolute top-1/2 -translate-y-1/2 overflow-hidden rounded bg-[#E6E1D4]/70 ${
          highlight ? HIGHLIGHT_RING : ''
        }`}
        style={{ left: `${leftPct}%`, width: `${widthPct}%`, height: boardView ? 16 : 12 }}
        title={`${task.name} · ${task.percentComplete}%`}
      >
        <div
          className={`h-full transition-[width] duration-700 ease-out ${STATUS_BAR_BG[task.status]}`}
          style={{ width: `${task.percentComplete}%` }}
        />
      </div>
      {boardView && (
        <span
          className="pointer-events-none absolute top-1/2 max-w-[38%] -translate-y-1/2 truncate text-[10px] font-medium text-[#3A3A3A]"
          style={labelAfter
            ? { left: `calc(${leftPct + widthPct}% + 6px)` }
            : { right: `calc(${100 - leftPct}% + 6px)` }}
          title={`${task.name} · ${task.durationDays}d`}
        >
          {task.name} <span className="text-[#A0A0A0]">· {task.durationDays}d</span>
        </span>
      )}
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
          ? <ChevronRight className="h-4 w-4 flex-shrink-0 text-[#6B6B6B]" />
          : <ChevronDown className="h-4 w-4 flex-shrink-0 text-[#6B6B6B]" />}
        <span
          aria-hidden
          className="inline-block h-2 w-2 flex-shrink-0 rounded-full"
          style={{ backgroundColor: anchorDisp(phase.anchor).color }}
        />
        <span className={`flex-1 truncate text-left text-sm font-semibold text-[#1A1A1A] ${phase.anchor.isCustom ? '' : 'capitalize'}`}>
          {anchorDisp(phase.anchor).label}
        </span>
        <span className="tabular-nums text-[11px] text-[#6B6B6B]">
          <CountUp value={phase.rolled} />%
        </span>
      </button>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#EFEBE0]">
        <div
          className="h-1.5 rounded-full transition-[width] duration-700 ease-out"
          style={{
            width: `${phase.rolled}%`,
            backgroundColor: anchorDisp(phase.anchor).color,
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
                className="flex w-full items-center gap-2 rounded py-1 text-left hover:bg-[#FAF8F2] disabled:cursor-default disabled:hover:bg-transparent"
              >
                <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${STATUS_DOT[c.status]}`} />
                <span className="min-w-0 flex-1 truncate text-[12px] text-[#3A3A3A]">{c.name}</span>
                <span className="tabular-nums text-[10px] text-[#6B6B6B]">{c.percentComplete}%</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

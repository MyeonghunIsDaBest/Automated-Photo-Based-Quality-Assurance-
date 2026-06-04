// Shared date-math utilities for Gantt-style visualisations.
//
// Both `components/ui/GanttChart.tsx` (the original full-width chart) and
// the new split-pane `TasksTab` timeline consume these. Centralising avoids
// drift between two implementations of the same percentage math — and gives
// us one place to add subtleties (today marker, working-day shading, etc.)
// in the future.

import {
  addDays,
  differenceInDays,
  endOfQuarter,
  endOfWeek,
  format,
  getQuarter,
  parseISO,
  startOfQuarter,
  startOfWeek,
} from 'date-fns';

/** Supported zoom levels on the Gantt timeline axis. */
export type GanttZoom = 'day' | 'week' | 'month' | 'quarter';

export interface TimeWindow {
  /** ISO YYYY-MM-DD (or full ISO). */
  startDate: string;
  endDate: string;
  /** Inclusive day count from start to end. Always ≥ 1. */
  totalDays: number;
}

export function makeTimeWindow(startDate: string, endDate: string): TimeWindow {
  const start = parseISO(startDate);
  const end = parseISO(endDate);
  const totalDays = Math.max(1, differenceInDays(end, start));
  return { startDate, endDate, totalDays };
}

/** Position a task bar within the time window as left + width percentages. */
export function taskBarPosition(
  task: { startDate: string; endDate: string },
  window: TimeWindow,
): { leftPct: number; widthPct: number } {
  const windowStart = parseISO(window.startDate);
  const taskStart = parseISO(task.startDate);
  const taskEnd = parseISO(task.endDate);
  const startOffset = differenceInDays(taskStart, windowStart);
  const duration = differenceInDays(taskEnd, taskStart) + 1;
  return {
    leftPct: (startOffset / window.totalDays) * 100,
    widthPct: (duration / window.totalDays) * 100,
  };
}

/** Drop a vertical-line marker for an arbitrary date within the window. */
export function xPositionPct(date: Date | string, window: TimeWindow): number {
  const d = typeof date === 'string' ? parseISO(date) : date;
  const windowStart = parseISO(window.startDate);
  const offset = differenceInDays(d, windowStart);
  return (offset / window.totalDays) * 100;
}

export interface MonthHeader {
  /** e.g. "Apr 2026" */
  label: string;
  /** Position in the window as a percentage. */
  leftPct: number;
  /** Width of this month's slice as a percentage. */
  widthPct: number;
  /** Short label for narrow viewports ("Apr"). */
  short: string;
}

/** Generate month headers covering the window. Useful for axis labels. */
export function monthHeaders(window: TimeWindow): MonthHeader[] {
  const start = parseISO(window.startDate);
  const end = parseISO(window.endDate);
  const headers: MonthHeader[] = [];
  let cursor = new Date(start);
  let dayOffset = 0;

  while (cursor <= end) {
    const monthStart = new Date(cursor);
    const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    const clampedEnd = monthEnd > end ? end : monthEnd;
    const daysInMonth = differenceInDays(clampedEnd, monthStart) + 1;
    headers.push({
      label: format(monthStart, 'MMM yyyy'),
      short: format(monthStart, 'MMM'),
      leftPct: (dayOffset / window.totalDays) * 100,
      widthPct: (daysInMonth / window.totalDays) * 100,
    });
    cursor = new Date(monthEnd);
    cursor.setDate(cursor.getDate() + 1);
    dayOffset += daysInMonth;
  }
  return headers;
}

export interface DayHeader {
  /** Full date label e.g. "Mon · Apr 12". */
  label: string;
  /** Compact label "12". */
  short: string;
  /** Narrow weekday letter "M" / "T" — for the two-row day axis. */
  weekday: string;
  /** True when this cell falls on today — caller highlights the column. */
  isToday: boolean;
  /** Position percentage. */
  leftPct: number;
  /** Width percentage — always 1 day. */
  widthPct: number;
  /** True for Saturday / Sunday — caller can shade weekends. */
  isWeekend: boolean;
}

/** One header cell per day in the window. Use at the "day" zoom level. */
export function dayHeaders(window: TimeWindow): DayHeader[] {
  const start = parseISO(window.startDate);
  const headers: DayHeader[] = [];
  const cellWidth = 100 / window.totalDays;
  const todayKey = format(new Date(), 'yyyy-MM-dd');
  for (let i = 0; i < window.totalDays; i++) {
    const d = addDays(start, i);
    const dow = d.getDay();
    headers.push({
      label: format(d, 'EEE · MMM d'),
      short: format(d, 'd'),
      weekday: format(d, 'EEEEE'),
      isToday: format(d, 'yyyy-MM-dd') === todayKey,
      leftPct: i * cellWidth,
      widthPct: cellWidth,
      isWeekend: dow === 0 || dow === 6,
    });
  }
  return headers;
}

export interface WeekHeader {
  /** "Apr 12 – Apr 18" */
  label: string;
  /** "W16" */
  short: string;
  leftPct: number;
  widthPct: number;
}

/** Per-week headers, snapping to Monday. */
export function weekHeaders(window: TimeWindow): WeekHeader[] {
  const start = parseISO(window.startDate);
  const end = parseISO(window.endDate);
  const headers: WeekHeader[] = [];
  let cursor = startOfWeek(start, { weekStartsOn: 1 });

  while (cursor <= end) {
    const weekStartClamped = cursor < start ? start : cursor;
    const weekEndRaw = endOfWeek(cursor, { weekStartsOn: 1 });
    const weekEnd = weekEndRaw > end ? end : weekEndRaw;
    const dayOffset = Math.max(0, differenceInDays(weekStartClamped, start));
    const durationDays = differenceInDays(weekEnd, weekStartClamped) + 1;
    headers.push({
      label: `${format(weekStartClamped, 'MMM d')} – ${format(weekEnd, 'MMM d')}`,
      short: format(cursor, "'W'II"),
      leftPct: (dayOffset / window.totalDays) * 100,
      widthPct: (durationDays / window.totalDays) * 100,
    });
    cursor = addDays(weekEndRaw, 1);
  }
  return headers;
}

export interface AxisTick {
  /** Position percentage of the tick within the window. */
  leftPct: number;
  /** Day-of-month number to print under the month band. */
  day: number;
}

/** Weekly (Monday) date-number ticks across the window. Powers the month-zoom
 *  sub-axis so users can read exact dates, not just the month band. */
export function weekTicks(window: TimeWindow): AxisTick[] {
  const start = parseISO(window.startDate);
  const end = parseISO(window.endDate);
  const ticks: AxisTick[] = [];
  let cursor = startOfWeek(start, { weekStartsOn: 1 });
  if (cursor < start) cursor = addDays(cursor, 7); // first Monday on/after start
  while (cursor <= end) {
    ticks.push({
      leftPct: (differenceInDays(cursor, start) / window.totalDays) * 100,
      day: cursor.getDate(),
    });
    cursor = addDays(cursor, 7);
  }
  return ticks;
}

export interface QuarterHeader {
  /** "Q2 2026" */
  label: string;
  /** "Q2" */
  short: string;
  leftPct: number;
  widthPct: number;
}

/** Per-quarter headers. */
export function quarterHeaders(window: TimeWindow): QuarterHeader[] {
  const start = parseISO(window.startDate);
  const end = parseISO(window.endDate);
  const headers: QuarterHeader[] = [];
  let cursor = startOfQuarter(start);

  while (cursor <= end) {
    const qStartClamped = cursor < start ? start : cursor;
    const qEndRaw = endOfQuarter(cursor);
    const qEnd = qEndRaw > end ? end : qEndRaw;
    const dayOffset = Math.max(0, differenceInDays(qStartClamped, start));
    const durationDays = differenceInDays(qEnd, qStartClamped) + 1;
    const q = getQuarter(cursor);
    headers.push({
      label: `Q${q} ${cursor.getFullYear()}`,
      short: `Q${q}`,
      leftPct: (dayOffset / window.totalDays) * 100,
      widthPct: (durationDays / window.totalDays) * 100,
    });
    cursor = addDays(qEndRaw, 1);
  }
  return headers;
}

export interface WeekendInterval {
  /** Start of weekend block as a percentage. */
  leftPct: number;
  /** Width of weekend block as a percentage (one or two days). */
  widthPct: number;
}

/** Minimum width per day, by zoom level, so axis labels stay readable.
 *  At day zoom, "31" needs roughly 14px + padding; at quarter zoom, the
 *  natural container width is usually plenty so we keep the per-day budget
 *  small. The Gantt right-pane sets `min-width: totalDays * pxPerDay` and
 *  enables `overflow-x-auto`, so this number only triggers scroll when the
 *  natural container width can't fit it. */
export const PX_PER_DAY: Record<GanttZoom, number> = {
  day:     28,
  week:    12,
  month:   4,
  quarter: 2,
};

/** Minimum pixel width the inner timeline needs to render its labels
 *  legibly. The outer pane sets `overflow-x: auto`, so this only forces
 *  horizontal scroll when the natural width can't accommodate it. */
export function timelineMinWidthPx(zoom: GanttZoom, totalDays: number): number {
  return Math.max(1, Math.round(totalDays * PX_PER_DAY[zoom]));
}

/** Compute weekend (Sat-Sun) intervals within the window. The caller renders
 *  a faint column behind the timeline at each interval. Used at day + week zoom
 *  levels — at month/quarter zoom the columns would be invisible-thin. */
export function weekendIntervals(window: TimeWindow): WeekendInterval[] {
  const start = parseISO(window.startDate);
  const intervals: WeekendInterval[] = [];
  const dayWidth = 100 / window.totalDays;
  for (let i = 0; i < window.totalDays; i++) {
    const dow = addDays(start, i).getDay();
    if (dow !== 6) continue; // Saturday only — Sunday is merged into a 2-day block.
    const sundayInWindow = i + 1 < window.totalDays;
    intervals.push({
      leftPct: i * dayWidth,
      widthPct: dayWidth * (sundayInWindow ? 2 : 1),
    });
  }
  // Edge case: window starts on a Sunday — the prior Saturday isn't in scope,
  // so render a 1-day block at offset 0.
  if (start.getDay() === 0 && window.totalDays > 0) {
    intervals.unshift({ leftPct: 0, widthPct: dayWidth });
  }
  return intervals;
}

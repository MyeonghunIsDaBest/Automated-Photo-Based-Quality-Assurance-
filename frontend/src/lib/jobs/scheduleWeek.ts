// lib/jobs/scheduleWeek.ts — pure week/month timeline math for the inline
// Simpro-job scheduler. No imports. Monday-start weeks. Local calendar dates.

export function toISODate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** The 7 dates (Mon→Sun) of the week containing `ref`. */
export function weekDates(ref: Date): Date[] {
  const mondayOffset = (ref.getDay() + 6) % 7; // Sun(0)->6, Mon(1)->0, …
  const monday = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() - mondayOffset);
  return Array.from(
    { length: 7 },
    (_, i) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i),
  );
}

/** A default schedule bar from a Simpro Due Date: an `days`-long inclusive run
 *  ENDING on the due date (default 3 days → start = due − 2). The export has no
 *  start/duration, so imported jobs seed their bar from this; the owner adjusts. */
export function scheduleFromDue(dueIso: string, days = 3): { start: string; end: string } {
  const end = dueIso.slice(0, 10);
  const [y, m, d] = end.split('-').map(Number);
  return { start: toISODate(new Date(y, m - 1, d - (days - 1))), end };
}

/** A default schedule bar STARTING on a given date (used when a job has no due
 *  date — seed from the import/created date instead). `days`-long inclusive. */
export function scheduleFromStart(startIso: string, days = 3): { start: string; end: string } {
  const start = startIso.slice(0, 10);
  const [y, m, d] = start.split('-').map(Number);
  return { start, end: toISODate(new Date(y, m - 1, d + (days - 1))) };
}

export type TimelineScale = 'week' | 'month';

/** The day columns for the timeline: week = Mon–Sun of the anchor's week;
 *  month = every day of the anchor's calendar month. */
export function timelineColumns(scale: TimelineScale, anchor: Date): Date[] {
  if (scale === 'week') return weekDates(anchor);
  const y = anchor.getFullYear();
  const m = anchor.getMonth();
  const days = new Date(y, m + 1, 0).getDate(); // last day-of-month
  return Array.from({ length: days }, (_, i) => new Date(y, m, i + 1));
}

/** A continuous, Monday-aligned run of days for the scrollable Gantt sheet:
 *  `weeksBefore` whole weeks before the centre date's week, through `weeksAfter`
 *  weeks after — i.e. (weeksBefore + weeksAfter + 1) × 7 consecutive days. */
export function timelineWindow(centerIso: string, weeksBefore: number, weeksAfter: number): Date[] {
  const [y, m, d] = centerIso.slice(0, 10).split('-').map(Number);
  const center = new Date(y, m - 1, d);
  const mondayOffset = (center.getDay() + 6) % 7;
  const start = new Date(center.getFullYear(), center.getMonth(), center.getDate() - mondayOffset - weeksBefore * 7);
  const totalDays = (weeksBefore + weeksAfter + 1) * 7;
  return Array.from(
    { length: totalDays },
    (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i),
  );
}

export interface BarSpan {
  startIdx: number; // first column the bar covers (inclusive)
  endIdx: number; // last column the bar covers (inclusive)
  clampedLeft: boolean; // range starts before the view (continues left)
  clampedRight: boolean; // range ends after the view (continues right)
}

/** The inclusive column span a [start,end] date range covers within `columns`,
 *  clamped to the view. Null if the range doesn't intersect the view at all.
 *  Accepts ISO dates or timestamps (the date part is used). */
export function barSpan(startIso: string, endIso: string, columns: Date[]): BarSpan | null {
  if (columns.length === 0) return null;
  const keys = columns.map(toISODate);
  const s = startIso.slice(0, 10);
  const e = endIso.slice(0, 10);
  const first = keys[0];
  const last = keys[keys.length - 1];
  if (e < first || s > last) return null; // no overlap with the view

  const clampedLeft = s < first;
  const clampedRight = e > last;
  const startIdx = clampedLeft ? 0 : keys.findIndex((k) => k >= s);
  let endIdx = keys.length - 1;
  if (!clampedRight) {
    for (let i = keys.length - 1; i >= 0; i--) {
      if (keys[i] <= e) {
        endIdx = i;
        break;
      }
    }
  }
  return { startIdx, endIdx, clampedLeft, clampedRight };
}

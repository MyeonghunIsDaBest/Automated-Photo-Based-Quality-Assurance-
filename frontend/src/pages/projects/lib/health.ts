// Project "health" (momentum) — a derived signal layered on top of the
// lifecycle `status`. Lifecycle answers "is this project open?"; health answers
// "is it actually moving?". We read the most recent task update on a project:
//
//   active + updated within 4 days   → on_track (green)
//   active + quiet 4–6 days          → caution  (amber)  — "almost a week"
//   active + no progress for 7d+     → delayed  (red)    — "at least a week"
//   on_hold                          → paused
//   completed / archived             → done
//
// Pure + side-effect-free so it can be unit-tested and reused by the Dashboard
// portfolio rollup later. `now` is injectable for tests.

import type { ProjectStatus } from '../types';

export type ProjectHealth = 'on_track' | 'caution' | 'delayed' | 'paused' | 'done';

export interface ProjectHealthInfo {
  health: ProjectHealth;
  /** Whole days since the latest task update, or null when nothing has ever
   *  been recorded (brand-new project with no task timestamps). */
  daysSinceUpdate: number | null;
}

export const CAUTION_DAYS = 4; // "almost a week" — starts nudging amber
export const DELAYED_DAYS = 7; // "at least a week" — flips red

export const HEALTH_META: Record<ProjectHealth, {
  label: string;
  fg: string;
  bg: string;
  dot: string;
  accent: string;
  blurb: string;
}> = {
  on_track: { label: 'On track',  fg: '#246F47', bg: '#E5F2EA', dot: '#2F8F5C', accent: '#2F8F5C', blurb: 'Updated this week' },
  caution:  { label: 'Caution',   fg: '#C8841E', bg: '#F9EFD9', dot: '#D69A2E', accent: '#C8841E', blurb: 'Quiet 4–6 days' },
  delayed:  { label: 'Delayed',   fg: '#C44545', bg: '#FBE5E5', dot: '#C44545', accent: '#C44545', blurb: 'No progress in 7d+' },
  paused:   { label: 'On hold',   fg: '#8A6D3B', bg: '#F0EDE4', dot: '#A0A0A0', accent: '#A0A0A0', blurb: 'Paused or pending input' },
  done:     { label: 'Completed', fg: '#5B6B7B', bg: '#EEF1F4', dot: '#6B7A8F', accent: '#5B6B7B', blurb: 'Closed or archived' },
};

const DAY_MS = 86_400_000;

function daysSince(ms: number | null, now: number): number | null {
  if (ms == null || Number.isNaN(ms)) return null;
  return Math.max(0, Math.floor((now - ms) / DAY_MS));
}

export function projectHealthInfo(
  status: ProjectStatus,
  lastUpdatedMs: number | null,
  now: number = Date.now(),
): ProjectHealthInfo {
  const days = daysSince(lastUpdatedMs, now);
  if (status === 'on_hold') return { health: 'paused', daysSinceUpdate: days };
  if (status === 'completed' || status === 'archived') return { health: 'done', daysSinceUpdate: days };
  // active — momentum by recency. No timestamp at all (no tasks yet) is benign,
  // not a red flag, so it reads as on_track until real work starts moving.
  if (days == null) return { health: 'on_track', daysSinceUpdate: null };
  if (days >= DELAYED_DAYS) return { health: 'delayed', daysSinceUpdate: days };
  if (days >= CAUTION_DAYS) return { health: 'caution', daysSinceUpdate: days };
  return { health: 'on_track', daysSinceUpdate: days };
}

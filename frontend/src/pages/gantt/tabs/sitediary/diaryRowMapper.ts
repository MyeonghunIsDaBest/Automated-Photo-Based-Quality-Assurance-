// Single source of truth for DiaryEntry → UI TimelineRow shape.
// Used by the timeline list AND by the rollup calculations, so the
// conditions-stub filter stays consistent across the two surfaces.

import type { DiaryEntry, DiaryStatus } from '../../types';

export interface TimelineRow {
  id: string;
  workerInitials: string;
  workerColorIndex: 1 | 2 | 3 | 4 | 5;
  workerName: string;
  workerRole: string;
  startTime: string;
  endTime: string;
  hours: number;
  status: DiaryStatus;
  description: string;
  tags: string[];
  extraPersonnelCount: number;   // > 0 if multi-personnel — rendered as "+N more"
  photoIds: string[];
}

// A conditions-stub entry is created when the user toggles weather/temp
// before any real entry exists for the day. We persist these as real
// DiaryEntry rows (no new store slice) and filter them out everywhere
// they would otherwise inflate the timeline/rollup numbers.
export function isVisibleEntry(entry: DiaryEntry): boolean {
  const hasDescription = entry.description.trim().length > 0;
  const hasPersonnel = entry.personnel.length > 0;
  const hasPhotos = entry.photoIds.length > 0;
  return hasDescription || hasPersonnel || hasPhotos;
}

// Deterministic 1..5 colour bucket for a worker. The same worker keeps
// the same colour across reloads without needing a stored field.
export function colorIndexForWorker(workerId: string): 1 | 2 | 3 | 4 | 5 {
  if (!workerId) return 5;
  let h = 0;
  for (let i = 0; i < workerId.length; i++) {
    h = (h * 31 + workerId.charCodeAt(i)) >>> 0;
  }
  return (((h % 5) + 1) as 1 | 2 | 3 | 4 | 5);
}

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '—';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function mapEntryToRow(entry: DiaryEntry): TimelineRow {
  const primary = entry.personnel[0];
  const totalHours = entry.personnel.reduce((s, p) => s + (p.hours ?? 0), 0);
  const workerName = primary?.workerName ?? '—';
  const role = primary
    ? `${primary.role}${primary.company ? ` · ${primary.company}` : ''}`
    : '';

  return {
    id: entry.id,
    workerInitials: initialsFor(workerName),
    workerColorIndex: colorIndexForWorker(primary?.workerId ?? entry.createdBy ?? entry.id),
    workerName,
    workerRole: role,
    startTime: entry.startTime ?? '—',
    endTime: entry.endTime ?? '—',
    hours: Number.isFinite(totalHours) ? Math.round(totalHours * 100) / 100 : 0,
    status: entry.status ?? 'pending',
    description: entry.description,
    tags: entry.tags ?? [],
    extraPersonnelCount: Math.max(0, entry.personnel.length - 1),
    photoIds: entry.photoIds,
  };
}

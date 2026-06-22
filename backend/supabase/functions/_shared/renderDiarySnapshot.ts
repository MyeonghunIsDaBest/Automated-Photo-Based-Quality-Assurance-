// backend/supabase/functions/_shared/renderDiarySnapshot.ts

export interface SnapshotEntry {
  date: string;                                       // YYYY-MM-DD
  description: string;
  weather?: 'sunny' | 'cloudy' | 'rain' | 'storm';
  temperatureC?: number;
  personnel: Array<{ hours: number }>;
}

const DESCRIPTION_TRUNC = 160;

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + '…';
}

function totalHours(personnel: SnapshotEntry['personnel']): number {
  return personnel.reduce((sum, p) => sum + (p.hours || 0), 0);
}

function conditionsBadge(e: SnapshotEntry): string {
  const parts: string[] = [];
  if (e.weather) parts.push(e.weather);
  if (typeof e.temperatureC === 'number') parts.push(`${e.temperatureC}°C`);
  return parts.length ? parts.join(' ') : '—';
}

export function renderDiarySnapshot(entries: SnapshotEntry[], limit: number): string {
  const ordered = [...entries]
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, limit);

  if (ordered.length === 0) {
    return '(No prior diary entries on this project.)';
  }

  return ordered.map((e) => {
    const cond = conditionsBadge(e);
    const ppl = e.personnel.length;
    const hrs = totalHours(e.personnel);
    const desc = (e.description || '').trim() || '—';
    const compactDesc = truncate(desc.replace(/\s+/g, ' '), DESCRIPTION_TRUNC);
    return `  ${e.date} · ${cond} · ${ppl} ppl · ${hrs}h\n    "${compactDesc}"`;
  }).join('\n');
}

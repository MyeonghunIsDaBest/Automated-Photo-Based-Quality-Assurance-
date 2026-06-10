// Site Diary persistence + realtime. The Zustand gantt store remains the
// editing source of truth; this layer mirrors each new entry to Supabase
// (best-effort, fire-and-forget) and subscribes to realtime so entries
// created on another device/tab arrive live. Mirrors the helper style of
// lib/api/realtime.ts (each subscribe returns an unsubscribe fn) and the
// mock-mode short-circuit of the other lib/api modules.

import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase, supabaseConfigured } from '../supabase';
import type { DiaryEntry } from '../../pages/gantt/types';

// snake_case row <-> camelCase DiaryEntry. Column names MUST match what the
// site-diary-assistant Edge Function reads (date, description, weather,
// temperature_c, personnel) — see 20_diary_entries.sql + 57_diary_temperature_celsius.sql.
function toRow(e: DiaryEntry) {
  return {
    id: e.id,
    project_id: e.projectId,
    date: e.date,
    description: e.description,
    weather: e.weather ?? null,
    temperature_c: e.temperatureC ?? null,
    personnel: e.personnel,
    photo_ids: e.photoIds,
    start_time: e.startTime ?? null,
    end_time: e.endTime ?? null,
    status: e.status ?? 'pending',
    tags: e.tags ?? [],
    created_by: e.createdBy,
  };
}

export function rowToEntry(r: Record<string, unknown>): DiaryEntry {
  return {
    id: String(r.id),
    projectId: String(r.project_id),
    date: String(r.date),
    description: String(r.description ?? ''),
    weather: (r.weather as DiaryEntry['weather']) ?? undefined,
    temperatureC: r.temperature_c == null ? undefined : Number(r.temperature_c),
    personnel: Array.isArray(r.personnel) ? (r.personnel as DiaryEntry['personnel']) : [],
    photoIds: Array.isArray(r.photo_ids) ? (r.photo_ids as string[]) : [],
    startTime: (r.start_time as string) ?? undefined,
    endTime: (r.end_time as string) ?? undefined,
    status: (r.status as DiaryEntry['status']) ?? 'pending',
    tags: Array.isArray(r.tags) ? (r.tags as string[]) : [],
    createdBy: String(r.created_by ?? 'unknown'),
    createdAt: String(r.created_at ?? new Date().toISOString()),
  };
}

/** Mirror a diary entry to Supabase. Best-effort: the local store is the
 *  source of truth, so a failure here is logged, never thrown — the entry is
 *  still saved locally and will reconcile on the next successful write. Upsert
 *  on the text id makes a realtime echo / retry idempotent. No-op in mock mode. */
export async function insertDiaryEntry(e: DiaryEntry): Promise<void> {
  if (!supabaseConfigured()) return;
  const { error } = await supabase.from('diary_entries').upsert(toRow(e), { onConflict: 'id' });
  if (error) console.warn('[diaryEntries] insert failed (entry still saved locally):', error.message);
}

/** Subscribe to new diary entries for a project (INSERT-only). Returns an
 *  unsubscribe fn for useEffect cleanup. No-op (returns noop) in mock mode. */
export function subscribeToProjectDiary(
  projectId: string,
  onInsert: (entry: DiaryEntry) => void,
): () => void {
  if (!supabaseConfigured()) return () => void 0;
  const channel: RealtimeChannel = supabase
    .channel(`diary:${projectId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'diary_entries', filter: `project_id=eq.${projectId}` },
      (payload) => onInsert(rowToEntry(payload.new as Record<string, unknown>)),
    )
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
}

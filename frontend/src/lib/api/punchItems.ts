// Typed CRUD + realtime for the `punch_items` table (roadmap P1.6). Same
// template as lib/api/warranties.ts. Used by PunchView (which owns the list)
// + PunchItemDrawer + NewPunchItemSheet via callbacks, so the punch surface no
// longer touches the client-only Zustand store.

import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase, supabaseConfigured, isUuid } from '../supabase';
import type { PunchItem } from '../../pages/gantt/types';

export interface PunchItemRow {
  id: string;
  project_id: string;
  org_id: string | null;
  text: string;
  assignee_id: string | null;
  zone_id: string | null;
  task_id: string | null;
  due_date: string | null;
  photo_id: string | null;
  status: 'open' | 'done';
  created_by: string | null;
  created_at: string;
  closed_at: string | null;
}

export function mapPunchItemRow(r: PunchItemRow): PunchItem {
  return {
    id: r.id,
    projectId: r.project_id,
    text: r.text,
    assigneeId: r.assignee_id ?? undefined,
    zoneId: r.zone_id ?? undefined,
    taskId: r.task_id ?? undefined,
    dueDate: r.due_date ?? undefined,
    photoId: r.photo_id ?? undefined,
    status: r.status,
    createdBy: r.created_by ?? 'unknown',
    createdAt: r.created_at,
    closedAt: r.closed_at ?? undefined,
  };
}

const NOT_CONFIGURED = new Error(
  'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in frontend/.env.local.',
);

export async function listPunchItems(projectId: string): Promise<PunchItem[]> {
  if (!supabaseConfigured() || !isUuid(projectId)) return [];
  const { data, error } = await supabase
    .from('punch_items')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => mapPunchItemRow(r as PunchItemRow));
}

export interface NewPunchItem {
  text: string;
  assigneeId?: string;
  zoneId?: string;
  taskId?: string;
  dueDate?: string;
  photoId?: string;
  createdBy: string;
}

export async function createPunchItem(projectId: string, p: NewPunchItem): Promise<PunchItem> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { data, error } = await supabase
    .from('punch_items')
    .insert({
      project_id: projectId,
      text: p.text,
      assignee_id: p.assigneeId ?? null,
      zone_id: p.zoneId ?? null,
      task_id: p.taskId ?? null,
      due_date: p.dueDate ?? null,
      photo_id: p.photoId ?? null,
      status: 'open',
      created_by: p.createdBy,
    })
    .select('*')
    .single();
  if (error) throw error;
  return mapPunchItemRow(data as PunchItemRow);
}

// Accepts a camelCase Partial<PunchItem> (the shape the drawer edits) and maps
// the editable fields to snake_case columns. Undefined fields are skipped.
export async function updatePunchItem(id: string, patch: Partial<PunchItem>): Promise<void> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const row: Record<string, unknown> = {};
  if (patch.text !== undefined) row.text = patch.text;
  if (patch.assigneeId !== undefined) row.assignee_id = patch.assigneeId ?? null;
  if (patch.zoneId !== undefined) row.zone_id = patch.zoneId ?? null;
  if (patch.taskId !== undefined) row.task_id = patch.taskId ?? null;
  if (patch.dueDate !== undefined) row.due_date = patch.dueDate ?? null;
  if (patch.photoId !== undefined) row.photo_id = patch.photoId ?? null;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.closedAt !== undefined) row.closed_at = patch.closedAt ?? null;
  if (Object.keys(row).length === 0) return;
  const { error } = await supabase.from('punch_items').update(row).eq('id', id);
  if (error) throw error;
}

export async function deletePunchItem(id: string): Promise<void> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { error } = await supabase.from('punch_items').delete().eq('id', id);
  if (error) throw error;
}

/** Subscribe to punch inserts/updates/deletes for a project (toggle is an
 *  update). Returns an unsubscribe fn. No-op in mock mode. */
export function subscribeToProjectPunchItems(
  projectId: string,
  handlers: {
    onInsert: (p: PunchItem) => void;
    onUpdate: (p: PunchItem) => void;
    onDelete: (id: string) => void;
  },
): () => void {
  if (!supabaseConfigured() || !isUuid(projectId)) return () => void 0;
  const channel: RealtimeChannel = supabase
    .channel(`punch:${projectId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'punch_items', filter: `project_id=eq.${projectId}` },
      (payload) => handlers.onInsert(mapPunchItemRow(payload.new as PunchItemRow)),
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'punch_items', filter: `project_id=eq.${projectId}` },
      (payload) => handlers.onUpdate(mapPunchItemRow(payload.new as PunchItemRow)),
    )
    .on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'punch_items', filter: `project_id=eq.${projectId}` },
      (payload) => {
        const old = payload.old as { id?: string };
        if (old?.id) handlers.onDelete(old.id);
      },
    )
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
}

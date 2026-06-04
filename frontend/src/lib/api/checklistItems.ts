// Typed CRUD + realtime for the `checklist_items` table (roadmap P1.6),
// task-scoped. Same template as lib/api/warranties.ts / punchItems.ts.
// Consumed via the useChecklistItems hook so the Task drawer no longer touches
// the client-only Zustand store for checklists.

import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase, supabaseConfigured, isUuid } from '../supabase';
import type { ChecklistItem } from '../../pages/gantt/types';

export interface ChecklistItemRow {
  id: string;
  task_id: string;
  org_id: string | null;
  text: string;
  done: boolean;
  created_at: string;
  closed_at: string | null;
}

export function mapChecklistItemRow(r: ChecklistItemRow): ChecklistItem {
  return {
    id: r.id,
    text: r.text,
    done: r.done,
    createdAt: r.created_at,
    closedAt: r.closed_at ?? undefined,
  };
}

const NOT_CONFIGURED = new Error(
  'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in frontend/.env.local.',
);

export async function listChecklistItems(taskId: string): Promise<ChecklistItem[]> {
  if (!supabaseConfigured() || !isUuid(taskId)) return [];
  const { data, error } = await supabase
    .from('checklist_items')
    .select('*')
    .eq('task_id', taskId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => mapChecklistItemRow(r as ChecklistItemRow));
}

export async function createChecklistItem(taskId: string, text: string): Promise<ChecklistItem> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { data, error } = await supabase
    .from('checklist_items')
    .insert({ task_id: taskId, text, done: false })
    .select('*')
    .single();
  if (error) throw error;
  return mapChecklistItemRow(data as ChecklistItemRow);
}

/** Bulk insert — used by the "Apply template" picker (P4.1) so a template's
 *  items land in one round trip. Returns the persisted rows. */
export async function createChecklistItems(taskId: string, texts: string[]): Promise<ChecklistItem[]> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const rows = texts.map((text) => ({ task_id: taskId, text, done: false }));
  if (rows.length === 0) return [];
  const { data, error } = await supabase
    .from('checklist_items')
    .insert(rows)
    .select('*');
  if (error) throw error;
  return (data ?? []).map((r) => mapChecklistItemRow(r as ChecklistItemRow));
}

export async function updateChecklistItem(
  id: string,
  patch: { text?: string; done?: boolean; closedAt?: string | null },
): Promise<void> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const row: Record<string, unknown> = {};
  if (patch.text !== undefined) row.text = patch.text;
  if (patch.done !== undefined) row.done = patch.done;
  if (patch.closedAt !== undefined) row.closed_at = patch.closedAt;
  if (Object.keys(row).length === 0) return;
  const { error } = await supabase.from('checklist_items').update(row).eq('id', id);
  if (error) throw error;
}

export async function deleteChecklistItem(id: string): Promise<void> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { error } = await supabase.from('checklist_items').delete().eq('id', id);
  if (error) throw error;
}

export function subscribeToTaskChecklist(
  taskId: string,
  handlers: {
    onInsert: (i: ChecklistItem) => void;
    onUpdate: (i: ChecklistItem) => void;
    onDelete: (id: string) => void;
  },
): () => void {
  if (!supabaseConfigured() || !isUuid(taskId)) return () => void 0;
  const channel: RealtimeChannel = supabase
    .channel(`checklist:${taskId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'checklist_items', filter: `task_id=eq.${taskId}` },
      (payload) => handlers.onInsert(mapChecklistItemRow(payload.new as ChecklistItemRow)),
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'checklist_items', filter: `task_id=eq.${taskId}` },
      (payload) => handlers.onUpdate(mapChecklistItemRow(payload.new as ChecklistItemRow)),
    )
    .on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'checklist_items', filter: `task_id=eq.${taskId}` },
      (payload) => {
        const old = payload.old as { id?: string };
        if (old?.id) handlers.onDelete(old.id);
      },
    )
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
}

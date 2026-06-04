// Typed CRUD + realtime for the `defects` table (roadmap P4.3) — the formal QA
// defect register with an open→triaged→fixed→verified lifecycle. Full-swap
// domain (the board owns the data; no Zustand mirror). Same template as
// lib/api/punchItems.ts / warranties.ts.

import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase, supabaseConfigured, isUuid } from '../supabase';

export type DefectSeverity = 'low' | 'medium' | 'high' | 'critical';
export type DefectStatus = 'open' | 'triaged' | 'fixed' | 'verified';

export interface Defect {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  severity: DefectSeverity;
  status: DefectStatus;
  taskId?: string;
  photoId?: string;
  /** Supply-material link (migration 43): the order + embedded line-item id this
   *  defect was raised against. Set when reported from the Inventory tab. */
  orderId?: string;
  lineItemId?: string;
  assigneeId?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
  verifiedAt?: string;
}

export interface DefectRow {
  id: string;
  project_id: string;
  org_id: string | null;
  title: string;
  description: string | null;
  severity: DefectSeverity;
  status: DefectStatus;
  task_id: string | null;
  photo_id: string | null;
  order_id: string | null;
  line_item_id: string | null;
  assignee_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  verified_at: string | null;
}

export function mapDefectRow(r: DefectRow): Defect {
  return {
    id: r.id,
    projectId: r.project_id,
    title: r.title,
    description: r.description ?? undefined,
    severity: r.severity,
    status: r.status,
    taskId: r.task_id ?? undefined,
    photoId: r.photo_id ?? undefined,
    orderId: r.order_id ?? undefined,
    lineItemId: r.line_item_id ?? undefined,
    assigneeId: r.assignee_id ?? undefined,
    createdBy: r.created_by ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    verifiedAt: r.verified_at ?? undefined,
  };
}

const NOT_CONFIGURED = new Error(
  'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in frontend/.env.local.',
);

export async function listDefects(projectId: string): Promise<Defect[]> {
  if (!supabaseConfigured() || !isUuid(projectId)) return [];
  const { data, error } = await supabase
    .from('defects')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => mapDefectRow(r as DefectRow));
}

export interface NewDefect {
  title: string;
  description?: string;
  severity?: DefectSeverity;
  taskId?: string;
  photoId?: string;
  orderId?: string;
  lineItemId?: string;
  assigneeId?: string;
  createdBy?: string;
}

export async function createDefect(projectId: string, d: NewDefect): Promise<Defect> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { data, error } = await supabase
    .from('defects')
    .insert({
      project_id: projectId,
      title: d.title,
      description: d.description ?? null,
      severity: d.severity ?? 'medium',
      status: 'open',
      task_id: d.taskId ?? null,
      photo_id: d.photoId ?? null,
      // Only sent when a material link is supplied (Inventory "Report defect").
      // Omitting the keys otherwise keeps board-side creation working even if
      // migration 43 hasn't been applied yet (no reference to absent columns).
      ...(d.orderId    ? { order_id: d.orderId }         : {}),
      ...(d.lineItemId ? { line_item_id: d.lineItemId }  : {}),
      assignee_id: d.assigneeId ?? null,
      created_by: d.createdBy ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return mapDefectRow(data as DefectRow);
}

export interface DefectPatch {
  title?: string;
  description?: string;
  severity?: DefectSeverity;
  status?: DefectStatus;
  assigneeId?: string | null;
}

export async function updateDefect(id: string, patch: DefectPatch): Promise<void> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined)       row.title = patch.title;
  if (patch.description !== undefined) row.description = patch.description ?? null;
  if (patch.severity !== undefined)    row.severity = patch.severity;
  if (patch.assigneeId !== undefined)  row.assignee_id = patch.assigneeId;
  if (patch.status !== undefined) {
    row.status = patch.status;
    // Stamp / clear the sign-off milestone as the defect crosses verified.
    row.verified_at = patch.status === 'verified' ? new Date().toISOString() : null;
  }
  const { error } = await supabase.from('defects').update(row).eq('id', id);
  if (error) throw error;
}

export async function deleteDefect(id: string): Promise<void> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { error } = await supabase.from('defects').delete().eq('id', id);
  if (error) throw error;
}

// Per-subscription channel counter. Two components subscribe to defects at the
// same time now — the Inventory "Materials ledger" (inline chips + KPIs) and the
// nested Defect register board. supabase-js reuses a channel when the topic name
// matches, then throws "cannot add `postgres_changes` callbacks ... after
// `subscribe()`" on the second subscriber. A unique suffix keeps topics distinct.
let defectsChannelSeq = 0;

export function subscribeToProjectDefects(
  projectId: string,
  handlers: {
    onInsert: (d: Defect) => void;
    onUpdate: (d: Defect) => void;
    onDelete: (id: string) => void;
  },
): () => void {
  if (!supabaseConfigured() || !isUuid(projectId)) return () => void 0;
  const channel: RealtimeChannel = supabase
    .channel(`defects:${projectId}:${++defectsChannelSeq}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'defects', filter: `project_id=eq.${projectId}` },
      (payload) => handlers.onInsert(mapDefectRow(payload.new as DefectRow)),
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'defects', filter: `project_id=eq.${projectId}` },
      (payload) => handlers.onUpdate(mapDefectRow(payload.new as DefectRow)),
    )
    .on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'defects', filter: `project_id=eq.${projectId}` },
      (payload) => {
        const old = payload.old as { id?: string };
        if (old?.id) handlers.onDelete(old.id);
      },
    )
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
}

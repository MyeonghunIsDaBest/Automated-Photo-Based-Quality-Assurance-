// Typed CRUD + realtime for the `warranties` table — the first procurement
// domain persisted to Supabase (roadmap P1.5). Conventions mirror
// lib/api/tasks.ts (throw on error, no-op / empty in mock mode, snake_case
// row shape) and lib/api/diaryEntries.ts (a co-located realtime subscribe
// helper returning an unsubscribe fn). This is the template the remaining
// procurement domains (orders/deliveries/invoices, punch/checklists) follow.

import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase, supabaseConfigured, isUuid } from '../supabase';
import type { Warranty } from '../../pages/gantt/types';

export interface WarrantyRow {
  id: string;
  project_id: string;
  org_id: string | null;
  description: string;
  supplier_name: string;
  start_date: string;
  expiry_date: string;
  invoice_id: string | null;
  order_id: string | null;
  line_item_id: string | null;
  file_ref: string | null;
  notes: string | null;
  created_at: string;
}

export function mapWarrantyRow(r: WarrantyRow): Warranty {
  return {
    id: r.id,
    projectId: r.project_id,
    description: r.description,
    supplierName: r.supplier_name,
    startDate: r.start_date,
    expiryDate: r.expiry_date,
    invoiceId: r.invoice_id ?? undefined,
    orderId: r.order_id ?? undefined,
    lineItemId: r.line_item_id ?? undefined,
    fileRef: r.file_ref ?? undefined,
    notes: r.notes ?? undefined,
    createdAt: r.created_at,
  };
}

const NOT_CONFIGURED = new Error(
  'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in frontend/.env.local.',
);

/** All warranties for a project, soonest expiry first. Empty in mock mode or
 *  for a non-UUID (demo) project id. */
export async function listWarranties(projectId: string): Promise<Warranty[]> {
  if (!supabaseConfigured() || !isUuid(projectId)) return [];
  const { data, error } = await supabase
    .from('warranties')
    .select('*')
    .eq('project_id', projectId)
    .order('expiry_date', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => mapWarrantyRow(r as WarrantyRow));
}

export interface NewWarranty {
  description: string;
  supplierName: string;
  startDate: string;
  expiryDate: string;
  invoiceId?: string;
  orderId?: string;
  lineItemId?: string;
  fileRef?: string;
  notes?: string;
}

/** Insert a warranty; returns the persisted row (with its generated id). */
export async function createWarranty(projectId: string, w: NewWarranty): Promise<Warranty> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { data, error } = await supabase
    .from('warranties')
    .insert({
      project_id: projectId,
      description: w.description,
      supplier_name: w.supplierName,
      start_date: w.startDate,
      expiry_date: w.expiryDate,
      invoice_id: w.invoiceId ?? null,
      order_id: w.orderId ?? null,
      line_item_id: w.lineItemId ?? null,
      file_ref: w.fileRef ?? null,
      notes: w.notes ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return mapWarrantyRow(data as WarrantyRow);
}

export async function deleteWarranty(id: string): Promise<void> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { error } = await supabase.from('warranties').delete().eq('id', id);
  if (error) throw error;
}

/** Subscribe to warranty inserts/deletes for a project. Returns an
 *  unsubscribe fn for useEffect cleanup. No-op (noop) in mock mode. */
export function subscribeToProjectWarranties(
  projectId: string,
  handlers: { onInsert: (w: Warranty) => void; onDelete: (id: string) => void },
): () => void {
  if (!supabaseConfigured() || !isUuid(projectId)) return () => void 0;
  const channel: RealtimeChannel = supabase
    .channel(`warranties:${projectId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'warranties', filter: `project_id=eq.${projectId}` },
      (payload) => handlers.onInsert(mapWarrantyRow(payload.new as WarrantyRow)),
    )
    .on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'warranties', filter: `project_id=eq.${projectId}` },
      (payload) => {
        const old = payload.old as { id?: string };
        if (old?.id) handlers.onDelete(old.id);
      },
    )
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
}

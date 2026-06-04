// Persistence + realtime for the `orders` table (roadmap P1.2). Orders use the
// DUAL-WRITE pattern (like diaryEntries): the Zustand gantt store stays the
// editing source of truth + owns deriveOrderStatus and the delivery→order
// receipt logic; the store mirrors each change here (best-effort), and
// OrdersTab hydrates from here + subscribes to realtime. Line items ride along
// as an embedded jsonb array, matching the Order shape verbatim.

import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase, supabaseConfigured, isUuid } from '../supabase';
import type { Order, OrderLineItem, OrderStatus, SupplierResponse } from '../../pages/gantt/types';

export interface OrderRow {
  id: string;
  project_id: string;
  org_id: string | null;
  po_number: string;
  supplier_id: string | null;
  supplier_name: string;
  zone_id: string | null;
  task_id: string | null;
  ordered_date: string;
  expected_delivery: string | null;
  status: OrderStatus;
  notes: string | null;
  line_items: OrderLineItem[];
  created_at: string;
  // Migration 47 (deploy-gated). Optional here so a SELECT * pre-deploy (columns
  // absent) maps cleanly to undefined rather than throwing.
  supplier_response?: SupplierResponse | null;
  supplier_responded_at?: string | null;
  supplier_response_note?: string | null;
}

export function mapOrderRow(r: OrderRow): Order {
  return {
    id: r.id,
    projectId: r.project_id,
    poNumber: r.po_number,
    supplierId: r.supplier_id ?? undefined,
    supplierName: r.supplier_name,
    zoneId: r.zone_id ?? undefined,
    taskId: r.task_id ?? undefined,
    orderedDate: r.ordered_date,
    expectedDelivery: r.expected_delivery ?? undefined,
    status: r.status,
    notes: r.notes ?? undefined,
    lineItems: Array.isArray(r.line_items) ? r.line_items : [],
    supplierResponse: r.supplier_response ?? undefined,
    supplierRespondedAt: r.supplier_responded_at ?? undefined,
    supplierResponseNote: r.supplier_response_note ?? undefined,
  };
}

function toRow(o: Order) {
  return {
    id: o.id,
    project_id: o.projectId,
    po_number: o.poNumber,
    supplier_id: o.supplierId ?? null,
    supplier_name: o.supplierName,
    zone_id: o.zoneId ?? null,
    task_id: o.taskId ?? null,
    ordered_date: o.orderedDate,
    expected_delivery: o.expectedDelivery ?? null,
    status: o.status,
    notes: o.notes ?? null,
    line_items: o.lineItems,
  };
}

export async function listOrders(projectId: string): Promise<Order[]> {
  if (!supabaseConfigured() || !isUuid(projectId)) return [];
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('project_id', projectId)
    .order('ordered_date', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => mapOrderRow(r as OrderRow));
}

/** Mirror an order (insert or update) to Supabase. Best-effort: the local
 *  store is the source of truth, so a failure is logged, never thrown. Upsert
 *  on the text id makes a realtime echo / retry idempotent. No-op in mock mode. */
export async function upsertOrder(o: Order): Promise<void> {
  if (!supabaseConfigured()) return;
  const { error } = await supabase.from('orders').upsert(toRow(o), { onConflict: 'id' });
  if (error) console.warn('[orders] upsert failed (order still saved locally):', error.message);
}

export async function deleteOrderRemote(id: string): Promise<void> {
  if (!supabaseConfigured()) return;
  const { error } = await supabase.from('orders').delete().eq('id', id);
  if (error) console.warn('[orders] delete failed:', error.message);
}

/** Supplier Accept/Hold/Decline (role-experiences). Targeted update of ONLY the
 *  response columns — kept separate from `upsertOrder`/`toRow` so normal order
 *  writes keep working before migration 47 lands. Best-effort: a missing-column
 *  error pre-deploy is logged, never thrown (the local store already reflects
 *  the response optimistically). The RLS policy in migration 47 restricts this
 *  to the supplier's own POs on their invited projects. */
export async function updateOrderResponse(
  id: string,
  response: SupplierResponse,
  note?: string,
): Promise<void> {
  if (!supabaseConfigured()) return;
  const { error } = await supabase
    .from('orders')
    .update({
      supplier_response: response,
      supplier_responded_at: new Date().toISOString(),
      supplier_response_note: note ?? null,
    })
    .eq('id', id);
  if (error) console.warn('[orders] response update failed (saved locally):', error.message);
}

/** Subscribe to order inserts/updates/deletes for a project. Returns an
 *  unsubscribe fn. No-op in mock mode. */
export function subscribeToProjectOrders(
  projectId: string,
  handlers: { onUpsert: (o: Order) => void; onDelete: (id: string) => void },
): () => void {
  if (!supabaseConfigured() || !isUuid(projectId)) return () => void 0;
  const channel: RealtimeChannel = supabase
    .channel(`orders:${projectId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'orders', filter: `project_id=eq.${projectId}` },
      (payload) => handlers.onUpsert(mapOrderRow(payload.new as OrderRow)),
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'orders', filter: `project_id=eq.${projectId}` },
      (payload) => handlers.onUpsert(mapOrderRow(payload.new as OrderRow)),
    )
    .on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'orders', filter: `project_id=eq.${projectId}` },
      (payload) => {
        const old = payload.old as { id?: string };
        if (old?.id) handlers.onDelete(old.id);
      },
    )
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
}

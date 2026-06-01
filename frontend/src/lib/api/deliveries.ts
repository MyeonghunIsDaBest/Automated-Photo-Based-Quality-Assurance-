// Persistence + realtime for the `deliveries` table (roadmap P1.3). Dual-write
// pattern (the store owns the receipt→order logic; this mirrors the delivery
// records). `items` rides along as embedded jsonb.

import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase, supabaseConfigured, isUuid } from '../supabase';
import type { Delivery, DeliveryLineItem } from '../../pages/gantt/types';

export interface DeliveryRow {
  id: string;
  project_id: string;
  org_id: string | null;
  order_id: string;
  received_date: string;
  received_by: string | null;
  items: DeliveryLineItem[];
  photo_ids: string[];
  notes: string | null;
  created_at: string;
}

export function mapDeliveryRow(r: DeliveryRow): Delivery {
  return {
    id: r.id,
    projectId: r.project_id,
    orderId: r.order_id,
    receivedDate: r.received_date,
    receivedBy: r.received_by ?? '',
    items: Array.isArray(r.items) ? r.items : [],
    photoIds: Array.isArray(r.photo_ids) ? r.photo_ids : [],
    notes: r.notes ?? undefined,
    createdAt: r.created_at,
  };
}

function toRow(d: Delivery) {
  return {
    id: d.id,
    project_id: d.projectId,
    order_id: d.orderId,
    received_date: d.receivedDate,
    received_by: d.receivedBy || null,
    items: d.items,
    photo_ids: d.photoIds,
    notes: d.notes ?? null,
  };
}

export async function listDeliveries(projectId: string): Promise<Delivery[]> {
  if (!supabaseConfigured() || !isUuid(projectId)) return [];
  const { data, error } = await supabase
    .from('deliveries')
    .select('*')
    .eq('project_id', projectId)
    .order('received_date', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => mapDeliveryRow(r as DeliveryRow));
}

export async function upsertDelivery(d: Delivery): Promise<void> {
  if (!supabaseConfigured()) return;
  const { error } = await supabase.from('deliveries').upsert(toRow(d), { onConflict: 'id' });
  if (error) console.warn('[deliveries] upsert failed (saved locally):', error.message);
}

export async function deleteDeliveryRemote(id: string): Promise<void> {
  if (!supabaseConfigured()) return;
  const { error } = await supabase.from('deliveries').delete().eq('id', id);
  if (error) console.warn('[deliveries] delete failed:', error.message);
}

export function subscribeToProjectDeliveries(
  projectId: string,
  handlers: { onUpsert: (d: Delivery) => void; onDelete: (id: string) => void },
): () => void {
  if (!supabaseConfigured() || !isUuid(projectId)) return () => void 0;
  const channel: RealtimeChannel = supabase
    .channel(`deliveries:${projectId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'deliveries', filter: `project_id=eq.${projectId}` },
      (payload) => handlers.onUpsert(mapDeliveryRow(payload.new as DeliveryRow)),
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'deliveries', filter: `project_id=eq.${projectId}` },
      (payload) => handlers.onUpsert(mapDeliveryRow(payload.new as DeliveryRow)),
    )
    .on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'deliveries', filter: `project_id=eq.${projectId}` },
      (payload) => {
        const old = payload.old as { id?: string };
        if (old?.id) handlers.onDelete(old.id);
      },
    )
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
}

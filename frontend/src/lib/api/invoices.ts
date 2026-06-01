// Persistence + realtime for the `invoices` table (roadmap P1.4). Dual-write
// pattern (the store stays the editing source of truth; this mirrors).

import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase, supabaseConfigured, isUuid } from '../supabase';
import type { Invoice, InvoiceStatus } from '../../pages/gantt/types';

export interface InvoiceRow {
  id: string;
  project_id: string;
  org_id: string | null;
  order_id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  amount: number;
  status: InvoiceStatus;
  paid_date: string | null;
  file_ref: string | null;
  notes: string | null;
  created_at: string;
}

export function mapInvoiceRow(r: InvoiceRow): Invoice {
  return {
    id: r.id,
    projectId: r.project_id,
    orderId: r.order_id,
    invoiceNumber: r.invoice_number,
    invoiceDate: r.invoice_date,
    dueDate: r.due_date,
    amount: Number(r.amount),
    status: r.status,
    paidDate: r.paid_date ?? undefined,
    fileRef: r.file_ref ?? undefined,
    notes: r.notes ?? undefined,
    createdAt: r.created_at,
  };
}

function toRow(i: Invoice) {
  return {
    id: i.id,
    project_id: i.projectId,
    order_id: i.orderId,
    invoice_number: i.invoiceNumber,
    invoice_date: i.invoiceDate,
    due_date: i.dueDate,
    amount: i.amount,
    status: i.status,
    paid_date: i.paidDate ?? null,
    file_ref: i.fileRef ?? null,
    notes: i.notes ?? null,
  };
}

export async function listInvoices(projectId: string): Promise<Invoice[]> {
  if (!supabaseConfigured() || !isUuid(projectId)) return [];
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('project_id', projectId)
    .order('due_date', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => mapInvoiceRow(r as InvoiceRow));
}

export async function upsertInvoice(i: Invoice): Promise<void> {
  if (!supabaseConfigured()) return;
  const { error } = await supabase.from('invoices').upsert(toRow(i), { onConflict: 'id' });
  if (error) console.warn('[invoices] upsert failed (saved locally):', error.message);
}

export async function deleteInvoiceRemote(id: string): Promise<void> {
  if (!supabaseConfigured()) return;
  const { error } = await supabase.from('invoices').delete().eq('id', id);
  if (error) console.warn('[invoices] delete failed:', error.message);
}

export function subscribeToProjectInvoices(
  projectId: string,
  handlers: { onUpsert: (i: Invoice) => void; onDelete: (id: string) => void },
): () => void {
  if (!supabaseConfigured() || !isUuid(projectId)) return () => void 0;
  const channel: RealtimeChannel = supabase
    .channel(`invoices:${projectId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'invoices', filter: `project_id=eq.${projectId}` },
      (payload) => handlers.onUpsert(mapInvoiceRow(payload.new as InvoiceRow)),
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'invoices', filter: `project_id=eq.${projectId}` },
      (payload) => handlers.onUpsert(mapInvoiceRow(payload.new as InvoiceRow)),
    )
    .on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'invoices', filter: `project_id=eq.${projectId}` },
      (payload) => {
        const old = payload.old as { id?: string };
        if (old?.id) handlers.onDelete(old.id);
      },
    )
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
}

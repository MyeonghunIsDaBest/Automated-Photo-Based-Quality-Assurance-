// Typed CRUD + realtime for the `certifications` table (roadmap P5.2). Full-swap.

import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase, supabaseConfigured, isUuid } from '../supabase';

export type CertKind = 'white_card' | 'induction' | 'license' | 'ticket' | 'other';

export interface Certification {
  id: string;
  projectId: string;
  workerName: string;
  kind: CertKind;
  name: string;
  reference?: string;
  issuedDate?: string;
  expiryDate?: string;
  required: boolean;
  notes?: string;
  createdBy?: string;
  createdAt: string;
}

export interface CertificationRow {
  id: string;
  project_id: string;
  org_id: string | null;
  worker_name: string;
  kind: CertKind;
  name: string;
  reference: string | null;
  issued_date: string | null;
  expiry_date: string | null;
  required: boolean;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export function mapCertificationRow(r: CertificationRow): Certification {
  return {
    id: r.id,
    projectId: r.project_id,
    workerName: r.worker_name,
    kind: r.kind,
    name: r.name,
    reference: r.reference ?? undefined,
    issuedDate: r.issued_date ?? undefined,
    expiryDate: r.expiry_date ?? undefined,
    required: r.required,
    notes: r.notes ?? undefined,
    createdBy: r.created_by ?? undefined,
    createdAt: r.created_at,
  };
}

/** Expiry classification used by the UI (and the future assignment block). */
export type CertExpiryState = 'valid' | 'expiring' | 'expired' | 'none';

export function certExpiryState(c: Certification, withinDays = 30): CertExpiryState {
  if (!c.expiryDate) return 'none';
  const exp = Date.parse(c.expiryDate);
  if (!Number.isFinite(exp)) return 'none';
  const now = Date.now();
  if (exp < now) return 'expired';
  if (exp <= now + withinDays * 86_400_000) return 'expiring';
  return 'valid';
}

const NOT_CONFIGURED = new Error('Supabase is not configured.');

export async function listCertifications(projectId: string): Promise<Certification[]> {
  if (!supabaseConfigured() || !isUuid(projectId)) return [];
  const { data, error } = await supabase
    .from('certifications')
    .select('*')
    .eq('project_id', projectId)
    .order('expiry_date', { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data ?? []).map((r) => mapCertificationRow(r as CertificationRow));
}

export interface NewCertification {
  workerName: string;
  kind: CertKind;
  name: string;
  reference?: string;
  issuedDate?: string;
  expiryDate?: string;
  required?: boolean;
  notes?: string;
  createdBy?: string;
}

export async function createCertification(projectId: string, c: NewCertification): Promise<Certification> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { data, error } = await supabase
    .from('certifications')
    .insert({
      project_id: projectId,
      worker_name: c.workerName,
      kind: c.kind,
      name: c.name,
      reference: c.reference ?? null,
      issued_date: c.issuedDate ?? null,
      expiry_date: c.expiryDate ?? null,
      required: c.required ?? false,
      notes: c.notes ?? null,
      created_by: c.createdBy ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return mapCertificationRow(data as CertificationRow);
}

export async function deleteCertification(id: string): Promise<void> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { error } = await supabase.from('certifications').delete().eq('id', id);
  if (error) throw error;
}

export function subscribeToProjectCertifications(
  projectId: string,
  handlers: { onInsert: (c: Certification) => void; onDelete: (id: string) => void },
): () => void {
  if (!supabaseConfigured() || !isUuid(projectId)) return () => void 0;
  const channel: RealtimeChannel = supabase
    .channel(`certifications:${projectId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'certifications', filter: `project_id=eq.${projectId}` },
      (p) => handlers.onInsert(mapCertificationRow(p.new as CertificationRow)))
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'certifications', filter: `project_id=eq.${projectId}` },
      (p) => { const old = p.old as { id?: string }; if (old?.id) handlers.onDelete(old.id); })
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
}

// Typed CRUD for the `signoffs` table (roadmap P4.2) — immutable ITP sign-off
// records captured when a manager confirms a photo analysis. Full-swap domain.

import { supabase, supabaseConfigured, isUuid } from '../supabase';

export interface Signoff {
  id: string;
  projectId: string;
  photoId?: string;
  taskId?: string;
  kind: 'itp';
  signerId?: string;
  signerName: string;
  signatureData: string;
  pct?: number;
  notes?: string;
  createdAt: string;
}

export interface SignoffRow {
  id: string;
  project_id: string;
  org_id: string | null;
  photo_id: string | null;
  task_id: string | null;
  kind: 'itp';
  signer_id: string | null;
  signer_name: string;
  signature_data: string;
  pct: number | null;
  notes: string | null;
  created_at: string;
}

export function mapSignoffRow(r: SignoffRow): Signoff {
  return {
    id: r.id,
    projectId: r.project_id,
    photoId: r.photo_id ?? undefined,
    taskId: r.task_id ?? undefined,
    kind: r.kind,
    signerId: r.signer_id ?? undefined,
    signerName: r.signer_name,
    signatureData: r.signature_data,
    pct: r.pct ?? undefined,
    notes: r.notes ?? undefined,
    createdAt: r.created_at,
  };
}

const NOT_CONFIGURED = new Error('Supabase is not configured.');

export interface NewSignoff {
  photoId?: string;
  taskId?: string;
  signerId?: string;
  signerName: string;
  signatureData: string;
  pct?: number;
  notes?: string;
}

export async function createSignoff(projectId: string, s: NewSignoff): Promise<Signoff> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { data, error } = await supabase
    .from('signoffs')
    .insert({
      project_id: projectId,
      photo_id: s.photoId ?? null,
      task_id: s.taskId ?? null,
      kind: 'itp',
      signer_id: s.signerId ?? null,
      signer_name: s.signerName,
      signature_data: s.signatureData,
      pct: s.pct ?? null,
      notes: s.notes ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return mapSignoffRow(data as SignoffRow);
}

export async function listSignoffs(projectId: string): Promise<Signoff[]> {
  if (!supabaseConfigured() || !isUuid(projectId)) return [];
  const { data, error } = await supabase
    .from('signoffs')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => mapSignoffRow(r as SignoffRow));
}

export async function listSignoffsForPhoto(photoId: string): Promise<Signoff[]> {
  if (!supabaseConfigured() || !isUuid(photoId)) return [];
  const { data, error } = await supabase
    .from('signoffs')
    .select('*')
    .eq('photo_id', photoId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => mapSignoffRow(r as SignoffRow));
}

export async function deleteSignoff(id: string): Promise<void> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { error } = await supabase.from('signoffs').delete().eq('id', id);
  if (error) throw error;
}

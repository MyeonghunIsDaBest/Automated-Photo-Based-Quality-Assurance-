// Typed CRUD + realtime for the `safety_documents` table (roadmap P1.7).
// Full-swap domain: the Safety page owns this data — there is no Zustand
// mirror. Conventions mirror lib/api/warranties.ts (throw on error, empty/no-op
// in mock mode, snake_case row shape, a co-located realtime subscribe helper).
//
// Returns the existing `SafetyDocument` domain type from pages/safety/types so
// the page's DocRow renderer needs no changes.

import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase, supabaseConfigured, isUuid } from '../supabase';
import type { SafetyDocument, SafetyDocCategory } from '../../pages/safety/types';

export interface SafetyDocumentRow {
  id: string;
  project_id: string;
  org_id: string | null;
  category: SafetyDocCategory;
  title: string;
  reference: string | null;
  effective_date: string;
  expiry_date: string | null;
  file_name: string;
  file_size_kb: number | null;
  file_ref: string | null;
  uploaded_by: string;
  uploaded_at: string;
  notes: string | null;
  created_at: string;
}

export function mapSafetyDocumentRow(r: SafetyDocumentRow): SafetyDocument {
  return {
    id: r.id,
    category: r.category,
    title: r.title,
    reference: r.reference ?? undefined,
    effectiveDate: r.effective_date,
    expiryDate: r.expiry_date ?? undefined,
    fileName: r.file_name,
    fileSizeKb: r.file_size_kb ?? undefined,
    uploadedBy: r.uploaded_by,
    uploadedAt: r.uploaded_at,
    notes: r.notes ?? undefined,
  };
}

const NOT_CONFIGURED = new Error(
  'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in frontend/.env.local.',
);

/** All safety documents for a project, newest upload first. Empty in mock mode
 *  or for a non-UUID (demo) project id. */
export async function listSafetyDocuments(projectId: string): Promise<SafetyDocument[]> {
  if (!supabaseConfigured() || !isUuid(projectId)) return [];
  const { data, error } = await supabase
    .from('safety_documents')
    .select('*')
    .eq('project_id', projectId)
    .order('uploaded_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => mapSafetyDocumentRow(r as SafetyDocumentRow));
}

/** A new document is the SafetyDocument shape minus the generated id. */
export type NewSafetyDocument = Omit<SafetyDocument, 'id'>;

/** Insert a document; returns the persisted row (with its generated id). */
export async function createSafetyDocument(
  projectId: string,
  d: NewSafetyDocument,
): Promise<SafetyDocument> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { data, error } = await supabase
    .from('safety_documents')
    .insert({
      project_id: projectId,
      category: d.category,
      title: d.title,
      reference: d.reference ?? null,
      effective_date: d.effectiveDate,
      expiry_date: d.expiryDate ?? null,
      file_name: d.fileName,
      file_size_kb: d.fileSizeKb ?? null,
      uploaded_by: d.uploadedBy,
      uploaded_at: d.uploadedAt,
      notes: d.notes ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return mapSafetyDocumentRow(data as SafetyDocumentRow);
}

export async function deleteSafetyDocument(id: string): Promise<void> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { error } = await supabase.from('safety_documents').delete().eq('id', id);
  if (error) throw error;
}

/** Subscribe to document inserts/deletes for a project. Returns an unsubscribe
 *  fn for useEffect cleanup. No-op in mock mode. */
export function subscribeToProjectSafetyDocuments(
  projectId: string,
  handlers: { onInsert: (d: SafetyDocument) => void; onDelete: (id: string) => void },
): () => void {
  if (!supabaseConfigured() || !isUuid(projectId)) return () => void 0;
  const channel: RealtimeChannel = supabase
    .channel(`safety_documents:${projectId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'safety_documents', filter: `project_id=eq.${projectId}` },
      (payload) => handlers.onInsert(mapSafetyDocumentRow(payload.new as SafetyDocumentRow)),
    )
    .on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'safety_documents', filter: `project_id=eq.${projectId}` },
      (payload) => {
        const old = payload.old as { id?: string };
        if (old?.id) handlers.onDelete(old.id);
      },
    )
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
}

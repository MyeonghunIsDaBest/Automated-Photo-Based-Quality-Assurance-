// CRUD wrappers + storage upload for `user_documents`. All admin-write only
// (RLS enforced); reads are open to any authed user.

import { supabase, supabaseConfigured } from '../supabase';
import type { ExpiryAlert, UserDocument } from '../../types';

const BUCKET = 'user-documents';

const NOT_CONFIGURED = new Error(
  'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in frontend/.env.local.',
);

interface UserDocumentRow {
  id: string;
  user_id: string;
  document_name: string;
  reference_no: string | null;
  expiry_date: string | null;
  expiry_alert: ExpiryAlert | null;
  notes: string | null;
  storage_path: string;
  file_size_kb: number;
  uploaded_by: string | null;
  uploaded_at: string;
}

function rowToDoc(r: UserDocumentRow): UserDocument {
  return {
    id: r.id,
    userId: r.user_id,
    documentName: r.document_name,
    referenceNo: r.reference_no ?? undefined,
    expiryDate: r.expiry_date ?? undefined,
    expiryAlert: r.expiry_alert ?? undefined,
    notes: r.notes ?? undefined,
    storagePath: r.storage_path,
    fileSizeKb: r.file_size_kb,
    uploadedBy: r.uploaded_by ?? undefined,
    uploadedAt: r.uploaded_at,
  };
}

export interface UserDocumentInput {
  userId: string;
  documentName: string;
  referenceNo?: string;
  expiryDate?: string;
  expiryAlert?: ExpiryAlert;
  notes?: string;
  file: File;
}

export async function listUserDocuments(userId: string): Promise<UserDocument[]> {
  if (!supabaseConfigured()) return [];
  const { data, error } = await supabase
    .from('user_documents')
    .select('*')
    .eq('user_id', userId)
    .order('uploaded_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => rowToDoc(r as UserDocumentRow));
}

// Uploads the file to the `user-documents` bucket then writes the metadata row.
export async function createUserDocument(input: UserDocumentInput): Promise<UserDocument> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;

  const ext = input.file.name.split('.').pop() ?? 'bin';
  const safeName = input.documentName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
  const storagePath = `${input.userId}/${Date.now()}_${safeName}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, input.file, { contentType: input.file.type, upsert: false });
  if (upErr) throw upErr;

  const { data: sessionData } = await supabase.auth.getSession();
  const uploadedBy = sessionData.session?.user.id ?? null;

  const { data, error } = await supabase
    .from('user_documents')
    .insert({
      user_id: input.userId,
      document_name: input.documentName,
      reference_no: input.referenceNo ?? null,
      expiry_date: input.expiryDate ?? null,
      expiry_alert: input.expiryAlert ?? null,
      notes: input.notes ?? null,
      storage_path: storagePath,
      file_size_kb: Math.max(1, Math.round(input.file.size / 1024)),
      uploaded_by: uploadedBy,
    })
    .select('*')
    .single();
  if (error) {
    // Best-effort cleanup if metadata insert failed after upload.
    await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => {});
    throw error;
  }
  return rowToDoc(data as UserDocumentRow);
}

export async function deleteUserDocument(doc: UserDocument): Promise<void> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { error } = await supabase.from('user_documents').delete().eq('id', doc.id);
  if (error) throw error;
  await supabase.storage.from(BUCKET).remove([doc.storagePath]).catch(() => {});
}

// Builds a short-lived signed URL so admins can preview/download the file.
export async function getDocumentSignedUrl(doc: UserDocument, ttlSeconds = 60): Promise<string> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(doc.storagePath, ttlSeconds);
  if (error) throw error;
  return data.signedUrl;
}

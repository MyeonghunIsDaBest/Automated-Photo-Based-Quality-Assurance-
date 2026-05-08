// Photo upload + listing helpers.
//
// Layout in storage:  photos/{project_id}/{photo_id}.{ext}
// The bucket is private — `getPhotoUrl()` returns a short-lived signed URL.

import { supabase, supabaseConfigured } from '../supabase';

export interface PhotoRow {
  id: string;
  project_id: string;
  task_id: string | null;
  zone_id: string | null;
  uploaded_by: string | null;
  filename: string;
  storage_path: string;
  thumbnail_path: string | null;
  file_size_kb: number;
  width: number;
  height: number;
  taken_at: string | null;
  uploaded_at: string;
  gps_lat: number | null;
  gps_lng: number | null;
  notes: string | null;
  ai_analyzed: boolean;
  perceptual_hash?: string | null;
}

interface UploadInput {
  file: File;
  projectId: string;
  taskId?: string;
  zoneId?: string;
  notes?: string;
  gpsLat?: number | null;
  gpsLng?: number | null;
  takenAt?: string | null;
  perceptualHash?: string | null;
  width?: number;
  height?: number;
}

const NOT_CONFIGURED = new Error(
  'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in frontend/.env.local.'
);

const PHOTOS_BUCKET = 'photos';

function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).toLowerCase() : 'bin';
}

// Uploads a single file to Storage, then inserts the metadata row in the
// `photos` table. Returns the new row.
export async function uploadPhoto({
  file, projectId, taskId, zoneId, notes,
  gpsLat, gpsLng, takenAt, perceptualHash, width, height,
}: UploadInput): Promise<PhotoRow> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;

  // crypto.randomUUID() is in every modern browser Vite supports.
  const photoId = crypto.randomUUID();
  const storagePath = `${projectId}/${photoId}.${extOf(file.name)}`;

  const upload = await supabase.storage
    .from(PHOTOS_BUCKET)
    .upload(storagePath, file, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    });
  if (upload.error) throw upload.error;

  const { data, error } = await supabase
    .from('photos')
    .insert({
      id: photoId,
      project_id: projectId,
      task_id: taskId ?? null,
      zone_id: zoneId ?? null,
      filename: file.name,
      storage_path: storagePath,
      file_size_kb: Math.round(file.size / 1024),
      width: width ?? 0,
      height: height ?? 0,
      taken_at: takenAt ?? null,
      gps_lat: gpsLat ?? null,
      gps_lng: gpsLng ?? null,
      perceptual_hash: perceptualHash ?? null,
      notes: notes ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;

  // Bump the task's photo_count so the Gantt badge stays accurate. Fire
  // and forget — a failure here shouldn't undo the upload.
  if (taskId) {
    supabase
      .rpc('increment_photo_count', { p_task_id: taskId })
      .then(() => void 0, () => void 0);
  }

  return data as PhotoRow;
}

export async function listPhotos(projectId: string, taskId?: string): Promise<PhotoRow[]> {
  if (!supabaseConfigured()) return [];
  let q = supabase
    .from('photos')
    .select('*')
    .eq('project_id', projectId)
    .order('uploaded_at', { ascending: false });
  if (taskId) q = q.eq('task_id', taskId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as PhotoRow[];
}

// Signed GET URL valid for `expiresInSeconds` (default 1h). The bucket is
// private so `<img src>` won't work without one.
export async function getPhotoUrl(storagePath: string, expiresInSeconds = 3600): Promise<string | null> {
  if (!supabaseConfigured()) return null;
  const { data, error } = await supabase.storage
    .from(PHOTOS_BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds);
  if (error) return null;
  return data?.signedUrl ?? null;
}

// Find photos in the same project whose perceptual_hash is within a given
// distance of the new candidate. Phase D-3 pushed this filter into Postgres
// via the `find_similar_photos` RPC (migration 05_phash_rpc.sql) so the
// client only sees the matching rows — at thousand-photo projects the
// previous client-side scan locked up the upload page.
export async function findSimilarPhotos(
  projectId: string,
  hash: string,
  maxDistance: number,
): Promise<PhotoRow[]> {
  if (!supabaseConfigured()) return [];
  if (!hash || hash.length !== 16) return [];

  const { data, error } = await supabase.rpc('find_similar_photos', {
    p_project_id: projectId,
    p_hash:       hash,
    p_threshold:  maxDistance,
  });
  if (error) throw error;
  return (data ?? []) as PhotoRow[];
}

export async function deletePhoto(photo: PhotoRow): Promise<void> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;

  // Storage first, then the metadata row — leaves the row behind if the
  // file delete fails so we don't lose the audit trail of "this photo
  // existed once".
  const storage = await supabase.storage.from(PHOTOS_BUCKET).remove([photo.storage_path]);
  if (storage.error) throw storage.error;

  const { error } = await supabase.from('photos').delete().eq('id', photo.id);
  if (error) throw error;
}

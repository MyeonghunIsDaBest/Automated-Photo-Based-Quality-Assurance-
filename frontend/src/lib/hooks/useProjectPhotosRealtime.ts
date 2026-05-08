import { useEffect } from 'react';
import { useAppStore } from '../../store';
import { subscribeToProjectPhotos } from '../api/realtime';
import { supabaseConfigured } from '../supabase';
import type { PhotoRow } from '../api/photos';
import type { Photo } from '../../types';

// Map a Supabase photo row into the camelCase Photo shape used in
// useAppStore.photos. The signed thumbnail URL is resolved lazily by
// rendering surfaces; storing the raw storage_path here keeps the realtime
// hot path cheap.
function mapPhotoRow(row: PhotoRow): Photo {
  return {
    id: row.id,
    projectId: row.project_id,
    zoneId: row.zone_id ?? undefined,
    taskId: row.task_id ?? undefined,
    uploadedBy: row.uploaded_by ?? '',
    filename: row.filename,
    storageUrl: row.storage_path,
    thumbnailUrl: row.thumbnail_path ?? undefined,
    fileSizeKb: row.file_size_kb,
    width: row.width,
    height: row.height,
    takenAt: row.taken_at ?? undefined,
    uploadedAt: row.uploaded_at,
    gpsLat: row.gps_lat ?? undefined,
    gpsLng: row.gps_lng ?? undefined,
    notes: row.notes ?? undefined,
    aiAnalyzed: row.ai_analyzed,
  };
}

// Layout-level photo realtime — replaces the per-tab subscription that used
// to live in `gantt/tabs/UploadsTab.tsx`. Mounted once at Layout so the
// Dashboard's activity feed + "today" widgets pick up new uploads while
// the user is on any page.
//
// INSERT-only — Supabase publication on `photos` is configured for inserts.
// We only push onto the cache; nothing here triggers a re-fetch of an
// existing row. Surfaces that need updates (e.g. AI analysis state) listen
// via `useProjectAnalysesRealtime` instead.
export function useProjectPhotosRealtime(projectId: string | null | undefined): void {
  useEffect(() => {
    if (!supabaseConfigured() || !projectId) return;

    const unsubscribe = subscribeToProjectPhotos(projectId, (row) => {
      useAppStore.getState().prependPhoto(mapPhotoRow(row));
    });

    return unsubscribe;
  }, [projectId]);
}

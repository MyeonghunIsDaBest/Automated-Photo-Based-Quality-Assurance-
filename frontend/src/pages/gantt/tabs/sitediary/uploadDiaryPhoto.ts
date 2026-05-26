// Shared upload + attach helper for the three Site Diary photo entry points
// (FAB camera, QuickAddRow Photo button, DiaryEntryDrawer photos pane).
//
// Surfaces the photos.ts UUID guard as a clean Error so callers can show a
// banner without copy-pasting the upload + attach flow.

import { uploadPhoto } from '../../../../lib/api/photos';
import type { PhotoRow } from '../../../../lib/api/photos';
import type { DiaryEntry } from '../../types';

type UpdateDiaryEntryFn = (
  projectId: string,
  id: string,
  patch: Partial<DiaryEntry>,
) => void;

interface AttachOptions {
  file: File;
  projectId: string;
  entry: DiaryEntry | null;          // null = file uploaded; caller will attach later
  updateDiaryEntry: UpdateDiaryEntryFn;
}

export interface AttachResult {
  photo: PhotoRow;
  photoId: string;
}

export async function uploadAndAttach({
  file,
  projectId,
  entry,
  updateDiaryEntry,
}: AttachOptions): Promise<AttachResult> {
  const photo = await uploadPhoto({ file, projectId });
  if (entry) {
    updateDiaryEntry(projectId, entry.id, {
      photoIds: [...entry.photoIds, photo.id],
    });
  }
  return { photo, photoId: photo.id };
}

// JobPhotosSection — Before / After / Other photo groups for a service job.
// Uploaded straight to Supabase storage via uploadServiceJobPhoto; thumbnails
// from listServiceJobPhotos (pre-signed URLs). No Object URL previews are
// created here — files go straight to storage, so there is no leak vector.

import { useRef, useState } from 'react';
import { Camera, Trash2, Loader2 } from 'lucide-react';
import {
  uploadServiceJobPhoto,
  deleteServiceJobPhoto,
  type ServiceJobPhoto,
  type ServiceJobPhotoKind,
} from '../../lib/api/serviceJobs';

interface Props {
  jobId: string;
  /** Photos already loaded by the parent (with signed `url` field). */
  photos: (ServiceJobPhoto & { url: string | null })[];
  /** True when the current user has manager-level delete rights. */
  canManage: boolean;
  /** The current user's own profile id — used to gate uploader-level delete. */
  currentProfileId: string | null;
  onChanged: () => void;
}

type UploadStatus = { busy: boolean; error: string | null };
type GroupUploadState = Record<ServiceJobPhotoKind, UploadStatus>;

const GROUPS: { kind: ServiceJobPhotoKind; label: string }[] = [
  { kind: 'before', label: 'Before' },
  { kind: 'after',  label: 'After'  },
  { kind: 'other',  label: 'Other'  },
];

const DEFAULT_UPLOAD_STATE: GroupUploadState = {
  before: { busy: false, error: null },
  after:  { busy: false, error: null },
  other:  { busy: false, error: null },
};

export function JobPhotosSection({ jobId, photos, canManage, currentProfileId, onChanged }: Props) {
  const [uploadState, setUploadState] = useState<GroupUploadState>(DEFAULT_UPLOAD_STATE);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const beforeRef = useRef<HTMLInputElement | null>(null);
  const afterRef  = useRef<HTMLInputElement | null>(null);
  const otherRef  = useRef<HTMLInputElement | null>(null);

  const inputRefs: Record<ServiceJobPhotoKind, React.RefObject<HTMLInputElement | null>> = {
    before: beforeRef,
    after:  afterRef,
    other:  otherRef,
  };

  const setGroupState = (kind: ServiceJobPhotoKind, patch: Partial<UploadStatus>) => {
    setUploadState((prev) => ({ ...prev, [kind]: { ...prev[kind], ...patch } }));
  };

  const handleFileChange = async (kind: ServiceJobPhotoKind, files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file.type.startsWith('image/')) {
      setGroupState(kind, { error: 'Only image files are accepted.' });
      return;
    }
    setGroupState(kind, { busy: true, error: null });
    try {
      await uploadServiceJobPhoto(jobId, file, kind);
      onChanged();
    } catch (e) {
      setGroupState(kind, { error: e instanceof Error ? e.message : 'Upload failed.' });
    } finally {
      setGroupState(kind, { busy: false });
      const ref = inputRefs[kind];
      if (ref.current) ref.current.value = '';
    }
  };

  const handleDelete = async (photoId: string) => {
    setDeleteError(null);
    try {
      await deleteServiceJobPhoto(photoId);
      onChanged();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Delete failed.');
    }
  };

  return (
    <section className="space-y-4">
      <label className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6B6B6B]">
        Photos
      </label>

      {deleteError && (
        <p className="rounded-md border border-[#F0C8C8] bg-[#FBE5E5] px-3 py-2 text-xs text-[#C44545]">
          {deleteError}
        </p>
      )}

      {GROUPS.map(({ kind, label }) => {
        const groupPhotos = photos.filter((p) => p.kind === kind);
        const state = uploadState[kind];
        const inputRef = inputRefs[kind];

        return (
          <div key={kind}>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[11px] font-medium text-[#6B6B6B]">{label}</span>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={state.busy}
                className="inline-flex items-center gap-1 rounded-full border border-[#E6E1D4] bg-white px-2.5 py-1 text-[11px] font-medium text-[#3A3A3A] hover:bg-[#FAF8F2] disabled:opacity-50"
              >
                {state.busy ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Camera className="h-3 w-3" />
                )}
                {state.busy ? 'Uploading…' : 'Add'}
              </button>
              <input
                ref={inputRef as React.RefObject<HTMLInputElement>}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => void handleFileChange(kind, e.target.files)}
                aria-label={`Upload ${label} photo`}
              />
            </div>

            {state.error && (
              <p className="mb-1.5 text-[11px] text-[#C44545]">{state.error}</p>
            )}

            {groupPhotos.length === 0 ? (
              <p className="text-[11px] text-[#A0A0A0]">No {label.toLowerCase()} photos yet.</p>
            ) : (
              <div className="grid grid-cols-3 gap-1.5">
                {groupPhotos.map((photo) => (
                  <div
                    key={photo.id}
                    className="group relative aspect-square overflow-hidden rounded-[7px] border border-[#E6E1D4] bg-[#F0EDE4]"
                  >
                    {photo.url ? (
                      <a
                        href={photo.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`View ${label} photo`}
                        className="block h-full w-full"
                      >
                        <img
                          src={photo.url}
                          alt={`${label} photo`}
                          className="h-full w-full object-cover"
                        />
                      </a>
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[10px] text-[#A0A0A0]">
                        No URL
                      </div>
                    )}
                    {(canManage || photo.uploadedBy === currentProfileId) && (
                      <button
                        type="button"
                        onClick={() => void handleDelete(photo.id)}
                        className="absolute right-1 top-1 hidden h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white group-hover:flex hover:bg-black"
                        aria-label="Delete photo"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}

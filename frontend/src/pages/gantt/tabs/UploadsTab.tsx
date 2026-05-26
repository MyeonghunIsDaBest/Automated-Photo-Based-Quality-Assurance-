// frontend/src/pages/gantt/tabs/UploadsTab.tsx
//
// Project Uploads tab — editorial-style gallery of project-scoped photos and
// videos. Drop a file in the top dropzone and it appears immediately below.
// Each tile has a hover-revealed delete affordance that calls deletePhoto()
// against Supabase Storage + the photos table.

import { useEffect, useRef, useState } from 'react';
import {
  Image as ImageIcon,
  Lock,
  Trash2,
  Upload as UploadIcon,
  Video as VideoIcon,
  X,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import type { Project, User } from '../../../types';
import { Badge } from '../../../components/ui/badge';
import {
  deletePhoto,
  getPhotoUrl,
  listPhotos,
  uploadPhoto,
  type PhotoRow,
} from '../../../lib/api/photos';
import { supabaseConfigured } from '../../../lib/supabase';
import { TabHeader } from '../components/TabHeader';

interface UploadsTabProps {
  project: Project;
  currentUser: User | null;
  canUpload: boolean;
}

interface PhotoTile {
  id: string;
  row: PhotoRow;             // kept for deletePhoto() — storage_path lives here
  filename: string;
  uploadedAt: string;
  url: string | null;
  isVideo: boolean;
}

const ACCEPT_ATTR = 'image/*,video/mp4,video/quicktime,.heic,.heif';

export function UploadsTab({ project, currentUser, canUpload }: UploadsTabProps) {
  const [items, setItems] = useState<PhotoTile[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const resolveTile = async (row: PhotoRow): Promise<PhotoTile> => {
    const url = await getPhotoUrl(row.storage_path);
    const ext = (row.filename.split('.').pop() ?? '').toLowerCase();
    return {
      id: row.id,
      row,
      filename: row.filename,
      uploadedAt: row.uploaded_at,
      url,
      isVideo: ext === 'mp4' || ext === 'mov',
    };
  };

  // Initial hydration — realtime is mounted higher in the tree, so this tab
  // only fetches once on mount. Locally-uploaded photos are appended in
  // handleFiles so the user sees the result without an extra round-trip.
  useEffect(() => {
    if (!supabaseConfigured() || !project?.id) return;
    let cancelled = false;
    const projectId = project.id;

    (async () => {
      try {
        const rows = await listPhotos(projectId);
        if (cancelled) return;
        const tiles = await Promise.all(rows.slice(0, 24).map(resolveTile));
        if (!cancelled) setItems(tiles);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load uploads.');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [project?.id]);

  const handleFiles = async (files: FileList | File[] | null) => {
    if (!files) return;
    const list = Array.from(files);
    if (list.length === 0) return;
    if (!supabaseConfigured()) {
      setError('Supabase is not configured — uploads need env keys.');
      return;
    }
    if (!currentUser) return;
    setBusy(true);
    setError(null);
    try {
      for (const file of list) {
        const row = await uploadPhoto({ file, projectId: project.id });
        const tile = await resolveTile(row);
        setItems((prev) => [tile, ...prev].slice(0, 24));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleDelete = async (tile: PhotoTile) => {
    setConfirmId(null);
    setDeleting(tile.id);
    setError(null);
    try {
      await deletePhoto(tile.row);
      setItems((prev) => prev.filter((t) => t.id !== tile.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete file.');
    } finally {
      setDeleting(null);
    }
  };

  return (
    <>
      <TabHeader
        eyebrow={`Workspace · Uploads · ${project.name}`}
        title="Photos & site footage."
        description="Drop site photos and videos. Files land in the project's gallery, feed the AI analyzer, and surface in the activity stream."
        action={
          canUpload ? null : (
            <Badge variant="secondary" className="gap-1.5 px-3 py-1.5">
              <Lock className="h-3.5 w-3.5" />
              Read-only
            </Badge>
          )
        }
      />

      {/* Editorial dropzone */}
      {canUpload ? (
        <div className="mb-4">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              void handleFiles(e.dataTransfer.files);
            }}
            className={`flex items-center gap-4 rounded-[12px] border-2 border-dashed px-5 py-5 transition-colors ${
              dragOver
                ? 'border-emerald-400 bg-emerald-50/40'
                : 'border-[#D6CDB7] bg-[#FAF8F2] hover:border-emerald-400 hover:bg-emerald-50/40'
            }`}
          >
            <span className="grid h-12 w-12 flex-shrink-0 place-items-center rounded-[10px] bg-white border border-[#E6E1D4]">
              <UploadIcon className="h-5 w-5 text-emerald-600" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold text-[#1A1A1A]">
                {busy ? 'Uploading…' : 'Drop files here, or click Browse'}
              </p>
              <p className="mt-0.5 text-[12px] text-[#6B6B6B]">
                Photos &amp; site videos · attach to the current project
              </p>
              <div className="mt-2 flex items-center gap-1">
                {['JPG', 'PNG', 'HEIC', 'MP4', 'MOV'].map((t) => (
                  <span
                    key={t}
                    className="px-1.5 py-0.5 rounded-md bg-white border border-[#E6E1D4] text-[10px] font-semibold text-[#6B6B6B] tracking-wide"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#2F8F5C] text-white text-[12.5px] font-semibold hover:bg-[#246F47] disabled:opacity-60"
            >
              <UploadIcon className="h-3.5 w-3.5" />
              Browse
            </button>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={ACCEPT_ATTR}
              onChange={(e) => { void handleFiles(e.target.files); }}
              className="hidden"
            />
          </div>
          {error ? (
            <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Recent uploads card */}
      <div className="rounded-[12px] border border-[#E6E1D4] bg-white shadow-[0_1px_2px_rgba(20,20,20,0.04)] overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[#EFEBE0]">
          <span className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-[7px] bg-[#E0EBE3]">
            <ImageIcon className="h-3.5 w-3.5 text-[#246F47]" />
          </span>
          <h3 className="text-[14px] font-semibold text-[#1A1A1A]">Recent uploads</h3>
          <span className="text-[12px] text-[#6B6B6B]">
            · {items.length === 0 ? 'No uploads yet' : `${items.length} item${items.length === 1 ? '' : 's'}`}
          </span>
        </div>

        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-5 py-10 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-full border border-[#E6E1D4] bg-[#FAF8F2]">
              <ImageIcon className="h-4 w-4 text-[#A0A0A0]" />
            </span>
            <p className="mt-3 text-[13px] text-[#6B6B6B]">
              {canUpload
                ? 'No uploads yet — drop a photo above and it shows up here.'
                : 'No uploads on this project yet.'}
            </p>
          </div>
        ) : (
          <div className="grid gap-2.5 p-3 grid-cols-2 sm:grid-cols-3 xl:grid-cols-4">
            {items.map((tile) => {
              const isConfirming = confirmId === tile.id;
              const isDeleting = deleting === tile.id;
              return (
                <div
                  key={tile.id}
                  className={`group relative flex flex-col overflow-hidden rounded-[10px] border border-[#E6E1D4] bg-white transition-shadow hover:shadow-[0_2px_8px_rgba(20,20,20,0.06)] ${
                    isDeleting ? 'opacity-50' : ''
                  }`}
                >
                  {/* Preview — fixed 4:3 ratio across every tile so the grid
                      reads as a uniform contact sheet regardless of source
                      aspect. Both images and video posters get the same
                      object-cover crop, so phones in portrait or landscape
                      both fit cleanly. */}
                  <div className="relative aspect-[4/3] w-full overflow-hidden bg-[#FAF8F2]">
                    {tile.url ? (
                      tile.isVideo ? (
                        <video
                          src={tile.url}
                          className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                          muted
                          playsInline
                          preload="metadata"
                        />
                      ) : (
                        <img
                          src={tile.url}
                          alt={tile.filename}
                          className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                          loading="lazy"
                          draggable={false}
                        />
                      )
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <ImageIcon className="h-6 w-6 text-[#A0A0A0]" />
                      </div>
                    )}

                    {tile.isVideo ? (
                      <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-md bg-[#1A1A1A]/85 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-white">
                        <VideoIcon className="h-2.5 w-2.5" />
                        VIDEO
                      </span>
                    ) : null}

                    {/* Delete affordance — hover-revealed on desktop, always visible on mobile */}
                    {canUpload && !isConfirming && !isDeleting ? (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setConfirmId(tile.id); }}
                        aria-label={`Delete ${tile.filename}`}
                        className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/95 text-[#3A3A3A] opacity-0 transition-opacity hover:bg-white hover:text-[#C44545] group-hover:opacity-100 focus:opacity-100 sm:opacity-0"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    ) : null}

                    {/* Inline confirm overlay */}
                    {isConfirming ? (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#1A1A1A]/85 px-3 text-center backdrop-blur-[1px]">
                        <p className="text-[12.5px] font-semibold text-white">Delete this file?</p>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setConfirmId(null)}
                            className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-[11.5px] font-semibold text-[#3A3A3A] hover:bg-[#F4F1E8]"
                          >
                            <X className="h-3 w-3" />
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDelete(tile)}
                            className="inline-flex items-center gap-1 rounded-full bg-[#C44545] px-3 py-1 text-[11.5px] font-semibold text-white hover:bg-[#A53636]"
                          >
                            <Trash2 className="h-3 w-3" />
                            Delete
                          </button>
                        </div>
                      </div>
                    ) : null}

                    {isDeleting ? (
                      <div className="absolute inset-0 flex items-center justify-center bg-white/60 text-[11.5px] font-semibold text-[#3A3A3A]">
                        Deleting…
                      </div>
                    ) : null}
                  </div>

                  {/* Caption */}
                  <div className="px-2.5 py-2">
                    <p className="truncate text-[12px] font-semibold text-[#1A1A1A]" title={tile.filename}>
                      {tile.filename}
                    </p>
                    <p className="text-[10.5px] text-[#A0A0A0]">
                      {format(parseISO(tile.uploadedAt), 'MMM d, h:mm a')}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

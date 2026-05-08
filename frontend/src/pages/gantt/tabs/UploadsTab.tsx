import { useEffect, useState } from 'react';
import { Image as ImageIcon, Lock } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import type { Project, User } from '../../../types';
import { Card, CardContent } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';
import {
  uploadPhoto,
  listPhotos,
  getPhotoUrl,
  type PhotoRow,
} from '../../../lib/api/photos';
import { supabaseConfigured } from '../../../lib/supabase';
import { TabHeader } from '../components/TabHeader';
import { EmptyState } from '../components/EmptyState';
import { InlineDropzone } from '../components/InlineDropzone';

interface UploadsTabProps {
  project: Project;
  currentUser: User | null;
  canUpload: boolean;
}

interface PhotoTile {
  id: string;
  filename: string;
  uploadedAt: string;
  url: string | null;     // signed; resolved async
  isVideo: boolean;
}

export function UploadsTab({ project, currentUser, canUpload }: UploadsTabProps) {
  const [items, setItems] = useState<PhotoTile[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Resolve a signed URL for one row. Files have no `mime_type` column so we
  // sniff video/image from the filename extension — good enough for the
  // gallery's video badge.
  const resolveTile = async (row: PhotoRow): Promise<PhotoTile> => {
    const url = await getPhotoUrl(row.storage_path);
    const ext = (row.filename.split('.').pop() ?? '').toLowerCase();
    return {
      id: row.id,
      filename: row.filename,
      uploadedAt: row.uploaded_at,
      url,
      isVideo: ext === 'mp4' || ext === 'mov',
    };
  };

  // Initial fetch only — realtime is now mounted at Layout via
  // `useProjectPhotosRealtime` so the Dashboard activity feed sees teammate
  // uploads from any page. The tile grid here is hydrated once on mount;
  // locally-uploaded photos are appended directly inside `handleFiles` so
  // the user sees their upload land without an extra round-trip.
  useEffect(() => {
    if (!supabaseConfigured() || !project?.id) return;
    let cancelled = false;
    const projectId = project.id;

    (async () => {
      try {
        const rows = await listPhotos(projectId);
        if (cancelled) return;
        const tiles = await Promise.all(rows.slice(0, 12).map(resolveTile));
        if (!cancelled) setItems(tiles);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load uploads.');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [project?.id]);

  const handleFiles = async (files: File[]) => {
    if (!supabaseConfigured()) {
      setError('Supabase is not configured — uploads need env keys.');
      return;
    }
    if (!currentUser) return;
    setBusy(true);
    setError(null);
    try {
      for (const file of files) {
        // No task selection in the tab — uploads land scoped to the project.
        // To attach to a specific task, use the /upload page or the Schedule
        // tab's per-row uploader (future work).
        const row = await uploadPhoto({ file, projectId: project.id });
        // Push the just-uploaded photo into the local tile grid so the user
        // sees the result immediately. Cross-browser uploads still land in
        // the Dashboard activity feed via Layout's realtime hook; they only
        // appear here on next mount, which matches the tab's hydration-only
        // model after the Pass 2 realtime lift.
        const tile = await resolveTile(row);
        setItems((prev) => [tile, ...prev].slice(0, 12));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <TabHeader
        eyebrow={`Workspace · Uploads · ${project.name}`}
        title="Drop site photos & video."
        description="Files land in the project's Storage bucket and feed the gallery in realtime. Use the /upload page for per-task uploads with progress controls."
        action={
          canUpload ? null : (
            <Badge variant="secondary" className="gap-1.5 px-3 py-1.5">
              <Lock className="h-3.5 w-3.5" />
              Read-only
            </Badge>
          )
        }
      />

      {canUpload && (
        <div className="mb-6">
          <InlineDropzone onFiles={handleFiles} />
          {busy && (
            <p className="mt-3 text-xs text-slate-500">Uploading…</p>
          )}
          {error && (
            <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </p>
          )}
        </div>
      )}

      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-sm font-medium text-slate-900">Recent uploads</h3>
        <Badge variant="secondary" className="text-[10px]">
          {items.length}
        </Badge>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={ImageIcon}
          title="No uploads yet."
          description={canUpload ? 'Drop a photo above and it appears here.' : undefined}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((tile) => (
            <Card key={tile.id} className="overflow-hidden">
              <div className="relative h-32 w-full bg-slate-100">
                {tile.url ? (
                  tile.isVideo ? (
                    <video
                      src={tile.url}
                      className="h-full w-full object-cover"
                      muted
                      playsInline
                      preload="metadata"
                    />
                  ) : (
                    <img
                      src={tile.url}
                      alt={tile.filename}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  )
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <ImageIcon className="h-6 w-6 text-slate-300" />
                  </div>
                )}
                {tile.isVideo && (
                  <span className="absolute left-2 top-2 rounded-full bg-slate-900/70 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white">
                    Video
                  </span>
                )}
              </div>
              <CardContent className="p-2">
                <p className="truncate text-xs text-slate-700">{tile.filename}</p>
                <p className="text-[10px] text-slate-400">
                  {format(parseISO(tile.uploadedAt), 'MMM d, h:mm a')}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

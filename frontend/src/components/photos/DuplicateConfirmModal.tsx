import { useEffect, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { EditorialButton, EditorialModal } from '../editorial';
import { getPhotoUrl, type PhotoRow } from '../../lib/api/photos';
import { phashDistance } from '../../lib/ai/perceptualHash';

interface Props {
  /** The hash of the file the user is trying to upload. */
  candidateHash: string;
  /** Existing photos that look similar (already filtered by phash distance). */
  duplicates: PhotoRow[];
  onUploadAnyway: () => void;
  onSkip: () => void;
  onCancel: () => void;
}

// Surface up-to-3 dupes; more than that is overwhelming.
const MAX_THUMBS = 3;

export default function DuplicateConfirmModal({
  candidateHash, duplicates, onUploadAnyway, onSkip, onCancel,
}: Props) {
  const top = duplicates
    .map((p) => ({ photo: p, distance: phashDistance(p.perceptual_hash, candidateHash) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, MAX_THUMBS);

  return (
    <EditorialModal
      open
      onClose={onCancel}
      eyebrow="Photos · duplicate detected"
      title={duplicates.length === 1 ? 'We already have this shot.' : 'We already have similar shots.'}
      size="md"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <EditorialButton type="button" variant="ghost" trailingIcon="none" onClick={onCancel}>
            Cancel
          </EditorialButton>
          <EditorialButton type="button" variant="ghost" trailingIcon="none" onClick={onSkip}>
            Skip — don't upload
          </EditorialButton>
          <EditorialButton type="button" variant="pill" trailingIcon="none" onClick={onUploadAnyway}>
            Upload anyway
          </EditorialButton>
        </div>
      }
    >
      <p className="text-sm leading-relaxed text-slate-600">
        Found {duplicates.length} photo{duplicates.length === 1 ? '' : 's'} in this project with
        a near-identical perceptual hash. Re-uploading will run a fresh AI analysis and create
        a new gallery entry. <em>Skip</em> if it's the same shot you've already filed.
      </p>

      <ul className="mt-4 space-y-2">
        {top.map(({ photo, distance }) => (
          <DupRow key={photo.id} photo={photo} distance={distance} />
        ))}
        {duplicates.length > MAX_THUMBS && (
          <li className="rounded-md border border-dashed border-slate-200 px-3 py-2 text-center text-xs text-slate-500">
            + {duplicates.length - MAX_THUMBS} more
          </li>
        )}
      </ul>
    </EditorialModal>
  );
}

function DupRow({ photo, distance }: { photo: PhotoRow; distance: number }) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [thumbErr, setThumbErr] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getPhotoUrl(photo.storage_path, 300).then((url) => {
      if (!cancelled) setThumbUrl(url);
    }).catch(() => {
      if (!cancelled) setThumbErr(true);
    });
    return () => { cancelled = true; };
  }, [photo.storage_path]);

  // Closer match → louder badge. The threshold the upload page applies is 6,
  // so anything that hits this modal is already 0..6.
  const badgeClass =
    distance === 0 ? 'bg-red-100 text-red-700' :
    distance <= 2 ? 'bg-orange-100 text-orange-700' :
    'bg-amber-100 text-amber-700';

  return (
    <li className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-2">
      <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-md bg-slate-100">
        {thumbUrl && !thumbErr ? (
          <img
            src={thumbUrl}
            alt={photo.filename}
            className="h-full w-full object-cover"
            onError={() => setThumbErr(true)}
          />
        ) : (
          <ImageOff className="h-5 w-5 text-slate-400" aria-hidden />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-900">{photo.filename}</p>
        <p className="truncate text-xs text-slate-500">
          {photo.uploaded_at ? new Date(photo.uploaded_at).toLocaleDateString() : '—'}
          {photo.task_id ? ' · attached to a task' : ' · unattached'}
        </p>
      </div>
      <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${badgeClass}`}>
        d={distance}
      </span>
    </li>
  );
}

// Overlay shown on a create-mode photo thumbnail during the batch upload that
// runs when "Create entry" is clicked. supabase.storage has no native upload
// progress, so the ring animates 0→90% on a timer while the request is in
// flight and snaps to 100% on resolve — perceived progress, honest enough for
// the demo. A failed upload shows a red retry affordance and never blocks the
// entry from saving.

import { RefreshCw } from 'lucide-react';

export type PhotoUploadStatus = 'pending' | 'uploading' | 'done' | 'error';

interface Props {
  status: PhotoUploadStatus;
  progress: number;
  onRetry?: () => void;
}

export function PhotoUploadRing({ status, progress, onRetry }: Props) {
  if (status === 'pending' || status === 'done') return null;

  if (status === 'error') {
    return (
      <div className="absolute inset-0 grid place-items-center bg-red-900/55">
        <button
          type="button"
          onClick={onRetry}
          aria-label="Retry upload"
          className="flex flex-col items-center gap-0.5 text-white hover:text-red-100"
        >
          <RefreshCw className="h-4 w-4" />
          <span className="text-[9px] font-semibold uppercase tracking-wide">Retry</span>
        </button>
      </div>
    );
  }

  // uploading
  const r = 14;
  const c = 2 * Math.PI * r;
  const safe = Math.min(100, Math.max(0, progress));
  const dash = (safe / 100) * c;
  return (
    <div className="absolute inset-0 grid place-items-center bg-black/40">
      <span aria-hidden className="relative inline-flex h-9 w-9 items-center justify-center">
        <svg viewBox="0 0 36 36" className="h-9 w-9 -rotate-90">
          <circle cx="18" cy="18" r={r} fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="3" />
          <circle
            cx="18"
            cy="18"
            r={r}
            fill="none"
            stroke="#fff"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${c}`}
            style={{ transition: 'stroke-dasharray 150ms linear' }}
          />
        </svg>
      </span>
    </div>
  );
}

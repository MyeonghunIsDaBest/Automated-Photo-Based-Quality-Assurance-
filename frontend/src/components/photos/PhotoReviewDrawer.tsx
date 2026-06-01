import { useEffect, useState } from 'react';
import { AlertTriangle, ImageOff, MapPin, RefreshCw } from 'lucide-react';
import { EditorialButton, EditorialModal } from '../editorial';
import ConfidenceRing from '../ui/ConfidenceRing';
import {
  confirmAnalysis,
  rejectAnalysis,
  type AIAnalysisRow,
} from '../../lib/api/aiAnalyses';
import { getPhotoUrl } from '../../lib/api/photos';
import { canViewSafetyIncident } from '../../lib/permissions';
import { useAppStore } from '../../store';
import type { SafetyFlag, SafetySeverity } from '../../types';

// Mirrors `_shared/safetyTaxonomy.ts`. See Gallery.tsx for the same pattern.
const SAFETY_SEVERITY: Record<SafetyFlag, SafetySeverity> = {
  exposed_wiring:  'critical',
  fall_hazard:     'critical',
  no_hard_hat:     'high',
  unsecured_load:  'high',
  housekeeping:    'medium',
  signage_missing: 'low',
};
const SEVERITY_TONE: Record<SafetySeverity, string> = {
  critical: 'border-red-200 bg-red-50 text-red-700',
  high:     'border-orange-200 bg-orange-50 text-orange-700',
  medium:   'border-amber-200 bg-amber-50 text-amber-700',
  low:      'border-slate-200 bg-slate-50 text-slate-700',
};

export interface ReviewQueueItem extends AIAnalysisRow {
  photos: {
    id: string;
    project_id: string;
    storage_path: string;
    filename: string;
    uploaded_by: string | null;
    taken_at: string | null;
    gps_lat: number | null;
    gps_lng: number | null;
  };
}

interface Props {
  item: ReviewQueueItem;
  onClose: () => void;
  /** Fired after a successful confirm/reject so the parent can drop the row. */
  onResolved?: () => void;
}

export default function PhotoReviewDrawer({ item, onClose, onResolved }: Props) {
  const { currentProfile, setNotification } = useAppStore();
  const showGps = canViewSafetyIncident(currentProfile); // manager+ tier — same gate as Safety

  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [overridePct, setOverridePct] = useState(item.completion_pct);
  const [rejectNotes, setRejectNotes] = useState('');
  const [confirmNotes, setConfirmNotes] = useState('');
  const [showConfirmNotes, setShowConfirmNotes] = useState(false);
  const [busy, setBusy] = useState<'confirm' | 'reject' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getPhotoUrl(item.photos.storage_path, 600)
      .then((url) => { if (!cancelled) setThumbUrl(url); })
      .catch((err) => {
        // Storage signing failures (expired token, RLS denial, network)
        // shouldn't crash the drawer — the existing ImageOff fallback
        // renders when thumbUrl stays null. Log so the dev console
        // surfaces the cause for diagnosis.
        if (!cancelled) console.warn('[PhotoReviewDrawer] thumbnail load failed', err);
      });
    return () => { cancelled = true; };
  }, [item.photos.storage_path]);

  const handleConfirm = async () => {
    setBusy('confirm');
    setError(null);
    try {
      const res = await confirmAnalysis(item.photo_id, {
        overridePct: overridePct !== item.completion_pct ? overridePct : undefined,
        notes: confirmNotes.trim() || undefined,
      });
      // confirm-analysis reports whether the linked task's progress actually
      // moved (taskBumped) and the value it landed on (newPct). Surface that
      // as a toast so the reviewer sees the schedule respond, not just the
      // row vanish.
      const label = item.suggested_task ?? item.photos.filename;
      setNotification(
        res.taskBumped && typeof res.newPct === 'number'
          ? { message: `Task “${label}” bumped to ${res.newPct}%`, type: 'success' }
          : { message: `Analysis confirmed at ${res.newPct ?? overridePct}%`, type: 'success' },
      );
      onResolved?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to confirm.');
    } finally {
      setBusy(null);
    }
  };

  const handleReject = async () => {
    setBusy('reject');
    setError(null);
    try {
      // Trim + drop empty so the backend audit row stays clean (notes is
      // optional, an empty string is not the same as "no notes provided").
      const notes = rejectNotes.trim() || undefined;
      await rejectAnalysis(item.photo_id, notes);
      onResolved?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reject.');
    } finally {
      setBusy(null);
    }
  };

  const confidencePct = Math.round(item.confidence * 100);
  const overrideChanged = overridePct !== item.completion_pct;

  return (
    <EditorialModal
      open
      onClose={onClose}
      eyebrow="Review queue · pending"
      title={item.photos.filename}
      size="lg"
      footer={
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          {error && (
            <p className="flex-1 text-xs text-red-700">{error}</p>
          )}
          <div className="flex flex-col-reverse gap-2 sm:ml-auto sm:flex-row">
            <EditorialButton
              type="button"
              variant="ghost"
              trailingIcon="none"
              onClick={handleReject}
              disabled={busy !== null}
              aria-label="Reject analysis"
            >
              {busy === 'reject' ? 'Rejecting…' : 'Reject'}
            </EditorialButton>
            <EditorialButton
              type="button"
              variant="pill"
              trailingIcon="none"
              onClick={handleConfirm}
              disabled={busy !== null}
              aria-label={`Confirm analysis at ${overrideChanged ? overridePct : item.completion_pct}%`}
            >
              {busy === 'confirm'
                ? 'Confirming…'
                : overrideChanged
                  ? `Confirm at ${overridePct}%`
                  : `Confirm at ${item.completion_pct}%`}
            </EditorialButton>
          </div>
        </div>
      }
    >
      {/* Thumbnail */}
      <div className="mb-5 overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
        {thumbUrl ? (
          <img src={thumbUrl} alt={item.photos.filename} className="aspect-video w-full object-contain bg-black" />
        ) : (
          <div className="flex aspect-video items-center justify-center text-slate-400">
            <ImageOff className="h-8 w-8" />
          </div>
        )}
      </div>

      {/* Phase + confidence */}
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Cell label="Phase detected">
          <span className="inline-flex rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium capitalize text-slate-700">
            {item.phase_detected ?? '—'}
          </span>
        </Cell>
        <Cell label="Confidence">
          <ConfidenceRing pct={confidencePct} animateFromZero />
        </Cell>
      </div>

      {/* AI rationale */}
      <Cell label={`AI says ${item.completion_pct}% complete`}>
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-relaxed text-slate-700">
          {item.rationale ?? 'No rationale provided.'}
        </p>
      </Cell>

      {/* Reject notes — optional but encouraged. Backend audit_log captures
          this in the entity row when handleReject sends it, so a reviewer's
          "why" survives even after the analysis row is gone. */}
      <div className="mt-5">
        <label htmlFor="reject-notes" className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          Rejection notes (optional)
        </label>
        <textarea
          id="reject-notes"
          rows={3}
          maxLength={500}
          value={rejectNotes}
          onChange={(e) => setRejectNotes(e.target.value)}
          placeholder="Why are you rejecting this analysis? e.g. wrong phase, photo unclear, model misread the materials."
          className="w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        />
      </div>

      {/* Override slider */}
      <div className="mt-5">
        <div className="mb-1 flex items-center justify-between text-sm">
          <span className="text-slate-600">Override completion %</span>
          <span className="font-medium text-slate-900 tabular-nums">{overridePct}%</span>
        </div>
        <div className="relative pt-6">
          {/* Floating value bubble that tracks the thumb. left:% + center
              transform approximates the thumb position closely enough. */}
          <span
            className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-md bg-stone-900 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white shadow-sm transition-[left] duration-100"
            style={{ left: `${overridePct}%` }}
          >
            {overridePct}%
          </span>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={overridePct}
            onChange={(e) => setOverridePct(Number(e.target.value))}
            className="w-full accent-emerald-600"
            aria-label="Override completion percentage"
            aria-valuetext={`${overridePct}%`}
          />
        </div>
        <p className="mt-1 text-[11px] text-slate-500">
          Confirming with the slider moved bumps the linked task's progress to that value.
          Leaving it on the AI suggestion just confirms the AI's number.
        </p>
      </div>

      {/* Confirm notes — optional context written to the audit row on confirm.
          Behind a toggle so the default confirm path stays one click. */}
      <div className="mt-3">
        {showConfirmNotes ? (
          <>
            <label htmlFor="confirm-notes" className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Confirm notes (optional)
            </label>
            <textarea
              id="confirm-notes"
              rows={2}
              maxLength={500}
              value={confirmNotes}
              onChange={(e) => setConfirmNotes(e.target.value)}
              placeholder="Anything worth recording with this confirm? e.g. verified on site, slider raised to match progress."
              className="w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </>
        ) : (
          <button
            type="button"
            onClick={() => setShowConfirmNotes(true)}
            className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800"
          >
            + Add a note to this confirm
          </button>
        )}
      </div>

      {/* Safety + quality flags */}
      {(item.safety_flags.length > 0 || item.quality_flags.length > 0) && (
        <div className="mt-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Flags detected
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {item.safety_flags.map((flag) => (
              <span
                key={flag}
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${SEVERITY_TONE[SAFETY_SEVERITY[flag]]}`}
              >
                <AlertTriangle className="h-3 w-3" aria-hidden />
                {flag.replace(/_/g, ' ')}
              </span>
            ))}
            {item.quality_flags.map((flag) => (
              <span
                key={flag}
                className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700"
              >
                {flag.replace(/_/g, ' ')}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Materials */}
      {item.materials.length > 0 && (
        <Cell label="Materials">
          <p className="text-sm text-slate-700">{item.materials.join(', ')}</p>
        </Cell>
      )}

      {/* Suggested task */}
      {item.suggested_task && (
        <Cell label="Suggested task">
          <p className="text-sm text-slate-700">{item.suggested_task}</p>
        </Cell>
      )}

      {/* GPS — manager+ only via permission gate */}
      {showGps && item.photos.gps_lat != null && item.photos.gps_lng != null && (
        <div className="mt-5 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <MapPin className="h-4 w-4 text-slate-500" />
          <a
            className="font-medium text-slate-700 underline underline-offset-2"
            href={`https://www.google.com/maps?q=${item.photos.gps_lat},${item.photos.gps_lng}`}
            target="_blank"
            rel="noreferrer"
          >
            {item.photos.gps_lat.toFixed(5)}, {item.photos.gps_lng.toFixed(5)}
          </a>
          <RefreshCw className="ml-auto hidden h-3 w-3" aria-hidden />
        </div>
      )}
    </EditorialModal>
  );
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-3 first:mt-0">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      {children}
    </div>
  );
}

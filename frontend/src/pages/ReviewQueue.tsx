import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ImageOff, Inbox } from 'lucide-react';
import { format } from 'date-fns';
import { useAppStore } from '../store';
import { canConfirmAIAnalysis } from '../lib/permissions';
import { supabase, supabaseConfigured } from '../lib/supabase';
import { listPendingAnalyses } from '../lib/api/aiAnalyses';
import { getPhotoUrl } from '../lib/api/photos';
import { EyebrowLabel } from '../components/editorial';
import NotAuthorized from '../components/NotAuthorized';
import PhotoReviewDrawer, { type ReviewQueueItem } from '../components/photos/PhotoReviewDrawer';
import type { SafetyFlag, SafetySeverity } from '../types';

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

export default function ReviewQueue() {
  const { currentProfile, project } = useAppStore();

  if (!canConfirmAIAnalysis(currentProfile)) {
    return <NotAuthorized surface="the review queue" />;
  }

  const [items, setItems] = useState<ReviewQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<ReviewQueueItem | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listPendingAnalyses(project.id);
      setItems(data as unknown as ReviewQueueItem[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load queue.');
    } finally {
      setLoading(false);
    }
  }, [project.id]);

  useEffect(() => { void refresh(); }, [refresh]);

  // Realtime: drop a row from the list as soon as another reviewer marks it
  // confirmed/rejected. Race losers see a fresh queue without a manual reload.
  useEffect(() => {
    if (!supabaseConfigured()) return;
    const channel = supabase
      .channel(`review-queue:${project.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'ai_analyses' },
        (payload) => {
          const row = payload.new as { id: string; analysis_status: string; action_taken: string };
          if (row.analysis_status !== 'analysed' || row.action_taken !== 'pending') {
            setItems((prev) => prev.filter((it) => it.id !== row.id));
          }
        },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [project.id]);

  return (
    <div className="editorial-root min-h-full bg-[#FAFAF7]">
      <header className="relative overflow-hidden border-b border-slate-200/70 bg-white">
        <div className="grid-bg absolute inset-0 opacity-50" />
        <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-emerald-100/40 blur-3xl" />
        <div className="relative px-4 py-8 sm:px-8 sm:py-10">
          <EyebrowLabel>Workspace · Review queue</EyebrowLabel>
          <h1
            className="display mt-3 text-2xl font-medium leading-tight text-slate-900 sm:text-4xl md:text-5xl"
            style={{ textWrap: 'balance' }}
          >
            Pending <em className="font-normal italic text-emerald-700">AI calls</em>.
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-500 sm:text-[15px]">
            The AI analysed these photos but wasn't confident enough to update the schedule on
            its own. Confirm the % complete it suggested, override it, or reject the analysis
            entirely. Every action lands in the audit log.
          </p>
        </div>
      </header>

      <div className="px-4 py-6 sm:px-8 sm:py-8">
        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-12 text-center text-sm text-slate-400">
            Loading…
          </div>
        ) : items.length === 0 ? (
          <EmptyState />
        ) : (
          <ul className="space-y-3">
            {items.map((item) => (
              <Row key={item.id} item={item} onClick={() => setActive(item)} />
            ))}
          </ul>
        )}
      </div>

      {active && (
        <PhotoReviewDrawer
          item={active}
          onClose={() => setActive(null)}
          onResolved={() => {
            setItems((prev) => prev.filter((it) => it.id !== active.id));
          }}
        />
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-16 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
        <Inbox className="h-6 w-6" />
      </div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">— All caught up</p>
      <h2 className="display mt-1 text-lg font-medium text-slate-900 sm:text-xl">
        No analyses awaiting review.
      </h2>
      <p className="mt-2 text-sm text-slate-500">
        Photos with confidence ≥ 85% auto-update the schedule; below 50% are skipped.
      </p>
    </div>
  );
}

function Row({ item, onClick }: { item: ReviewQueueItem; onClick: () => void }) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [thumbErr, setThumbErr] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getPhotoUrl(item.photos.storage_path, 600).then((url) => {
      if (!cancelled) setThumbUrl(url);
    }).catch(() => {
      if (!cancelled) setThumbErr(true);
    });
    return () => { cancelled = true; };
  }, [item.photos.storage_path]);

  const confidencePct = Math.round(item.confidence * 100);

  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left transition-shadow hover:shadow-sm sm:items-center sm:gap-4 sm:p-4"
      >
        <div className="flex h-16 w-20 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100 sm:h-20 sm:w-28">
          {thumbUrl && !thumbErr ? (
            <img src={thumbUrl} alt={item.photos.filename} className="h-full w-full object-cover" onError={() => setThumbErr(true)} />
          ) : (
            <ImageOff className="h-5 w-5 text-slate-400" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-medium text-slate-900">{item.photos.filename}</p>
            {item.phase_detected && (
              <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider capitalize text-slate-600">
                {item.phase_detected}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            AI says <span className="font-medium tabular-nums text-slate-700">{item.completion_pct}%</span>
            {' · '}confidence <span className="font-medium tabular-nums text-slate-700">{confidencePct}%</span>
            {item.photos.taken_at && (
              <> · captured {format(new Date(item.photos.taken_at), 'MMM d, h:mm a')}</>
            )}
          </p>
          {item.safety_flags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {item.safety_flags.map((flag) => (
                <span
                  key={flag}
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${SEVERITY_TONE[SAFETY_SEVERITY[flag]]}`}
                >
                  <AlertTriangle className="h-3 w-3" aria-hidden />
                  {flag.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
          )}
        </div>
        <span className="hidden sm:block text-xs text-slate-400">→ Review</span>
      </button>
    </li>
  );
}

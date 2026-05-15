// ReviewQueueTab — the AI Analysis hub, mounted as a Gantt tab.
//
// Was a standalone `/review-queue` page (`frontend/src/pages/ReviewQueue.tsx`)
// until the demo cleanup pass pulled it under the project-scoped Gantt module.
// `/review-queue?project=X` still resolves via a redirect in App.tsx, so old
// links + the Dashboard's "Pending review" tile keep working.
//
// Layout (top to bottom):
//   1. Upload affordance card — link to /upload for roles that can upload.
//   2. Mock-AI runner card — picks pending photos, bumps 4-10% each.
//   3. Schedule-context Gantt chart — bars move as the runner walks.
//   4. Review queue list — items with confidence in the 0.50-0.85 band.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, ImageOff, Inbox, Upload as UploadIcon } from 'lucide-react';
import { format } from 'date-fns';
import { canConfirmAIAnalysis, canUploadPhotos } from '../../../lib/permissions';
import { supabase, supabaseConfigured } from '../../../lib/supabase';
import { listPendingAnalyses } from '../../../lib/api/aiAnalyses';
import { getPhotoUrl } from '../../../lib/api/photos';
import NotAuthorized from '../../../components/NotAuthorized';
import PhotoReviewDrawer, { type ReviewQueueItem } from '../../../components/photos/PhotoReviewDrawer';
import MockAnalysisButton from '../../../components/mockAi/MockAnalysisButton';
import { SplitPaneGantt } from '../../../components/ui/SplitPaneGantt';
import { useMockAiUiStore } from '../../../store/mockAiUi';
import { TabHeader } from '../components/TabHeader';
import type { Project, Task, Zone, User, SafetyFlag, SafetySeverity } from '../../../types';

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

interface ReviewQueueTabProps {
  project: Project;
  tasks: Task[];          // already scoped to this project by the parent Gantt page
  zones: Zone[];          // project-scoped zones used by the split-pane Gantt
  currentUser: User | null;
}

export function ReviewQueueTab({ project, tasks, zones, currentUser }: ReviewQueueTabProps) {
  if (!canConfirmAIAnalysis(currentUser)) {
    return <NotAuthorized surface="the review queue" />;
  }

  const canUpload = canUploadPhotos(currentUser);
  // Read the pulse target from the shared mock-AI store so the Gantt bar
  // outlines emerald while the batch processes that task's photo.
  const currentlyAnalysingTaskId = useMockAiUiStore((s) => s.currentlyAnalysingTaskId);
  const highlightedTaskIds = currentlyAnalysingTaskId ? [currentlyAnalysingTaskId] : undefined;

  const [items, setItems] = useState<ReviewQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<ReviewQueueItem | null>(null);
  // Auto-scroll target: when a batch completes the freshest analysis is the
  // first list item; flash it for 1.2 s + scroll it into view so the user's
  // eye lands on what just changed.
  const [flashedItemId, setFlashedItemId] = useState<string | null>(null);
  const firstRowRef = useRef<HTMLLIElement | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listPendingAnalyses(project.id);
      setItems(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load queue.');
    } finally {
      setLoading(false);
    }
  }, [project.id]);

  useEffect(() => { void refresh(); }, [refresh]);

  // When a mock-AI batch finishes (`currentlyAnalysingTaskId` returns to null
  // after being non-null), refresh the list and scroll/flash the top row —
  // that's where Phase D's real persisted analyses would land first.
  const prevAnalysingRef = useRef<string | null>(null);
  useEffect(() => {
    const prev = prevAnalysingRef.current;
    prevAnalysingRef.current = currentlyAnalysingTaskId;
    if (prev && !currentlyAnalysingTaskId) {
      void refresh().then(() => {
        // After refresh resolves the new items are in state; flash the first
        // one. Defer to next paint so the ref is wired up.
        requestAnimationFrame(() => {
          firstRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          setItems((prevItems) => {
            const top = prevItems[0];
            if (top) setFlashedItemId(top.id);
            return prevItems;
          });
          setTimeout(() => setFlashedItemId(null), 1200);
        });
      });
    }
  }, [currentlyAnalysingTaskId, refresh]);

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
    <>
      <TabHeader
        eyebrow="Workspace · AI analysis"
        title="Run, review, confirm."
        description="Kick off a mock AI pass on unanalysed photos, or work through the queue of analyses the AI wasn't confident enough to apply on its own. Every action lands in the audit log."
      />

      <div className="space-y-6">
        {/* ── Upload affordance ─────────────────────────────────────── */}
        {canUpload && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4">
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
                Need more photos?
              </p>
              <p className="mt-1 text-sm text-slate-700">
                Upload from the field — every photo becomes a candidate for the AI analysis below.
              </p>
            </div>
            <Link
              to="/gantt?tab=uploads"
              className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-slate-800"
            >
              <UploadIcon className="h-3.5 w-3.5" />
              Upload photos
            </Link>
          </div>
        )}

        {/* ── Mock-AI runner ───────────────────────────────────────── */}
        <MockAnalysisButton projectId={project.id} variant="card" />

        {/* ── Schedule context — split-pane Gantt mirroring the Tasks tab.
              Bars animate in place as Mock-AI walks through analyses, and the
              row currently being analysed pulses emerald via highlightedTaskIds. */}
        {tasks.length > 0 && (
          <div>
            <div className="mb-3 flex items-baseline justify-between">
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
                Schedule context
              </p>
              <p className="text-[11px] text-slate-400">
                {tasks.length} task{tasks.length === 1 ? '' : 's'} · bars animate as analyses land
              </p>
            </div>
            <SplitPaneGantt
              tasks={tasks}
              zones={zones}
              startDate={project.startDate}
              endDate={project.endDate}
              highlightedTaskIds={highlightedTaskIds}
            />
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* ── Review queue ─────────────────────────────────────────── */}
        <div>
          <div className="mb-3 flex items-baseline justify-between">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
              Review queue
            </p>
            <p className="text-[11px] text-slate-400">
              {loading ? '…' : `${items.length} pending`}
            </p>
          </div>
          {loading ? (
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-12 text-center text-sm text-slate-400">
              Loading…
            </div>
          ) : items.length === 0 ? (
            <EmptyState />
          ) : (
            <ul className="space-y-3">
              {/* AnimatePresence + motion.li layout = new analyses (from a Mock-AI
                  run) enter via fadeUp and shift existing rows down via FLIP. */}
              <AnimatePresence initial={false}>
                {items.map((item, idx) => (
                  <motion.div
                    key={item.id}
                    layout
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } }}
                    exit={{ opacity: 0, height: 0, marginTop: 0, transition: { duration: 0.2 } }}
                  >
                    <Row
                      item={item}
                      onClick={() => setActive(item)}
                      flash={flashedItemId === item.id}
                      rowRef={idx === 0 ? firstRowRef : undefined}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </div>
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
    </>
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

function Row({
  item, onClick, flash = false, rowRef,
}: {
  item: ReviewQueueItem;
  onClick: () => void;
  flash?: boolean;
  rowRef?: React.RefObject<HTMLLIElement | null>;
}) {
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
    <li ref={rowRef}>
      <button
        type="button"
        onClick={onClick}
        className={`flex w-full items-start gap-3 rounded-xl border bg-white p-3 text-left transition-shadow hover:shadow-sm sm:items-center sm:gap-4 sm:p-4 ${flash ? 'border-emerald-400 ring-2 ring-emerald-300 ring-offset-1 animate-pulse' : 'border-slate-200'}`}
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

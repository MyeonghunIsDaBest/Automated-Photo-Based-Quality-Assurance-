// ReviewQueueTab — the AI Analysis hub, mounted as a Gantt tab.
//
// UI refresh: warm stone/cream palette, sage green accents, Fraunces serif
// for stat numerics, phase-coloured accents on queue rows, friendlier
// dropzone, refined confidence ring. Logic and data flow unchanged.
//
// Was a standalone `/review-queue` page (`frontend/src/pages/ReviewQueue.tsx`)
// until the demo cleanup pass pulled it under the project-scoped Gantt module.
// `/review-queue?project=X` still resolves via a redirect in App.tsx, so old
// links + the Dashboard's "Pending review" tile keep working.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle, ChevronRight, Clock, ImageOff, Inbox, Settings2,
  ShieldAlert, Sparkles,
} from 'lucide-react';
import { format } from 'date-fns';
import { canConfirmAIAnalysis, canUploadPhotos } from '../../../lib/permissions';
import { supabase, supabaseConfigured } from '../../../lib/supabase';
import { listPendingAnalyses, getRecentAnalyses, type RecentAnalysisRow } from '../../../lib/api/aiAnalyses';
import { getPhotoUrl, uploadPhoto } from '../../../lib/api/photos';
import NotAuthorized from '../../../components/NotAuthorized';
import PhotoReviewDrawer, { type ReviewQueueItem } from '../../../components/photos/PhotoReviewDrawer';
import { PhaseCompletionCard } from './PhaseCompletionCard';
import { SplitPaneGantt } from '../../../components/ui/SplitPaneGantt';
import { TabHeader } from '../components/TabHeader';
import { InlineDropzone } from '../components/InlineDropzone';
import { DonutProgress } from '../../../components/ai/LoadingStates';
import { PHASE_COLORS, phaseColor } from '../../../lib/construction/phaseColors';
import type { ConstructionPhase } from '../../../lib/ai/contract';
import type { Project, Task, Zone, User, SafetyFlag, SafetySeverity } from '../../../types';

const PHASE_ORDER: ConstructionPhase[] = [
  'excavation', 'foundation', 'framing', 'roofing',
  'electrical', 'plumbing', 'drywall', 'finishing',
];

const SAFETY_SEVERITY: Record<SafetyFlag, SafetySeverity> = {
  exposed_wiring:  'critical',
  fall_hazard:     'critical',
  no_hard_hat:     'high',
  unsecured_load:  'high',
  housekeeping:    'medium',
  signage_missing: 'low',
};

// Warm-toned severity palette — replaces the slate-y red/orange/amber for a
// softer, more editorial feel that doesn't dominate the row.
const SEVERITY_TONE: Record<SafetySeverity, string> = {
  critical: 'border-red-200 bg-red-50 text-red-700',
  high:     'border-orange-200 bg-orange-50 text-orange-800',
  medium:   'border-amber-200 bg-amber-50 text-amber-800',
  low:      'border-stone-200 bg-stone-50 text-stone-600',
};

interface ReviewQueueTabProps {
  project: Project;
  tasks: Task[];
  zones: Zone[];
  currentUser: User | null;
}

export function ReviewQueueTab({ project, tasks, zones, currentUser }: ReviewQueueTabProps) {
  if (!canConfirmAIAnalysis(currentUser)) {
    return <NotAuthorized surface="the review queue" />;
  }

  const canUpload = canUploadPhotos(currentUser);

  const [items, setItems] = useState<ReviewQueueItem[]>([]);
  const [recentActivity, setRecentActivity] = useState<RecentAnalysisRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<ReviewQueueItem | null>(null);
  const [selectedPhase, setSelectedPhase] = useState<ConstructionPhase | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);

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

  const refreshActivity = useCallback(async () => {
    try {
      const data = await getRecentAnalyses(project.id, { limit: 50 });
      setRecentActivity(data);
    } catch {
      // Strip failures are non-fatal — leave the previous counts visible.
    }
  }, [project.id]);

  useEffect(() => { void refresh(); void refreshActivity(); }, [refresh, refreshActivity]);

  const [uploadBusy, setUploadBusy] = useState(0);
  const [uploadDone, setUploadDone] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    setUploadError(null);
    setUploadBusy(files.length);
    setUploadDone(0);
    try {
      const results = await Promise.allSettled(
        files.map(async (file) => {
          await uploadPhoto({
            file,
            projectId: project.id,
            phaseHint: selectedPhase ?? undefined,
          });
          setUploadDone((n) => n + 1);
          return file.name;
        }),
      );
      const failed = results
        .map((r, i) => ({ r, name: files[i].name }))
        .filter((x): x is { r: PromiseRejectedResult; name: string } => x.r.status === 'rejected');
      if (failed.length > 0) {
        const detail = failed
          .map(({ r, name }) => `${name}: ${(r.reason as Error)?.message ?? 'unknown'}`)
          .join('; ');
        setUploadError(
          `${results.length - failed.length} of ${results.length} uploaded. Failures — ${detail}`,
        );
      }
      void refresh();
      void refreshActivity();
    } finally {
      setUploadBusy(0);
      setUploadDone(0);
    }
  }, [project.id, refresh, refreshActivity, selectedPhase]);

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
          void refreshActivity();
        },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [project.id, refreshActivity]);

  const stats = useMemo(() => {
    const total = items.length;
    const avgConf = total > 0
      ? Math.round((items.reduce((s, it) => s + it.confidence, 0) / total) * 100)
      : 0;
    const flagged = items.reduce((s, it) => s + it.safety_flags.length, 0);
    return { total, avgConf, flagged };
  }, [items]);

  // Active phase for the completion card: the phase most represented in the
  // queue, overridden by an explicit chip selection, else the first phase.
  const activePhase = useMemo<ConstructionPhase>(() => {
    const counts: Partial<Record<ConstructionPhase, number>> = {};
    for (const it of items) {
      if (it.phase_detected) counts[it.phase_detected] = (counts[it.phase_detected] ?? 0) + 1;
    }
    const top = (Object.entries(counts).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0]?.[0]) as
      | ConstructionPhase
      | undefined;
    return selectedPhase ?? top ?? PHASE_ORDER[0];
  }, [items, selectedPhase]);

  return (
    <>
      <TabHeader
        eyebrow="Workspace · AI Analysis"
        title="Run, review, confirm."
        description="Tag the batch with its construction phase, drop photos, then work through the analyses the AI wasn't confident enough to apply on its own. Every action lands in the audit log."
      />

      <div className="space-y-5">
        {/* ── Hero stats strip ─────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile
            label="Pending review"
            icon={<Clock className="h-3 w-3" />}
            value={loading ? '…' : String(stats.total)}
            caption="Items in queue · 0.50–0.85 band"
            accent="#2F8F5C"
          />
          <StatTile
            label="Avg confidence"
            icon={<Sparkles className="h-3 w-3" />}
            value={loading ? '…' : `${stats.avgConf}%`}
            caption="Across queue · borderline cases"
            accent="#0D8D85"
          />
          <StatTile
            label="Safety flags"
            icon={<ShieldAlert className="h-3 w-3" />}
            value={loading ? '…' : String(stats.flagged)}
            caption={stats.flagged > 0 ? 'Need immediate triage' : 'No active flags'}
            accent={stats.flagged > 0 ? '#C44545' : '#5B6B7B'}
          />
          <StatTile
            label="Auto-apply threshold"
            icon={<Settings2 className="h-3 w-3" />}
            value="≥ 85%"
            caption="Sub-50% auto-skipped"
            accent="#5B6B7B"
          />
        </div>

        {/* ── Phase completion — AI verdict for the active phase ────── */}
        <PhaseCompletionCard projectId={project.id} phase={activePhase} />

        {/* ── Live processing indicator (visible while uploads fly) ── */}
        {uploadBusy > 0 && (
          <div className="relative flex items-center gap-3 overflow-hidden rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/80 to-emerald-50/40 px-5 py-3.5">
            <span
              aria-hidden
              className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-emerald-300/15 blur-2xl"
            />
            <span className="relative text-emerald-700">
              <DonutProgress current={uploadDone} total={uploadBusy} sizePx={24} />
            </span>
            <div className="relative min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-emerald-900">
                Uploaded {uploadDone} of {uploadBusy} photo{uploadBusy === 1 ? '' : 's'}…
              </p>
              <p className="text-[11.5px] text-emerald-700/75">
                AI analysis fires automatically once each upload lands.
              </p>
            </div>
            <span className="relative inline-flex items-center gap-1.5 rounded-full bg-white/60 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              Analysing
            </span>
          </div>
        )}

        {/* ── Phase chip selector + dropzone ───────────────────────── */}
        {canUpload && (
          <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
              <div className="min-w-0 flex-1">
                <p className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-stone-500">
                  Tag photos as phase
                </p>
                <p className="mt-1 text-xs leading-relaxed text-stone-500">
                  Higher accuracy when the model knows the phase. "Auto-detect" lets Claude infer from the image.
                </p>
              </div>
              <p className="text-[11px] text-stone-400">
                Drops scoped to{' '}
                <span className="font-medium text-stone-600">{project.name}</span>
              </p>
            </div>

            <div className="px-5 pb-5">
              <PhaseChipSelector value={selectedPhase} onChange={setSelectedPhase} />
              <div className="mt-4">
                <InlineDropzone
                  onFiles={handleFiles}
                  helperText={
                    selectedPhase
                      ? `Drop photos here — they'll be tagged as ${phaseColor(selectedPhase).label}.`
                      : 'Drop site photos here or click to browse — phase auto-detects.'
                  }
                  badges={['JPG', 'PNG', 'WebP', 'HEIC']}
                  maxFiles={12}
                />
              </div>
              {uploadError && (
                <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {uploadError}
                </p>
              )}
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* ── Recent activity strip ────────────────────────────────── */}
        <RecentActivityStrip rows={recentActivity} />

        {/* ── Review queue ─────────────────────────────────────────── */}
        <div>
          <div className="mb-3 flex items-baseline justify-between px-1">
            <div className="flex items-baseline gap-2.5">
              <h2 className="display text-xl font-medium tracking-tight text-stone-900 sm:text-[22px]">
                Review queue
              </h2>
              <span className="rounded-full border border-stone-200 bg-stone-50 px-2 py-0.5 text-[11px] font-medium text-stone-500">
                {loading ? '…' : `${items.length} pending`}
              </span>
            </div>
            <p className="text-[11px] text-stone-400">Sorted by confidence ↑</p>
          </div>

          {loading ? (
            <div className="rounded-2xl border border-stone-200 bg-white px-4 py-16 text-center text-sm text-stone-400 shadow-sm">
              Loading queue…
            </div>
          ) : items.length === 0 ? (
            <EmptyState />
          ) : (
            <ul className="space-y-2.5">
              <AnimatePresence initial={false}>
                {items.map((item) => (
                  <motion.div
                    key={item.id}
                    layout
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } }}
                    exit={{ opacity: 0, height: 0, marginTop: 0, transition: { duration: 0.2 } }}
                  >
                    <Row item={item} onClick={() => setActive(item)} />
                  </motion.div>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </div>

        {/* ── Schedule context — collapsed by default ──────────────── */}
        {tasks.length > 0 && (
          <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
            <button
              type="button"
              onClick={() => setScheduleOpen((v) => !v)}
              className="flex w-full items-center justify-between px-5 py-3.5 text-left transition-colors hover:bg-stone-50"
              aria-expanded={scheduleOpen}
            >
              <div className="flex items-center gap-2.5">
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-lg transition-all ${
                    scheduleOpen
                      ? 'rotate-90 bg-emerald-50 text-emerald-700'
                      : 'bg-stone-100 text-stone-600'
                  }`}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </span>
                <span className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-stone-500">
                  Schedule context
                </span>
                <span className="text-xs text-stone-400">
                  · {tasks.length} task{tasks.length === 1 ? '' : 's'}
                </span>
              </div>
              <span className="text-[11px] italic text-stone-400">
                bars animate as analyses land
              </span>
            </button>
            {scheduleOpen && (
              <div className="border-t border-stone-100 p-4 sm:p-5">
                <SplitPaneGantt
                  tasks={tasks}
                  zones={zones}
                  startDate={project.startDate}
                  endDate={project.endDate}
                />
              </div>
            )}
          </div>
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
    </>
  );
}

// ─── Hero stat tile ────────────────────────────────────────────────────────

function StatTile({
  label, icon, value, caption, accent,
}: {
  label: string;
  icon?: React.ReactNode;
  value: string;
  caption: string;
  accent: string;
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-stone-200 bg-white px-5 py-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
      <span
        aria-hidden
        className="absolute left-0 top-0 h-full w-1"
        style={{ backgroundColor: accent }}
      />
      <div className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.16em] text-stone-500">
        {icon && <span className="opacity-80">{icon}</span>}
        {label}
      </div>
      <p
        className="display mt-2 text-[32px] font-medium leading-none tracking-tight text-stone-900 tabular-nums"
      >
        {value}
      </p>
      <p className="mt-1.5 text-[11.5px] text-stone-400">{caption}</p>
    </div>
  );
}

// ─── Phase chip selector ──────────────────────────────────────────────────

function PhaseChipSelector({
  value, onChange,
}: {
  value: ConstructionPhase | null;
  onChange: (phase: ConstructionPhase | null) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={() => onChange(null)}
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11.5px] font-medium transition-all ${
          value === null
            ? 'border-stone-900 bg-stone-900 text-white shadow-sm'
            : 'border-stone-200 bg-white text-stone-600 hover:border-stone-300 hover:bg-stone-50'
        }`}
      >
        <Sparkles className="h-3 w-3" />
        Auto-detect
      </button>
      {PHASE_ORDER.map((phase) => {
        const palette = PHASE_COLORS[phase];
        const selected = value === phase;
        return (
          <button
            key={phase}
            type="button"
            onClick={() => onChange(phase)}
            className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11.5px] font-medium transition-all"
            style={
              selected
                ? {
                    borderColor: palette.color,
                    backgroundColor: palette.tint,
                    color: palette.color,
                    fontWeight: 600,
                  }
                : {
                    borderColor: 'rgb(231 229 228)' /* stone-200 */,
                    backgroundColor: 'white',
                    color: 'rgb(87 83 78)' /* stone-600 */,
                  }
            }
          >
            <span
              aria-hidden
              className="inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full"
              style={{ backgroundColor: palette.color }}
            />
            {palette.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Recent activity strip ────────────────────────────────────────────────

function bucketActivity(rows: RecentAnalysisRow[]): {
  auto: number; pending: number; skipped: number; failed: number;
} {
  const out = { auto: 0, pending: 0, skipped: 0, failed: 0 };
  for (const r of rows) {
    if (r.analysis_status === 'failed') { out.failed += 1; continue; }
    if (r.action_taken === 'auto_updated') out.auto += 1;
    else if (r.action_taken === 'pending') out.pending += 1;
    else if (r.action_taken === 'skipped')  out.skipped += 1;
  }
  return out;
}

function RecentActivityStrip({ rows }: { rows: RecentAnalysisRow[] }) {
  if (rows.length === 0) return null;
  const b = bucketActivity(rows);
  return (
    <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-stone-100 px-5 py-3">
        <div className="flex items-center gap-2 text-[12.5px] font-semibold text-stone-800">
          <Clock className="h-3.5 w-3.5 text-stone-400" />
          Last 24 hours
        </div>
        <p className="text-[11px] text-stone-400">{rows.length} analyses processed</p>
      </div>
      <div className="grid grid-cols-2 divide-stone-100 sm:grid-cols-4 sm:divide-x">
        <ActivityTile label="Auto-applied" value={b.auto}    caption="≥85% — schedule bumped"      accent="#2F8F5C" />
        <ActivityTile label="Pending"      value={b.pending} caption="In review queue"             accent="#0D8D85" />
        <ActivityTile label="Skipped"      value={b.skipped} caption="<50% — needs better photo"   accent="#5B6B7B" />
        <ActivityTile label="Failed"       value={b.failed}  caption="Parse / storage error"       accent={b.failed > 0 ? '#C44545' : '#5B6B7B'} />
      </div>
    </div>
  );
}

function ActivityTile({
  label, value, caption, accent,
}: {
  label: string;
  value: number;
  caption: string;
  accent: string;
}) {
  return (
    <div className="px-5 py-3.5">
      <div className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.16em] text-stone-500">
        <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: accent }} />
        {label}
      </div>
      <p className="display mt-1.5 text-[22px] font-medium leading-none text-stone-900 tabular-nums">
        {value}
      </p>
      <p className="mt-1 text-[11px] text-stone-400">{caption}</p>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white px-6 py-16 text-center shadow-sm">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
        <Inbox className="h-7 w-7" />
      </div>
      <p className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-emerald-700">
        All caught up
      </p>
      <h3 className="display mt-2 text-xl font-medium text-stone-900 sm:text-[22px]">
        No analyses awaiting review.
      </h3>
      <p className="mx-auto mt-2 max-w-sm text-[13px] text-stone-500">
        Photos with confidence ≥ 85% auto-update the schedule; below 50% are skipped.
      </p>
    </div>
  );
}

// ─── Queue row ────────────────────────────────────────────────────────────

function Row({
  item, onClick,
}: {
  item: ReviewQueueItem;
  onClick: () => void;
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
  const palette = item.phase_detected ? phaseColor(item.phase_detected) : null;

  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="group flex w-full items-stretch overflow-hidden rounded-2xl border border-stone-200 bg-white text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-stone-300 hover:shadow-md"
      >
        {/* Phase-coloured accent rail */}
        <span
          aria-hidden
          className="w-1 flex-shrink-0"
          style={{ backgroundColor: palette?.color ?? 'rgb(231 229 228)' /* stone-200 */ }}
        />

        {/* Thumbnail with subtle gradient overlay */}
        <div className="relative h-28 w-32 flex-shrink-0 overflow-hidden bg-stone-100 sm:w-36">
          {thumbUrl && !thumbErr ? (
            <>
              <img
                src={thumbUrl}
                alt={item.photos.filename}
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                onError={() => setThumbErr(true)}
              />
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-black/20"
              />
            </>
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <ImageOff className="h-5 w-5 text-stone-400" />
            </div>
          )}
          {item.photos.taken_at && (
            <span className="absolute bottom-1.5 left-1.5 rounded bg-black/55 px-1.5 py-0.5 text-[9.5px] font-medium text-white backdrop-blur-sm">
              {format(new Date(item.photos.taken_at), 'MMM d · h:mm a')}
            </span>
          )}
        </div>

        {/* Middle: filename + phase + meta + flags */}
        <div className="flex min-w-0 flex-1 flex-col justify-center py-3 pl-4 pr-3 sm:py-4 sm:pl-5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-[14px] font-semibold text-stone-900">
              {item.photos.filename}
            </p>
            {item.phase_detected && palette && (
              <span
                className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize"
                style={{
                  borderColor: palette.color,
                  backgroundColor: palette.tint,
                  color: palette.color,
                }}
              >
                <span
                  aria-hidden
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: palette.color }}
                />
                {item.phase_detected}
              </span>
            )}
          </div>
          <p className="mt-1 text-[12.5px] leading-relaxed text-stone-500">
            AI says{' '}
            <span className="font-semibold tabular-nums text-stone-800">
              {item.completion_pct}%
            </span>{' '}
            complete
          </p>
          {item.safety_flags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {item.safety_flags.map((flag) => (
                <span
                  key={flag}
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize ${SEVERITY_TONE[SAFETY_SEVERITY[flag]]}`}
                >
                  <AlertTriangle className="h-2.5 w-2.5" aria-hidden />
                  {flag.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Right: confidence ring + review CTA */}
        <div className="flex w-[110px] flex-shrink-0 flex-col items-center justify-center gap-2 border-l border-stone-100 bg-stone-50/60 px-4 py-3">
          <ConfidenceRing pct={confidencePct} />
          <span className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-stone-400 transition-colors group-hover:text-emerald-700">
            Review →
          </span>
        </div>
      </button>
    </li>
  );
}

// ─── Confidence ring ──────────────────────────────────────────────────────
// Sage-green / teal / amber ramp matches the 0.50–0.85 review band semantics.

function ConfidenceRing({ pct }: { pct: number }) {
  const safe = Math.max(0, Math.min(100, pct));
  const radius = 15;
  const circumference = 2 * Math.PI * radius;
  const dash = (safe / 100) * circumference;
  const stroke = safe >= 80 ? '#2F8F5C' : safe >= 60 ? '#0D8D85' : '#C8841E';
  return (
    <span aria-hidden className="relative inline-flex h-11 w-11 items-center justify-center">
      <svg viewBox="0 0 36 36" className="h-11 w-11 -rotate-90">
        <circle cx="18" cy="18" r={radius} fill="none" stroke="rgb(231 229 228)" strokeWidth="2.5" />
        <circle
          cx="18"
          cy="18"
          r={radius}
          fill="none"
          stroke={stroke}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          style={{ transition: 'stroke-dasharray 400ms ease-out' }}
        />
      </svg>
      <span className="absolute text-[12px] font-bold tabular-nums text-stone-800">
        {safe}
      </span>
    </span>
  );
}
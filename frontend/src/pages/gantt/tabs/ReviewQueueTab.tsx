// ReviewQueueTab — the AI Analysis hub, mounted as a Gantt tab.
//
// Was a standalone `/review-queue` page (`frontend/src/pages/ReviewQueue.tsx`)
// until the demo cleanup pass pulled it under the project-scoped Gantt module.
// `/review-queue?project=X` still resolves via a redirect in App.tsx, so old
// links + the Dashboard's "Pending review" tile keep working.
//
// Layout (top to bottom):
//   1. Hero stats strip — pending, avg confidence, queue depth, total
//      analyses on this project. Reads from the loaded items + a small
//      summary count; client-side derived, no extra round-trip.
//   2. Live processing card — visible while uploads are flying or
//      analyse-photo has just landed a new ai_analyses row. Uses the
//      salvaged DonutProgress so a real photo batch surfaces an obvious
//      "AI is working" signal.
//   3. Phase chip selector — user can tag the about-to-be-uploaded batch
//      with a specific phase so analyze-photo gets the construction-phase
//      context (improves Claude Vision accuracy + lets the operator group
//      uploads by phase). "Auto-detect" leaves it to the model.
//   4. InlineDropzone — drops scoped to the active project, tagged with
//      the selected phase.
//   5. Review queue — items with confidence in the 0.50-0.85 band,
//      redesigned with full-bleed thumbs, phase-coloured tags, and a
//      confidence donut for at-a-glance triage.
//   6. Schedule-context Gantt — collapsed by default, expands on click.
//      Sits last so the client demo lands on stats + queue first.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, ChevronDown, ChevronRight, ImageOff, Inbox, Sparkles } from 'lucide-react';
import { format } from 'date-fns';
import { canConfirmAIAnalysis, canUploadPhotos } from '../../../lib/permissions';
import { supabase, supabaseConfigured } from '../../../lib/supabase';
import { listPendingAnalyses } from '../../../lib/api/aiAnalyses';
import { getPhotoUrl, uploadPhoto } from '../../../lib/api/photos';
import NotAuthorized from '../../../components/NotAuthorized';
import PhotoReviewDrawer, { type ReviewQueueItem } from '../../../components/photos/PhotoReviewDrawer';
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

  const [items, setItems] = useState<ReviewQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<ReviewQueueItem | null>(null);
  // Phase selection for the upload batch. `null` = "Auto-detect" — the model
  // decides without a hint. When set, every photo dropped in this session is
  // tagged with this phase so analyze-photo can use it as `phaseHint` for
  // higher-confidence vision calls. Persists until the user changes it.
  // NOTE: the phase value is currently captured for UX only; wiring it
  // through to analyze-photo's `phaseHint` parameter needs a `phase_hint`
  // column on the `photos` table (follow-up migration 17).
  const [selectedPhase, setSelectedPhase] = useState<ConstructionPhase | null>(null);
  // Schedule-context Gantt collapses by default so the client demo lands on
  // the stats + queue first. Operators can expand for full chart context.
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

  useEffect(() => { void refresh(); }, [refresh]);

  // Mini-dropzone state. Photos drop scoped to the project (no taskId) so
  // the operator stays on the AI hub instead of routing to the Uploads tab.
  // After each batch finishes we refresh the queue — fresh queued analyses
  // appear in the list once the Postgres webhook fires analyze-photo.
  const [uploadBusy, setUploadBusy] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    setUploadError(null);
    setUploadBusy(files.length);
    try {
      for (const file of files) {
        await uploadPhoto({ file, projectId: project.id });
      }
      void refresh();
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      setUploadBusy(0);
    }
  }, [project.id, refresh]);

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

  // Derived stats — all computed from `items` so no extra round-trip. The
  // "Pending" tile is the queue depth; "Avg confidence" averages the queue
  // (which is exactly the 0.50-0.85 band, so this number characterises the
  // borderline cases the reviewer is working through). "Safety flags" is a
  // sum across all items because flags warrant immediate attention.
  const stats = useMemo(() => {
    const total = items.length;
    const avgConf = total > 0
      ? Math.round((items.reduce((s, it) => s + it.confidence, 0) / total) * 100)
      : 0;
    const flagged = items.reduce((s, it) => s + it.safety_flags.length, 0);
    return { total, avgConf, flagged };
  }, [items]);

  return (
    <>
      <TabHeader
        eyebrow="Workspace · AI analysis"
        title="Run, review, confirm."
        description="Tag the batch with its construction phase, drop photos, then work through the analyses the AI wasn't confident enough to apply on its own. Every action lands in the audit log."
      />

      <div className="space-y-6">
        {/* ── Hero stats strip ─────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile
            label="Pending review"
            value={loading ? '…' : String(stats.total)}
            caption="0.50 – 0.85 confidence"
            accent="#0F766E"
          />
          <StatTile
            label="Avg confidence"
            value={loading ? '…' : `${stats.avgConf}%`}
            caption="Across queue"
            accent="#0369A1"
          />
          <StatTile
            label="Safety flags"
            value={loading ? '…' : String(stats.flagged)}
            caption="Across queue"
            accent={stats.flagged > 0 ? '#B91C1C' : '#475569'}
          />
          <StatTile
            label="Auto-apply threshold"
            value="≥ 85%"
            caption="Sub-50% auto-skipped"
            accent="#059669"
          />
        </div>

        {/* ── Live processing indicator (visible while uploads fly) ── */}
        {uploadBusy > 0 && (
          <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-800">
            <span className="text-emerald-600">
              <DonutProgress current={0} total={uploadBusy} sizePx={20} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                Uploading {uploadBusy} photo{uploadBusy === 1 ? '' : 's'}…
              </p>
              <p className="text-xs text-emerald-700/80">
                AI analysis fires automatically once each upload lands.
              </p>
            </div>
          </div>
        )}

        {/* ── Phase chip selector + dropzone ───────────────────────── */}
        {canUpload && (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
                  Tag photos as phase
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Higher accuracy when the model knows the phase. "Auto-detect" lets Claude infer.
                </p>
              </div>
              <p className="text-[11px] text-slate-400">Drops scoped to {project.name}</p>
            </div>
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
              <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {uploadError}
              </p>
            )}
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
              {/* AnimatePresence + motion.li layout = new analyses (from real
                  Edge-Function INSERT events) enter via fadeUp and shift
                  existing rows down via FLIP. */}
              <AnimatePresence initial={false}>
                {items.map((item) => (
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
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </div>

        {/* ── Schedule context — collapsed by default ──────────────── */}
        {tasks.length > 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white">
            <button
              type="button"
              onClick={() => setScheduleOpen((v) => !v)}
              className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-slate-50"
              aria-expanded={scheduleOpen}
            >
              <div className="flex items-center gap-2">
                {scheduleOpen
                  ? <ChevronDown className="h-4 w-4 text-slate-500" />
                  : <ChevronRight className="h-4 w-4 text-slate-500" />}
                <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
                  Schedule context
                </span>
                <span className="text-xs text-slate-400">
                  · {tasks.length} task{tasks.length === 1 ? '' : 's'}
                </span>
              </div>
              <span className="text-[11px] text-slate-400">
                bars animate as analyses land
              </span>
            </button>
            {scheduleOpen && (
              <div className="border-t border-slate-100 p-3 sm:p-4">
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
  label, value, caption, accent,
}: {
  label: string;
  value: string;
  caption: string;
  accent: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white px-4 py-3 sm:px-5 sm:py-4">
      <span
        aria-hidden
        className="absolute left-0 top-0 h-full w-1"
        style={{ backgroundColor: accent }}
      />
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-2xl font-medium tabular-nums text-slate-900 sm:text-3xl">
        {value}
      </p>
      <p className="mt-1 text-[11px] text-slate-400">{caption}</p>
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
      {/* Auto-detect chip — null state. */}
      <button
        type="button"
        onClick={() => onChange(null)}
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors ${
          value === null
            ? 'bg-slate-900 text-white'
            : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
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
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors`}
            style={
              selected
                ? {
                    borderColor: palette.color,
                    backgroundColor: palette.tint,
                    color: palette.color,
                  }
                : {
                    borderColor: 'rgb(226 232 240)' /* slate-200 */,
                    backgroundColor: 'white',
                    color: 'rgb(71 85 105)' /* slate-600 */,
                  }
            }
          >
            <span
              aria-hidden
              className="inline-block h-2 w-2 flex-shrink-0 rounded-full"
              style={{ backgroundColor: palette.color }}
            />
            {palette.label}
          </button>
        );
      })}
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
        className="group flex w-full items-stretch gap-4 overflow-hidden rounded-2xl border border-slate-200 bg-white text-left transition-shadow hover:shadow-md"
      >
        {/* Left phase-color accent + thumbnail */}
        <div className="flex flex-shrink-0">
          <span
            aria-hidden
            className="w-1.5 flex-shrink-0"
            style={{ backgroundColor: palette?.color ?? 'rgb(226 232 240)' /* slate-200 */ }}
          />
          <div className="flex h-24 w-28 flex-shrink-0 items-center justify-center overflow-hidden bg-slate-100 sm:h-28 sm:w-36">
            {thumbUrl && !thumbErr ? (
              <img
                src={thumbUrl}
                alt={item.photos.filename}
                className="h-full w-full object-cover transition-transform group-hover:scale-105"
                onError={() => setThumbErr(true)}
              />
            ) : (
              <ImageOff className="h-5 w-5 text-slate-400" />
            )}
          </div>
        </div>

        {/* Middle: filename + phase + meta + flags */}
        <div className="min-w-0 flex-1 py-3 pr-2 sm:py-4">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-medium text-slate-900">{item.photos.filename}</p>
            {item.phase_detected && palette && (
              <span
                className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize"
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
          <p className="mt-1 text-xs text-slate-500">
            AI says <span className="font-medium tabular-nums text-slate-700">{item.completion_pct}%</span> complete
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

        {/* Right: confidence donut + review CTA */}
        <div className="flex flex-shrink-0 flex-col items-center justify-center gap-1 border-l border-slate-100 px-3 py-3 sm:px-5 sm:py-4">
          <ConfidenceRing pct={confidencePct} />
          <span className="hidden text-[10px] font-medium uppercase tracking-wider text-slate-400 group-hover:text-emerald-600 sm:inline">
            Review →
          </span>
        </div>
      </button>
    </li>
  );
}

// Small confidence donut sized for the row's right rail. Colour ramps from
// amber (low) through emerald (high) so the eye picks out the worst cases
// without reading the number. Distinct from <DonutProgress> (which is for
// in-progress work) — this one is a state read-out.
function ConfidenceRing({ pct }: { pct: number }) {
  const safe = Math.max(0, Math.min(100, pct));
  const radius = 14;
  const circumference = 2 * Math.PI * radius;
  const dash = (safe / 100) * circumference;
  // Amber below 60, slate-emerald 60-80, emerald above 80. Matches the
  // existing 0.50-0.85 review-band semantics (queue is the borderline cases).
  const stroke = safe >= 80 ? '#059669' : safe >= 60 ? '#0D9488' : '#CA8A04';
  return (
    <span aria-hidden className="relative inline-flex h-10 w-10 items-center justify-center">
      <svg viewBox="0 0 36 36" className="h-10 w-10 -rotate-90">
        <circle cx="18" cy="18" r={radius} fill="none" stroke="rgb(226 232 240)" strokeWidth="3" />
        <circle
          cx="18"
          cy="18"
          r={radius}
          fill="none"
          stroke={stroke}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          style={{ transition: 'stroke-dasharray 400ms ease-out' }}
        />
      </svg>
      <span className="absolute text-[11px] font-semibold tabular-nums text-slate-700">
        {safe}
      </span>
    </span>
  );
}

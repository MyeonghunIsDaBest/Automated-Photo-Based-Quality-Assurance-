// ReviewQueueTab — the AI Analysis hub, mounted as a Gantt tab. The flagship
// QA surface: tag a photo with the TASK it belongs to, drop it, and the
// analyser judges it against that task's phase. Two views behind a sub-nav —
// the live review Queue (borderline analyses awaiting a human) and the full
// scan History (every photo ever judged, cloud + localStorage cached). Reworked
// onto the shared warm "site register" kit.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle, Check, Clock, History, ImageOff, Inbox,
  RefreshCw, Sparkles, Upload as UploadIcon,
} from 'lucide-react';
import { format, isToday, isYesterday, parseISO } from 'date-fns';
import { canConfirmAIAnalysis, canUploadPhotos } from '../../../lib/permissions';
import { supabase, supabaseConfigured } from '../../../lib/supabase';
import {
  listPendingAnalyses, getRecentAnalyses, listScanHistory, listFailedAnalyses, requestAnalysis,
  type RecentAnalysisRow, type ScanHistoryItem,
} from '../../../lib/api/aiAnalyses';
import { getPhotoUrl, uploadPhoto } from '../../../lib/api/photos';
import NotAuthorized from '../../../components/NotAuthorized';
import PhotoReviewDrawer, { type ReviewQueueItem } from '../../../components/photos/PhotoReviewDrawer';
import { PhaseCompletionBoard } from './PhaseCompletionCard';
import ConfidenceRing from '../../../components/ui/ConfidenceRing';
import CountUp from '../../../components/ui/CountUp';
import { DonutProgress } from '../../../components/ai/LoadingStates';
import { phaseColor } from '../../../lib/construction/phaseColors';
import {
  StatusPill, FRAUNCES, cardShell, type ToneKey,
} from '../components/ledger';
import type { ConstructionPhase } from '../../../lib/ai/contract';
import { rolledUpPct } from '../../../types';
import type { Project, Task, Zone, User, SafetyFlag, SafetySeverity } from '../../../types';

const PHASE_ORDER: ConstructionPhase[] = [
  'excavation', 'foundation', 'framing', 'roofing',
  'electrical', 'plumbing', 'drywall', 'finishing',
];

const SAFETY_SEVERITY: Record<SafetyFlag, SafetySeverity> = {
  exposed_wiring: 'critical', fall_hazard: 'critical', no_hard_hat: 'high',
  unsecured_load: 'high', housekeeping: 'medium', signage_missing: 'low',
};
const SEVERITY_TONE: Record<SafetySeverity, ToneKey> = {
  critical: 'red', high: 'orange', medium: 'amber', low: 'slate',
};

const cacheKey = (projectId: string) => `photoqa:scanhistory:${projectId}`;

export function ReviewQueueTab({ project, tasks, currentUser }: { project: Project; tasks: Task[]; zones: Zone[]; currentUser: User | null }) {
  if (!canConfirmAIAnalysis(currentUser)) {
    return <NotAuthorized surface="the review queue" />;
  }
  const canUpload = canUploadPhotos(currentUser);

  const [view, setView] = useState<'queue' | 'history'>('queue');
  const [items, setItems] = useState<ReviewQueueItem[]>([]);
  const [history, setHistory] = useState<ScanHistoryItem[]>([]);
  const [recentActivity, setRecentActivity] = useState<RecentAnalysisRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<ReviewQueueItem | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  // Upload target: 'auto' | `task:<id>` | `phase:<phase>`.
  const [judge, setJudge] = useState<string>('auto');

  // Project tasks grouped by phase for the picker (phase anchors excluded).
  const tasksByPhase = useMemo(() => {
    const m = new Map<ConstructionPhase, Task[]>();
    for (const t of tasks) {
      if (t.isPhaseAnchor || t.projectId !== project.id) continue;
      const arr = m.get(t.phase as ConstructionPhase) ?? [];
      arr.push(t);
      m.set(t.phase as ConstructionPhase, arr);
    }
    return m;
  }, [tasks, project.id]);

  const { selectedTaskId, selectedPhase } = useMemo(() => {
    if (judge.startsWith('task:')) {
      const id = judge.slice(5);
      const t = tasks.find((x) => x.id === id);
      return { selectedTaskId: id, selectedPhase: (t?.phase as ConstructionPhase) ?? null };
    }
    if (judge.startsWith('phase:')) return { selectedTaskId: null, selectedPhase: judge.slice(6) as ConstructionPhase };
    return { selectedTaskId: null, selectedPhase: null };
  }, [judge, tasks]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await listPendingAnalyses(project.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load queue.');
    } finally {
      setLoading(false);
    }
  }, [project.id]);

  const refreshActivity = useCallback(async () => {
    try { setRecentActivity(await getRecentAnalyses(project.id, { limit: 50 })); } catch { /* non-fatal */ }
  }, [project.id]);

  const refreshHistory = useCallback(async () => {
    try {
      const rows = await listScanHistory(project.id, 60);
      setHistory(rows);
      try { localStorage.setItem(cacheKey(project.id), JSON.stringify(rows)); } catch { /* quota / private mode */ }
    } catch { /* non-fatal — cached copy stays */ }
  }, [project.id]);

  // Seed history instantly from the local cache, then refresh from cloud.
  useEffect(() => {
    try {
      const cached = localStorage.getItem(cacheKey(project.id));
      if (cached) {
        const parsed = JSON.parse(cached) as ScanHistoryItem[];
        if (Array.isArray(parsed)) setHistory(parsed.filter((x) => x && typeof x.photoId === 'string'));
      }
    } catch { /* ignore */ }
    void refresh(); void refreshActivity(); void refreshHistory();
  }, [project.id, refresh, refreshActivity, refreshHistory]);

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
          const row = await uploadPhoto({
            file,
            projectId: project.id,
            taskId: selectedTaskId ?? undefined,
            phaseHint: selectedPhase ?? undefined,
          });
          setUploadDone((n) => n + 1);
          // Optimistic: the scan shows in History immediately as "Analyzing…",
          // before the AI verdict (or even the queued row) lands.
          const item: ScanHistoryItem = {
            photoId: row.id, filename: row.filename, storagePath: row.storage_path,
            uploadedAt: row.uploaded_at, takenAt: row.taken_at ?? null,
            phase: selectedPhase ?? null, completionPct: null, confidence: null,
            actionTaken: null, analysisStatus: null, flags: 0,
          };
          setHistory((prev) => (prev.some((x) => x.photoId === item.photoId) ? prev : [item, ...prev]));
          return file.name;
        }),
      );
      const failed = results
        .map((r, i) => ({ r, name: files[i].name }))
        .filter((x): x is { r: PromiseRejectedResult; name: string } => x.r.status === 'rejected');
      if (failed.length > 0) {
        const detail = failed.map(({ r, name }) => `${name}: ${(r.reason as Error)?.message ?? 'unknown'}`).join('; ');
        setUploadError(`${results.length - failed.length} of ${results.length} uploaded. Failures — ${detail}`);
      }
      void refresh(); void refreshActivity(); void refreshHistory();
    } finally {
      setUploadBusy(0);
      setUploadDone(0);
    }
  }, [project.id, refresh, refreshActivity, refreshHistory, selectedTaskId, selectedPhase]);

  // Realtime: an analysis flipping status drops it from the queue + refreshes
  // the activity strip and the scan history.
  useEffect(() => {
    if (!supabaseConfigured()) return;
    const channel = supabase
      .channel(`review-queue:${project.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'ai_analyses' }, (payload) => {
        const row = payload.new as { id: string; analysis_status: string; action_taken: string };
        if (row.analysis_status !== 'analysed' || row.action_taken !== 'pending') {
          setItems((prev) => prev.filter((it) => it.id !== row.id));
        }
        void refreshActivity(); void refreshHistory();
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [project.id, refreshActivity, refreshHistory]);

  const stats = useMemo(() => {
    const total = items.length;
    const avgConf = total > 0 ? Math.round((items.reduce((s, it) => s + it.confidence, 0) / total) * 100) : 0;
    const flagged = items.reduce((s, it) => s + it.safety_flags.length, 0);
    return { total, avgConf, flagged };
  }, [items]);

  // Custom phases (migration 44) sync into the Phase completion board with their
  // rolled-up %, so creating a phase in Tasks surfaces it here too.
  const customPhases = useMemo(
    () => tasks
      .filter((t) => t.isPhaseAnchor && t.isCustom && t.projectId === project.id)
      .map((t) => ({ id: t.id, name: t.name, pct: rolledUpPct(t, tasks) }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [tasks, project.id],
  );

  const judgeLabel = selectedTaskId
    ? (tasks.find((t) => t.id === selectedTaskId)?.name ?? 'task')
    : selectedPhase ? phaseColor(selectedPhase).label : 'Auto-detect';

  return (
    <div className="editorial-root">
      {/* ── Scan bench — the inspection desk ── */}
      <div className="relative mb-4 overflow-hidden rounded-[16px] border border-[#E6E1D4] bg-white shadow-[0_1px_2px_rgba(20,20,20,0.04)]">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            backgroundImage: 'linear-gradient(#E6E1D4 1px, transparent 1px), linear-gradient(90deg, #E6E1D4 1px, transparent 1px)',
            backgroundSize: '22px 22px',
            WebkitMaskImage: 'radial-gradient(ellipse 75% 60% at 22% 0%, #000 22%, transparent 72%)',
            maskImage: 'radial-gradient(ellipse 75% 60% at 22% 0%, #000 22%, transparent 72%)',
          }}
        />
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-[#2F8F5C]/10 blur-3xl" />

        <div className="relative grid gap-5 p-5 sm:p-6 lg:grid-cols-[1fr_300px]">
          <div className="flex flex-col">
            <div className="mb-3.5 flex items-center gap-2.5">
              <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-[10px] bg-[#1A1A1A] text-white"><Sparkles className="h-4 w-4" /></span>
              <div className="min-w-0">
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-[#6B6B6B]">Photo QA inspection · {project.name}</p>
                <h2 className="text-[24px] font-medium leading-none text-[#1A1A1A]" style={{ fontFamily: FRAUNCES, letterSpacing: '-0.015em' }}>The inspection desk.</h2>
              </div>
            </div>

            {canUpload ? (
              <div className="flex flex-1 flex-col">
                <div className="mb-2.5 flex flex-wrap items-center gap-2">
                  <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[#6B6B6B]">Judge against</span>
                  <JudgeSelect value={judge} onChange={setJudge} tasksByPhase={tasksByPhase} />
                </div>
                <ScanDropzone
                  onFiles={handleFiles}
                  busy={uploadBusy > 0}
                  done={uploadDone}
                  total={uploadBusy}
                  hint={selectedTaskId ? `Tagged to “${judgeLabel}”` : selectedPhase ? `Tagged as ${judgeLabel}` : 'Phase auto-detects from the image'}
                />
                {uploadError && <p className="mt-2.5 rounded-[10px] border border-[#F3CFCF] bg-[#FBE5E5] px-3 py-2 text-[12px] text-[#C44545]">{uploadError}</p>}
              </div>
            ) : (
              <div className="flex flex-1 items-center rounded-[12px] border border-dashed border-[#E6E1D4] bg-[#FAF8F2] px-5 py-8 text-[13px] text-[#6B6B6B]">
                Read-only access — uploads are disabled. You can still review and confirm analyses below.
              </div>
            )}
          </div>

          {/* Gauge cluster */}
          <div className="flex flex-col gap-3 rounded-[12px] border border-[#E6E1D4] bg-[#FAF8F2]/70 p-4">
            <div className="flex items-center gap-3">
              <ConfidenceRing pct={loading ? 0 : stats.avgConf} />
              <div className="min-w-0">
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[#6B6B6B]">Avg confidence</p>
                <p className="text-[11px] text-[#A0A0A0]">across the open queue</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 border-t border-[#EFEBE0] pt-3">
              <Gauge label="Pending" value={loading ? 0 : stats.total} tone="amber" />
              <Gauge label="Flags" value={loading ? 0 : stats.flagged} tone={stats.flagged > 0 ? 'red' : 'sage'} />
              <Gauge label="Scanned" value={history.length} tone="slate" />
            </div>
          </div>
        </div>
      </div>

      {/* View sub-nav */}
      <div className="mb-4 inline-flex items-center gap-1 rounded-full border border-[#E6E1D4] bg-white p-1 shadow-[0_1px_2px_rgba(20,20,20,0.04)]">
        {([['queue', 'Review queue', Inbox], ['history', 'Scan history', History]] as const).map(([id, label, Icon]) => {
          const isActive = view === id;
          const count = id === 'queue' ? items.length : history.length;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setView(id)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
                isActive ? 'bg-[#1A1A1A] text-white' : 'text-[#6B6B6B] hover:bg-[#FAF8F2] hover:text-[#1A1A1A]'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
              {count > 0 && (
                <span className={`ml-0.5 rounded-full px-1.5 text-[10px] font-bold tabular-nums ${isActive ? 'bg-white/20 text-white' : 'bg-[#F0EDE4] text-[#6B6B6B]'}`}>{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Upload + judge + live scan progress now live in the Scan bench hero above. */}

      {error && (
        <div className="mb-4 rounded-[10px] border border-[#F3CFCF] bg-[#FBE5E5] px-3 py-2 text-[13px] text-[#C44545]">{error}</div>
      )}

      {view === 'queue' ? (
        <QueueView
          project={project}
          items={items} loading={loading} recentActivity={recentActivity}
          history={history} confirmingId={confirmingId}
          customPhases={customPhases}
          onOpen={setActive}
        />
      ) : (
        <HistoryView items={history} />
      )}

      {active && (
        <PhotoReviewDrawer
          item={active}
          onClose={() => setActive(null)}
          onResolved={() => {
            const id = active.id;
            setConfirmingId(id);
            window.setTimeout(() => {
              setItems((prev) => prev.filter((it) => it.id !== id));
              setConfirmingId((cur) => (cur === id ? null : cur));
              void refreshHistory();
            }, 700);
          }}
        />
      )}
    </div>
  );
}

// ─── Queue view ─────────────────────────────────────────────────────────────

function QueueView({
  project, items, loading, recentActivity, history, confirmingId, customPhases, onOpen,
}: {
  project: Project;
  items: ReviewQueueItem[]; loading: boolean; recentActivity: RecentAnalysisRow[];
  history: ScanHistoryItem[]; confirmingId: string | null;
  customPhases: { id: string; name: string; pct: number }[];
  onOpen: (it: ReviewQueueItem) => void;
}) {
  return (
    <div className="space-y-4">
      <PhaseCompletionBoard projectId={project.id} scans={history} customPhases={customPhases} />
      <RecentActivityStrip rows={recentActivity} />
      <FailedScansCard projectId={project.id} />

      <div>
        <div className="mb-3 flex items-baseline justify-between px-1">
          <div className="flex items-baseline gap-2.5">
            <h2 className="text-[20px] font-medium tracking-tight text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>Review queue</h2>
            <StatusPill tone="slate">{loading ? '…' : `${items.length} pending`}</StatusPill>
          </div>
          <p className="text-[11px] text-[#A0A0A0]">Borderline scans · sorted by confidence ↑</p>
        </div>

        {loading ? (
          <div className={`px-4 py-16 text-center text-[13px] text-[#A0A0A0] ${cardShell}`}>Loading queue…</div>
        ) : items.length === 0 ? (
          <EmptyQueue hasScans={history.length > 0} />
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
                  <QueueRow item={item} confirmed={confirmingId === item.id} onClick={() => onOpen(item)} />
                </motion.div>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>
    </div>
  );
}

// ─── Failed-scans drilldown (Tier-2 #11) ─────────────────────────────────────
// Surfaces photos whose AI analysis errored (analysis_status='failed') with a
// one-click retry, so a failed scan no longer silently vanishes from the
// pending-only queue. Renders nothing when there are no failures.
type FailedRow = Awaited<ReturnType<typeof listFailedAnalyses>>[number];

function FailedScansCard({ projectId }: { projectId: string }) {
  const [rows, setRows] = useState<FailedRow[]>([]);
  const [retrying, setRetrying] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setRows(await listFailedAnalyses(projectId)); } catch { /* non-fatal */ }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  if (rows.length === 0) return null;

  const retry = async (photoId: string) => {
    setRetrying(photoId);
    try {
      await requestAnalysis(photoId, { forceNew: true });
      // Optimistically drop it — the realtime UPDATE + refreshes reconcile.
      setRows((prev) => prev.filter((r) => r.photo_id !== photoId));
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[review] retry failed:', e);
    } finally {
      setRetrying(null);
    }
  };

  return (
    <div className={`overflow-hidden ${cardShell}`}>
      <div className="flex items-center justify-between border-b border-[#EFEBE0] px-5 py-3">
        <div className="flex items-center gap-2 text-[12.5px] font-semibold text-[#1A1A1A]">
          <AlertTriangle className="h-3.5 w-3.5 text-[#C44545]" />Failed scans
        </div>
        <StatusPill tone="red">{rows.length} need a retry</StatusPill>
      </div>
      <ul className="divide-y divide-[#EFEBE0]">
        {rows.map((r) => (
          <FailedRowItem key={r.id} row={r} retrying={retrying === r.photo_id} onRetry={() => retry(r.photo_id)} />
        ))}
      </ul>
    </div>
  );
}

function FailedRowItem({ row, retrying, onRetry }: { row: FailedRow; retrying: boolean; onRetry: () => void }) {
  const { url, err } = useThumb(row.photos.storage_path);
  return (
    <li className="flex items-center gap-3 px-5 py-3">
      <div className="relative h-12 w-14 flex-shrink-0 overflow-hidden rounded-[8px] bg-[#F0EDE4]">
        {url && !err ? (
          <img src={url} alt={row.photos.filename} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center"><ImageOff className="h-4 w-4 text-[#A0A0A0]" /></div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold text-[#1A1A1A]">{row.photos.filename}</p>
        <p className="truncate text-[11.5px] text-[#6B6B6B]">
          {row.rationale || 'Analysis errored — parse or storage issue.'}
          {row.analyzed_at && <> · {format(new Date(row.analyzed_at), 'MMM d, h:mm a')}</>}
        </p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        disabled={retrying}
        className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-full bg-[#2F8F5C] px-3.5 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-[#246F47] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${retrying ? 'animate-spin' : ''}`} />
        {retrying ? 'Retrying…' : 'Retry'}
      </button>
    </li>
  );
}

// ─── Task / phase picker ─────────────────────────────────────────────────────

function JudgeSelect({
  value, onChange, tasksByPhase,
}: {
  value: string;
  onChange: (v: string) => void;
  tasksByPhase: Map<ConstructionPhase, Task[]>;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-10 w-full rounded-full border border-[#E6E1D4] bg-white px-4 text-[13px] font-medium text-[#1A1A1A] focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]/30 sm:w-72"
    >
      <option value="auto">✦ Auto-detect (no task)</option>
      {PHASE_ORDER.map((ph) => {
        const ts = tasksByPhase.get(ph);
        if (!ts || ts.length === 0) return null;
        return (
          <optgroup key={ph} label={phaseColor(ph).label}>
            {ts.map((t) => <option key={t.id} value={`task:${t.id}`}>{t.name}</option>)}
          </optgroup>
        );
      })}
      <optgroup label="Phase only (no task)">
        {PHASE_ORDER.map((ph) => <option key={ph} value={`phase:${ph}`}>{phaseColor(ph).label}</option>)}
      </optgroup>
    </select>
  );
}

function ScanDropzone({
  onFiles, hint, busy, done, total,
}: {
  onFiles: (files: File[]) => void;
  hint: string;
  busy: boolean;
  done: number;
  total: number;
}) {
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const active = over || busy;
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); if (e.dataTransfer.files) onFiles(Array.from(e.dataTransfer.files)); }}
      onClick={() => { if (!busy) inputRef.current?.click(); }}
      className={`relative flex min-h-[150px] flex-1 cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-[14px] border-2 border-dashed px-5 py-6 text-center transition-colors ${
        active ? 'border-[#2F8F5C] bg-[#E5F2EA]/50' : 'border-[#D6CDB7] bg-[#FAF8F2] hover:border-[#2F8F5C] hover:bg-[#E5F2EA]/40'
      }`}
    >
      {active && <span aria-hidden className="aiq-scanline pointer-events-none absolute inset-x-0 top-0 h-14" />}
      {busy ? (
        <>
          <span className="relative text-[#246F47]"><DonutProgress current={done} total={total} sizePx={30} /></span>
          <p className="text-[13.5px] font-semibold text-[#1A4D32]">Scanning {done} / {total}…</p>
          <p className="text-[11.5px] text-[#246F47]/80">AI fires automatically once each upload lands.</p>
        </>
      ) : (
        <>
          <span className="grid h-11 w-11 place-items-center rounded-full border border-[#E6E1D4] bg-white"><UploadIcon className="h-5 w-5 text-[#246F47]" /></span>
          <p className="text-[14.5px] font-semibold text-[#1A1A1A]">Drop photos to scan</p>
          <p className="text-[12px] text-[#6B6B6B]">{hint}</p>
          <div className="mt-1 flex items-center gap-1">
            {['JPG', 'PNG', 'WebP', 'HEIC'].map((t) => (
              <span key={t} className="rounded-md border border-[#E6E1D4] bg-white px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-[#6B6B6B]">{t}</span>
            ))}
          </div>
        </>
      )}
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*,.heic,.heif"
        onChange={(e) => { if (e.target.files) onFiles(Array.from(e.target.files)); e.target.value = ''; }}
        className="hidden"
      />
    </div>
  );
}

function Gauge({ label, value, tone }: { label: string; value: number; tone: ToneKey }) {
  return (
    <div>
      <p className="text-[22px] font-medium leading-none tabular-nums text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}><CountUp value={value} /></p>
      <p className="mt-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#6B6B6B]">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: TONE_DOT[tone] }} />{label}
      </p>
    </div>
  );
}

// ─── Recent-activity strip ───────────────────────────────────────────────────

function bucketActivity(rows: RecentAnalysisRow[]) {
  const out = { auto: 0, pending: 0, skipped: 0, failed: 0 };
  for (const r of rows) {
    if (r.analysis_status === 'failed') { out.failed += 1; continue; }
    if (r.action_taken === 'auto_updated') out.auto += 1;
    else if (r.action_taken === 'pending') out.pending += 1;
    else if (r.action_taken === 'skipped') out.skipped += 1;
  }
  return out;
}

function RecentActivityStrip({ rows }: { rows: RecentAnalysisRow[] }) {
  if (rows.length === 0) return null;
  const b = bucketActivity(rows);
  const tiles: { label: string; value: number; sub: string; tone: ToneKey }[] = [
    { label: 'Auto-applied', value: b.auto,    sub: '≥85% — schedule bumped',   tone: 'sage' },
    { label: 'Pending',      value: b.pending, sub: 'in review queue',          tone: 'amber' },
    { label: 'Skipped',      value: b.skipped, sub: '<50% — needs better photo', tone: 'slate' },
    { label: 'Failed',       value: b.failed,  sub: 'parse / storage error',    tone: b.failed > 0 ? 'red' : 'slate' },
  ];
  return (
    <div className={`overflow-hidden ${cardShell}`}>
      <div className="flex items-center justify-between border-b border-[#EFEBE0] px-5 py-3">
        <div className="flex items-center gap-2 text-[12.5px] font-semibold text-[#1A1A1A]"><Clock className="h-3.5 w-3.5 text-[#A0A0A0]" />Last 24 hours</div>
        <p className="text-[11px] text-[#A0A0A0]">{rows.length} analyses processed</p>
      </div>
      <div className="grid grid-cols-2 divide-[#EFEBE0] sm:grid-cols-4 sm:divide-x">
        {tiles.map((t) => (
          <div key={t.label} className="px-5 py-3.5">
            <div className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.16em] text-[#6B6B6B]">
              <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: TONE_DOT[t.tone] }} />{t.label}
            </div>
            <p className="mt-1.5 text-[22px] font-medium leading-none tabular-nums text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}><CountUp value={t.value} /></p>
            <p className="mt-1 text-[11px] text-[#A0A0A0]">{t.sub}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
const TONE_DOT: Record<ToneKey, string> = { sage: '#2F8F5C', amber: '#D69A2E', orange: '#C26A2C', red: '#C44545', slate: '#6B7A8F', ink: '#1A1A1A', sky: '#2A6F9E', violet: '#6B3FA0', emerald: '#10B981' };

// ─── Queue row ───────────────────────────────────────────────────────────────

function useThumb(storagePath: string) {
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void getPhotoUrl(storagePath, 600).then((u) => { if (!cancelled) setUrl(u); }).catch(() => { if (!cancelled) setErr(true); });
    return () => { cancelled = true; };
  }, [storagePath]);
  return { url, err };
}

function QueueRow({ item, onClick, confirmed }: { item: ReviewQueueItem; onClick: () => void; confirmed?: boolean }) {
  const { url, err } = useThumb(item.photos.storage_path);
  const confidencePct = Math.round(item.confidence * 100);
  const palette = item.phase_detected ? phaseColor(item.phase_detected) : null;
  return (
    <li>
      <button type="button" onClick={onClick} className={`group relative flex w-full items-stretch overflow-hidden text-left transition-all hover:-translate-y-0.5 hover:shadow-md ${cardShell}`}>
        {confirmed && (
          <motion.span initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="absolute right-3 top-3 z-10 inline-flex items-center gap-1 rounded-full bg-[#2F8F5C] px-2 py-0.5 text-[10px] font-semibold text-white shadow">
            <Check className="h-3 w-3" aria-hidden /> Confirmed
          </motion.span>
        )}
        <span aria-hidden className="w-1 flex-shrink-0" style={{ backgroundColor: palette?.color ?? '#E6E1D4' }} />
        <div className="relative h-32 w-36 flex-shrink-0 overflow-hidden bg-[#F0EDE4] sm:w-44">
          {url && !err ? (
            <img src={url} alt={item.photos.filename} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
          ) : (
            <div className="flex h-full w-full items-center justify-center"><ImageOff className="h-5 w-5 text-[#A0A0A0]" /></div>
          )}
          {item.photos.taken_at && (
            <span className="absolute bottom-1.5 left-1.5 rounded bg-black/55 px-1.5 py-0.5 text-[9.5px] font-medium text-white backdrop-blur-sm">
              {format(new Date(item.photos.taken_at), 'MMM d · h:mm a')}
            </span>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-center py-3 pl-4 pr-3 sm:py-4 sm:pl-5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-[14px] font-semibold text-[#1A1A1A]">{item.photos.filename}</p>
            {item.phase_detected && palette && (
              <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize" style={{ borderColor: palette.color, backgroundColor: palette.tint, color: palette.color }}>
                <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: palette.color }} />{item.phase_detected}
              </span>
            )}
          </div>
          <p className="mt-1 text-[12.5px] leading-relaxed text-[#6B6B6B]">
            AI says <span className="font-semibold tabular-nums text-[#1A1A1A]">{item.completion_pct}%</span> complete
          </p>
          <div className="mt-1.5 h-1.5 w-full max-w-[240px] overflow-hidden rounded-full bg-[#F0EDE4]">
            <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${item.completion_pct}%`, background: 'linear-gradient(90deg,#246F47,#2F8F5C)' }} />
          </div>
          {item.safety_flags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {item.safety_flags.map((flag) => (
                <StatusPill key={flag} tone={SEVERITY_TONE[SAFETY_SEVERITY[flag]]} className="capitalize">
                  <AlertTriangle className="h-2.5 w-2.5" aria-hidden />{flag.replace(/_/g, ' ')}
                </StatusPill>
              ))}
            </div>
          )}
        </div>
        <div className="flex w-[110px] flex-shrink-0 flex-col items-center justify-center gap-2 border-l border-[#EFEBE0] bg-[#FAF8F2]/60 px-4 py-3">
          <ConfidenceRing pct={confidencePct} />
          <span className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-[#A0A0A0] transition-colors group-hover:text-[#246F47]">Review →</span>
        </div>
      </button>
    </li>
  );
}

function EmptyQueue({ hasScans }: { hasScans: boolean }) {
  // When scans exist they auto-resolved (≥85% applied, <50% skipped) — point the
  // user to the Recent scans below instead of an empty "nothing happened" card.
  if (hasScans) {
    return (
      <div className={`flex items-center gap-3.5 px-5 py-4 ${cardShell}`}>
        <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-full bg-[#E5F2EA] text-[#246F47]"><Inbox className="h-5 w-5" strokeWidth={1.5} /></span>
        <div className="min-w-0">
          <p className="text-[13.5px] font-semibold text-[#1A1A1A]">Nothing awaiting your review.</p>
          <p className="text-[12px] text-[#6B6B6B]">Recent scans auto-resolved — see their status in the Phase completion scan board above, or the Scan history tab. Borderline ones (50–85% confidence) would land here.</p>
        </div>
      </div>
    );
  }
  return (
    <div className={`px-6 py-16 text-center ${cardShell}`}>
      <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-[#E5F2EA] text-[#246F47]"><Inbox className="h-7 w-7" strokeWidth={1.5} /></div>
      <p className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-[#246F47]">All caught up</p>
      <h3 className="mt-2 text-[22px] font-medium text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>No analyses awaiting review.</h3>
      <p className="mx-auto mt-2 max-w-sm text-[13px] text-[#6B6B6B]">Drop a photo in the scan bench above. Photos ≥ 85% confidence auto-update the schedule; below 50% are skipped. Borderline ones land here.</p>
    </div>
  );
}

// ─── Scan history (date-grouped) ─────────────────────────────────────────────

function scanStatus(item: ScanHistoryItem): { tone: ToneKey; label: string } {
  const st = item.analysisStatus;
  if (st === null) return { tone: 'slate', label: 'Awaiting AI' };
  if (st === 'queued' || st === 'analysing') return { tone: 'amber', label: 'Analyzing…' };
  if (st === 'failed') return { tone: 'red', label: 'Failed' };
  switch (item.actionTaken) {
    case 'auto_updated': return { tone: 'sage', label: 'Auto-applied' };
    case 'confirmed':    return { tone: 'sage', label: 'Confirmed' };
    case 'skipped':      return { tone: 'slate', label: 'Skipped' };
    default:             return st === 'rejected' ? { tone: 'slate', label: 'Rejected' } : { tone: 'amber', label: 'Pending review' };
  }
}

function dayLabel(iso: string): string {
  const d = parseISO(iso);
  if (isToday(d)) return 'Today';
  if (isYesterday(d)) return 'Yesterday';
  return format(d, 'EEEE, MMM d');
}

function HistoryView({ items }: { items: ScanHistoryItem[] }) {
  const groups = useMemo(() => {
    const m = new Map<string, ScanHistoryItem[]>();
    for (const it of items) {
      const key = (it.uploadedAt ?? '').slice(0, 10) || 'unknown';
      const arr = m.get(key) ?? [];
      arr.push(it);
      m.set(key, arr);
    }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [items]);

  if (items.length === 0) {
    return (
      <div className={`px-6 py-16 text-center ${cardShell}`}>
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-[#FAF8F2] text-[#2F8F5C]"><History className="h-7 w-7" strokeWidth={1.5} /></div>
        <h3 className="text-[22px] font-medium text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>No scans yet.</h3>
        <p className="mx-auto mt-2 max-w-sm text-[13px] text-[#6B6B6B]">Drop a photo above and it lands here the instant it uploads — with its AI verdict as soon as the analyser returns. Every scan is mirrored to your Files.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {groups.map(([day, dayItems]) => (
        <div key={day}>
          <div className="mb-2.5 flex items-center gap-2 px-0.5">
            <h3 className="text-[13px] font-semibold text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>{dayLabel(dayItems[0].uploadedAt)}</h3>
            <span className="text-[11px] tabular-nums text-[#A0A0A0]">{dayItems.length} scan{dayItems.length === 1 ? '' : 's'}</span>
            <span aria-hidden className="ml-1 h-px flex-1 bg-[#EFEBE0]" />
          </div>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {dayItems.map((it) => <ContactTile key={it.photoId} item={it} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

// A contact-sheet tile — thumbnail-first, with the scan verdict as a corner chip
// and the completion % overlaid, so History reads as a visual timeline.
function ContactTile({ item }: { item: ScanHistoryItem }) {
  const { url, err } = useThumb(item.storagePath);
  const { tone, label } = scanStatus(item);
  const palette = item.phase ? phaseColor(item.phase) : null;
  return (
    <div className="group overflow-hidden rounded-[10px] border border-[#E6E1D4] bg-white shadow-[0_1px_2px_rgba(20,20,20,0.04)] transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-[#F0EDE4]">
        {url && !err ? (
          <img src={url} alt={item.filename} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
        ) : (
          <div className="flex h-full w-full items-center justify-center"><ImageOff className="h-5 w-5 text-[#A0A0A0]" /></div>
        )}
        <span aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent" />
        <div className="absolute left-1.5 top-1.5"><StatusPill tone={tone} className="px-1.5 py-0 text-[9px]">{label}</StatusPill></div>
        {item.completionPct !== null && (
          <span className="absolute bottom-1.5 right-1.5 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white backdrop-blur-sm">{item.completionPct}%</span>
        )}
        {palette && (
          <span className="absolute bottom-1.5 left-1.5 inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold capitalize text-white" style={{ backgroundColor: `${palette.color}E6` }}>
            {item.phase}
          </span>
        )}
      </div>
      <div className="px-2 py-1.5">
        <p className="truncate text-[11.5px] font-semibold text-[#1A1A1A]" title={item.filename}>{item.filename}</p>
        <p className="text-[10px] tabular-nums text-[#A0A0A0]">
          {item.uploadedAt ? format(parseISO(item.uploadedAt), 'h:mm a') : ''}{item.confidence !== null && <> · {Math.round(item.confidence * 100)}% conf</>}
        </p>
      </div>
    </div>
  );
}

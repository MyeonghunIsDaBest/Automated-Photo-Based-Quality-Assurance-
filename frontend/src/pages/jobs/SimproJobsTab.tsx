// ─────────────────────────────────────────────────────────────────────────────
// pages/jobs/SimproJobsTab.tsx — the "Sim-Pro Jobs" body of the Jobs hub.
//
// A staging workspace for jobs imported from Simpro CSV exports:
//   • Hero card — 5 Simpro-stage count tiles + total loaded + action buttons.
//   • Stage tab-strip (In Progress / Pending / Complete / Invoiced / Archived).
//   • Searchable browse table of staged jobs.
//   • Upload new CSV  → parse (pure) → preview + plan → persist to simpro_jobs.
//   • Confirm import  → promote staged jobs into projects / service_jobs.
//
// View = any staff (hub guard). Import + Confirm = canManageServiceJobs (RLS
// also enforces manager-only writes server-side).
//
// Pure parse/plan: lib/jobs/simproCsv.ts. Network: lib/api/simproJobs.ts.
// ─────────────────────────────────────────────────────────────────────────────

import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Upload,
  Download,
  CheckCircle2,
  Loader2,
  Search,
  X,
  CalendarRange,
  GripVertical,
  Plus,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

import { useAppStore } from '../../store';
import { canManageServiceJobs } from '../../lib/permissions';
import {
  FRAUNCES,
  TONE,
  type ToneKey,
  cardShell,
  btnPrimary,
  btnGhost,
  StatusPill,
} from '../gantt/components/ledger';
import { Toaster } from '../../components/ui/Toaster';

import {
  parseSimproCsv,
  planSimproImport,
  SIMPRO_STAGES,
  STAGE_LABEL,
  SIMPRO_CSV_TEMPLATE,
  inferCategory,
  type SimproStage,
  type SimproCategory,
  type SimproJobRow,
  type ImportPlan,
} from '../../lib/jobs/simproCsv';
import {
  listSimproJobs,
  stageCounts,
  listStagedRefs,
  importStagedJobs,
  confirmImport,
  createSimproJob,
  scheduleSimproJob,
  unscheduleSimproJob,
  type StagedJob,
  type CreateSimproJobInput,
} from '../../lib/api/simproJobs';
import {
  listCrewForSimproJobs,
  addSimproCrew,
  removeSimproCrew,
} from '../../lib/api/simproJobCrew';
import { listProfiles } from '../../lib/api/profiles';
import { timelineWindow, toISODate, barSpan } from '../../lib/jobs/scheduleWeek';
import type { Profile } from '../../types';

// ─── stage → tone (distinct chips, drawn from the warm Site Diary palette) ────

const STAGE_TONE: Record<SimproStage, ToneKey> = {
  in_progress: 'sage',
  pending: 'amber',
  complete: 'slate',
  invoiced: 'orange',
  archived: 'ink',
};

// ─── category → tone + label for the inline Type pill ─────────────────────────

const CATEGORY_TONE: Record<SimproCategory, ToneKey> = {
  solar: 'sage',
  aircon: 'slate', // blue-ish slate
  battery: 'ink',
  generator: 'amber',
  ev: 'red',
  other: 'slate',
};

const CATEGORY_LABEL: Record<SimproCategory, string> = {
  solar: 'Solar',
  aircon: 'Air-con',
  battery: 'Battery',
  generator: 'Generator',
  ev: 'EV',
  other: 'Other',
};

// The browse-table column count — kept in one place so loading/empty colSpans
// and the expander's full-width <td> all stay in sync with the header array.
const COLUMN_COUNT = 10; // Type, Job, Description, Customer, Site, Suburb, Phone, Due, Stage, Actions

/** A deterministic warm-ish tint from a user id, for crew avatar backgrounds. */
function avatarTint(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 45% 86%)`;
}

type ToastState = { message: string; type: 'success' | 'error' | 'info' } | null;
type EmptyCounts = Record<SimproStage, number>;

const ZERO_COUNTS: EmptyCounts = {
  in_progress: 0,
  pending: 0,
  complete: 0,
  invoiced: 0,
  archived: 0,
};

// ─── component ───────────────────────────────────────────────────────────────

export default function SimproJobsTab() {
  const currentProfile = useAppStore((s) => s.currentProfile);
  const currentUser = useAppStore((s) => s.currentUser);
  const canManage = canManageServiceJobs(currentProfile ?? currentUser);

  const [counts, setCounts] = useState<EmptyCounts>(ZERO_COUNTS);
  const [total, setTotal] = useState(0);
  const [activeStage, setActiveStage] = useState<SimproStage>('in_progress');
  const [search, setSearch] = useState('');
  const [jobs, setJobs] = useState<StagedJob[]>([]);
  const [loading, setLoading] = useState(true);

  const [toast, setToast] = useState<ToastState>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  // Visible width of the table's scroll viewport — pins the inline timeline so a
  // wide Gantt scrolls INSIDE the row instead of stretching the table/page wider.
  const tableWrapRef = useRef<HTMLDivElement>(null);
  const [viewportW, setViewportW] = useState(0);
  useEffect(() => {
    const el = tableWrapRef.current;
    if (!el) return;
    const update = () => setViewportW(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── per-row inline schedule expander ──────────────────────────────────────
  // Non-null = the row with this job id has its inline timeline expanded.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [crew, setCrew] = useState<Map<string, string[]>>(new Map());
  // Local schedule overrides so a dragged/cleared bar updates instantly; keyed
  // by job id, reconciled on every crew/schedule refetch below.
  const [scheduleOverride, setScheduleOverride] = useState<
    Map<string, { start: string | null; end: string | null }>
  >(new Map());

  // pick the first stage that actually has jobs, once counts arrive
  const pickedInitialStage = useRef(false);

  const refreshCounts = useCallback(async () => {
    try {
      const { counts: c, total: t } = await stageCounts();
      setCounts(c);
      setTotal(t);
      if (!pickedInitialStage.current && t > 0) {
        pickedInitialStage.current = true;
        const firstWithJobs = SIMPRO_STAGES.find((s) => c[s] > 0);
        if (firstWithJobs) setActiveStage(firstWithJobs);
      }
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'Failed to load counts', type: 'error' });
    }
  }, []);

  const refreshList = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listSimproJobs({ stage: activeStage, search: search.trim() || undefined });
      setJobs(rows);
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'Failed to load jobs', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [activeStage, search]);

  // Crew assignments for all currently-loaded jobs (the expander reads from this
  // map; loading all of them up-front keeps expanding a row instant). Clears any
  // stale schedule overrides at the same time.
  const refreshCrew = useCallback(async (jobIds: string[]) => {
    if (jobIds.length === 0) {
      setCrew(new Map());
      return;
    }
    try {
      const map = await listCrewForSimproJobs(jobIds);
      setCrew(map);
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'Failed to load crew', type: 'error' });
    }
  }, []);

  useEffect(() => {
    void refreshCounts();
  }, [refreshCounts]);

  useEffect(() => {
    void refreshList();
  }, [refreshList]);

  // Active staff for crew assignment — loaded once.
  useEffect(() => {
    (async () => {
      try {
        const all = await listProfiles();
        setProfiles(all.filter((p) => p.isActive));
      } catch (err) {
        setToast({ message: err instanceof Error ? err.message : 'Failed to load staff', type: 'error' });
      }
    })();
  }, []);

  // A freshly-listed set of rows is authoritative — drop stale schedule overrides.
  useEffect(() => {
    setScheduleOverride(new Map());
  }, [jobs]);

  // Crew is only shown in the expander, so load it for the OPEN job only (not the
  // whole stage — a 500+ id `in.()` blows the URL length → 400). Refetch when the
  // open row changes or the list refreshes.
  useEffect(() => {
    void refreshCrew(expandedId ? [expandedId] : []);
  }, [expandedId, jobs, refreshCrew]);

  function downloadTemplate() {
    const blob = new Blob([SIMPRO_CSV_TEMPLATE], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'simpro-jobs-import-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function afterWrite() {
    await Promise.all([refreshCounts(), refreshList()]);
  }

  // ── expander mutations (optimistic, refetch crew/list to reconcile) ────────

  async function toggleCrew(jobId: string, userId: string) {
    const current = crew.get(jobId) ?? [];
    const isAssigned = current.includes(userId);
    // optimistic
    const next = new Map(crew);
    next.set(jobId, isAssigned ? current.filter((u) => u !== userId) : [...current, userId]);
    setCrew(next);
    try {
      if (isAssigned) await removeSimproCrew(jobId, userId);
      else await addSimproCrew(jobId, userId);
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'Failed to update crew', type: 'error' });
    } finally {
      await refreshCrew([jobId]);
    }
  }

  async function applySchedule(jobId: string, startIso: string, endIso: string) {
    // Optimistic: the bar already moved via the override; persist in the
    // BACKGROUND with no refetch, so the table/expander stays stable (no flicker).
    // The override keeps the bar in place until the next deliberate refresh.
    const prev = scheduleOverride.get(jobId) ?? null;
    setScheduleOverride((m) => new Map(m).set(jobId, { start: startIso, end: endIso }));
    try {
      await scheduleSimproJob(jobId, startIso, endIso);
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'Failed to save schedule', type: 'error' });
      setScheduleOverride((m) => {
        const n = new Map(m);
        if (prev) n.set(jobId, prev);
        else n.delete(jobId);
        return n;
      });
    }
  }

  async function clearSchedule(jobId: string) {
    const prev = scheduleOverride.get(jobId) ?? null;
    setScheduleOverride((m) => new Map(m).set(jobId, { start: null, end: null }));
    try {
      await unscheduleSimproJob(jobId);
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'Failed to clear schedule', type: 'error' });
      setScheduleOverride((m) => {
        const n = new Map(m);
        if (prev) n.set(jobId, prev);
        else n.delete(jobId);
        return n;
      });
    }
  }

  // Re-pull jobs + counts + crew so the expander reflects SiteProof exactly.
  const syncSchedule = useCallback(async () => {
    await Promise.all([
      refreshList(),
      refreshCounts(),
      refreshCrew(expandedId ? [expandedId] : []),
    ]);
    setToast({ message: 'In sync with SiteProof', type: 'success' });
  }, [refreshList, refreshCounts, refreshCrew, expandedId]);

  return (
    <div className="space-y-5">
      {/* ── Hero card ─────────────────────────────────────────────────────── */}
      <div className={`overflow-hidden ${cardShell}`}>
        <div className="flex flex-col gap-5 px-5 py-5 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="leading-tight">
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#6B6B6B]">
                PP2 · SIMPRO JOB IMPORT · CASONE ELECTRICAL
              </div>
              <h1
                className="m-0 text-[28px] font-medium leading-none text-[#1A1A1A] sm:text-[32px]"
                style={{ fontFamily: FRAUNCES, letterSpacing: '-0.02em' }}
              >
                Simpro <span className="italic text-[#2F8F5C]">jobs.</span>
              </h1>
              <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-[#6B6B6B]">
                {total > 0 ? (
                  <>
                    {total.toLocaleString('en-AU')} job{total === 1 ? '' : 's'} across 5 stages loaded
                    from Simpro CSV exports. Browse, search, and confirm the import into SiteProof.
                  </>
                ) : (
                  <>No Simpro jobs loaded yet. Upload a Simpro CSV export to stage jobs here, then confirm them into SiteProof.</>
                )}
              </p>
            </div>

            {canManage && (
              <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
                <button type="button" onClick={downloadTemplate} className={btnGhost}>
                  <Download className="h-4 w-4" />
                  Download template
                </button>
                <button type="button" onClick={() => setImportOpen(true)} className={btnGhost}>
                  <Upload className="h-4 w-4" />
                  Upload new CSV
                </button>
                <button type="button" onClick={() => setCreateOpen(true)} className={btnGhost}>
                  <Plus className="h-4 w-4" />
                  New job
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmOpen(true)}
                  disabled={total === 0}
                  className={btnPrimary}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Confirm import
                </button>
              </div>
            )}
          </div>

          {/* Stage count tiles + total */}
          <div className="flex flex-wrap items-center gap-x-8 gap-y-4 border-t border-[#EFEBE0] pt-4">
            {SIMPRO_STAGES.map((s) => {
              const t = TONE[STAGE_TONE[s]];
              return (
                <div key={s} className="min-w-[92px]">
                  <div
                    className="text-[24px] font-medium leading-none tabular-nums text-[#1A1A1A]"
                    style={{ fontFamily: FRAUNCES }}
                  >
                    {counts[s].toLocaleString('en-AU')}
                  </div>
                  <div className="mt-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-[#6B6B6B]">
                    <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ background: t.dot }} aria-hidden />
                    {STAGE_LABEL[s]}
                  </div>
                </div>
              );
            })}
            <div className="ml-auto text-right">
              <div
                className="text-[24px] font-medium leading-none tabular-nums text-[#1A1A1A]"
                style={{ fontFamily: FRAUNCES }}
              >
                {total.toLocaleString('en-AU')}
              </div>
              <div className="mt-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-[#A0A0A0]">
                Total jobs loaded
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Stage tabs + search ───────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex flex-wrap items-center gap-1 rounded-2xl border border-[#E6E1D4] bg-[#FAF8F2] p-1">
          {SIMPRO_STAGES.map((s) => {
            const isActive = activeStage === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => setActiveStage(s)}
                className={`flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-medium transition-colors ${
                  isActive ? 'bg-[#1A1A1A] text-white shadow-sm' : 'text-[#6B6B6B] hover:bg-[#F0EDE4] hover:text-[#1A1A1A]'
                }`}
              >
                {STAGE_LABEL[s]}
                <span
                  className={`rounded-full px-1.5 text-[11px] font-semibold tabular-nums ${
                    isActive ? 'bg-white/20 text-white' : 'bg-[#E6E1D4] text-[#6B6B6B]'
                  }`}
                >
                  {counts[s].toLocaleString('en-AU')}
                </span>
              </button>
            );
          })}
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A0A0A0]" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search job no., description, customer…"
            className="w-72 max-w-full rounded-full border border-[#E6E1D4] bg-white py-2 pl-9 pr-3 text-sm text-[#1A1A1A] placeholder:text-[#A0A0A0] focus:border-[#D8D2C4] focus:outline-none"
          />
        </div>
      </div>

      {/* ── Browse table ──────────────────────────────────────────────────── */}
      <div className={`overflow-hidden ${cardShell}`}>
        <div ref={tableWrapRef} className="overflow-x-auto">
          <table className="min-w-full text-[13px]">
            <thead className="border-b border-[#E6E1D4] bg-[#FAF8F2]">
              <tr>
                {['Type', 'Job', 'Description', 'Customer', 'Site', 'Suburb', 'Phone', 'Due', 'Stage'].map((h) => (
                  <th
                    key={h}
                    className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]"
                  >
                    {h}
                  </th>
                ))}
                <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EFEBE0]">
              {loading ? (
                <tr>
                  <td colSpan={COLUMN_COUNT} className="px-3 py-10 text-center text-sm text-[#A0A0A0]">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                  </td>
                </tr>
              ) : jobs.length === 0 ? (
                <tr>
                  <td colSpan={COLUMN_COUNT} className="px-3 py-12 text-center text-sm text-[#A0A0A0]">
                    {search.trim()
                      ? 'No jobs match your search in this stage.'
                      : `No ${STAGE_LABEL[activeStage].toLowerCase()} jobs staged.`}
                  </td>
                </tr>
              ) : (
                jobs.map((j) => {
                  const cat = inferCategory(j.description);
                  const expanded = expandedId === j.id;
                  return (
                    <Fragment key={j.id}>
                      <tr className={expanded ? 'bg-[#FAF8F2]' : 'hover:bg-[#FAF8F2]'}>
                        <td className="px-3 py-2.5">
                          <StatusPill tone={CATEGORY_TONE[cat]}>{CATEGORY_LABEL[cat]}</StatusPill>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-[11.5px] text-[#6B6B6B]">
                          #{j.externalRef}
                          {j.promotedAt && (
                            <span className="ml-1.5 inline-flex items-center" title="Imported into SiteProof">
                              <CheckCircle2 className="h-3.5 w-3.5 text-[#2F8F5C]" />
                            </span>
                          )}
                        </td>
                        <td className="max-w-[240px] truncate px-3 py-2.5 font-medium text-[#1A1A1A]" title={j.description ?? ''}>
                          {j.description ?? '—'}
                        </td>
                        <td className="px-3 py-2.5 text-[#3A3A3A]">{j.customerName ?? '—'}</td>
                        <td className="max-w-[180px] truncate px-3 py-2.5 text-[#6B6B6B]" title={j.siteName ?? ''}>
                          {j.siteName ?? '—'}
                        </td>
                        <td className="px-3 py-2.5 text-[#6B6B6B]">{j.suburb ?? '—'}</td>
                        <td className="px-3 py-2.5 text-[#6B6B6B]">{j.telephone ?? '—'}</td>
                        <td className="px-3 py-2.5 font-mono text-[12px] text-[#6B6B6B]">{j.dueDate ?? '—'}</td>
                        <td className="px-3 py-2.5">
                          <StatusPill tone={STAGE_TONE[j.stage]} className="whitespace-nowrap">{STAGE_LABEL[j.stage]}</StatusPill>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => setExpandedId((id) => (id === j.id ? null : j.id))}
                            aria-expanded={expanded}
                            className="inline-flex items-center gap-1 rounded-full border border-[#E6E1D4] bg-white px-2.5 py-1 text-[12px] font-semibold text-[#3A3A3A] transition-colors hover:bg-[#FAF8F2]"
                          >
                            <CalendarRange className="h-3.5 w-3.5" />
                            {expanded ? 'Hide' : 'View'}
                          </button>
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="bg-[#FAF8F2]">
                          <td colSpan={COLUMN_COUNT} className="border-t-2 border-[#D69A2E] p-0">
                            <JobScheduleExpander
                              job={j}
                              profiles={profiles}
                              assignedIds={crew.get(j.id) ?? []}
                              scheduleOverride={scheduleOverride.get(j.id) ?? null}
                              canManage={canManage}
                              onToggleCrew={(userId) => void toggleCrew(j.id, userId)}
                              onSchedule={(s, e) => void applySchedule(j.id, s, e)}
                              onClear={() => void clearSchedule(j.id)}
                              onSync={syncSchedule}
                              viewportW={viewportW}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {importOpen && (
        <ImportModal
          onClose={() => setImportOpen(false)}
          onImported={async (msg) => {
            setImportOpen(false);
            setToast({ message: msg, type: 'success' });
            await afterWrite();
          }}
          onError={(msg) => setToast({ message: msg, type: 'error' })}
        />
      )}

      {confirmOpen && (
        <ConfirmModal
          onClose={() => setConfirmOpen(false)}
          onConfirmed={async (msg, type) => {
            setConfirmOpen(false);
            setToast({ message: msg, type });
            await afterWrite();
          }}
        />
      )}

      {createOpen && (
        <CreateJobModal
          onClose={() => setCreateOpen(false)}
          onCreated={async () => {
            setCreateOpen(false);
            setToast({ message: 'Job created', type: 'success' });
            await afterWrite();
          }}
          onError={(msg) => setToast({ message: msg, type: 'error' })}
        />
      )}

      {toast && <Toaster message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

// ─── Modal shell ───────────────────────────────────────────────────────────

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div
        className={`w-full max-w-2xl ${cardShell} max-h-[85vh] overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#E6E1D4] px-5 py-4">
          <h2 className="text-[15px] font-semibold text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full text-[#6B6B6B] hover:bg-[#F0EDE4] hover:text-[#1A1A1A]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 py-5">{children}</div>
      </div>
    </div>
  );
}

// ─── Import modal — file → parse → plan → persist ────────────────────────────

function ImportModal({
  onClose,
  onImported,
  onError,
}: {
  onClose: () => void;
  onImported: (msg: string) => void | Promise<void>;
  onError: (msg: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [validRows, setValidRows] = useState<SimproJobRow[]>([]);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [fileCount, setFileCount] = useState(0);

  // Accepts one or many CSVs: each file is parsed independently, then the rows
  // are combined and planned together. planSimproImport dedupes by external_ref
  // across the whole set (first occurrence wins), so the same job appearing in
  // two exports imports once. Per-file errors are prefixed with the file name.
  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setBusy(true);
    setFileCount(files.length);
    try {
      const allRows: SimproJobRow[] = [];
      const allErrors: string[] = [];
      for (const file of files) {
        const text = await file.text();
        const { rows, errors } = parseSimproCsv(text);
        const prefix = files.length > 1 ? file.name + ': ' : '';
        allRows.push(...rows);
        allErrors.push(...errors.map((er) => prefix + er));
      }
      setParseErrors(allErrors);
      setValidRows(allRows);
      setPlan(allRows.length > 0 ? planSimproImport(await listStagedRefs(), allRows) : null);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to read files — please try again');
    } finally {
      setBusy(false);
    }
  }

  async function handlePersist() {
    if (!plan) return;
    setBusy(true);
    try {
      const res = await importStagedJobs(plan);
      const msg =
        `Loaded ${res.added} new · ${res.updated} updated` +
        (res.failed.count > 0 ? ` · ${res.failed.count} failed` : '');
      await onImported(msg);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setBusy(false);
    }
  }

  const planEmpty = plan !== null && plan.adds.length === 0 && plan.updates.length === 0;

  return (
    <ModalShell title="Upload Simpro CSV" onClose={onClose}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className={btnGhost + ' cursor-pointer'}>
            <Upload className="h-4 w-4" />
            Choose CSV file(s)
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              multiple
              className="sr-only"
              onChange={handleFiles}
            />
          </label>
          {fileCount > 1 && (
            <span className="text-xs text-[#6B6B6B]">{fileCount} files combined into one import.</span>
          )}
        </div>

        {parseErrors.length > 0 && (
          <div className="rounded-[10px] border border-[#F0BFBF] bg-[#FBE5E5] px-4 py-3">
            <p className="mb-1.5 text-xs font-semibold text-[#C44545]">
              {parseErrors.length} issue{parseErrors.length === 1 ? '' : 's'} — fix and re-upload:
            </p>
            <ul className="space-y-0.5">
              {parseErrors.slice(0, 12).map((e, i) => (
                <li key={i} className="text-xs text-[#C44545]">{e}</li>
              ))}
              {parseErrors.length > 12 && (
                <li className="text-xs text-[#C44545]">…and {parseErrors.length - 12} more</li>
              )}
            </ul>
          </div>
        )}

        {busy && !plan && (
          <p className="flex items-center gap-2 text-sm text-[#6B6B6B]">
            <Loader2 className="h-4 w-4 animate-spin" /> Reading file…
          </p>
        )}

        {plan && (
          <>
            <div className="flex flex-wrap gap-6">
              <PlanChip count={plan.adds.length} label="to add" tone="sage" />
              <PlanChip count={plan.updates.length} label="to update" tone="amber" />
              <PlanChip count={plan.skips.length} label="skipped" tone="slate" />
            </div>
            {validRows.length > 0 && (
              <div className="overflow-x-auto rounded-[10px] border border-[#E6E1D4]">
                <table className="min-w-full text-xs">
                  <thead className="border-b border-[#E6E1D4] bg-[#FAF8F2]">
                    <tr>
                      {['Job', 'Description', 'Customer', 'Phone', 'Stage'].map((h) => (
                        <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EFEBE0]">
                    {validRows.slice(0, 15).map((r, i) => (
                      <tr key={i}>
                        <td className="px-3 py-1.5 font-mono text-[#6B6B6B]">#{r.externalRef}</td>
                        <td className="max-w-[200px] truncate px-3 py-1.5 text-[#1A1A1A]">{r.description ?? '—'}</td>
                        <td className="px-3 py-1.5 text-[#6B6B6B]">{r.customerName ?? '—'}</td>
                        <td className="px-3 py-1.5 text-[#6B6B6B]">{r.telephone ?? '—'}</td>
                        <td className="px-3 py-1.5"><StatusPill tone={STAGE_TONE[r.stage]}>{STAGE_LABEL[r.stage]}</StatusPill></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {validRows.length > 15 && (
                  <p className="px-3 py-2 text-xs text-[#A0A0A0]">…and {validRows.length - 15} more rows</p>
                )}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className={btnGhost} disabled={busy}>
                Cancel
              </button>
              <button type="button" onClick={() => void handlePersist()} disabled={busy || planEmpty} className={btnPrimary}>
                {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Load {plan.adds.length + plan.updates.length} job{plan.adds.length + plan.updates.length === 1 ? '' : 's'}
              </button>
            </div>
          </>
        )}
      </div>
    </ModalShell>
  );
}

function PlanChip({ count, label, tone }: { count: number; label: string; tone: ToneKey }) {
  const t = TONE[tone];
  return (
    <div className="flex items-center gap-2">
      <span
        className="flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-[13px] font-semibold tabular-nums"
        style={{ backgroundColor: t.bg, color: t.fg }}
      >
        {count}
      </span>
      <span className="text-sm text-[#3A3A3A]">{label}</span>
    </div>
  );
}

// ─── Confirm-import modal — promote staged → live tables ─────────────────────

function ConfirmModal({
  onClose,
  onConfirmed,
}: {
  onClose: () => void;
  onConfirmed: (msg: string, type: 'success' | 'info') => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const res = await confirmImport();
      const moved = res.projects + res.services;
      if (moved === 0 && res.failed.count === 0) {
        await onConfirmed('Nothing new to import — all staged jobs are already in SiteProof.', 'info');
      } else {
        const msg =
          `Imported ${res.services} service job${res.services === 1 ? '' : 's'} · ${res.projects} project${res.projects === 1 ? '' : 's'}` +
          (res.failed.count > 0 ? ` · ${res.failed.count} failed` : '');
        await onConfirmed(msg, res.failed.count > 0 ? 'info' : 'success');
      }
    } catch (err) {
      await onConfirmed(err instanceof Error ? err.message : 'Confirm failed', 'info');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell title="Confirm import into SiteProof" onClose={onClose}>
      <div className="space-y-5">
        <p className="text-sm leading-relaxed text-[#3A3A3A]">
          This promotes every staged Simpro job into SiteProof — projects and service jobs —
          carrying the contract value and Simpro job number. Already-imported jobs are skipped,
          so it's safe to run again after loading a new export.
        </p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={btnGhost} disabled={busy}>
            Cancel
          </button>
          <button type="button" onClick={() => void run()} disabled={busy} className={btnPrimary}>
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            <CheckCircle2 className="h-4 w-4" />
            Confirm import
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

// ─── Create-job modal — manually add one job to the staging list ─────────────
// Inserts straight into simpro_jobs (via createSimproJob), so the new job shows
// up in the browse table and is schedulable via View exactly like an imported
// one. external_ref ("Job no.") must be unique — a clash throws and we surface
// it without closing the modal.

const CREATE_CATEGORIES = Object.keys(CATEGORY_LABEL) as SimproCategory[];

function CreateJobModal({
  onClose,
  onCreated,
  onError,
}: {
  onClose: () => void;
  onCreated: () => void | Promise<void>;
  onError: (msg: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [externalRef, setExternalRef] = useState('');
  const [description, setDescription] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [siteName, setSiteName] = useState('');
  const [siteAddress, setSiteAddress] = useState('');
  const [suburb, setSuburb] = useState('');
  const [telephone, setTelephone] = useState('');
  const [category, setCategory] = useState<SimproCategory>('other');
  const [stage, setStage] = useState<SimproStage>('in_progress');
  const [dueDate, setDueDate] = useState('');

  const refTrimmed = externalRef.trim();
  const canSubmit = refTrimmed !== '' && !busy;

  // Drop empty optional strings to null so they store/display as "—".
  const clean = (v: string): string | null => {
    const t = v.trim();
    return t === '' ? null : t;
  };

  async function handleCreate() {
    if (!canSubmit) return;
    setBusy(true);
    try {
      const input: CreateSimproJobInput = {
        externalRef: refTrimmed,
        description: clean(description),
        customerName: clean(customerName),
        telephone: clean(telephone),
        siteName: clean(siteName),
        siteAddress: clean(siteAddress),
        suburb: clean(suburb),
        category,
        stage,
        dueDate: clean(dueDate), // native date input is already 'YYYY-MM-DD'
      };
      await createSimproJob(input);
      await onCreated();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to create job');
    } finally {
      setBusy(false);
    }
  }

  const fieldCls =
    'w-full rounded-[10px] border border-[#E6E1D4] bg-white px-3 py-2 text-sm text-[#1A1A1A] placeholder:text-[#A0A0A0] focus:border-[#D8D2C4] focus:outline-none';
  const labelCls = 'mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6B6B6B]';

  return (
    <ModalShell title="New job" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void handleCreate();
        }}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>
              Job no. <span className="text-[#C44545]">*</span>
            </label>
            <input
              type="text"
              value={externalRef}
              onChange={(e) => setExternalRef(e.target.value)}
              placeholder="e.g. 10482"
              autoFocus
              required
              className={fieldCls}
            />
          </div>
          <div>
            <label className={labelCls}>Customer</label>
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Customer name"
              className={fieldCls}
            />
          </div>
        </div>

        <div>
          <label className={labelCls}>Description</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What's the job?"
            className={fieldCls}
          />
        </div>

        <div>
          <label className={labelCls}>Site</label>
          <input
            type="text"
            value={siteName}
            onChange={(e) => setSiteName(e.target.value)}
            placeholder="Site name"
            className={fieldCls}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Site address</label>
            <input
              type="text"
              value={siteAddress}
              onChange={(e) => setSiteAddress(e.target.value)}
              placeholder="Street address"
              className={fieldCls}
            />
          </div>
          <div>
            <label className={labelCls}>Suburb</label>
            <input
              type="text"
              value={suburb}
              onChange={(e) => setSuburb(e.target.value)}
              placeholder="Suburb"
              className={fieldCls}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Phone</label>
            <input
              type="text"
              value={telephone}
              onChange={(e) => setTelephone(e.target.value)}
              placeholder="Contact phone"
              className={fieldCls}
            />
          </div>
          <div>
            <label className={labelCls}>Due date</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className={fieldCls}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Type</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as SimproCategory)}
              className={fieldCls}
            >
              {CREATE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Stage</label>
            <select
              value={stage}
              onChange={(e) => setStage(e.target.value as SimproStage)}
              className={fieldCls}
            >
              {SIMPRO_STAGES.map((s) => (
                <option key={s} value={s}>
                  {STAGE_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-[#EFEBE0] pt-4">
          <button type="button" onClick={onClose} className={btnGhost} disabled={busy}>
            Cancel
          </button>
          <button type="submit" disabled={!canSubmit} className={btnPrimary}>
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            <Plus className="h-4 w-4" />
            Create job
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

// ─── Crew avatar ─────────────────────────────────────────────────────────────
// 28px circle, deterministic tint, initials (or avatar img). Assigned = full
// opacity + sage ring; unassigned = dimmed. Clickable only when canManage.

function CrewAvatar({
  profile,
  assigned,
  canManage,
  onToggle,
}: {
  profile: Profile;
  assigned: boolean;
  canManage: boolean;
  onToggle: () => void;
}) {
  const initials =
    `${profile.firstName?.[0] ?? ''}${profile.lastName?.[0] ?? ''}`.toUpperCase() || '?';
  const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(' ') || profile.email;
  return (
    <button
      type="button"
      onClick={canManage ? onToggle : undefined}
      disabled={!canManage}
      title={`${fullName}${assigned ? ' · assigned' : ''}${canManage ? ' — click to toggle' : ''}`}
      aria-pressed={assigned}
      className={`relative flex h-7 w-7 flex-shrink-0 items-center justify-center overflow-hidden rounded-full text-[10px] font-semibold text-[#3A3A3A] transition-opacity ${
        assigned ? 'opacity-100 ring-2 ring-[#2F8F5C]' : 'opacity-40'
      } ${canManage ? 'cursor-pointer hover:opacity-100' : 'cursor-default'}`}
      style={{ backgroundColor: avatarTint(profile.id) }}
    >
      {profile.avatarUrl ? (
        <img src={profile.avatarUrl} alt={fullName} className="h-full w-full object-cover" />
      ) : (
        initials
      )}
    </button>
  );
}

// ─── Mini stacked avatars ────────────────────────────────────────────────────
// The overlapping crew faces shown inside a schedule bar (up to `max`).

function MiniAvatars({ profiles, max = 3 }: { profiles: Profile[]; max?: number }) {
  if (profiles.length === 0) return null;
  return (
    <span className="ml-auto flex flex-shrink-0 items-center -space-x-1.5 pl-1">
      {profiles.slice(0, max).map((p) => (
        <span
          key={p.id}
          className="flex h-4 w-4 items-center justify-center overflow-hidden rounded-full text-[7px] font-semibold text-[#3A3A3A] ring-1 ring-white"
          style={{ backgroundColor: avatarTint(p.id) }}
          title={[p.firstName, p.lastName].filter(Boolean).join(' ') || p.email}
        >
          {p.avatarUrl ? (
            <img src={p.avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            `${p.firstName?.[0] ?? ''}${p.lastName?.[0] ?? ''}`.toUpperCase()
          )}
        </span>
      ))}
    </span>
  );
}

// ─── Inline schedule expander ────────────────────────────────────────────────
// The per-row inline timeline for a SINGLE job, dropped beneath its table row.
// Top-to-bottom: crew chips → status line + Today/Zoom/Sync controls → a one-row
// scrollable Gantt with a sticky job-label cell, week/day headers, and a single
// draggable/resizable bar that auto-saves on drop. Drag math is pixel-based
// (colW = pxPerDay) and clamped to the continuous Monday-aligned day window.

const SIDEBAR_W = 200; // px — the sticky left label column width
const TRACK_H = 72; // px — the schedule track row height

type DragMode = 'move' | 'resize-start' | 'resize-end';
interface DragState {
  mode: DragMode;
  startX: number;
  origStart: number;
  origEnd: number;
  span: { startIdx: number; endIdx: number };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function JobScheduleExpander({
  job,
  profiles,
  assignedIds,
  scheduleOverride,
  canManage,
  onToggleCrew,
  onSchedule,
  onClear,
  onSync,
  viewportW,
}: {
  job: StagedJob;
  profiles: Profile[];
  assignedIds: string[];
  scheduleOverride: { start: string | null; end: string | null } | null;
  canManage: boolean;
  onToggleCrew: (userId: string) => void;
  onSchedule: (startIso: string, endIso: string) => void;
  onClear: () => void;
  onSync: () => Promise<void>;
  viewportW: number;
}) {
  const [pxPerDay, setPxPerDay] = useState(40); // clamp 16…80
  const [syncing, setSyncing] = useState(false);
  const [drag, setDrag] = useState<DragState | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const colW = pxPerDay;
  const todayKey = toISODate(new Date());

  // Effective schedule = optimistic override (if any) ?? persisted row.
  const range = scheduleOverride ?? { start: job.scheduledStart, end: job.scheduledEnd };

  // 15-week continuous day run, centred on the job's start (or today if unscheduled).
  const centerIso = (range.start ?? toISODate(new Date())).slice(0, 10);
  const days = useMemo(() => timelineWindow(centerIso, 2, 12), [centerIso]);
  const last = days.length - 1;
  const dayKeys = useMemo(() => days.map(toISODate), [days]);
  const todayIdx = dayKeys.indexOf(todayKey);
  const chartWidth = days.length * colW;

  const assignedProfiles = profiles.filter((p) => assignedIds.includes(p.id));

  const persisted = range.start && range.end ? barSpan(range.start, range.end, days) : null;
  const liveDrag = drag ? drag.span : null;
  const span = liveDrag ?? persisted;

  // Scroll so a given day column is in view (Today button + initial focus).
  const scrollToIdx = useCallback(
    (idx: number) => {
      if (!scrollRef.current || idx < 0) return;
      scrollRef.current.scrollLeft = Math.max(0, idx * colW - 120);
    },
    [colW],
  );

  // On expand: scroll to the job's scheduledStart (or today) column.
  useLayoutEffect(() => {
    const focusIdx = range.start ? dayKeys.indexOf(range.start.slice(0, 10)) : todayIdx;
    scrollToIdx(focusIdx >= 0 ? focusIdx : Math.max(0, todayIdx));
    // run once on open — colW changes use the Today/Zoom controls instead
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function beginDrag(mode: DragMode, e: React.PointerEvent) {
    if (!canManage || !persisted) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({
      mode,
      startX: e.clientX,
      origStart: persisted.startIdx,
      origEnd: persisted.endIdx,
      span: { startIdx: persisted.startIdx, endIdx: persisted.endIdx },
    });
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag) return;
    const delta = Math.round((e.clientX - drag.startX) / colW);
    let ns = drag.origStart;
    let ne = drag.origEnd;
    if (drag.mode === 'move') {
      const len = drag.origEnd - drag.origStart;
      ns = clamp(drag.origStart + delta, 0, last - len);
      ne = ns + len;
    } else if (drag.mode === 'resize-start') {
      ns = clamp(drag.origStart + delta, 0, drag.origEnd);
      ne = drag.origEnd;
    } else {
      ne = clamp(drag.origEnd + delta, drag.origStart, last);
      ns = drag.origStart;
    }
    setDrag({ ...drag, span: { startIdx: ns, endIdx: ne } });
  }

  function endDrag(e: React.PointerEvent) {
    if (!drag) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* capture may already be released */
    }
    const { span: s, origStart, origEnd } = drag;
    setDrag(null);
    if (s.startIdx !== origStart || s.endIdx !== origEnd) {
      onSchedule(toISODate(days[s.startIdx]), toISODate(days[s.endIdx]));
    }
  }

  async function handleSync() {
    setSyncing(true);
    try {
      await onSync();
    } finally {
      setSyncing(false);
    }
  }

  // "Booked · Mon 15 Jun – Wed 17 Jun · 3d" — inclusive day count.
  const fmtDay = (iso: string) => {
    const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-AU', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  };
  const dayCount =
    range.start && range.end
      ? Math.round(
          (new Date(range.end.slice(0, 10)).getTime() - new Date(range.start.slice(0, 10)).getTime()) /
            86_400_000,
        ) + 1
      : 0;

  return (
    <div className="px-4 py-3">
      {/* ── Crew on this job ────────────────────────────────────────────────── */}
      <div className="mb-2">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#6B6B6B]">
          Crew on this job
        </div>
        {profiles.length === 0 ? (
          <p className="text-[11.5px] text-[#A0A0A0]">No active staff to assign.</p>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5">
            {profiles.map((p) => (
              <CrewAvatar
                key={p.id}
                profile={p}
                assigned={assignedIds.includes(p.id)}
                canManage={canManage}
                onToggle={() => onToggleCrew(p.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Status line + controls ──────────────────────────────────────────── */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
          {range.start && range.end ? (
            <>
              <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ background: TONE.amber.dot }} aria-hidden />
              <span className="font-medium text-[#1A1A1A]">
                Booked · {fmtDay(range.start)} – {fmtDay(range.end)} · {dayCount}d
              </span>
              {canManage && (
                <button
                  type="button"
                  onClick={onClear}
                  className="inline-flex items-center gap-1 rounded-full border border-[#E6E1D4] bg-white px-2 py-0.5 text-[11.5px] font-semibold text-[#C44545] transition-colors hover:bg-[#FBE5E5]"
                >
                  <X className="h-3 w-3" />
                  Clear
                </button>
              )}
              <span className="text-[11.5px] text-[#A0A0A0]">
                Drag the bar to move · drag either edge to change the dates.
              </span>
            </>
          ) : (
            <span className="text-[#A0A0A0]">
              Not scheduled — click a day or drag onto the timeline.
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => scrollToIdx(todayIdx)} className={btnGhost}>
            <CalendarRange className="h-4 w-4" />
            Today
          </button>
          <div className="inline-flex items-center gap-1 rounded-full border border-[#E6E1D4] bg-white px-1 py-0.5">
            <button
              type="button"
              aria-label="Zoom out"
              onClick={() => setPxPerDay((v) => clamp(v - 8, 16, 80))}
              disabled={pxPerDay <= 16}
              className="flex h-7 w-7 items-center justify-center rounded-full text-[#6B6B6B] transition-colors hover:bg-[#F0EDE4] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <span className="min-w-[42px] text-center text-[11.5px] font-semibold tabular-nums text-[#3A3A3A]">
              {pxPerDay}px
            </span>
            <button
              type="button"
              aria-label="Zoom in"
              onClick={() => setPxPerDay((v) => clamp(v + 8, 16, 80))}
              disabled={pxPerDay >= 80}
              className="flex h-7 w-7 items-center justify-center rounded-full text-[#6B6B6B] transition-colors hover:bg-[#F0EDE4] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ZoomIn className="h-4 w-4" />
            </button>
          </div>
          <button type="button" onClick={() => void handleSync()} disabled={syncing} className={btnGhost}>
            {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Sync
          </button>
        </div>
      </div>

      {/* ── Timeline ────────────────────────────────────────────────────────── */}
      <div
        className={`overflow-hidden ${cardShell}`}
        style={{ width: viewportW > 0 ? viewportW - 32 : undefined, maxWidth: '100%' }}
      >
        <div ref={scrollRef} className="overflow-x-auto">
          <div style={{ width: SIDEBAR_W + chartWidth }}>
            {/* Header: week-group row */}
            <div className="flex border-b border-[#EFEBE0] bg-[#FAF8F2]">
              <div
                className="sticky left-0 z-10 flex-shrink-0 border-r border-[#E6E1D4] bg-[#FAF8F2]"
                style={{ width: SIDEBAR_W }}
              />
              <div className="relative flex" style={{ width: chartWidth }}>
                {days.map((d, i) =>
                  d.getDay() === 1 ? (
                    <div
                      key={dayKeys[i]}
                      className="flex-shrink-0 border-l border-[#E6E1D4] px-2 py-1 text-[10.5px] font-semibold text-[#3A3A3A]"
                      style={{ width: 7 * colW }}
                    >
                      {d.toLocaleDateString('en-AU', { month: 'short', day: 'numeric' })}
                    </div>
                  ) : null,
                )}
              </div>
            </div>

            {/* Header: day-cell row */}
            <div className="flex border-b border-[#E6E1D4] bg-white">
              <div
                className="sticky left-0 z-10 flex flex-shrink-0 items-center border-r border-[#E6E1D4] bg-white px-3 text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]"
                style={{ width: SIDEBAR_W }}
              >
                Job
              </div>
              <div className="flex" style={{ width: chartWidth }}>
                {days.map((d, i) => {
                  const dow = d.getDay();
                  const weekend = dow === 0 || dow === 6;
                  const isToday = dayKeys[i] === todayKey;
                  return (
                    <div
                      key={dayKeys[i]}
                      className={`relative flex-shrink-0 py-1 text-center text-[9.5px] leading-tight ${
                        weekend ? 'bg-[#FAF8F2]' : ''
                      }`}
                      style={{
                        width: colW,
                        ...(isToday ? { background: TONE.amber.bg } : {}),
                      }}
                    >
                      {isToday && (
                        <span className="absolute inset-y-0 left-0 w-[2px] bg-[#D69A2E]" aria-hidden />
                      )}
                      <div className={`font-semibold uppercase ${weekend ? 'text-[#A0A0A0]' : 'text-[#6B6B6B]'}`}>
                        {d.toLocaleDateString('en-AU', { weekday: 'narrow' })}
                      </div>
                      <div className={`tabular-nums ${weekend ? 'text-[#A0A0A0]' : 'text-[#1A1A1A]'}`}>
                        {d.getDate()}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Body: the single job's track */}
            <div className="flex bg-white" style={{ height: TRACK_H }}>
              {/* sticky left label cell */}
              <div
                className="sticky left-0 z-10 flex flex-shrink-0 flex-col justify-center gap-0.5 border-r border-[#E6E1D4] bg-white px-3 py-1.5"
                style={{ width: SIDEBAR_W }}
              >
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[10.5px] text-[#A0A0A0]">#{job.externalRef}</span>
                </div>
                <span className="truncate text-[12px] font-medium text-[#1A1A1A]" title={job.description ?? ''}>
                  {job.description ?? 'Job'}
                </span>
                <span className="truncate text-[10.5px] text-[#6B6B6B]">{job.customerName ?? '—'}</span>
              </div>

              {/* track */}
              <div className="relative flex-shrink-0 select-none" style={{ width: chartWidth, height: TRACK_H }}>
                {/* gridlines + clickable empty day cells (place when unscheduled) */}
                {days.map((d, i) => {
                  const dow = d.getDay();
                  const weekend = dow === 0 || dow === 6;
                  const isToday = dayKeys[i] === todayKey;
                  const weekStart = dow === 1;
                  return (
                    <div
                      key={dayKeys[i]}
                      onClick={
                        canManage && !span ? () => onSchedule(dayKeys[i], dayKeys[i]) : undefined
                      }
                      className={`absolute top-0 bottom-0 ${
                        weekStart ? 'border-l border-[#E6E1D4]' : ''
                      } ${weekend ? 'bg-[#FAF8F2]' : ''} ${
                        canManage && !span ? 'cursor-pointer hover:bg-[#F4F1E9]' : ''
                      }`}
                      style={{ left: i * colW, width: colW }}
                      aria-hidden={!(canManage && !span)}
                    >
                      {isToday && (
                        <span className="absolute inset-y-0 left-0 w-[2px] bg-[#D69A2E]/70" aria-hidden />
                      )}
                    </div>
                  );
                })}

                {/* the schedule bar */}
                {span && (
                  <div
                    onPointerDown={(e) => beginDrag('move', e)}
                    onPointerMove={onPointerMove}
                    onPointerUp={endDrag}
                    className={`absolute top-1/2 flex -translate-y-1/2 items-center gap-1.5 overflow-hidden border border-[#E6E1D4] border-l-[3px] border-l-[#2F8F5C] bg-white px-1.5 py-1 shadow-[0_1px_3px_rgba(20,20,20,0.10)] ${
                      canManage ? 'cursor-grab active:cursor-grabbing' : ''
                    } ${persisted?.clampedLeft ? 'rounded-l-none' : 'rounded-l-[8px]'} ${
                      persisted?.clampedRight ? 'rounded-r-none' : 'rounded-r-[8px]'
                    }`}
                    style={{
                      left: span.startIdx * colW,
                      width: (span.endIdx - span.startIdx + 1) * colW,
                      height: 44,
                    }}
                    title="Drag to move · drag the edges to resize"
                  >
                    {/* left resize handle */}
                    {canManage && (
                      <div
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          beginDrag('resize-start', e);
                        }}
                        onPointerMove={onPointerMove}
                        onPointerUp={endDrag}
                        className="absolute inset-y-0 left-0 w-[6px] cursor-ew-resize"
                        aria-hidden
                      />
                    )}
                    <GripVertical className="h-3 w-3 flex-shrink-0 text-[#A0A0A0]" />
                    <span className="flex-shrink-0 font-mono text-[10px] font-semibold text-[#246F47]">
                      #{job.externalRef}
                    </span>
                    <span className="truncate text-[11px] font-medium text-[#1A1A1A]">
                      {job.description ?? 'Job'}
                    </span>
                    <MiniAvatars profiles={assignedProfiles} max={3} />
                    {/* right resize handle */}
                    {canManage && (
                      <div
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          beginDrag('resize-end', e);
                        }}
                        onPointerMove={onPointerMove}
                        onPointerUp={endDrag}
                        className="absolute inset-y-0 right-0 w-[6px] cursor-ew-resize"
                        aria-hidden
                      />
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

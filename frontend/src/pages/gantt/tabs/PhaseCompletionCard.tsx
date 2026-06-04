// PhaseCompletionBoard — Review-tab overview of completion status across ALL
// construction phases. Reads every project_phase_status row in one query on
// mount, then renders a compact 8-phase ledger: each phase shows its verdict
// status at a glance (Ready for next / Complete / Reviewed / N blockers / Not
// checked), with a thin phase-coloured "spine" summarising the whole project.
// Click a phase to expand the full AI verdict + blockers and Mark complete /
// Re-check that phase.
//
// Replaces the old single-phase card, which defaulted to whichever phase was
// selected or most-represented in the queue and so always read as "biased"
// toward one phase (usually Excavation). This answers "where does EVERY phase
// stand?" without picking a winner.
//
// Warm "site register" tokens. Honors prefers-reduced-motion via the app-root
// MotionConfig.

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, type Transition } from 'framer-motion';
import { AlertTriangle, CheckCircle2, ChevronRight, ClipboardCheck, RefreshCw, Sparkles } from 'lucide-react';
import { listPhaseStatuses, completePhase, completeCustomPhase, type PhaseStatusRow, type PhaseVerdictResult } from '../../../lib/api/phaseStatus';
import type { ScanHistoryItem } from '../../../lib/api/aiAnalyses';
import type { ConstructionPhase } from '../../../lib/ai/contract';
import { phaseColor } from '../../../lib/construction/phaseColors';
import { StatusPill, FRAUNCES, cardShell, REG, type ToneKey } from '../components/ledger';

const PHASE_ORDER: ConstructionPhase[] = [
  'excavation', 'foundation', 'framing', 'roofing',
  'electrical', 'plumbing', 'drywall', 'finishing',
];

interface Props {
  projectId: string;
  /** Photo-centric scan history (newest-first) so each phase can surface the
   *  scans + AI results that drive its progress — not just the Scan history tab. */
  scans?: ScanHistoryItem[];
  /** Custom phases (migration 44) created in Tasks, with their rolled-up % —
   *  surfaced here so creating a phase syncs into the AI-Analysis tab too. */
  customPhases?: { id: string; name: string; pct: number }[];
}

interface PhaseState {
  tone: ToneKey;
  label: string;
  /** Has the AI rendered a verdict at all? */
  checked: boolean;
  /** verdict marked the phase complete? */
  done: boolean;
}

function deriveState(row: PhaseStatusRow | null | undefined): PhaseState {
  if (!row || !row.verdict_text) return { tone: 'slate', label: 'Not checked', checked: false, done: false };
  if (row.status === 'complete' && row.ready_for_next) return { tone: 'sage', label: 'Ready for next', checked: true, done: true };
  if (row.status === 'complete') return { tone: 'sage', label: 'Complete', checked: true, done: true };
  if (row.blockers.length > 0) {
    const n = row.blockers.length;
    return { tone: 'amber', label: `${n} blocker${n > 1 ? 's' : ''}`, checked: true, done: false };
  }
  return { tone: 'slate', label: 'Reviewed', checked: true, done: false };
}

/** Live scan stage → tone + label, mirroring the AI-Analysis scan badges so a
 *  photo shows its Scan Status (Awaiting AI / Analyzing…) before its result. */
function scanStage(s: ScanHistoryItem): { tone: ToneKey; label: string } {
  const st = s.analysisStatus;
  if (st === null) return { tone: 'slate', label: 'Awaiting AI' };
  if (st === 'queued' || st === 'analysing') return { tone: 'amber', label: 'Analyzing…' };
  if (st === 'failed') return { tone: 'red', label: 'Failed' };
  switch (s.actionTaken) {
    case 'auto_updated': return { tone: 'sage', label: 'Auto-applied' };
    case 'confirmed':    return { tone: 'sage', label: 'Confirmed' };
    case 'skipped':      return { tone: 'slate', label: 'Skipped' };
    default:             return st === 'rejected' ? { tone: 'slate', label: 'Rejected' } : { tone: 'amber', label: 'Pending review' };
  }
}

/** Phase "overall" = the most recent analysed scan's completion reading for that
 *  phase (the list is newest-first → first non-null). null until a scan returns,
 *  so it reads 0% until an AI result lands, then climbs. */
function overallPctOf(items: ScanHistoryItem[] | undefined): number | null {
  if (!items) return null;
  for (const s of items) if (s.completionPct != null) return s.completionPct;
  return null;
}

const CUSTOM_PHASE_PALETTE = ['#0D9488', '#7C3AED', '#DB2777', '#0891B2', '#9333EA', '#4F46E5'];
function customPhaseColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return CUSTOM_PHASE_PALETTE[h % CUSTOM_PHASE_PALETTE.length];
}

const EXPAND_T: Transition = { duration: 0.22, ease: [0.22, 1, 0.36, 1] };

export function PhaseCompletionBoard({ projectId, scans = [], customPhases = [] }: Props) {
  const [rows, setRows] = useState<Partial<Record<ConstructionPhase, PhaseStatusRow>>>({});
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(true);
  const [expanded, setExpanded] = useState<ConstructionPhase | null>(null);
  const [busy, setBusy] = useState<ConstructionPhase | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    void listPhaseStatuses(projectId)
      .then((list) => {
        if (cancelled) return;
        const map: Partial<Record<ConstructionPhase, PhaseStatusRow>> = {};
        for (const r of list) map[r.phase as ConstructionPhase] = r;
        setRows(map);
        setLoaded(true);
      })
      .catch(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [projectId]);

  const run = async (phase: ConstructionPhase) => {
    setBusy(phase);
    setError(null);
    try {
      const v = await completePhase(projectId, phase);
      setRows((prev) => ({
        ...prev,
        [phase]: {
          project_id: projectId,
          phase,
          status: v.status,
          verdict_text: v.verdict,
          blockers: v.blockers,
          ready_for_next: v.readyForNext,
          model_used: v.modelUsed,
          completed_at: v.status === 'complete' ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        },
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not check phase completion.');
    } finally {
      setBusy(null);
    }
  };

  // Custom-phase verdicts (Tier-3 #13) — evidence is gathered server-side from
  // confirmed analyses on photos tagged to tasks under the custom anchor.
  const [customVerdicts, setCustomVerdicts] = useState<Record<string, PhaseVerdictResult>>({});
  const [customBusy, setCustomBusy] = useState<string | null>(null);
  const [customExpanded, setCustomExpanded] = useState<string | null>(null);

  const runCustom = async (id: string) => {
    setCustomBusy(id);
    setError(null);
    try {
      const v = await completeCustomPhase(projectId, id);
      setCustomVerdicts((prev) => ({ ...prev, [id]: v }));
      setCustomExpanded(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not check phase completion.');
    } finally {
      setCustomBusy(null);
    }
  };

  const doneCount = useMemo(
    () => PHASE_ORDER.filter((p) => rows[p]?.status === 'complete').length,
    [rows],
  );

  // Scans bucketed by detected/tagged phase (newest-first preserved) — drives
  // each phase's overall % + its scan-results list.
  const scansByPhase = useMemo(() => {
    const m: Partial<Record<ConstructionPhase, ScanHistoryItem[]>> = {};
    for (const s of scans) {
      if (!s.phase) continue;
      (m[s.phase] ??= []).push(s);
    }
    return m;
  }, [scans]);

  // Don't flash an empty shell before the first read resolves.
  if (!loaded) return null;

  return (
    <div className={`overflow-hidden ${cardShell}`}>
      {/* ── Header — board summary + collapse ── */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-3.5 text-left transition-colors hover:bg-[#FAF8F2]"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2.5">
          <span className={`grid h-7 w-7 place-items-center rounded-[9px] bg-[#F0EDE4] text-[#1A1A1A] transition-transform ${open ? 'rotate-90' : ''}`}>
            <ChevronRight className="h-3.5 w-3.5" />
          </span>
          <span className="inline-flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.16em] text-[#6B6B6B]">
            <ClipboardCheck className="h-3.5 w-3.5" /> Phase completion scan
          </span>
        </span>
        <span className="text-[11px] font-semibold text-[#6B6B6B]">
          <span className="tabular-nums text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>{doneCount}</span>
          {' '}of {PHASE_ORDER.length} signed off
        </span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={EXPAND_T}
            className="overflow-hidden"
          >
            {/* ── Spine — every phase at a glance ── */}
            <div className="flex gap-1 px-5 pb-3.5" role="img" aria-label={`${doneCount} of ${PHASE_ORDER.length} phases signed off`}>
              {PHASE_ORDER.map((p) => {
                const st = deriveState(rows[p]);
                const pc = phaseColor(p);
                const bg = st.done ? pc.color : st.checked ? pc.tint : REG.divider;
                return (
                  <span
                    key={p}
                    className="h-1.5 flex-1 rounded-full"
                    style={{ background: bg }}
                    title={`${pc.label} · ${st.label}`}
                  />
                );
              })}
            </div>

            {error && (
              <p className="mx-5 mb-2 rounded-[8px] border border-[#F3CFCF] bg-[#FBE5E5] px-3 py-2 text-[12px] text-[#C44545]">
                {error}
              </p>
            )}

            {/* ── Per-phase rows ── */}
            <div className="border-t border-[#EFEBE0]">
              {PHASE_ORDER.map((phase) => {
                const row = rows[phase] ?? null;
                const st = deriveState(row);
                const pc = phaseColor(phase);
                const isOpen = expanded === phase;
                const isBusy = busy === phase;
                const phaseScans = scansByPhase[phase];
                const overall = overallPctOf(phaseScans);
                return (
                  <div key={phase} className="border-b border-[#EFEBE0] last:border-b-0">
                    <button
                      type="button"
                      onClick={() => setExpanded((cur) => (cur === phase ? null : phase))}
                      className="flex w-full items-center justify-between gap-3 px-5 py-2.5 text-left transition-colors hover:bg-[#FAF8F2]"
                      aria-expanded={isOpen}
                    >
                      <span className="flex items-center gap-2.5">
                        <span aria-hidden className="inline-block h-2 w-2 flex-shrink-0 rounded-full" style={{ background: pc.color }} />
                        <span className="text-[13.5px] font-medium text-[#1A1A1A]">{pc.label}</span>
                      </span>
                      <span className="flex items-center gap-2.5">
                        <span className="tabular-nums text-[12px] font-semibold text-[#1A1A1A]" title="Overall — latest AI completion reading for this phase">
                          {overall ?? 0}<span className="text-[10px] text-[#A0A0A0]">%</span>
                        </span>
                        {st.checked ? (
                          <StatusPill tone={st.tone}>
                            {st.done && <CheckCircle2 className="h-3 w-3" aria-hidden />}
                            {st.label}
                          </StatusPill>
                        ) : (
                          <span className="text-[11.5px] italic text-[#A0A0A0]">Not checked</span>
                        )}
                        <ChevronRight className={`h-3.5 w-3.5 flex-shrink-0 text-[#A0A0A0] transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                      </span>
                    </button>

                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={EXPAND_T}
                          className="overflow-hidden bg-[#FAF8F2]"
                        >
                          <div className="space-y-3.5 px-5 pb-4 pt-2">
                            {/* Overall — latest AI completion reading for this phase */}
                            <div>
                              <div className="flex items-baseline justify-between">
                                <span className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-[#6B6B6B]">{pc.label} overall</span>
                                <span className="tabular-nums text-[15px] font-semibold" style={{ fontFamily: FRAUNCES, color: pc.color }}>{overall ?? 0}%</span>
                              </div>
                              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[#EFEBE0]">
                                <div className="h-full rounded-full transition-[width] duration-700 ease-out" style={{ width: `${overall ?? 0}%`, background: pc.color }} />
                              </div>
                              <p className="mt-1 text-[10.5px] text-[#A0A0A0]">
                                {phaseScans?.length
                                  ? `${phaseScans.length} scan${phaseScans.length === 1 ? '' : 's'} · updates as the AI analyses ${pc.label.toLowerCase()} photos`
                                  : `No ${pc.label.toLowerCase()} scans yet — drop one in the scan bench and the AI result lands here.`}
                              </p>
                            </div>

                            {/* Scan results — each photo's Scan Status, then its AI result */}
                            {phaseScans && phaseScans.length > 0 && (
                              <div>
                                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[#6B6B6B]">Scan results</p>
                                <ul className="space-y-1">
                                  {phaseScans.slice(0, 6).map((s) => {
                                    const stg = scanStage(s);
                                    return (
                                      <li key={s.photoId} className="flex items-center gap-2 rounded-[8px] border border-[#EFEBE0] bg-white px-2.5 py-1.5">
                                        <StatusPill tone={stg.tone} className="flex-shrink-0 px-1.5 py-0 text-[9px]">{stg.label}</StatusPill>
                                        <span className="min-w-0 flex-1 truncate text-[12px] text-[#3A3A3A]" title={s.filename}>{s.filename}</span>
                                        {s.completionPct != null && <span className="flex-shrink-0 tabular-nums text-[11.5px] font-semibold text-[#1A1A1A]">{s.completionPct}%</span>}
                                        {s.confidence != null && <span className="flex-shrink-0 tabular-nums text-[10px] text-[#A0A0A0]">{Math.round(s.confidence * 100)}% conf</span>}
                                      </li>
                                    );
                                  })}
                                </ul>
                                {phaseScans.length > 6 && (
                                  <p className="mt-1 text-[10px] text-[#A0A0A0]">+{phaseScans.length - 6} more in Scan history</p>
                                )}
                              </div>
                            )}

                            {/* AI verdict + sign-off */}
                            {st.checked && row ? (
                              <div className="border-t border-[#EFEBE0] pt-3">
                                <p className="text-[13px] leading-relaxed text-[#3A3A3A]">{row.verdict_text}</p>
                                {row.blockers.length > 0 && (
                                  <div className="mt-3">
                                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#6B6B6B]">Blockers</p>
                                    <ul className="mt-1.5 space-y-1">
                                      {row.blockers.map((b) => (
                                        <li key={b} className="flex items-start gap-1.5 text-[12.5px] text-[#3A3A3A]">
                                          <AlertTriangle className="mt-0.5 h-3 w-3 flex-shrink-0 text-[#D69A2E]" aria-hidden /> {b}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                                <div className="mt-3.5 flex items-center gap-3">
                                  <button
                                    type="button"
                                    onClick={() => run(phase)}
                                    disabled={isBusy}
                                    className="inline-flex items-center gap-1.5 rounded-full border border-[#E6E1D4] bg-white px-3 py-1.5 text-[11.5px] font-semibold text-[#3A3A3A] transition-colors hover:bg-[#FAF8F2] disabled:opacity-60"
                                  >
                                    <RefreshCw className={`h-3 w-3 ${isBusy ? 'animate-spin' : 'text-[#2F8F5C]'}`} />
                                    {isBusy ? 'Re-checking…' : 'Re-check phase'}
                                  </button>
                                  {row.model_used && row.model_used !== 'none' && (
                                    <span className="text-[10.5px] text-[#A0A0A0]">via {row.model_used}</span>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <div className="flex flex-col items-start gap-2.5 border-t border-[#EFEBE0] pt-3">
                                <p className="text-[12.5px] text-[#6B6B6B]">
                                  Ask the AI to weigh the {pc.label.toLowerCase()} photo evidence and call whether this phase is done.
                                </p>
                                <button
                                  type="button"
                                  onClick={() => run(phase)}
                                  disabled={isBusy}
                                  className="inline-flex items-center gap-1.5 rounded-full bg-[#1A1A1A] px-3.5 py-1.5 text-[11.5px] font-semibold text-white transition-colors hover:bg-black disabled:opacity-60"
                                >
                                  {isBusy
                                    ? <RefreshCw className="h-3 w-3 animate-spin" />
                                    : <Sparkles className="h-3 w-3 text-[#FFE082]" />}
                                  {isBusy ? 'Checking…' : 'Mark phase complete'}
                                </button>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}

              {customPhases.length > 0 && (
                <div className="border-b border-[#EFEBE0] bg-[#FAF8F2]/60 px-5 py-1.5 text-[9.5px] font-bold uppercase tracking-[0.16em] text-[#A0A0A0]">
                  Custom phases
                </div>
              )}
              {customPhases.map((cp) => {
                const color = customPhaseColor(cp.id);
                const v = customVerdicts[cp.id];
                const isOpen = customExpanded === cp.id;
                const isBusy = customBusy === cp.id;
                return (
                  <div key={cp.id} className="border-b border-[#EFEBE0] last:border-b-0">
                    <button
                      type="button"
                      onClick={() => setCustomExpanded((cur) => (cur === cp.id ? null : cp.id))}
                      className="flex w-full items-center justify-between gap-3 px-5 py-2.5 text-left transition-colors hover:bg-[#FAF8F2]"
                      aria-expanded={isOpen}
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <span aria-hidden className="inline-block h-2 w-2 flex-shrink-0 rounded-full" style={{ background: color }} />
                        <span className="truncate text-[13.5px] font-medium text-[#1A1A1A]">{cp.name}</span>
                        <StatusPill tone="slate">Custom</StatusPill>
                      </span>
                      <span className="flex flex-shrink-0 items-center gap-2.5">
                        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-[#EFEBE0]">
                          <div className="h-full rounded-full transition-[width] duration-700 ease-out" style={{ width: `${cp.pct}%`, background: color }} />
                        </div>
                        <span className="tabular-nums text-[12px] font-semibold text-[#1A1A1A]">{cp.pct}<span className="text-[10px] text-[#A0A0A0]">%</span></span>
                        <ChevronRight className={`h-3.5 w-3.5 flex-shrink-0 text-[#A0A0A0] transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                      </span>
                    </button>

                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={EXPAND_T}
                          className="overflow-hidden bg-[#FAF8F2]"
                        >
                          <div className="space-y-3 px-5 pb-4 pt-2">
                            {v ? (
                              <div>
                                <p className="text-[13px] leading-relaxed text-[#3A3A3A]">{v.verdict}</p>
                                {v.blockers.length > 0 && (
                                  <div className="mt-3">
                                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#6B6B6B]">Blockers</p>
                                    <ul className="mt-1.5 space-y-1">
                                      {v.blockers.map((b) => (
                                        <li key={b} className="flex items-start gap-1.5 text-[12.5px] text-[#3A3A3A]">
                                          <AlertTriangle className="mt-0.5 h-3 w-3 flex-shrink-0 text-[#D69A2E]" aria-hidden /> {b}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                                <button
                                  type="button"
                                  onClick={() => runCustom(cp.id)}
                                  disabled={isBusy}
                                  className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-[#E6E1D4] bg-white px-3 py-1.5 text-[11.5px] font-semibold text-[#3A3A3A] transition-colors hover:bg-[#FAF8F2] disabled:opacity-60"
                                >
                                  <RefreshCw className={`h-3 w-3 ${isBusy ? 'animate-spin' : 'text-[#2F8F5C]'}`} />
                                  {isBusy ? 'Re-checking…' : 'Re-check phase'}
                                </button>
                              </div>
                            ) : (
                              <div className="flex flex-col items-start gap-2.5">
                                <p className="text-[12.5px] text-[#6B6B6B]">
                                  Ask the AI to weigh the confirmed photo evidence tagged to {cp.name}’s tasks and call whether it’s done.
                                </p>
                                <button
                                  type="button"
                                  onClick={() => runCustom(cp.id)}
                                  disabled={isBusy}
                                  className="inline-flex items-center gap-1.5 rounded-full bg-[#1A1A1A] px-3.5 py-1.5 text-[11.5px] font-semibold text-white transition-colors hover:bg-black disabled:opacity-60"
                                >
                                  {isBusy ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3 text-[#FFE082]" />}
                                  {isBusy ? 'Checking…' : 'Mark phase complete'}
                                </button>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

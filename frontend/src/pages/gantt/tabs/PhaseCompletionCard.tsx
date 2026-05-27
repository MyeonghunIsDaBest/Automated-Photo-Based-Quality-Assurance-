// PhaseCompletionCard — Review-tab card showing the AI's completion verdict for
// the project's active phase. Reads project_phase_status on mount; when there's
// no verdict yet it offers a "Mark phase complete" CTA that calls the
// complete-phase Edge Function and renders the result inline.
//
// Collapsible. Honors prefers-reduced-motion via the app-root MotionConfig.

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, ChevronRight, RefreshCw, Sparkles } from 'lucide-react';
import { getPhaseStatus, completePhase, type PhaseStatusRow } from '../../../lib/api/phaseStatus';
import type { ConstructionPhase } from '../../../lib/ai/contract';
import { phaseColor } from '../../../lib/construction/phaseColors';

interface Props {
  projectId: string;
  phase: ConstructionPhase;
}

export function PhaseCompletionCard({ projectId, phase }: Props) {
  const [row, setRow] = useState<PhaseStatusRow | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    void getPhaseStatus(projectId, phase)
      .then((r) => { if (!cancelled) { setRow(r); setLoaded(true); } })
      .catch(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [projectId, phase]);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const v = await completePhase(projectId, phase);
      setRow({
        project_id: projectId,
        phase,
        status: v.status,
        verdict_text: v.verdict,
        blockers: v.blockers,
        ready_for_next: v.readyForNext,
        model_used: v.modelUsed,
        completed_at: v.status === 'complete' ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not check phase completion.');
    } finally {
      setBusy(false);
    }
  };

  // Don't flash an empty card before the first read resolves.
  if (!loaded) return null;

  const palette = phaseColor(phase);
  const hasVerdict = row != null && row.verdict_text != null;

  return (
    <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-3.5 text-left transition-colors hover:bg-stone-50"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2.5">
          <span
            className={`flex h-7 w-7 items-center justify-center rounded-lg transition-all ${open ? 'rotate-90' : ''}`}
            style={{ backgroundColor: palette.tint, color: palette.color }}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </span>
          <span className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-stone-500">
            Phase completion
          </span>
          <span
            className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize"
            style={{ borderColor: palette.color, backgroundColor: palette.tint, color: palette.color }}
          >
            <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: palette.color }} />
            {phase}
          </span>
        </div>
        {hasVerdict && row!.ready_for_next ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" /> Ready for next phase
          </span>
        ) : (
          <span className="text-[11px] italic text-stone-400">
            {hasVerdict ? 'Reviewed' : 'Not yet reviewed'}
          </span>
        )}
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="border-t border-stone-100"
          >
            <div className="px-5 py-4">
              {error && (
                <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {error}
                </p>
              )}

              {hasVerdict ? (
                <>
                  <p className="text-[13.5px] leading-relaxed text-stone-700">{row!.verdict_text}</p>
                  {row!.blockers.length > 0 && (
                    <div className="mt-3">
                      <p className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-stone-500">Blockers</p>
                      <ul className="mt-1.5 space-y-1">
                        {row!.blockers.map((b) => (
                          <li key={b} className="flex items-start gap-1.5 text-[12.5px] text-stone-600">
                            <AlertTriangle className="mt-0.5 h-3 w-3 flex-shrink-0 text-amber-600" aria-hidden />
                            {b}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="mt-4 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={run}
                      disabled={busy}
                      className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-[11.5px] font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-60"
                    >
                      <RefreshCw className={`h-3 w-3 ${busy ? 'animate-spin' : 'text-emerald-600'}`} />
                      {busy ? 'Re-checking…' : 'Re-check phase'}
                    </button>
                    {row!.model_used && row!.model_used !== 'none' && (
                      <span className="text-[10.5px] text-stone-400">via {row!.model_used}</span>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-start gap-3">
                  <p className="text-[13px] text-stone-500">
                    No completion check yet for{' '}
                    <span className="font-semibold capitalize text-stone-700">{phase}</span>. Ask the AI to
                    weigh the confirmed photo evidence and call whether this phase is done.
                  </p>
                  <button
                    type="button"
                    onClick={run}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 rounded-full bg-stone-900 px-3.5 py-1.5 text-[11.5px] font-semibold text-white hover:bg-black disabled:opacity-60"
                  >
                    {busy
                      ? <RefreshCw className="h-3 w-3 animate-spin" />
                      : <Sparkles className="h-3 w-3 text-[#FFE082]" />}
                    {busy ? 'Checking…' : 'Mark phase complete'}
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

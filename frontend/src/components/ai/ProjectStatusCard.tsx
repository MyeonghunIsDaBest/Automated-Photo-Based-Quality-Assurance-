// ProjectStatusCard — fires synthesize-project-status on click and renders
// the Claude-generated overall %, staggered phase bars, blockers, and next
// milestone. Cached once per day server-side, so a re-click reads the cache
// without burning more tokens. Mounted on the Dashboard.

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, RefreshCw, Sparkles, Target } from 'lucide-react';
import { synthesizeProjectStatus, type ProjectStatusResult } from '../../lib/api/projectStatus';
import CountUp from '../ui/CountUp';
import { FRAUNCES } from '../../pages/gantt/components/ledger';
import { phaseColor } from '../../lib/construction/phaseColors';
import type { ConstructionPhase } from '../../types';

interface Props {
  projectId: string;
}

export default function ProjectStatusCard({ projectId }: Props) {
  const [status, setStatus] = useState<ProjectStatusResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await synthesizeProjectStatus(projectId);
      setStatus(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to synthesize project status.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="overflow-hidden rounded-[16px] border border-[#E6E1D4] bg-white shadow-[0_1px_0_0_rgba(15,23,42,0.04),0_1px_2px_-1px_rgba(15,23,42,0.06)]">
      <div className={`flex flex-wrap items-center justify-between gap-4 px-5 py-[18px] ${status || error ? 'border-b border-[#EFEBE0]' : ''}`}>
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.1em] text-[#2F8F5C]">
            <Sparkles className="h-3 w-3" aria-hidden />
            AI · Project synthesis
          </p>
          <h3 className="mt-[5px] text-[19px] font-semibold leading-tight text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>
            Where we are right now
          </h3>
          <p className="mt-[5px] max-w-[560px] text-[12.5px] leading-[1.55] text-[#6B6B6B]">
            Claude reads the confirmed photo evidence per phase and calls overall progress, blockers, and the next milestone. Cached once per day.
          </p>
        </div>
        <button
          type="button"
          onClick={run}
          disabled={busy}
          className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-full bg-[#1A1A1A] py-2 pl-3.5 pr-4 text-[12.5px] font-semibold text-white transition-[background-color,transform] duration-150 ease-out hover:-translate-y-px hover:bg-[#246F47] disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:bg-[#1A1A1A]"
        >
          {busy
            ? <RefreshCw className="h-3 w-3 animate-spin" />
            : <Sparkles className="h-3 w-3" />}
          {busy ? 'Synthesizing…' : status ? 'Re-generate' : 'Generate status'}
        </button>
      </div>

      <AnimatePresence initial={false}>
        {error && (
          <motion.p
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-b border-[#F0D4D4] bg-[#FBE5E5] px-5 py-2 text-xs text-[#C44545]"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {status && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="px-5 py-5"
          >
            {/* Overall + active phase */}
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-[#6B6B6B]">
                  Overall progress
                </p>
                <p className="mt-1 text-[32px] font-semibold leading-none tabular-nums text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>
                  <CountUp value={status.overallPct} format={(n) => `${Math.round(n)}%`} />
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-[#6B6B6B]">
                  Active phase
                </p>
                <p className="mt-1 text-base font-medium capitalize text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>
                  {status.activePhase || '—'}
                </p>
              </div>
            </div>

            {/* Staggered phase bars */}
            {status.phaseBreakdown.length > 0 && (
              <div className="mt-5 space-y-2">
                {status.phaseBreakdown.map((row, i) => {
                  const palette = phaseColorSafe(row.phase);
                  return (
                    <motion.div
                      key={row.phase}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.06, duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                      className="flex items-center gap-3"
                    >
                      <span className="w-24 truncate text-[11px] font-medium capitalize text-[#3A3A3A]">
                        {row.phase}
                      </span>
                      <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-[#F0EDE4]">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${row.pct}%` }}
                          transition={{ delay: i * 0.06 + 0.05, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                          className="h-full rounded-full"
                          style={{ backgroundColor: palette.color }}
                        />
                      </div>
                      <span className="w-10 text-right text-[11px] font-semibold tabular-nums text-[#1A1A1A]">
                        {row.pct}%
                      </span>
                    </motion.div>
                  );
                })}
              </div>
            )}

            {/* Blockers */}
            {status.blockers.length > 0 && (
              <div className="mt-5">
                <p className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-[#6B6B6B]">
                  Blockers
                </p>
                <ul className="mt-1.5 space-y-1">
                  {status.blockers.map((b) => (
                    <li key={b} className="flex items-start gap-1.5 text-[12.5px] text-[#3A3A3A]">
                      <AlertTriangle className="mt-0.5 h-3 w-3 flex-shrink-0 text-[#9A6B12]" aria-hidden />
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Next milestone */}
            {status.nextMilestone && (
              <div className="mt-5 flex items-start gap-2 rounded-[10px] border border-[#D5E8DD] bg-[#E5F2EA] px-3 py-2">
                <Target className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-[#246F47]" aria-hidden />
                <p className="text-[12.5px] leading-relaxed text-[#246F47]">
                  <span className="font-semibold">Next:</span> {status.nextMilestone}
                </p>
              </div>
            )}

            <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#A0A0A0]">
              {status.cached ? 'Cached today' : 'Fresh'} · via {status.modelUsed}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

// phaseColor expects a known ConstructionPhase but Claude could return any
// string for `activePhase` / `phaseBreakdown[].phase`. Fall back to a neutral
// palette (ledger TONE.slate) so an unknown phase still renders cleanly.
function phaseColorSafe(phase: string): { color: string; tint: string } {
  try {
    return phaseColor(phase as ConstructionPhase);
  } catch {
    return { color: '#6B7A8F', tint: '#EEF1F4' };
  }
}

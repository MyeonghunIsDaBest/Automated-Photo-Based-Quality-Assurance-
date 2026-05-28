// ProjectStatusCard — fires synthesize-project-status on click and renders
// the Claude-generated overall %, staggered phase bars, blockers, and next
// milestone. Cached once per day server-side, so a re-click reads the cache
// without burning more tokens. Mounted on the Dashboard.

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, RefreshCw, Sparkles, Target } from 'lucide-react';
import { synthesizeProjectStatus, type ProjectStatusResult } from '../../lib/api/projectStatus';
import CountUp from '../ui/CountUp';
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
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">
            AI · Project synthesis
          </p>
          <h3 className="display mt-1 text-lg font-medium text-slate-900">
            Where we are right now
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Claude reads the confirmed photo evidence per phase and calls overall progress, blockers, and the next milestone. Cached once per day.
          </p>
        </div>
        <button
          type="button"
          onClick={run}
          disabled={busy}
          className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-full bg-slate-900 px-3.5 py-1.5 text-[12px] font-semibold text-white hover:bg-black disabled:opacity-60"
        >
          {busy
            ? <RefreshCw className="h-3 w-3 animate-spin" />
            : <Sparkles className="h-3 w-3 text-[#FFE082]" />}
          {busy ? 'Synthesizing…' : status ? 'Re-generate' : 'Generate status'}
        </button>
      </div>

      <AnimatePresence initial={false}>
        {error && (
          <motion.p
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-b border-red-100 bg-red-50 px-5 py-2 text-xs text-red-700"
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
                <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">
                  Overall progress
                </p>
                <p className="display mt-1 text-3xl font-medium tabular-nums text-slate-900">
                  <CountUp value={status.overallPct} format={(n) => `${Math.round(n)}%`} />
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">
                  Active phase
                </p>
                <p className="display mt-1 text-base font-medium capitalize text-slate-900">
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
                      <span className="w-24 truncate text-[11px] font-medium capitalize text-slate-700">
                        {row.phase}
                      </span>
                      <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${row.pct}%` }}
                          transition={{ delay: i * 0.06 + 0.05, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                          className="h-full rounded-full"
                          style={{ backgroundColor: palette.color }}
                        />
                      </div>
                      <span className="w-10 text-right text-[11px] font-semibold tabular-nums text-slate-800">
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
                <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">
                  Blockers
                </p>
                <ul className="mt-1.5 space-y-1">
                  {status.blockers.map((b) => (
                    <li key={b} className="flex items-start gap-1.5 text-[12.5px] text-slate-600">
                      <AlertTriangle className="mt-0.5 h-3 w-3 flex-shrink-0 text-amber-600" aria-hidden />
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Next milestone */}
            {status.nextMilestone && (
              <div className="mt-5 flex items-start gap-2 rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2">
                <Target className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-emerald-700" aria-hidden />
                <p className="text-[12.5px] leading-relaxed text-emerald-900">
                  <span className="font-semibold">Next:</span> {status.nextMilestone}
                </p>
              </div>
            )}

            <p className="mt-4 text-[10px] uppercase tracking-[0.15em] text-slate-400">
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
// palette so an unknown phase still renders cleanly.
function phaseColorSafe(phase: string): { color: string; tint: string } {
  try {
    return phaseColor(phase as ConstructionPhase);
  } catch {
    return { color: '#94a3b8', tint: '#f1f5f9' };
  }
}

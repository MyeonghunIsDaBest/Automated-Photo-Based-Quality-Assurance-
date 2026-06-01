// DailyBriefCard — a warm, prose "today's site brief" the way a foreman would
// say it at the morning toolbox talk. The narrative rides on the EXISTING
// synthesize-project-status payload + daily cache (one Claude call returns both
// the structured JSON and this narrative), so this card adds ZERO extra Claude
// calls per day — even though ProjectStatusCard also calls the same function,
// the server-side daily cache makes the second call free.
//
// Visually distinct from ProjectStatusCard: that one is structured % bars; this
// is a single warm paragraph in the Fraunces serif (.display) over a cream →
// emerald gradient. Mounted on the Dashboard directly above ProjectStatusCard.

import { useEffect, useRef, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { RefreshCw, Sparkles } from 'lucide-react';
import { synthesizeProjectStatus, type ProjectStatusResult } from '../../lib/api/projectStatus';

interface Props {
  projectId: string;
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export default function DailyBriefCard({ projectId }: Props) {
  const [status, setStatus] = useState<ProjectStatusResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);

  // Bump to force a re-fetch (Refresh / Retry). Same-day hits the server cache,
  // so this never burns extra Claude tokens.
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);

    synthesizeProjectStatus(projectId)
      .then((result) => {
        if (cancelled) return;
        setStatus(result);
        setFetchedAt(new Date());
      })
      .catch(() => {
        if (cancelled) return;
        setError(true);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, nonce]);

  const refresh = () => setNonce((n) => n + 1);

  // ── States ──────────────────────────────────────────────────────────────

  // Loading → shimmer skeleton lines.
  if (loading) {
    return (
      <section className="rounded-xl border border-emerald-100 bg-gradient-to-br from-[#FAF8F2] to-emerald-50/40 px-5 py-5">
        <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-emerald-700/80">
          <Sparkles className="h-3 w-3" aria-hidden />
          AI · Today's brief
        </p>
        <div className="mt-3 space-y-2" aria-hidden>
          <div className="h-4 w-[92%] animate-pulse rounded bg-emerald-100/70" />
          <div className="h-4 w-[78%] animate-pulse rounded bg-emerald-100/70" />
          <div className="h-4 w-[40%] animate-pulse rounded bg-emerald-100/70" />
        </div>
      </section>
    );
  }

  // Error → render nothing. The brief is a nice-to-have; if the synthesis
  // function is unreachable (not deployed, network, CORS) the Dashboard should
  // just omit the card rather than show a persistent error on every load.
  // ProjectStatusCard (below it) still surfaces a real error on its explicit
  // Generate action, so failures aren't hidden everywhere.
  if (error) return null;

  // Empty narrative → render nothing so the card never shows an empty box.
  if (!status || !status.narrative) return null;

  // ── Loaded ──────────────────────────────────────────────────────────────

  const phaseContext = status.activePhase
    ? `${status.activePhase} · ${status.overallPct}% overall`
    : `${status.overallPct}% overall`;

  return (
    <section className="rounded-xl border border-emerald-100 bg-gradient-to-br from-[#FAF8F2] to-emerald-50/40 px-5 py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-emerald-700/80">
            <Sparkles className="h-3 w-3" aria-hidden />
            AI · Today's brief
          </p>
          <p className="mt-1 text-[11px] font-medium capitalize tracking-wide text-emerald-800/70">
            {phaseContext}
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          aria-label="Refresh brief"
          className="inline-flex flex-shrink-0 items-center gap-1 rounded-full border border-emerald-200/70 bg-white/60 px-2.5 py-1 text-[11px] font-medium text-emerald-800 transition-colors hover:bg-white"
        >
          <RefreshCw className="h-3 w-3" aria-hidden />
          Refresh
        </button>
      </div>

      <Typewriter
        key={status.narrative}
        text={status.narrative}
        className="display mt-3 text-lg font-medium leading-relaxed text-slate-800 sm:text-xl"
      />

      {fetchedAt && (
        <p className="mt-3 text-[10px] uppercase tracking-[0.15em] text-emerald-700/50">
          Updated {formatDistanceToNow(fetchedAt, { addSuffix: true })}
          {status.cached ? ' · cached today' : ''}
        </p>
      )}
    </section>
  );
}

// Typewriter — reveals the narrative as a growing substring over ≤1.5s total,
// dependency-free (rAF-paced). Honors prefers-reduced-motion by rendering the
// full text instantly. A trailing caret hints at the live "writing" feel while
// in motion.
function Typewriter({ text, className }: { text: string; className?: string }) {
  const reduced = prefersReducedMotion();
  const [count, setCount] = useState(reduced ? text.length : 0);
  const rafRef = useRef(0);

  useEffect(() => {
    if (reduced) {
      setCount(text.length);
      return;
    }
    const total = 1500; // ms — full reveal budget regardless of length
    const start = performance.now();

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / total);
      setCount(Math.round(t * text.length));
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    setCount(0);
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [text, reduced]);

  const done = count >= text.length;

  return (
    <p className={className}>
      {text.slice(0, count)}
      {!done && (
        <span
          className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] animate-pulse bg-emerald-600/70 align-middle"
          aria-hidden
        />
      )}
    </p>
  );
}

// MockAnalysisButton — the user-facing entry point to the client-side
// mock-AI runtime. Renders inside the Gantt's Overview + Tasks tabs.
//
// Visual states:
//   • idle, count > 0 → "Run AI analysis · N photos"
//   • idle, count === 0 → muted "No photos pending · run again after upload"
//   • running → inline shimmer with "Analysing 3 of 8 — Foundation pour" copy
//   • just-ran → small summary chip "Analysed 8 photos. Project +6%"
//
// Compact = inline pill suitable for a tab toolbar; full = card-shaped block
// suitable for the Overview's right-rail.

import { Sparkles, Check, ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useMockAnalysis } from '../../lib/hooks/useMockAnalysis';

interface MockAnalysisButtonProps {
  projectId: string | null;
  variant?: 'compact' | 'card';
  /** Optional navigation target. When provided, the affordance gets a secondary
   *  link that routes to the AI Analysis hub so users on Gantt Overview / Tasks
   *  can drill in for the full Gantt chart + review queue. The hub page itself
   *  omits this prop (you're already there). */
  viewHref?: string;
}

export default function MockAnalysisButton({ projectId, variant = 'compact', viewHref }: MockAnalysisButtonProps) {
  const { pendingCount, isRunning, progress, lastSummary, error, run } = useMockAnalysis(projectId);
  const disabled = !projectId || isRunning || pendingCount === 0;

  if (variant === 'card') {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-start gap-3">
          <span
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full"
            style={{ backgroundColor: 'var(--accent-color, #10B981)', opacity: 0.12 }}
            aria-hidden
          >
            <Sparkles className="h-4 w-4" style={{ color: 'var(--accent-color, #047857)' }} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
              AI analysis
            </p>
            <p className="mt-1 text-sm text-slate-700">
              {pendingCount > 0
                ? `${pendingCount} photo${pendingCount === 1 ? '' : 's'} ready to analyse. Each photo bumps its task by 4–10%.`
                : 'Every photo on this project has been analysed. Upload more from the Upload tab to see new bumps.'}
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={run}
            disabled={disabled}
            className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-slate-800 disabled:opacity-50"
            style={isRunning ? { backgroundColor: 'var(--accent-color, #047857)' } : undefined}
          >
            {isRunning ? <Shimmer /> : <Sparkles className="h-3.5 w-3.5" />}
            {isRunning
              ? `Analysing ${progress.current} of ${progress.total}…`
              : pendingCount > 0
                ? `Run AI analysis (${pendingCount})`
                : 'No photos pending'}
          </button>
          {viewHref && (
            <Link
              to={viewHref}
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50"
            >
              View AI hub
              <ArrowUpRight className="h-3 w-3" aria-hidden />
            </Link>
          )}
          {lastSummary && !isRunning && (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
              <Check className="h-3.5 w-3.5" />
              Analysed {lastSummary.bumped} · project at {lastSummary.newOverallProgress}%
            </span>
          )}
          {error && <span className="text-xs text-rose-600" role="alert">{error}</span>}
        </div>
        {isRunning && progress.latest && (
          <p className="mt-2 text-[11px] text-slate-500">
            Latest: {progress.latest.analysis.phaseDetected ?? 'general'} ·{' '}
            +{progress.latest.increment}% ({progress.latest.oldPct}% → {progress.latest.newPct}%)
          </p>
        )}
      </div>
    );
  }

  // Compact variant — pill for a tab toolbar.
  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={run}
        disabled={disabled}
        className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
        style={isRunning ? { borderColor: 'var(--accent-color, #10B981)', color: 'var(--accent-color, #047857)' } : undefined}
      >
        {isRunning ? <Shimmer /> : <Sparkles className="h-3.5 w-3.5" />}
        {isRunning
          ? `Analysing ${progress.current}/${progress.total}`
          : pendingCount > 0
            ? `Run AI · ${pendingCount}`
            : 'AI · no pending'}
      </button>
      {viewHref && (
        <Link
          to={viewHref}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700"
          aria-label="Open AI analysis hub"
          title="Open AI analysis hub"
        >
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      )}
      {lastSummary && !isRunning && (
        <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700">
          <Check className="h-3 w-3" />
          +{lastSummary.totalDeltaPct}%
        </span>
      )}
      {error && <span className="text-[11px] text-rose-600" role="alert">{error}</span>}
    </div>
  );
}

function Shimmer() {
  return (
    <span
      aria-hidden
      className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-200 border-t-current"
    />
  );
}

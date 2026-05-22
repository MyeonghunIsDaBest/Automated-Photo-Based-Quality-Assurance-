// Shared "AI is doing something" indicators.
//
// Salvaged from the deleted MockAnalysisButton so the visual language of
// "AI in progress" stays consistent now that the real analyze-photo
// pipeline drives it instead of the client-side mock runner.
//
// Both components sit in the same 14px slot, so callers can swap between
// indeterminate (Shimmer) and determinate (DonutProgress) without the
// surrounding button reflowing.

interface DonutProgressProps {
  /** Current step (e.g. 3rd of 8). */
  current: number;
  /** Total steps. When 0, the component renders an empty ring. */
  total: number;
  /** Pixel size of the ring. Defaults to 14 (matches Shimmer). */
  sizePx?: number;
}

/** Indeterminate spinner — use when total work isn't known yet (queued, just
 *  invoked, awaiting first response). Picks up `currentColor` so it tints
 *  with the surrounding text. */
export function Shimmer({ sizePx = 14 }: { sizePx?: number } = {}) {
  return (
    <span
      aria-hidden
      className="inline-block animate-spin rounded-full border-2 border-slate-200 border-t-current"
      style={{ height: sizePx, width: sizePx }}
    />
  );
}

/** Determinate progress ring — use when the consumer knows how many items
 *  are being processed. Two stacked stroked circles: slate track + sweep
 *  driven by stroke-dasharray. Stroke uses `currentColor` so the consumer
 *  controls hue via parent text colour. */
export function DonutProgress({ current, total, sizePx = 14 }: DonutProgressProps) {
  const pct = total > 0 ? Math.min(1, Math.max(0, current / total)) : 0;
  const radius = 6;
  const circumference = 2 * Math.PI * radius;
  return (
    <span
      aria-hidden
      className="relative inline-flex items-center justify-center"
      style={{ height: sizePx, width: sizePx }}
    >
      <svg viewBox="0 0 16 16" className="-rotate-90" style={{ height: sizePx, width: sizePx }}>
        <circle cx="8" cy="8" r={radius} fill="none" stroke="rgb(226 232 240)" strokeWidth="2" />
        <circle
          cx="8"
          cy="8"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={`${pct * circumference} ${circumference}`}
          style={{ transition: 'stroke-dasharray 300ms ease-out' }}
        />
      </svg>
    </span>
  );
}

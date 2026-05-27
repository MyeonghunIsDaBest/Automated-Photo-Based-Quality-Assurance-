// ConfidenceRing — SVG progress ring with the sage / teal / amber confidence
// ramp (matches the 0.50–0.85 review band). Extracted from ReviewQueueTab so
// the PhotoReviewDrawer can reuse it.
//
// `animateFromZero` makes the arc sweep 0 → pct on mount (the drawer wants the
// reveal). Without it the ring renders at pct immediately and animates on
// later pct changes via the CSS transition (the queue rows want that). The
// 0-start is skipped under prefers-reduced-motion.

import { useEffect, useState } from 'react';

interface Props {
  pct: number;
  animateFromZero?: boolean;
}

export default function ConfidenceRing({ pct, animateFromZero = false }: Props) {
  const safe = Math.max(0, Math.min(100, pct));
  const radius = 15;
  const circumference = 2 * Math.PI * radius;
  const stroke = safe >= 80 ? '#2F8F5C' : safe >= 60 ? '#0D8D85' : '#C8841E';

  const [shownPct, setShownPct] = useState(animateFromZero ? 0 : safe);

  useEffect(() => {
    if (!animateFromZero) {
      setShownPct(safe);
      return;
    }
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setShownPct(safe);
      return;
    }
    // Start at 0, flip to the real value next frame so the CSS transition runs.
    setShownPct(0);
    const raf = requestAnimationFrame(() => setShownPct(safe));
    return () => cancelAnimationFrame(raf);
  }, [safe, animateFromZero]);

  const dash = (shownPct / 100) * circumference;

  return (
    <span aria-hidden className="relative inline-flex h-11 w-11 items-center justify-center">
      <svg viewBox="0 0 36 36" className="h-11 w-11 -rotate-90">
        <circle cx="18" cy="18" r={radius} fill="none" stroke="rgb(231 229 228)" strokeWidth="2.5" />
        <circle
          cx="18"
          cy="18"
          r={radius}
          fill="none"
          stroke={stroke}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          style={{ transition: 'stroke-dasharray 600ms ease-out' }}
        />
      </svg>
      <span className="absolute text-[12px] font-bold tabular-nums text-stone-800">
        {safe}
      </span>
    </span>
  );
}

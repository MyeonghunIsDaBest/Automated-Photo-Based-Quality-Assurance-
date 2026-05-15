// CountUp — animated number primitive driven by requestAnimationFrame +
// easeOutCubic. Re-animates whenever `value` changes by comparing against a
// previous-value ref. Falls back to instant render when the user has
// prefers-reduced-motion enabled so the polish never fights accessibility.

import { useEffect, useRef, useState } from 'react';

interface CountUpProps {
  value: number;
  duration?: number;
  format?: (n: number) => string;
}

const defaultFormat = (n: number) => String(Math.round(n));
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

export default function CountUp({ value, duration = 800, format = defaultFormat }: CountUpProps) {
  const prevRef = useRef(value);
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    if (reduced || duration <= 0) {
      prevRef.current = value;
      setDisplay(value);
      return;
    }

    const from = prevRef.current;
    const to = value;
    if (from === to) return;

    const start = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = easeOutCubic(t);
      setDisplay(from + (to - from) * eased);
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        prevRef.current = to;
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return <>{format(display)}</>;
}

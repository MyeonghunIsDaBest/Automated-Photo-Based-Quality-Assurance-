import { useEffect, useState } from 'react';

// Tiny, dependency-free media-query hook. Returns `false` when window or
// matchMedia is unavailable (SSR, jsdom test environment) — callers should
// design with that as the safe default (desktop layout).
export function useMediaQuery(query: string): boolean {
  const get = () => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }
    return window.matchMedia(query).matches;
  };

  const [matches, setMatches] = useState<boolean>(get);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const mql = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    setMatches(mql.matches);
    // The `change` event covers both addEventListener (modern) and the
    // legacy `addListener` API; we only need the modern path here because
    // every supported browser has it.
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [query]);

  return matches;
}

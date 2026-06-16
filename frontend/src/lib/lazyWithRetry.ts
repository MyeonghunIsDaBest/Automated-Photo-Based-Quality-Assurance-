// lazyWithRetry — `React.lazy` with a silent retry + one-shot reload guard.
// Extracted from App.tsx so nested lazy views (e.g. JobsHub's Board/Projects)
// get the same chunk-failure protection as top-level routes.
//
// Failure modes covered:
//   • Prod: a stale `index.html` references a chunk hash that no longer exists
//     after a redeploy — the retry still fails, so we fall through to a
//     one-shot full reload that picks up the new index.html.
//   • Dev: a Vite dev-server / HMR hiccup drops a single fetch — the silent
//     retry succeeds and the user sees nothing.
import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

const CHUNK_RELOAD_KEY = 'chunk-reload-attempted';
const CHUNK_ERROR_RE =
  /Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError/i;

// Storage access can THROW (Firefox strict modes, partitioned iframes, private
// mode). The guard is a nicety, not load-bearing — swallow and degrade.
const safeSession = {
  get(key: string): string | null { try { return sessionStorage.getItem(key); } catch { return null; } },
  set(key: string, value: string) { try { sessionStorage.setItem(key, value); } catch { /* storage blocked */ } },
  remove(key: string) { try { sessionStorage.removeItem(key); } catch { /* storage blocked */ } },
};

/** Clear the one-shot reload guard — call after any successful navigation so a
 *  chunk failure later in the session can still trigger one reload. */
export function clearChunkReloadGuard() {
  safeSession.remove(CHUNK_RELOAD_KEY);
}

export function lazyWithRetry<T extends ComponentType<any>>(
  loader: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      return await loader();
    } catch {
      try {
        return await loader();
      } catch (secondErr) {
        const msg = secondErr instanceof Error ? secondErr.message : String(secondErr);
        if (CHUNK_ERROR_RE.test(msg) && !safeSession.get(CHUNK_RELOAD_KEY)) {
          safeSession.set(CHUNK_RELOAD_KEY, '1');
          window.location.reload();
          return await new Promise<never>(() => {});
        }
        throw secondErr;
      }
    }
  });
}

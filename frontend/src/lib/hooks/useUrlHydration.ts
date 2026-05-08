import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useProjectsListStore } from '../../pages/projects/store';

interface UrlHydrationOptions {
  /** Page-specific extras applied AFTER the project switch settles. */
  onApplyExtras?: (params: Record<string, string | null>) => void;
  /** When true, runs `onApplyExtras` even if there was no `?project=` param. */
  applyExtrasWithoutProject?: boolean;
}

// Phase 2 of the connectedness pass — read URL query params on mount and
// hydrate page-level state from them. The schema:
//
//   ?project=<id>           — switch active project (idempotent)
//   ?tab=<id>               — page-specific tab selection
//   ?task=<id>              — open task drawer
//   ?photo=<id>             — open photo lightbox
//   ?incident=<id>          — scroll to safety incident
//
// This helper handles `project` itself; pages pass `onApplyExtras` to do
// their own thing with the remaining params.
//
// Cold-load order: project switch FIRST, then a one-tick wait (next
// microtask), then extras. The wait is what prevents
// "extras-applied-on-old-project" races when the page mounts before the
// project store has the new id.
export function useUrlHydration({ onApplyExtras, applyExtrasWithoutProject = true }: UrlHydrationOptions = {}): void {
  const [searchParams] = useSearchParams();
  const setActiveProject = useProjectsListStore((s) => s.setActiveProject);
  const activeProjectId = useProjectsListStore((s) => s.activeProjectId);

  // Mount-only effect — params apply once on arrival, not on every URL
  // change within the page (which would fight in-page state).
  const appliedRef = useRef(false);

  useEffect(() => {
    if (appliedRef.current) return;
    appliedRef.current = true;

    const projectParam = searchParams.get('project');
    if (projectParam && projectParam !== activeProjectId) {
      setActiveProject(projectParam);
    }

    if (!projectParam && !applyExtrasWithoutProject) return;

    // Defer extras to the next microtask so any React state updates
    // triggered by `setActiveProject` settle before page-side logic looks
    // at the store. queueMicrotask is enough — we're not waiting for a
    // network round-trip, just a render cycle.
    queueMicrotask(() => {
      const extras: Record<string, string | null> = {};
      for (const [k, v] of searchParams.entries()) {
        if (k === 'project') continue;
        extras[k] = v;
      }
      onApplyExtras?.(extras);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

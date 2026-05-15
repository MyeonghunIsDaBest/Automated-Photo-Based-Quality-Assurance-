// Owner-only demo project spawner.
//
// `createProject()` already seeds 8 phase anchors + 57 default milestones for
// every new project — this helper is just a thin wrapper that pre-fills the
// wizard payload with the Hampstead Heights template's parameters and runs
// the create flow. Result: a fresh demo build that the owner can walk
// through during onboarding / sales without touching the real Casone pilot.
//
// Naming: if "Hampstead Heights — Demo Build" already exists in the list,
// the new copy gets a `· copy 2`, `· copy 3`, … suffix so the switcher
// stays distinct.

import { createProject, type CreatedProjectResult } from './createProject';
import { useProjectsListStore } from '../store';
import { DEMO_INFLIGHT_PROJECT_META } from '../../../data/demoInflightProject';

function nextCopyName(): string {
  const base = DEMO_INFLIGHT_PROJECT_META.name;
  const existing = useProjectsListStore.getState().projects.map((p) => p.name);
  if (!existing.includes(base)) return base;
  for (let n = 2; n < 100; n++) {
    const candidate = `${base} · copy ${n}`;
    if (!existing.includes(candidate)) return candidate;
  }
  // Pathological fallback — append a timestamp so the call still succeeds.
  return `${base} · copy ${Date.now()}`;
}

export function generateDemoProject(): CreatedProjectResult {
  return createProject({
    name: nextCopyName(),
    clientName: DEMO_INFLIGHT_PROJECT_META.client,
    description: DEMO_INFLIGHT_PROJECT_META.description,
    startDate: DEMO_INFLIGHT_PROJECT_META.startDate,
    endDate: DEMO_INFLIGHT_PROJECT_META.endDate,
    status: 'active',
    // Modest budget — keeps the finance report from looking empty.
    budget: 1_250_000,
    // No user milestones — the 57 defaults seed automatically.
  });
}

// Two extra demo projects beyond Hampstead Heights, used to show off the
// per-project accent colour + report cadence flexibility in the demo pitch.
// Together they cover the three "moments in a project's life":
//
//   • Hampstead Heights — mid-stream (foundation pouring, framing just
//     about to start). Emerald accent, weekly cadence. (Lives in
//     `demoInflightProject.ts`.)
//   • Bondi Junction      — early stage (excavation in progress).
//     Rose accent, monthly cadence.
//   • Marrickville        — late stage (drywall + finishing).
//     Indigo accent, no auto-report cadence.
//
// All three share the canonical 8-phase / 57-milestone library from
// `lib/construction/phaseMilestones.ts` — only the progression % per
// milestone differs.

import type { ConstructionPhase, Task, TaskStatus } from '../types';
import {
  DEFAULT_PHASE_MILESTONES,
  milestoneDates,
} from '../lib/construction/phaseMilestones';

const TODAY = '2026-05-13T08:00:00Z';

// Map each phase to a percentage. Children inside a phase get the phase
// percentage, except the last milestone in an in-progress phase which sits
// at half the phase value so the timeline shows a visible "leading edge".
function progressionFor(
  phasePcts: Record<ConstructionPhase, number>,
): Record<ConstructionPhase, Array<{ pct: number; status: TaskStatus }>> {
  const out: Record<ConstructionPhase, Array<{ pct: number; status: TaskStatus }>> = {} as never;
  for (const phase of Object.keys(phasePcts) as ConstructionPhase[]) {
    const phasePct = phasePcts[phase];
    const milestones = DEFAULT_PHASE_MILESTONES[phase];
    out[phase] = milestones.map((_, idx, arr) => {
      if (phasePct === 100) return { pct: 100, status: 'complete' as TaskStatus };
      if (phasePct === 0)   return { pct: 0,   status: 'not_started' as TaskStatus };
      // In-progress phase: distribute so earlier milestones are further
      // along, later ones are 0.
      const cutoff = Math.floor((phasePct / 100) * arr.length);
      if (idx < cutoff) return { pct: 100, status: 'complete' };
      if (idx === cutoff) {
        const remainder = ((phasePct / 100) * arr.length - cutoff) * 100;
        return {
          pct: Math.round(remainder),
          status: remainder > 0 ? 'in_progress' as TaskStatus : 'not_started' as TaskStatus,
        };
      }
      return { pct: 0, status: 'not_started' as TaskStatus };
    });
  }
  return out;
}

interface BuildOptions {
  id: string;
  name: string;
  client: string;
  description: string;
  phaseWindows: Record<ConstructionPhase, { startDate: string; endDate: string }>;
  phasePcts: Record<ConstructionPhase, number>;
}

function buildDemoSite(opts: BuildOptions): { meta: SiteMeta; tasks: Task[] } {
  const { id, phaseWindows, phasePcts } = opts;
  const anchorId = (phase: ConstructionPhase) => `${id}_anchor_${phase}`;

  const anchors: Task[] = (Object.keys(phaseWindows) as ConstructionPhase[]).map((phase) => {
    const { startDate, endDate } = phaseWindows[phase];
    return {
      id: anchorId(phase),
      projectId: id,
      name: phase[0].toUpperCase() + phase.slice(1),
      phase,
      startDate,
      endDate,
      durationDays: Math.max(
        1,
        Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86_400_000),
      ),
      percentComplete: 0, // rolled up from children at render time
      status: 'not_started',
      dependencies: [],
      photoCount: 0,
      lastUpdated: TODAY,
      updateSource: 'manual',
      notes: [],
      isPhaseAnchor: true,
    };
  });

  const progress = progressionFor(phasePcts);
  const children: Task[] = [];
  for (const phase of Object.keys(phaseWindows) as ConstructionPhase[]) {
    const window = phaseWindows[phase];
    const milestones = DEFAULT_PHASE_MILESTONES[phase];
    milestones.forEach((m, idx) => {
      const dates = milestoneDates(window.startDate, window.endDate, m);
      const p = progress[phase][idx];
      children.push({
        id: `${id}_${phase}_${idx + 1}`,
        projectId: id,
        parentTaskId: anchorId(phase),
        name: m.name,
        phase,
        startDate: dates.startDate,
        endDate: dates.endDate,
        durationDays: dates.durationDays,
        percentComplete: p.pct,
        status: p.status,
        dependencies: [],
        photoCount: 0,
        lastUpdated: TODAY,
        updateSource: 'manual',
        notes: [],
        isPhaseAnchor: false,
      });
    });
  }

  return {
    meta: {
      id: opts.id,
      name: opts.name,
      client: opts.client,
      description: opts.description,
      startDate: phaseWindows.excavation.startDate,
      endDate: phaseWindows.finishing.endDate,
    },
    tasks: [...anchors, ...children],
  };
}

interface SiteMeta {
  id: string;
  name: string;
  client: string;
  description: string;
  startDate: string;
  endDate: string;
}

// ─── Bondi Junction — early stage ──────────────────────────────────────────
const BONDI = buildDemoSite({
  id: 'project_demo_bondi',
  name: 'Bondi Junction — Switchboard Upgrade',
  client: 'Westfield Bondi Junction',
  description: 'Early-stage demo. Excavation underway, footings just beginning. Showcases the Gantt at the start of a project lifecycle.',
  phaseWindows: {
    excavation: { startDate: '2026-05-01', endDate: '2026-06-01' },
    foundation: { startDate: '2026-06-01', endDate: '2026-07-10' },
    framing:    { startDate: '2026-07-05', endDate: '2026-08-25' },
    roofing:    { startDate: '2026-08-20', endDate: '2026-09-25' },
    electrical: { startDate: '2026-09-20', endDate: '2026-11-10' },
    plumbing:   { startDate: '2026-09-25', endDate: '2026-11-15' },
    drywall:    { startDate: '2026-11-10', endDate: '2026-12-15' },
    finishing:  { startDate: '2026-12-10', endDate: '2027-01-31' },
  },
  phasePcts: {
    excavation: 40,
    foundation: 0,
    framing:    0,
    roofing:    0,
    electrical: 0,
    plumbing:   0,
    drywall:    0,
    finishing:  0,
  },
});

// ─── Marrickville — late stage ─────────────────────────────────────────────
const MARRICKVILLE = buildDemoSite({
  id: 'project_demo_marrickville',
  name: 'Marrickville — Workshop Fitout',
  client: 'Inner West Maker Co.',
  description: 'Late-stage demo. Drywall and finishing in progress, structural phases complete. Showcases the Gantt near handover.',
  phaseWindows: {
    excavation: { startDate: '2025-09-01', endDate: '2025-09-25' },
    foundation: { startDate: '2025-09-20', endDate: '2025-10-25' },
    framing:    { startDate: '2025-10-20', endDate: '2025-12-05' },
    roofing:    { startDate: '2025-12-01', endDate: '2026-01-10' },
    electrical: { startDate: '2026-01-05', endDate: '2026-02-25' },
    plumbing:   { startDate: '2026-01-10', endDate: '2026-03-01' },
    drywall:    { startDate: '2026-02-25', endDate: '2026-04-15' },
    finishing:  { startDate: '2026-04-10', endDate: '2026-06-15' },
  },
  phasePcts: {
    excavation: 100,
    foundation: 100,
    framing:    100,
    roofing:    100,
    electrical: 100,
    plumbing:   100,
    drywall:    70,
    finishing:  15,
  },
});

export const DEMO_BONDI_META = BONDI.meta;
export const DEMO_MARRICKVILLE_META = MARRICKVILLE.meta;

export const demoExtraSiteTasks: Task[] = [...BONDI.tasks, ...MARRICKVILLE.tasks];

// Per-demo project-config overrides — accent colour + report cadence.
// `lib/api/projectConfig.ts:defaultsFor()` reads from this map so the Admin
// → Project Config tab shows the right values without a real DB row.
export const DEMO_PROJECT_CONFIG_OVERRIDES: Record<string, {
  accentColor: string;
  reportCadence: 'none' | 'weekly' | 'monthly';
}> = {
  // Hampstead Heights — emerald, weekly (the default; explicit so it shows
  // in the same place as the other two).
  project_demo_inflight:       { accentColor: '#10B981', reportCadence: 'weekly' },
  // Bondi Junction — rose, monthly.
  project_demo_bondi:          { accentColor: '#BE123C', reportCadence: 'monthly' },
  // Marrickville — indigo, no cadence.
  project_demo_marrickville:   { accentColor: '#4338CA', reportCadence: 'none' },
};

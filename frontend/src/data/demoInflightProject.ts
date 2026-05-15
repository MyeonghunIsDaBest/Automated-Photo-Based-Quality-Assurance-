// Demo in-flight project — a pre-seeded "Hampstead Heights — Demo Build"
// that shows what the editable Gantt looks like when construction is mid-
// stream. Loaded into the feature store at boot when Supabase is not
// configured (mock mode).
//
// The 8 phase anchors are seeded with the canonical milestone library from
// `lib/construction/phaseMilestones.ts`. Percentages reflect what a real
// residential build would look like at today's date (2026-05-13) given the
// schedule below:
//
//   Excavation:  Apr 1  → May 1  → COMPLETE (in the past).
//   Foundation:  May 1  → Jun 10 → MID-STREAM (today = day 12 of 40).
//   Framing:     Jun 5  → Jul 25 → NOT STARTED (begins in 3 weeks).
//   Roofing  →   Jul 20 → Aug 25
//   Electrical:  Aug 20 → Oct 10
//   Plumbing:    Aug 25 → Oct 15
//   Drywall:     Oct 10 → Nov 15
//   Finishing:   Nov 10 → Dec 31
//
// Live mode never sees this — the `trg_seed_phase_anchors` trigger on
// project INSERT handles real seeding from the DB side.

import type { Task, ConstructionPhase, TaskStatus } from '../types';
import {
  DEFAULT_PHASE_MILESTONES,
  milestoneDates,
} from '../lib/construction/phaseMilestones';

export const DEMO_INFLIGHT_PROJECT_ID = 'project_demo_inflight';

const CREATED_AT = '2026-04-01T08:00:00Z';
const TODAY = '2026-05-13T08:00:00Z';

// Phase windows — realistic residential build cadence. Foundation overlaps
// excavation's tail by a few days (utility trenching wraps as footings start);
// later phases follow the standard sequence.
const PHASE_WINDOWS: Record<ConstructionPhase, { startDate: string; endDate: string }> = {
  excavation: { startDate: '2026-04-01', endDate: '2026-05-01' },
  foundation: { startDate: '2026-05-01', endDate: '2026-06-10' },
  framing:    { startDate: '2026-06-05', endDate: '2026-07-25' },
  roofing:    { startDate: '2026-07-20', endDate: '2026-08-25' },
  electrical: { startDate: '2026-08-20', endDate: '2026-10-10' },
  plumbing:   { startDate: '2026-08-25', endDate: '2026-10-15' },
  drywall:    { startDate: '2026-10-10', endDate: '2026-11-15' },
  finishing:  { startDate: '2026-11-10', endDate: '2026-12-31' },
};

// Per-phase progress at today's date. Anchors derive their rolled-up %
// from the children's `percentComplete` (computed at render time), so the
// number we set on the anchor itself is 0 — the editable Gantt uses
// `rolledUpPct(anchor, allTasks)` instead.
//
// The arrays below are aligned to `DEFAULT_PHASE_MILESTONES[phase]` and
// give the % + status + (optional) photoCount for each child. Length and
// order must match the milestone library exactly.
const CHILD_PROGRESS: Record<ConstructionPhase, Array<{
  pct: number;
  status: TaskStatus;
  photoCount?: number;
}>> = {
  // Excavation — phase complete in the past.
  excavation: [
    { pct: 100, status: 'complete', photoCount: 4 },   // Survey & layout
    { pct: 100, status: 'complete', photoCount: 6 },   // Land clearing
    { pct: 100, status: 'complete', photoCount: 3 },   // Erosion control
    { pct: 100, status: 'complete', photoCount: 5 },   // Rough grading
    { pct: 100, status: 'complete', photoCount: 9 },   // Foundation excavation
    { pct: 100, status: 'complete', photoCount: 4 },   // Utility trenching
  ],
  // Foundation — today is ~day 12 of a 40-day phase (~30% calendar).
  // Footings & stem walls done, waterproofing wrapping, slab work ahead.
  foundation: [
    { pct: 100, status: 'complete',    photoCount: 7 },  // Footing forms
    { pct: 100, status: 'complete',    photoCount: 11 }, // Footing pour
    { pct: 95,  status: 'in_progress', photoCount: 8 },  // Stem walls
    { pct: 60,  status: 'in_progress', photoCount: 3 },  // Waterproofing
    { pct: 30,  status: 'in_progress', photoCount: 1 },  // Drainage
    { pct: 0,   status: 'not_started' },                  // Backfill
    { pct: 0,   status: 'not_started' },                  // Slab prep
    { pct: 0,   status: 'not_started' },                  // Slab pour
    { pct: 0,   status: 'not_started' },                  // Foundation inspection
  ],
  // Framing — hasn't started yet (begins Jun 5). All zero.
  framing:    Array(DEFAULT_PHASE_MILESTONES.framing.length).fill({ pct: 0, status: 'not_started' }),
  roofing:    Array(DEFAULT_PHASE_MILESTONES.roofing.length).fill({ pct: 0, status: 'not_started' }),
  electrical: Array(DEFAULT_PHASE_MILESTONES.electrical.length).fill({ pct: 0, status: 'not_started' }),
  plumbing:   Array(DEFAULT_PHASE_MILESTONES.plumbing.length).fill({ pct: 0, status: 'not_started' }),
  drywall:    Array(DEFAULT_PHASE_MILESTONES.drywall.length).fill({ pct: 0, status: 'not_started' }),
  finishing:  Array(DEFAULT_PHASE_MILESTONES.finishing.length).fill({ pct: 0, status: 'not_started' }),
};

function anchorId(phase: ConstructionPhase) {
  return `${DEMO_INFLIGHT_PROJECT_ID}_anchor_${phase}`;
}

function buildAnchors(): Task[] {
  return (Object.keys(PHASE_WINDOWS) as ConstructionPhase[]).map((phase) => {
    const { startDate, endDate } = PHASE_WINDOWS[phase];
    const durationDays = Math.max(
      1,
      Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86_400_000),
    );
    const phaseName = phase[0].toUpperCase() + phase.slice(1);
    return {
      id: anchorId(phase),
      projectId: DEMO_INFLIGHT_PROJECT_ID,
      name: phaseName,
      phase,
      startDate,
      endDate,
      durationDays,
      percentComplete: 0, // rolled up from children
      status: 'not_started',
      dependencies: [],
      photoCount: 0,
      lastUpdated: TODAY,
      updateSource: 'manual',
      notes: [],
      isPhaseAnchor: true,
    };
  });
}

function buildChildren(): Task[] {
  const out: Task[] = [];
  for (const phase of Object.keys(PHASE_WINDOWS) as ConstructionPhase[]) {
    const window = PHASE_WINDOWS[phase];
    const milestones = DEFAULT_PHASE_MILESTONES[phase];
    const progress = CHILD_PROGRESS[phase];
    milestones.forEach((m, idx) => {
      const dates = milestoneDates(window.startDate, window.endDate, m);
      const p = progress[idx] ?? { pct: 0, status: 'not_started' as TaskStatus };
      out.push({
        id: `${DEMO_INFLIGHT_PROJECT_ID}_${phase}_${idx + 1}`,
        projectId: DEMO_INFLIGHT_PROJECT_ID,
        parentTaskId: anchorId(phase),
        name: m.name,
        phase,
        startDate: dates.startDate,
        endDate: dates.endDate,
        durationDays: dates.durationDays,
        percentComplete: p.pct,
        status: p.status,
        dependencies: [],
        photoCount: p.photoCount ?? 0,
        lastUpdated: TODAY,
        updateSource: 'manual',
        notes: [],
        isPhaseAnchor: false,
      });
    });
  }
  return out;
}

export const demoInflightTasks: Task[] = [...buildAnchors(), ...buildChildren()];

export const DEMO_INFLIGHT_PROJECT_META = {
  id: DEMO_INFLIGHT_PROJECT_ID,
  name: 'Hampstead Heights — Demo Build',
  client: 'Demo Client',
  description:
    'A pre-seeded sample showing what the Gantt looks like mid-construction. Excavation complete, foundation work mid-stream, all later phases scheduled with their canonical milestones visible.',
  startDate: '2026-04-01',
  endDate: '2026-12-31',
  createdAt: CREATED_AT,
};

// ─────────────────────────────────────────────────────────────────────────────
// Phase task catalog — the pick-list of candidate sub-tasks offered when you
// click "Add tasks" on a phase in the Gantt schedule. Choose one or many; each
// becomes a sub-task under that phase. A custom one-off can still be typed in
// the same dialog.
//
// THIS IS THE FILE TO EDIT. The lists below are seeded from the built-in
// milestone library so the picker is useful out of the box — replace / extend
// them with your own per-job, per-client task names. Plain strings only; the
// Gantt dates each added task automatically within the phase window.
//
// Only the 8 built-in phases have a catalog. Custom phases (added via
// "Add phase") show just the custom-add field.
// ─────────────────────────────────────────────────────────────────────────────

import type { ConstructionPhase } from '../../types';

export const PHASE_TASK_CATALOG: Record<ConstructionPhase, string[]> = {
  excavation: [
    'Site survey & layout',
    'Land clearing & demolition',
    'Erosion & sediment control',
    'Rough grading',
    'Foundation excavation',
    'Utility trenching',
    'Excavation for power cabling',
    'Excavation for irrigation',
  ],
  foundation: [
    'Footing layout & forms',
    'Footing pour & cure',
    'Foundation / stem walls',
    'Waterproofing & damp-proofing',
    'Foundation drainage',
    'Backfill & compaction',
    'Slab prep — vapor barrier & rebar',
    'Slab pour',
    'Foundation inspection',
  ],
  framing: [
    'Sill plates & mudsill anchors',
    'Floor framing & subfloor',
    'Exterior wall framing',
    'Interior wall framing',
    'Window & door rough openings',
    'Roof trusses / rafters',
    'Roof sheathing',
    'Wall sheathing & house wrap',
    'Framing inspection',
  ],
  roofing: [
    'Roof underlayment & ice barrier',
    'Drip edge & flashing',
    'Shingle / metal install',
    'Ridge vents & penetrations',
    'Gutters & downspouts',
  ],
  electrical: [
    'Service entry & meter base',
    'Main panel & sub-panels',
    'Rough-in wiring & boxes',
    'Lighting & fixture boxes',
    'Low-voltage rough (data, security)',
    'Electrical rough inspection',
  ],
  plumbing: [
    'Water service connection',
    'DWV rough-in (drain / waste / vent)',
    'Water supply rough-in',
    'Gas line rough-in',
    'Fixture rough-in & stub-outs',
    'Pressure test',
    'Plumbing rough inspection',
  ],
  drywall: [
    'Insulation install',
    'Insulation inspection',
    'Drywall hang',
    'Tape & mud — 3 coats',
    'Sand & texture',
    'Primer coat',
  ],
  finishing: [
    'Interior paint',
    'Flooring install',
    'Cabinetry & countertops',
    'Interior trim & doors',
    'Final plumbing fixtures',
    'Final electrical devices & fixtures',
    'Appliance install',
    'Final inspections',
    'Punch list & closeout',
  ],
};

// Candidate task names for a phase. Returns [] for anything not in the catalog
// (e.g. a custom phase), so the picker falls back to custom-add only.
export function tasksForPhase(phase: ConstructionPhase | string): string[] {
  return PHASE_TASK_CATALOG[phase as ConstructionPhase] ?? [];
}

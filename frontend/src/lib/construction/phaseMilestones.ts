// Phase-milestone library — the canonical set of sub-tasks that belong under
// each construction phase, in the order they're typically executed on a
// residential build. Used by:
//   • `data/demoInflightProject.ts` — to seed the demo Gantt with a realistic
//     in-flight project state.
//   • `pages/projects/lib/createProject.ts` — to pre-populate every new
//     project so site managers don't start from a blank schedule.
//
// The phase order itself is fixed by the `construction_phase` enum on the DB
// (Excavation → Finishing); within each phase the array order reflects the
// canonical execution sequence sourced from standard residential build
// schedules (Buildertrend / Procore / NAHB templates).
//
// Notes on ordering of Electrical vs Plumbing:
//   The DB enum lists Electrical before Plumbing. In real builds, plumbing
//   rough-in usually goes first because rigid DWV pipes route harder than
//   flexible electrical wire. The two phases overlap heavily in practice;
//   this app treats them as parallel work streams that can be tracked
//   independently. Don't reorder the enum — many call sites depend on it.

import type { ConstructionPhase } from '../../types';

export interface PhaseMilestone {
  /** Display name — used as the Task's `name` field. */
  name: string;
  /** Hint of which trade lead is responsible. Currently informational
   *  (tooltips, future filtering). Kept lightweight rather than wired to
   *  the User model so the library doesn't need test fixtures to evolve. */
  trade?: 'site' | 'concrete' | 'carpentry' | 'roofing' | 'electrical' | 'plumbing' | 'hvac' | 'drywall' | 'paint' | 'finish' | 'inspector';
  /** Position 0..1 of where this milestone starts within the phase window.
   *  Lets Gantt layout overlap milestones realistically — e.g. waterproofing
   *  can start before all stem walls are poured. */
  startOffset: number;
  /** Position 0..1 of where this milestone ends within the phase window. */
  endOffset: number;
}

// ─── Excavation / Site preparation ─────────────────────────────────────────
const EXCAVATION: PhaseMilestone[] = [
  { name: 'Site survey & layout',          trade: 'site',     startOffset: 0.00, endOffset: 0.12 },
  { name: 'Land clearing & demolition',    trade: 'site',     startOffset: 0.08, endOffset: 0.30 },
  { name: 'Erosion & sediment control',    trade: 'site',     startOffset: 0.20, endOffset: 0.35 },
  { name: 'Rough grading',                 trade: 'site',     startOffset: 0.30, endOffset: 0.55 },
  { name: 'Foundation excavation',         trade: 'site',     startOffset: 0.45, endOffset: 0.80 },
  { name: 'Utility trenching',             trade: 'site',     startOffset: 0.70, endOffset: 1.00 },
];

// ─── Foundation ────────────────────────────────────────────────────────────
const FOUNDATION: PhaseMilestone[] = [
  { name: 'Footing layout & forms',        trade: 'concrete', startOffset: 0.00, endOffset: 0.10 },
  { name: 'Footing pour & cure',           trade: 'concrete', startOffset: 0.08, endOffset: 0.22 },
  { name: 'Foundation / stem walls',       trade: 'concrete', startOffset: 0.20, endOffset: 0.45 },
  { name: 'Waterproofing & damp-proofing', trade: 'concrete', startOffset: 0.42, endOffset: 0.55 },
  { name: 'Foundation drainage',           trade: 'site',     startOffset: 0.50, endOffset: 0.65 },
  { name: 'Backfill & compaction',         trade: 'site',     startOffset: 0.60, endOffset: 0.72 },
  { name: 'Slab prep — vapor barrier & rebar', trade: 'concrete', startOffset: 0.68, endOffset: 0.82 },
  { name: 'Slab pour',                     trade: 'concrete', startOffset: 0.80, endOffset: 0.92 },
  { name: 'Foundation inspection',         trade: 'inspector', startOffset: 0.92, endOffset: 1.00 },
];

// ─── Framing (rough carpentry) ─────────────────────────────────────────────
const FRAMING: PhaseMilestone[] = [
  { name: 'Sill plates & mudsill anchors', trade: 'carpentry', startOffset: 0.00, endOffset: 0.08 },
  { name: 'Floor framing & subfloor',      trade: 'carpentry', startOffset: 0.05, endOffset: 0.25 },
  { name: 'Exterior wall framing',         trade: 'carpentry', startOffset: 0.20, endOffset: 0.50 },
  { name: 'Interior wall framing',         trade: 'carpentry', startOffset: 0.35, endOffset: 0.62 },
  { name: 'Window & door rough openings',  trade: 'carpentry', startOffset: 0.45, endOffset: 0.65 },
  { name: 'Roof trusses / rafters',        trade: 'carpentry', startOffset: 0.55, endOffset: 0.78 },
  { name: 'Roof sheathing',                trade: 'carpentry', startOffset: 0.72, endOffset: 0.85 },
  { name: 'Wall sheathing & house wrap',   trade: 'carpentry', startOffset: 0.78, endOffset: 0.92 },
  { name: 'Framing inspection',            trade: 'inspector', startOffset: 0.92, endOffset: 1.00 },
];

// ─── Roofing ───────────────────────────────────────────────────────────────
const ROOFING: PhaseMilestone[] = [
  { name: 'Roof underlayment & ice barrier', trade: 'roofing', startOffset: 0.00, endOffset: 0.20 },
  { name: 'Drip edge & flashing',            trade: 'roofing', startOffset: 0.15, endOffset: 0.35 },
  { name: 'Shingle / metal install',         trade: 'roofing', startOffset: 0.30, endOffset: 0.75 },
  { name: 'Ridge vents & penetrations',      trade: 'roofing', startOffset: 0.70, endOffset: 0.85 },
  { name: 'Gutters & downspouts',            trade: 'roofing', startOffset: 0.82, endOffset: 1.00 },
];

// ─── Electrical (rough-in) ─────────────────────────────────────────────────
const ELECTRICAL: PhaseMilestone[] = [
  { name: 'Service entry & meter base',    trade: 'electrical', startOffset: 0.00, endOffset: 0.15 },
  { name: 'Main panel & sub-panels',       trade: 'electrical', startOffset: 0.12, endOffset: 0.30 },
  { name: 'Rough-in wiring & boxes',       trade: 'electrical', startOffset: 0.25, endOffset: 0.65 },
  { name: 'Lighting & fixture boxes',      trade: 'electrical', startOffset: 0.55, endOffset: 0.78 },
  { name: 'Low-voltage rough (data, security)', trade: 'electrical', startOffset: 0.70, endOffset: 0.90 },
  { name: 'Electrical rough inspection',   trade: 'inspector', startOffset: 0.92, endOffset: 1.00 },
];

// ─── Plumbing (rough-in) ───────────────────────────────────────────────────
const PLUMBING: PhaseMilestone[] = [
  { name: 'Water service connection',      trade: 'plumbing',  startOffset: 0.00, endOffset: 0.15 },
  { name: 'DWV rough-in (drain / waste / vent)', trade: 'plumbing', startOffset: 0.10, endOffset: 0.40 },
  { name: 'Water supply rough-in',         trade: 'plumbing',  startOffset: 0.30, endOffset: 0.55 },
  { name: 'Gas line rough-in',             trade: 'plumbing',  startOffset: 0.50, endOffset: 0.65 },
  { name: 'Fixture rough-in & stub-outs',  trade: 'plumbing',  startOffset: 0.60, endOffset: 0.80 },
  { name: 'Pressure test',                 trade: 'plumbing',  startOffset: 0.78, endOffset: 0.90 },
  { name: 'Plumbing rough inspection',     trade: 'inspector', startOffset: 0.92, endOffset: 1.00 },
];

// ─── Drywall (incl. insulation, the prerequisite) ──────────────────────────
const DRYWALL: PhaseMilestone[] = [
  { name: 'Insulation install',            trade: 'drywall',   startOffset: 0.00, endOffset: 0.18 },
  { name: 'Insulation inspection',         trade: 'inspector', startOffset: 0.15, endOffset: 0.22 },
  { name: 'Drywall hang',                  trade: 'drywall',   startOffset: 0.20, endOffset: 0.45 },
  { name: 'Tape & mud — 3 coats',          trade: 'drywall',   startOffset: 0.40, endOffset: 0.72 },
  { name: 'Sand & texture',                trade: 'drywall',   startOffset: 0.68, endOffset: 0.85 },
  { name: 'Primer coat',                   trade: 'paint',     startOffset: 0.82, endOffset: 1.00 },
];

// ─── Finishing (interior + final fixtures + closeout) ──────────────────────
const FINISHING: PhaseMilestone[] = [
  { name: 'Interior paint',                trade: 'paint',     startOffset: 0.00, endOffset: 0.20 },
  { name: 'Flooring install',              trade: 'finish',    startOffset: 0.15, endOffset: 0.42 },
  { name: 'Cabinetry & countertops',       trade: 'finish',    startOffset: 0.30, endOffset: 0.55 },
  { name: 'Interior trim & doors',         trade: 'finish',    startOffset: 0.45, endOffset: 0.65 },
  { name: 'Final plumbing fixtures',       trade: 'plumbing',  startOffset: 0.55, endOffset: 0.72 },
  { name: 'Final electrical devices & fixtures', trade: 'electrical', startOffset: 0.60, endOffset: 0.78 },
  { name: 'Appliance install',             trade: 'finish',    startOffset: 0.70, endOffset: 0.82 },
  { name: 'Final inspections',             trade: 'inspector', startOffset: 0.82, endOffset: 0.92 },
  { name: 'Punch list & closeout',         trade: 'finish',    startOffset: 0.88, endOffset: 1.00 },
];

export const DEFAULT_PHASE_MILESTONES: Record<ConstructionPhase, PhaseMilestone[]> = {
  excavation: EXCAVATION,
  foundation: FOUNDATION,
  framing:    FRAMING,
  roofing:    ROOFING,
  electrical: ELECTRICAL,
  plumbing:   PLUMBING,
  drywall:    DRYWALL,
  finishing:  FINISHING,
};

/** Number of default milestones per phase. Useful for previews & headers. */
export function countDefaultMilestones(phase: ConstructionPhase): number {
  return DEFAULT_PHASE_MILESTONES[phase].length;
}

/** Total default milestones across the full schedule. ~57 today. */
export function totalDefaultMilestones(): number {
  return Object.values(DEFAULT_PHASE_MILESTONES).reduce((sum, list) => sum + list.length, 0);
}

/** Lay out a milestone's dates within a phase window using its start/end
 *  offsets. Returns an ISO date pair clamped to the window. */
export function milestoneDates(
  phaseStart: string,
  phaseEnd: string,
  milestone: PhaseMilestone,
): { startDate: string; endDate: string; durationDays: number } {
  const startMs = new Date(phaseStart).getTime();
  const endMs = new Date(phaseEnd).getTime();
  const windowMs = Math.max(86_400_000, endMs - startMs);
  const s = new Date(startMs + windowMs * milestone.startOffset);
  const e = new Date(startMs + windowMs * milestone.endOffset);
  return {
    startDate: s.toISOString().slice(0, 10),
    endDate: e.toISOString().slice(0, 10),
    durationDays: Math.max(1, Math.round((e.getTime() - s.getTime()) / 86_400_000)),
  };
}

// Per-phase color palette for the Gantt timeline.
//
// Each construction phase gets a single saturated base color + pre-baked
// alpha variants so the consumer doesn't have to assemble `rgba()` strings
// at render time. The palette is semantic — colours evoke the material or
// trade of each phase rather than being arbitrary categorical hues:
//
//   excavation → earth-brown
//   foundation → concrete-slate
//   framing    → wood-amber/orange
//   roofing    → terracotta-red
//   electrical → copper-gold
//   plumbing   → pipe-blue
//   drywall    → gypsum-gray
//   finishing  → emerald (matches the app's accent so the final phase
//                ties back to the editorial brand)
//
// The 8-digit hex form (`#RRGGBBAA`) works in every modern browser CSS
// context — `border-color`, `background-color`, gradient stops. Alpha
// suffixes used here:
//   - `1A` ≈ 10% (light background tint behind empty bars)
//   - `99` ≈ 60% (filled-progress segment over the tint)
//
// Reused by:
//   - TasksTab anchor-bar rendering (timeline)
//   - AI-Analysis tab phase chip selector (planned)
//   - Anywhere a phase needs a visual identifier (badges, dots, etc.)

import type { ConstructionPhase } from '../ai/contract';

export interface PhaseColor {
  /** Saturated base color. Use for the bar's border + the accent dot in the
   *  phase row's name column. */
  color: string;
  /** Light tint (~10% alpha) for the empty bar background — provides
   *  contrast with the surrounding white row without dominating. */
  tint: string;
  /** Medium overlay (~60% alpha) for the filled progress segment. */
  fill: string;
  /** Human-readable label for chips, tooltips, accessible names. */
  label: string;
}

export const PHASE_COLORS: Record<ConstructionPhase, PhaseColor> = {
  excavation: { color: '#78350F', tint: '#78350F1A', fill: '#78350F99', label: 'Excavation' },
  foundation: { color: '#475569', tint: '#4755691A', fill: '#47556999', label: 'Foundation' },
  framing:    { color: '#C2410C', tint: '#C2410C1A', fill: '#C2410C99', label: 'Framing'    },
  roofing:    { color: '#B91C1C', tint: '#B91C1C1A', fill: '#B91C1C99', label: 'Roofing'    },
  electrical: { color: '#CA8A04', tint: '#CA8A041A', fill: '#CA8A0499', label: 'Electrical' },
  plumbing:   { color: '#0369A1', tint: '#0369A11A', fill: '#0369A199', label: 'Plumbing'   },
  drywall:    { color: '#94A3B8', tint: '#94A3B81A', fill: '#94A3B899', label: 'Drywall'    },
  finishing:  { color: '#059669', tint: '#0596691A', fill: '#05966999', label: 'Finishing'  },
};

/** Safe accessor — falls back to the editorial emerald if a future phase
 *  somehow slips past the type system. */
export function phaseColor(phase: ConstructionPhase | string | null | undefined): PhaseColor {
  if (phase && phase in PHASE_COLORS) {
    return PHASE_COLORS[phase as ConstructionPhase];
  }
  return PHASE_COLORS.finishing;
}

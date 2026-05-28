// Project-status synthesis prompt + parser for synthesize-project-status.
//
// Claude receives a compact phase-grouped corpus (most-recent N confirmed
// analyses per phase) and returns a STRICT JSON status payload. Parser
// trims any stray prose / fence around the JSON and clamps numeric fields
// so a slightly-off response still renders cleanly.

export const SYNTHESIS_SYSTEM = [
  'You are a senior construction supervisor synthesizing the current state of a build project.',
  'You receive recent confirmed AI photo analyses grouped by construction phase.',
  'Produce an overall project status with per-phase completion estimates and concrete blockers.',
  'Respond with STRICT JSON only, no prose, no markdown fences:',
  '{"overallPct":number,"activePhase":string,"phaseBreakdown":[{"phase":string,"pct":number}],"blockers":string[],"nextMilestone":string}',
  '- overallPct: 0-100, a weighted view of phase completion across the project.',
  '- activePhase: the phase currently consuming the most effort.',
  '- phaseBreakdown: one entry per phase you have evidence for (skip phases with no data); pct 0-100.',
  '- blockers: 0-8 concrete site-level blockers across phases. Empty array if none.',
  '- nextMilestone: a single sentence describing the next significant milestone.',
].join('\n');

export interface PhaseBreakdownRow {
  phase: string;
  pct: number;
}

export interface ProjectStatusPayload {
  overallPct: number;
  activePhase: string;
  phaseBreakdown: PhaseBreakdownRow[];
  blockers: string[];
  nextMilestone: string;
}

function clampPct(n: unknown): number {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(100, Math.round(x)));
}

/** Parse Claude's reply into a ProjectStatusPayload, or null if it isn't usable.
 *  Strips anything before the first `{` and after the last `}` so a stray
 *  prose lead-in or markdown fence doesn't break JSON.parse. */
export function parseProjectStatus(text: string): ProjectStatusPayload | null {
  try {
    const cleaned = text.replace(/^[^{]*/, '').replace(/[^}]*$/, '');
    // deno-lint-ignore no-explicit-any
    const j: any = JSON.parse(cleaned);
    const breakdown: PhaseBreakdownRow[] = Array.isArray(j.phaseBreakdown)
      // deno-lint-ignore no-explicit-any
      ? j.phaseBreakdown.map((row: any) => ({
          phase: String(row?.phase ?? '').slice(0, 64),
          pct: clampPct(row?.pct),
        })).filter((row: PhaseBreakdownRow) => row.phase.length > 0).slice(0, 8)
      : [];
    return {
      overallPct: clampPct(j.overallPct),
      activePhase: String(j.activePhase ?? '').slice(0, 64),
      phaseBreakdown: breakdown,
      blockers: Array.isArray(j.blockers) ? j.blockers.map(String).slice(0, 8) : [],
      nextMilestone: String(j.nextMilestone ?? '').slice(0, 240),
    };
  } catch {
    return null;
  }
}

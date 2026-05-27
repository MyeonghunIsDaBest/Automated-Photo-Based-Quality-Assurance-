// Phase-completion verdict prompt + parser for the complete-phase function.
//
// The system prompt is a plain string (well under the ~2048-token cache floor,
// so the cache_control marker in callAnthropic is a harmless no-op here). It
// instructs Claude to return STRICT JSON so parsePhaseVerdict can branch
// without prose-stripping heuristics beyond trimming to the first/last brace.

export const PHASE_VERDICT_SYSTEM = [
  'You are a senior construction supervisor reviewing whether a build phase is complete.',
  'You receive a corpus of confirmed AI photo analyses (rationales + completion %) for one phase.',
  'Decide if the phase is complete enough to move on.',
  'Respond with STRICT JSON only, no prose, no markdown fences:',
  '{"status":"complete"|"incomplete","verdict":string,"blockers":string[],"readyForNext":boolean}',
  '- verdict: 1-2 sentences a site manager would accept.',
  '- blockers: concrete outstanding items; [] if none.',
  '- readyForNext: true only when there are no blockers and coverage looks sufficient.',
].join('\n');

export interface PhaseVerdict {
  status: 'complete' | 'incomplete';
  verdict: string;
  blockers: string[];
  readyForNext: boolean;
}

/** Parse Claude's reply into a PhaseVerdict, or null if it isn't usable JSON.
 *  Trims anything before the first `{` and after the last `}` so a stray
 *  markdown fence or lead-in sentence doesn't break JSON.parse. */
export function parsePhaseVerdict(text: string): PhaseVerdict | null {
  try {
    const cleaned = text.replace(/^[^{]*/, '').replace(/[^}]*$/, '');
    const j = JSON.parse(cleaned);
    if (j.status !== 'complete' && j.status !== 'incomplete') return null;
    return {
      status: j.status,
      verdict: String(j.verdict ?? '').slice(0, 600),
      blockers: Array.isArray(j.blockers) ? j.blockers.map(String).slice(0, 12) : [],
      readyForNext: Boolean(j.readyForNext),
    };
  } catch {
    return null;
  }
}

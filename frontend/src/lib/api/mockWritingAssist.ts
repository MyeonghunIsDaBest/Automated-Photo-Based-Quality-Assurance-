// Client-side mock writing assistant.
//
// Three deterministic transforms that turn rough field notes into prose that
// reads like a project engineer wrote it. Pure functions over input strings
// + a small context object (weather + crew). No randomness, no Anthropic
// call — the same input always produces the same output so the demo is
// repeatable. A swappable shim for a real Claude call later: the public
// signature is the contract we want to preserve.
//
// V1 mounts on Site Diary's "Description of works" textarea (highest-volume
// free-text field). Future surfaces (Punch / Reports / Incident reports)
// will reuse the runtime + hook + button without changes.

import type { WeatherKind } from '../../pages/gantt/types';

// Minimal structural personnel shape — accepts both `DiaryPersonnel[]`
// (post-save, with ids) and `Omit<DiaryPersonnel, 'id'>[]` (pre-save form
// state) so callers don't have to massage their type before passing it in.
export interface WritingContextPersonnel {
  company?: string;
}

// Stamp every assistant output with this so future audit / persistence can
// distinguish mock-generated text from real-AI text or human-written text.
export const WRITING_ASSIST_MODEL_TAG = 'mock-writer@v1';

export type WritingTransform = 'improve' | 'expand_with_context' | 'tighten';

export interface WritingContext {
  /** ISO date — added to the expanded-context preface. */
  date?: string;
  weather?: WeatherKind;
  temperatureC?: number;
  personnel?: WritingContextPersonnel[];
}

export interface WritingAssistResult {
  improved: string;
  rationale: string;
  latencyMs: number;
  /** Real-AI populates the model identifier (e.g. `claude-sonnet-4-6`). The
   *  mock leaves this undefined so callers can render "Real · {model}" or
   *  "Mock" without further plumbing. */
  model?: string;
}

// Simulate AI latency so the UI shows a real loading state. 600 ms matches
// the mock-AI batch cadence so the two features feel like siblings.
const SIMULATED_LATENCY_MS = 600;

// Construction-domain shorthand → expansion. Keep it small + obvious; over-
// matching makes the output uncanny. Add entries when Casone's diary reveals
// patterns worth normalising.
const SHORTHAND_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bsmoko\b/gi, 'morning break'],
  [/\brebar\b/g, 'rebar (reinforcing steel)'],
  [/\bRDO\b/g, 'rostered day off'],
  [/\bSWMS\b/g, 'safe work method statement'],
  [/\bITP\b/g, 'inspection test plan'],
  [/\bRFI\b/g, 'request for information'],
  [/\bsubbie\b/gi, 'subcontractor'],
  [/\bchippie\b/gi, 'carpenter'],
  [/\bsparkie\b/gi, 'electrician'],
];

// Filler words / phrases the `tighten` transform strips. Match whole tokens
// only (word boundaries) so we don't mangle "basic" → "" inside other words.
const FILLER_PHRASES: RegExp[] = [
  /\bbasically\b/gi,
  /\bkind of\b/gi,
  /\bsort of\b/gi,
  /\bwe just\b/gi,
  /\bjust\b/gi,
  /\breally\b/gi,
  /\bvery\b/gi,
  /\bquite\b/gi,
  /\bsuper\b/gi,
];

const WEATHER_LABEL: Record<WeatherKind, string> = {
  sunny:  'Clear',
  cloudy: 'Cloudy',
  rain:   'Rain',
  storm:  'Stormy',
};

// ─── Transforms ─────────────────────────────────────────────────────────────

// 1. Capitalise sentence-initial letters.
// 2. Replace shorthand from the map above.
// 3. Trim and ensure trailing period.
function improveText(text: string): string {
  let out = text.trim();
  for (const [pattern, replacement] of SHORTHAND_REPLACEMENTS) {
    out = out.replace(pattern, replacement);
  }
  // Capitalise the start of each sentence (after `.`, `!`, `?` + whitespace).
  out = out.replace(/(^|[.!?]\s+)([a-z])/g, (_match, lead, letter) => lead + letter.toUpperCase());
  // Ensure trailing punctuation.
  if (out.length > 0 && !/[.!?]$/.test(out)) out += '.';
  return out;
}

// Prepend a one-sentence summary of weather + crew based on the context.
// The body is run through `improveText` so the combined output is clean.
function expandWithContext(text: string, ctx: WritingContext): string {
  const body = improveText(text);
  const preface = buildPreface(ctx);
  return preface ? `${preface} ${body}` : body;
}

function buildPreface(ctx: WritingContext): string {
  const parts: string[] = [];
  if (ctx.weather) {
    const label = WEATHER_LABEL[ctx.weather];
    const temp = typeof ctx.temperatureC === 'number' ? `, ${ctx.temperatureC}°C` : '';
    parts.push(`${label}${temp}`);
  }
  if (ctx.personnel && ctx.personnel.length > 0) {
    parts.push(`crew of ${ctx.personnel.length} on site${describeCrew(ctx.personnel)}`);
  }
  if (parts.length === 0) return '';
  // Capitalise first word, end with a full stop.
  const sentence = parts.join('. ');
  return sentence.charAt(0).toUpperCase() + sentence.slice(1) + '.';
}

function describeCrew(personnel: WritingContextPersonnel[]): string {
  // Group by company → "4 from Casone Electrical, 2 from Aetna Civil".
  if (personnel.length === 0) return '';
  const byCompany = new Map<string, number>();
  for (const p of personnel) {
    const c = (p.company || 'Casone Electrical').trim();
    byCompany.set(c, (byCompany.get(c) ?? 0) + 1);
  }
  const fragments = Array.from(byCompany.entries()).map(([company, n]) => `${n} from ${company}`);
  return ` (${fragments.join(', ')})`;
}

// Strip filler words + collapse runs of sentences into a brisk join with
// semicolons. Useful when the input is several short sentences and the
// reporter wants a single dense line.
function tightenText(text: string): string {
  let out = text.trim();
  for (const pattern of FILLER_PHRASES) out = out.replace(pattern, '');
  // Collapse multiple spaces and clean up dangling whitespace before punctuation.
  out = out.replace(/\s+/g, ' ').replace(/\s+([.,;:!?])/g, '$1').trim();
  // Split on sentence terminators, rejoin with semicolons for diary brevity.
  // Preserve the final terminator (default to period).
  const sentences = out
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.replace(/[.!?]+$/, '').trim())
    .filter(Boolean);
  if (sentences.length === 0) return '';
  const joined = sentences.join('; ');
  // Capitalise the very first letter; ensure a single trailing period.
  const capped = joined.charAt(0).toUpperCase() + joined.slice(1);
  return capped.endsWith('.') ? capped : `${capped}.`;
}

// ─── Public entry point ─────────────────────────────────────────────────────

const RATIONALE: Record<WritingTransform, string> = {
  improve:             'Fixed capitalisation and punctuation; expanded site shorthand.',
  expand_with_context: 'Prepended a weather + crew summary line before the description.',
  tighten:             'Removed filler words and joined sentences for diary brevity.',
};

export async function mockWritingAssist(
  transform: WritingTransform,
  text: string,
  context: WritingContext = {},
): Promise<WritingAssistResult> {
  await sleep(SIMULATED_LATENCY_MS);
  let improved: string;
  switch (transform) {
    case 'improve':             improved = improveText(text); break;
    case 'expand_with_context': improved = expandWithContext(text, context); break;
    case 'tighten':             improved = tightenText(text); break;
  }
  return {
    improved,
    rationale: RATIONALE[transform],
    latencyMs: SIMULATED_LATENCY_MS,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

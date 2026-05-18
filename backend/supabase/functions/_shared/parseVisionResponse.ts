// Parses Claude Vision's JSON response into an AnalysisResult.
//
// Defensive against the failure modes a real model exhibits in the wild:
//   • Markdown fence wrapping (```json ... ```) the model occasionally emits
//     despite the system prompt forbidding it.
//   • Confidence / completionPct out of range — clamped.
//   • Unknown enum values for safetyFlags/qualityFlags — filtered.
//   • suggestedTask / rationale / materials overlong — capped.
//   • Missing or null fields — replaced with safe defaults.
//
// Returns AnalysisResult always. If parsing fails or the input is empty, the
// returned result has modelUsed='failed' so audit + UI can detect it.
//
// Pure function. No I/O. Safe to import into the vitest harness from the
// frontend test runner (no `https://` deps).

import type {
  AnalysisResult,
  ConstructionPhase,
  SafetyFlag,
  QualityFlag,
} from './contract.ts';
import {
  CONSTRUCTION_PHASES,
  SAFETY_FLAGS,
  QUALITY_FLAGS,
} from './contract.ts';

const PHASE_SET = new Set<ConstructionPhase>(CONSTRUCTION_PHASES);
const SAFETY_SET = new Set<SafetyFlag>(SAFETY_FLAGS);
const QUALITY_SET = new Set<QualityFlag>(QUALITY_FLAGS);

// Length caps. Match the system prompt's stated bounds so the contract is
// consistent: prompt says "max 80 chars" for suggestedTask, "1-3 sentences"
// for rationale (we cap at 1000 chars defensively), "max 10 items" for
// materials. Individual material strings capped at 60 chars to keep the
// audit_log row reasonable.
const MAX_MATERIALS = 10;
const MAX_MATERIAL_LEN = 60;
const MAX_SUGGESTED_TASK_LEN = 80;
const MAX_RATIONALE_LEN = 1000;

export function parseVisionResponse(text: string, model: string): AnalysisResult {
  const cleaned = stripMarkdownFences(text.trim());
  if (!cleaned) {
    return failureResult(model, 'empty_response');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return failureResult(model, `invalid_json: ${detail.slice(0, 100)}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return failureResult(model, 'not_an_object');
  }

  const obj = parsed as Record<string, unknown>;
  return {
    modelUsed:      model,
    phaseDetected:  validatePhase(obj.phaseDetected),
    completionPct:  clampInt(toNumber(obj.completionPct), 0, 100),
    confidence:     clampFloat(toNumber(obj.confidence), 0, 1),
    safetyFlags:    filterEnum(obj.safetyFlags, SAFETY_SET),
    qualityFlags:   filterEnum(obj.qualityFlags, QUALITY_SET),
    materials:      coerceMaterials(obj.materials),
    suggestedTask:  coerceSuggestedTask(obj.suggestedTask),
    rationale:      coerceRationale(obj.rationale),
    rawResponse:    parsed,
  };
}

// Exported so analyze-photo/index.ts can synthesise its own failure rows on
// pre-call errors (Storage download miss, missing API key, etc.) without
// having to drive a fake model response through parseVisionResponse.
export function failureResult(attemptedModel: string, rationale: string): AnalysisResult {
  return {
    modelUsed:      'failed',
    phaseDetected:  null,
    completionPct:  0,
    confidence:     0,
    safetyFlags:    [],
    qualityFlags:   [],
    materials:      [],
    suggestedTask:  null,
    rationale,
    rawResponse:    { error: true, attemptedModel, rationale },
  };
}

// ── helpers ────────────────────────────────────────────────────────────────

function stripMarkdownFences(s: string): string {
  // Match a leading ```json or ``` fence wrapping the whole payload. The
  // system prompt forbids these but real models still emit them on edge
  // cases — strip rather than fail.
  const fenced = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fenced ? fenced[1].trim() : s;
}

function toNumber(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function clampInt(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(v)));
}

function clampFloat(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function validatePhase(v: unknown): ConstructionPhase | null {
  return typeof v === 'string' && PHASE_SET.has(v as ConstructionPhase)
    ? (v as ConstructionPhase)
    : null;
}

function filterEnum<T extends string>(v: unknown, allowed: Set<T>): T[] {
  if (!Array.isArray(v)) return [];
  const out: T[] = [];
  const seen = new Set<T>();
  for (const item of v) {
    if (typeof item === 'string' && allowed.has(item as T) && !seen.has(item as T)) {
      out.push(item as T);
      seen.add(item as T);
    }
  }
  return out;
}

function coerceMaterials(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    out.push(trimmed.slice(0, MAX_MATERIAL_LEN));
    if (out.length >= MAX_MATERIALS) break;
  }
  return out;
}

function coerceSuggestedTask(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s) return null;
  return s.slice(0, MAX_SUGGESTED_TASK_LEN);
}

function coerceRationale(v: unknown): string {
  if (typeof v !== 'string') return '';
  return v.slice(0, MAX_RATIONALE_LEN);
}

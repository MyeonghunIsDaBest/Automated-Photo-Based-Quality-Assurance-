import { describe, it, expect } from 'vitest';
import {
  VISION_PROMPT_VERSION,
  VISION_SYSTEM_PROMPT,
  buildUserPrompt,
} from '../../../backend/supabase/functions/_shared/visionPrompt';
import {
  parseVisionResponse,
  failureResult,
} from '../../../backend/supabase/functions/_shared/parseVisionResponse';

// Vitest can compile the Deno-side _shared files directly because they have
// no `https://` imports (only relative type imports from contract.ts, which
// itself is type/const-only). Same pattern as decideAction.test.ts.

// ─────────────────────────────────────────────────────────────────────────
// VISION_PROMPT_VERSION + VISION_SYSTEM_PROMPT
// ─────────────────────────────────────────────────────────────────────────

describe('VISION_PROMPT_VERSION', () => {
  it('follows the dated-version pattern YYYY-MM-DD-vN', () => {
    expect(VISION_PROMPT_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}-v\d+$/);
  });
});

describe('VISION_SYSTEM_PROMPT', () => {
  // Coverage check — drift between contract.ts and visionPrompt.ts is the
  // most likely silent failure (adding a new SafetyFlag to contract without
  // updating the prompt). This test catches that the moment a value lands.
  const PHASES = [
    'excavation','foundation','framing','roofing',
    'electrical','plumbing','drywall','finishing',
  ];
  const SAFETY = [
    'no_hard_hat','exposed_wiring','fall_hazard',
    'unsecured_load','housekeeping','signage_missing',
  ];
  const QUALITY = [
    'misalignment','damage','incomplete_seal',
    'wrong_material','measurement_off','finish_defect',
  ];

  it.each(PHASES)('names ConstructionPhase value %s', (phase) => {
    expect(VISION_SYSTEM_PROMPT).toContain(phase);
  });

  it.each(SAFETY)('names SafetyFlag value %s', (flag) => {
    expect(VISION_SYSTEM_PROMPT).toContain(flag);
  });

  it.each(QUALITY)('names QualityFlag value %s', (flag) => {
    expect(VISION_SYSTEM_PROMPT).toContain(flag);
  });

  it('demands JSON-only output (no markdown fences)', () => {
    expect(VISION_SYSTEM_PROMPT).toMatch(/JSON object only/i);
    expect(VISION_SYSTEM_PROMPT).toMatch(/no markdown fences/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// buildUserPrompt
// ─────────────────────────────────────────────────────────────────────────

describe('buildUserPrompt', () => {
  it('returns prompt text without operator hint when phaseHint is undefined', () => {
    const out = buildUserPrompt();
    expect(out).toContain('Return the JSON object now.');
    expect(out).not.toContain('Operator hint');
  });

  it('returns prompt text without operator hint when phaseHint is null', () => {
    const out = buildUserPrompt(null);
    expect(out).not.toContain('Operator hint');
  });

  it('includes the operator hint when phaseHint is provided', () => {
    const out = buildUserPrompt('framing');
    expect(out).toContain('Operator hint');
    expect(out).toContain('framing');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// parseVisionResponse — the 5 scenarios from the May 20 plan + extras
// ─────────────────────────────────────────────────────────────────────────

const MODEL = 'claude-sonnet-4-6';

const validRaw = JSON.stringify({
  phaseDetected: 'framing',
  completionPct: 65,
  confidence: 0.88,
  safetyFlags: [],
  qualityFlags: [],
  materials: ['Rondo steel studs', 'timber noggins'],
  suggestedTask: 'Install gyprock on Level 2 north wall',
  rationale: 'Framing visibly complete on the north wall — Rondo studs at standard spacing, top plates level. Ready for trades.',
});

describe('parseVisionResponse', () => {
  // ── 1. parse-success ────────────────────────────────────────────────
  it('parses a complete valid response into AnalysisResult', () => {
    const out = parseVisionResponse(validRaw, MODEL);
    expect(out.modelUsed).toBe(MODEL);
    expect(out.phaseDetected).toBe('framing');
    expect(out.completionPct).toBe(65);
    expect(out.confidence).toBe(0.88);
    expect(out.materials).toEqual(['Rondo steel studs', 'timber noggins']);
    expect(out.rationale).toContain('Rondo studs');
    expect(out.suggestedTask).toBe('Install gyprock on Level 2 north wall');
  });

  // ── 2. parse-failure ────────────────────────────────────────────────
  it('returns failureResult when text is not JSON', () => {
    const out = parseVisionResponse('this is not json', MODEL);
    expect(out.modelUsed).toBe('failed');
    expect(out.confidence).toBe(0);
    expect(out.completionPct).toBe(0);
    expect(out.rationale).toMatch(/invalid_json/);
  });

  it('returns failureResult when text is empty', () => {
    const out = parseVisionResponse('', MODEL);
    expect(out.modelUsed).toBe('failed');
    expect(out.rationale).toBe('empty_response');
  });

  it('returns failureResult when parsed value is not an object', () => {
    const out = parseVisionResponse(JSON.stringify(['array', 'not', 'object']), MODEL);
    expect(out.modelUsed).toBe('failed');
    expect(out.rationale).toBe('not_an_object');
  });

  // ── 3. confidence-clamp + completionPct-clamp ───────────────────────
  it('clamps confidence above 1 down to 1, and completionPct above 100 down to 100', () => {
    const raw = JSON.stringify({
      phaseDetected: 'electrical',
      completionPct: 150,
      confidence: 1.7,
      safetyFlags: [],
      qualityFlags: [],
      materials: [],
      suggestedTask: null,
      rationale: '',
    });
    const out = parseVisionResponse(raw, MODEL);
    expect(out.confidence).toBe(1);
    expect(out.completionPct).toBe(100);
  });

  it('clamps negative confidence + completionPct to 0', () => {
    const raw = JSON.stringify({
      phaseDetected: null,
      completionPct: -25,
      confidence: -0.3,
      safetyFlags: [],
      qualityFlags: [],
      materials: [],
      suggestedTask: null,
      rationale: '',
    });
    const out = parseVisionResponse(raw, MODEL);
    expect(out.confidence).toBe(0);
    expect(out.completionPct).toBe(0);
  });

  // ── 4. unknown-flag-filtered ────────────────────────────────────────
  it('filters unknown safety + quality flags while preserving valid ones', () => {
    const raw = JSON.stringify({
      phaseDetected: 'framing',
      completionPct: 50,
      confidence: 0.7,
      safetyFlags: ['no_hard_hat', 'made_up_flag', 'fall_hazard'],
      qualityFlags: ['misalignment', 'not_a_flag', 'misalignment'], // also tests dedup
      materials: [],
      suggestedTask: null,
      rationale: '',
    });
    const out = parseVisionResponse(raw, MODEL);
    expect(out.safetyFlags).toEqual(['no_hard_hat', 'fall_hazard']);
    expect(out.qualityFlags).toEqual(['misalignment']); // dedup'd
  });

  it('returns empty flag arrays when input flags are not arrays', () => {
    const raw = JSON.stringify({
      phaseDetected: 'framing',
      completionPct: 50,
      confidence: 0.7,
      safetyFlags: 'not an array',
      qualityFlags: null,
      materials: [],
      suggestedTask: null,
      rationale: '',
    });
    const out = parseVisionResponse(raw, MODEL);
    expect(out.safetyFlags).toEqual([]);
    expect(out.qualityFlags).toEqual([]);
  });

  // ── 5. markdown fence stripping ─────────────────────────────────────
  it('strips ```json ... ``` markdown fences if the model wraps the JSON', () => {
    const fenced = '```json\n' + validRaw + '\n```';
    const out = parseVisionResponse(fenced, MODEL);
    expect(out.modelUsed).toBe(MODEL);
    expect(out.phaseDetected).toBe('framing');
  });

  it('strips bare ``` fences without a language tag', () => {
    const fenced = '```\n' + validRaw + '\n```';
    const out = parseVisionResponse(fenced, MODEL);
    expect(out.phaseDetected).toBe('framing');
  });

  // ── 6. enum validation for phaseDetected ────────────────────────────
  it('coerces invalid phaseDetected to null', () => {
    const raw = JSON.stringify({
      phaseDetected: 'totally_made_up_phase',
      completionPct: 50,
      confidence: 0.7,
      safetyFlags: [],
      qualityFlags: [],
      materials: [],
      suggestedTask: null,
      rationale: '',
    });
    const out = parseVisionResponse(raw, MODEL);
    expect(out.phaseDetected).toBeNull();
  });

  // ── 7. length caps ──────────────────────────────────────────────────
  it('caps materials at 10 entries and trims overlong strings to 60 chars', () => {
    const longString = 'x'.repeat(120);
    const tooMany = Array.from({ length: 15 }, (_, i) => `material_${i}`);
    const raw = JSON.stringify({
      phaseDetected: 'finishing',
      completionPct: 90,
      confidence: 0.9,
      safetyFlags: [],
      qualityFlags: [],
      materials: [...tooMany, longString],
      suggestedTask: null,
      rationale: '',
    });
    const out = parseVisionResponse(raw, MODEL);
    expect(out.materials.length).toBe(10);
    expect(out.materials.every((m) => m.length <= 60)).toBe(true);
  });

  it('caps suggestedTask at 80 chars and trims whitespace', () => {
    const raw = JSON.stringify({
      phaseDetected: 'plumbing',
      completionPct: 40,
      confidence: 0.75,
      safetyFlags: [],
      qualityFlags: [],
      materials: [],
      suggestedTask: '   ' + 'x'.repeat(200) + '   ',
      rationale: '',
    });
    const out = parseVisionResponse(raw, MODEL);
    expect(out.suggestedTask).not.toBeNull();
    expect(out.suggestedTask!.length).toBeLessThanOrEqual(80);
  });

  it('caps rationale at 1000 chars', () => {
    const raw = JSON.stringify({
      phaseDetected: 'foundation',
      completionPct: 30,
      confidence: 0.85,
      safetyFlags: [],
      qualityFlags: [],
      materials: [],
      suggestedTask: null,
      rationale: 'r'.repeat(5000),
    });
    const out = parseVisionResponse(raw, MODEL);
    expect(out.rationale.length).toBe(1000);
  });

  // ── 8. defensive defaults ───────────────────────────────────────────
  it('returns safe defaults when fields are missing', () => {
    const raw = JSON.stringify({}); // every field missing
    const out = parseVisionResponse(raw, MODEL);
    expect(out.modelUsed).toBe(MODEL);
    expect(out.phaseDetected).toBeNull();
    expect(out.completionPct).toBe(0);
    expect(out.confidence).toBe(0);
    expect(out.safetyFlags).toEqual([]);
    expect(out.qualityFlags).toEqual([]);
    expect(out.materials).toEqual([]);
    expect(out.suggestedTask).toBeNull();
    expect(out.rationale).toBe('');
  });

  it('coerces string-typed numerics if the model emits "0.88" instead of 0.88', () => {
    const raw = JSON.stringify({
      phaseDetected: 'roofing',
      completionPct: '75',     // string instead of number
      confidence: '0.88',      // string instead of number
      safetyFlags: [],
      qualityFlags: [],
      materials: [],
      suggestedTask: null,
      rationale: '',
    });
    const out = parseVisionResponse(raw, MODEL);
    expect(out.completionPct).toBe(75);
    expect(out.confidence).toBe(0.88);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// failureResult — exported sibling for pre-call errors
// ─────────────────────────────────────────────────────────────────────────

describe('failureResult', () => {
  it('returns a marker AnalysisResult with modelUsed=failed and the given rationale', () => {
    const r = failureResult(MODEL, 'storage_download_failed');
    expect(r.modelUsed).toBe('failed');
    expect(r.confidence).toBe(0);
    expect(r.completionPct).toBe(0);
    expect(r.rationale).toBe('storage_download_failed');
    expect(r.safetyFlags).toEqual([]);
    expect(r.qualityFlags).toEqual([]);
    expect(r.materials).toEqual([]);
    expect(r.suggestedTask).toBeNull();
    expect(r.phaseDetected).toBeNull();
  });

  it('preserves the attempted model in rawResponse for replay', () => {
    const r = failureResult(MODEL, 'rate_limited');
    expect((r.rawResponse as { attemptedModel?: string }).attemptedModel).toBe(MODEL);
  });
});

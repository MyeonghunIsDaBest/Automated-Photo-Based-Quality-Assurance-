import { describe, it, expect } from 'vitest';
import type { AnalysisResult } from '../lib/ai/contract';
import { decideAction } from '../../../backend/supabase/functions/_shared/decideAction';

// Pure-function test of the Photo-QA action rule. Imports the Deno-side helper
// directly because that file is byte-equivalent to the frontend (the parity
// script enforces it). Vitest is happy compiling the .ts as TS.
//
// Thresholds are now passed explicitly so the rule's behaviour stays pinned
// to a single set of numbers in the tests, regardless of what the
// per-project config defaults to. The values below mirror today's hardcoded
// `CONFIDENCE_AUTO_UPDATE` / `CONFIDENCE_REVIEW_QUEUE` so existing
// assertions stay green.
const T = { autoUpdate: 0.85, reviewQueue: 0.5 };

function result(partial: Partial<AnalysisResult>): AnalysisResult {
  return {
    modelUsed: 'mvp-stub@v0',
    phaseDetected: null,
    completionPct: 0,
    confidence: 0,
    safetyFlags: [],
    qualityFlags: [],
    materials: [],
    suggestedTask: null,
    rationale: '',
    rawResponse: null,
    ...partial,
  };
}

describe('decideAction', () => {
  it('returns pending when any safety flag is present, regardless of confidence', () => {
    expect(decideAction(result({ safetyFlags: ['no_hard_hat'], confidence: 0.99 }), T)).toBe('pending');
    expect(decideAction(result({ safetyFlags: ['exposed_wiring'], confidence: 0.1 }), T)).toBe('pending');
  });

  it('auto-updates when confidence ≥ autoUpdate and no safety flags', () => {
    expect(decideAction(result({ confidence: 0.85 }), T)).toBe('auto_updated');
    expect(decideAction(result({ confidence: 0.99 }), T)).toBe('auto_updated');
  });

  it('queues for review when confidence is between reviewQueue and autoUpdate', () => {
    expect(decideAction(result({ confidence: 0.5 }), T)).toBe('pending');
    expect(decideAction(result({ confidence: 0.84 }), T)).toBe('pending');
  });

  it('skips when confidence is below reviewQueue and no safety flags', () => {
    expect(decideAction(result({ confidence: 0.49 }), T)).toBe('skipped');
    expect(decideAction(result({ confidence: 0 }), T)).toBe('skipped');
  });

  it('safety flags trump high confidence', () => {
    expect(decideAction(result({ confidence: 0.95, safetyFlags: ['fall_hazard'] }), T)).toBe('pending');
  });

  it('honours per-project threshold overrides', () => {
    // A project that demands 0.95 to auto-update keeps a 0.90 analysis in
    // the review queue rather than auto-applying it.
    const strict = { autoUpdate: 0.95, reviewQueue: 0.5 };
    expect(decideAction(result({ confidence: 0.9 }), strict)).toBe('pending');
    expect(decideAction(result({ confidence: 0.95 }), strict)).toBe('auto_updated');

    // A project that wants more aggressive auto-action accepts 0.70.
    const lax = { autoUpdate: 0.7, reviewQueue: 0.3 };
    expect(decideAction(result({ confidence: 0.7 }), lax)).toBe('auto_updated');
    expect(decideAction(result({ confidence: 0.4 }), lax)).toBe('pending');
  });
});

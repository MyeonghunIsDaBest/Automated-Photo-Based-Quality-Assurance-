import { describe, it, expect } from 'vitest';
import type { AnalysisResult } from '../lib/ai/contract';
import { decideAction } from '../../../backend/supabase/functions/_shared/decideAction';

// Pure-function test of the Photo-QA action rule. Imports the Deno-side helper
// directly because that file is byte-equivalent to the frontend (the parity
// script enforces it). Vitest is happy compiling the .ts as TS.

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
    expect(decideAction(result({ safetyFlags: ['no_hard_hat'], confidence: 0.99 }))).toBe('pending');
    expect(decideAction(result({ safetyFlags: ['exposed_wiring'], confidence: 0.1 }))).toBe('pending');
  });

  it('auto-updates when confidence ≥ 0.85 and no safety flags', () => {
    expect(decideAction(result({ confidence: 0.85 }))).toBe('auto_updated');
    expect(decideAction(result({ confidence: 0.99 }))).toBe('auto_updated');
  });

  it('queues for review when confidence is between 0.50 and 0.85', () => {
    expect(decideAction(result({ confidence: 0.5 }))).toBe('pending');
    expect(decideAction(result({ confidence: 0.84 }))).toBe('pending');
  });

  it('skips when confidence is below 0.50 and no safety flags', () => {
    expect(decideAction(result({ confidence: 0.49 }))).toBe('skipped');
    expect(decideAction(result({ confidence: 0 }))).toBe('skipped');
  });

  it('safety flags trump high confidence', () => {
    expect(decideAction(result({ confidence: 0.95, safetyFlags: ['fall_hazard'] }))).toBe('pending');
  });
});

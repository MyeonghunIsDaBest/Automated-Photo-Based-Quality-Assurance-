import { describe, it, expect, beforeEach, vi } from 'vitest';

// Pass D-readiness — pin the body envelope shape that the photo-QA Edge
// Functions receive. Phase D will swap the analyser internals without
// changing this contract; if the body shape drifts the regression lands
// here first.

const { state, makeInvoke } = vi.hoisted(() => {
  type Capture = { name: string; body: unknown };
  const state = {
    invocations: [] as Capture[],
  };
  const makeInvoke = vi.fn(async (name: string, opts?: { body?: unknown }) => {
    state.invocations.push({ name, body: opts?.body });
    return { data: { ok: true }, error: null };
  });
  return { state, makeInvoke };
});

vi.mock('../lib/supabase', () => ({
  supabase: {
    functions: { invoke: makeInvoke },
  },
  supabaseConfigured: () => true,
}));

beforeEach(() => {
  state.invocations.length = 0;
});

import { requestAnalysis, confirmAnalysis, rejectAnalysis } from '../lib/api/aiAnalyses';

describe('requestAnalysis body envelope', () => {
  it('default invocation sends just photoId — webhook claim path', async () => {
    await requestAnalysis('photo-1');
    expect(state.invocations).toHaveLength(1);
    expect(state.invocations[0].name).toBe('analyze-photo');
    expect(state.invocations[0].body).toEqual({ photoId: 'photo-1' });
  });

  it('forceNew=true is passed through so the Edge Function inserts a fresh row', async () => {
    await requestAnalysis('photo-1', { forceNew: true });
    expect(state.invocations[0].body).toEqual({ photoId: 'photo-1', forceNew: true });
  });

  it('model + phaseHint overrides ride along on the body', async () => {
    await requestAnalysis('photo-1', {
      forceNew: true,
      model: 'claude-sonnet-4-6@2026-05-08',
      phaseHint: 'electrical',
    });
    expect(state.invocations[0].body).toEqual({
      photoId: 'photo-1',
      forceNew: true,
      model: 'claude-sonnet-4-6@2026-05-08',
      phaseHint: 'electrical',
    });
  });
});

describe('confirmAnalysis / rejectAnalysis body envelopes', () => {
  it('confirmAnalysis sends action=confirmed and threads overridePct + notes through', async () => {
    await confirmAnalysis('photo-2', { overridePct: 75, notes: 'verified on site' });
    expect(state.invocations[0].name).toBe('confirm-analysis');
    expect(state.invocations[0].body).toEqual({
      photoId: 'photo-2',
      action: 'confirmed',
      overridePct: 75,
      notes: 'verified on site',
    });
  });

  it('rejectAnalysis sends action=rejected', async () => {
    await rejectAnalysis('photo-3', 'wrong phase detected');
    expect(state.invocations[0].body).toEqual({
      photoId: 'photo-3',
      action: 'rejected',
      notes: 'wrong phase detected',
    });
  });
});

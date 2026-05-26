import { describe, it, expect, beforeEach, vi } from 'vitest';

// Pass D-readiness — pin the body envelope shape that the photo-QA Edge
// Functions receive. Phase D will swap the analyser internals without
// changing this contract; if the body shape drifts the regression lands
// here first.
//
// Also covers `getRecentAnalyses` — the projection query that feeds the
// AI Analysis tab's recent-activity strip. Pins the filter shape so a
// silent change to `eq('photos.project_id', ...)` or to the time-window
// fallback would surface here.

const { state, makeInvoke, makeFrom } = vi.hoisted(() => {
  type Capture = { name: string; body: unknown };
  type FromCall = {
    table: string;
    selectArgs: unknown[];
    eqCalls: Array<{ column: string; value: unknown }>;
    gteCalls: Array<{ column: string; value: unknown }>;
    orderCalls: Array<{ column: string; opts: unknown }>;
    limitCalls: number[];
  };
  const state = {
    invocations: [] as Capture[],
    fromCalls: [] as FromCall[],
    fromResolve: { data: [] as unknown[], error: null as { message: string } | null },
  };
  const makeInvoke = vi.fn(async (name: string, opts?: { body?: unknown }) => {
    state.invocations.push({ name, body: opts?.body });
    return { data: { ok: true }, error: null };
  });
  const makeFrom = vi.fn((table: string) => {
    const call: FromCall = {
      table,
      selectArgs: [],
      eqCalls: [],
      gteCalls: [],
      orderCalls: [],
      limitCalls: [],
    };
    state.fromCalls.push(call);
    const builder = {
      select: (...args: unknown[]) => { call.selectArgs.push(...args); return builder; },
      eq: (column: string, value: unknown) => { call.eqCalls.push({ column, value }); return builder; },
      gte: (column: string, value: unknown) => { call.gteCalls.push({ column, value }); return builder; },
      order: (column: string, opts: unknown) => { call.orderCalls.push({ column, opts }); return builder; },
      limit: (n: number) => { call.limitCalls.push(n); return Promise.resolve(state.fromResolve); },
    };
    return builder;
  });
  return { state, makeInvoke, makeFrom };
});

vi.mock('../lib/supabase', () => ({
  supabase: {
    functions: { invoke: makeInvoke },
    from: makeFrom,
  },
  supabaseConfigured: () => true,
}));

beforeEach(() => {
  state.invocations.length = 0;
  state.fromCalls.length = 0;
  state.fromResolve = { data: [], error: null };
});

import {
  requestAnalysis, confirmAnalysis, rejectAnalysis, getRecentAnalyses,
} from '../lib/api/aiAnalyses';

// A UUID the production guard accepts — non-UUID project ids short-circuit
// to `[]` before any Supabase call, so the from() spy never sees them.
const TEST_PROJECT_ID = '550e8400-e29b-41d4-a716-446655440000';

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

describe('getRecentAnalyses query shape', () => {
  it('short-circuits non-UUID project ids without hitting Supabase', async () => {
    const out = await getRecentAnalyses('demo-project');
    expect(out).toEqual([]);
    expect(state.fromCalls).toHaveLength(0);
  });

  it('filters by project_id via inner join and orders by analyzed_at desc', async () => {
    state.fromResolve = { data: [], error: null };
    await getRecentAnalyses(TEST_PROJECT_ID);

    expect(state.fromCalls).toHaveLength(1);
    const call = state.fromCalls[0];
    expect(call.table).toBe('ai_analyses');
    // Project scoping must go through the photos!inner join — ai_analyses
    // doesn't carry project_id directly.
    expect(call.eqCalls).toContainEqual({
      column: 'photos.project_id',
      value: TEST_PROJECT_ID,
    });
    // Strip needs newest first so the bucket counts reflect "what just
    // happened" rather than "the start of yesterday".
    expect(call.orderCalls).toContainEqual({
      column: 'analyzed_at',
      opts: { ascending: false },
    });
    // Caller didn't pass a since — default window must be applied.
    expect(call.gteCalls).toHaveLength(1);
    expect(call.gteCalls[0].column).toBe('analyzed_at');
    expect(typeof call.gteCalls[0].value).toBe('string');
    // Default 24h window: the timestamp should be within the last minute
    // of "24h ago" — sanity-checks the window math without flaking.
    const since = new Date(call.gteCalls[0].value as string).getTime();
    const expected = Date.now() - 24 * 60 * 60 * 1000;
    expect(Math.abs(since - expected)).toBeLessThan(60_000);
    // Default limit applied.
    expect(call.limitCalls).toEqual([50]);
  });

  it('threads an explicit since + limit through to the query', async () => {
    const since = '2026-05-25T00:00:00.000Z';
    await getRecentAnalyses(TEST_PROJECT_ID, { since, limit: 10 });
    const call = state.fromCalls[0];
    expect(call.gteCalls).toContainEqual({ column: 'analyzed_at', value: since });
    expect(call.limitCalls).toEqual([10]);
  });
});

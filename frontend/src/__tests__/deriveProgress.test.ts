import { describe, it, expect } from 'vitest';
import { deriveProgress } from '../lib/progression/deriveProgress';

const DEFAULT_WEIGHTS = { checklist: 40, photos: 25, ai: 35 };

describe('deriveProgress', () => {
  it('returns 0 across the board when no signals are present', () => {
    const result = deriveProgress(
      { checklistPct: 0, photoCount: 0, aiAvgPct: 0 },
      DEFAULT_WEIGHTS,
      3,
    );
    expect(result.pct).toBe(0);
    expect(result.breakdown).toEqual({ checklist: 0, photos: 0, ai: 0 });
  });

  it('saturates to 100 when every signal is maxed out at default weights', () => {
    const result = deriveProgress(
      { checklistPct: 100, photoCount: 3, aiAvgPct: 100 },
      DEFAULT_WEIGHTS,
      3,
    );
    expect(result.pct).toBe(100);
    expect(result.breakdown.checklist).toBe(40);
    expect(result.breakdown.photos).toBe(25);
    expect(result.breakdown.ai).toBe(35);
  });

  it('respects extreme weight splits — 100/0/0 means only checklist counts', () => {
    const result = deriveProgress(
      { checklistPct: 80, photoCount: 0, aiAvgPct: 0 },
      { checklist: 100, photos: 0, ai: 0 },
      3,
    );
    expect(result.pct).toBe(80);
    expect(result.breakdown.checklist).toBe(80);
    expect(result.breakdown.photos).toBe(0);
    expect(result.breakdown.ai).toBe(0);
  });

  it('respects extreme weight splits — 0/100/0 means only photo coverage counts', () => {
    const result = deriveProgress(
      { checklistPct: 0, photoCount: 6, aiAvgPct: 0 },
      { checklist: 0, photos: 100, ai: 0 },
      3,
    );
    // 6 photos / 3 target = saturated → 100% photo signal × 100% weight = 100.
    expect(result.pct).toBe(100);
  });

  it('respects extreme weight splits — 0/0/100 means only AI counts', () => {
    const result = deriveProgress(
      { checklistPct: 100, photoCount: 3, aiAvgPct: 60 },
      { checklist: 0, photos: 0, ai: 100 },
      3,
    );
    expect(result.pct).toBe(60);
    expect(result.breakdown.checklist).toBe(0);
    expect(result.breakdown.photos).toBe(0);
    expect(result.breakdown.ai).toBe(60);
  });

  it('rounds the headline pct but keeps breakdown precise (33/33/34 case)', () => {
    const result = deriveProgress(
      { checklistPct: 90, photoCount: 3, aiAvgPct: 90 },
      { checklist: 33, photos: 33, ai: 34 },
      3,
    );
    // 90×33/100 + (3/3=100)×33/100 + 90×34/100 = 29.7 + 33 + 30.6 = 93.3 → 93.
    expect(result.pct).toBe(93);
    expect(result.breakdown.checklist).toBeCloseTo(29.7, 5);
    expect(result.breakdown.photos).toBeCloseTo(33, 5);
    expect(result.breakdown.ai).toBeCloseTo(30.6, 5);
  });

  it('caps photo contribution when photoCount exceeds the target', () => {
    const result = deriveProgress(
      { checklistPct: 0, photoCount: 10, aiAvgPct: 0 },
      { checklist: 0, photos: 100, ai: 0 },
      3,
    );
    // 10 photos vs 3 target → clamped to 100% photo signal, not 333%.
    expect(result.pct).toBe(100);
  });

  it('handles target = 0 by zeroing the photo contribution (no divide-by-zero)', () => {
    const result = deriveProgress(
      { checklistPct: 0, photoCount: 5, aiAvgPct: 0 },
      { checklist: 0, photos: 100, ai: 0 },
      0,
    );
    expect(result.pct).toBe(0);
    expect(result.breakdown.photos).toBe(0);
  });

  it('absent AI signal still produces meaningful progress from the other two', () => {
    const result = deriveProgress(
      { checklistPct: 100, photoCount: 3, aiAvgPct: 0 },
      DEFAULT_WEIGHTS,
      3,
    );
    // 100×0.4 + 100×0.25 + 0×0.35 = 65.
    expect(result.pct).toBe(65);
  });
});

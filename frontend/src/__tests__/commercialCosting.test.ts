// commercialCosting.test.ts
// TDD suite for lib/commercial/costing.ts — rollUpLabourCost + computeProfit.
//
// Run: npx vitest run src/__tests__/commercialCosting.test.ts --pool=forks --poolOptions.forks.singleFork=true

import { describe, it, expect } from 'vitest';
import { rollUpLabourCost, computeProfit } from '../lib/commercial/costing';

// ---------------------------------------------------------------------------
// rollUpLabourCost
// ---------------------------------------------------------------------------

describe('rollUpLabourCost', () => {
  it('all costed — two roles, both rated', () => {
    const entries = [
      { hours: 8, role: 'electrician' },
      { hours: 4, role: 'foreman' },
    ];
    const rates = new Map<string, number | null>([
      ['electrician', 80],
      ['foreman', 100],
    ]);
    const result = rollUpLabourCost(entries, rates);
    // 8 * 80 + 4 * 100 = 640 + 400 = 1040
    expect(result.labourCost).toBe(1040);
    expect(result.costedHours).toBe(12);
    expect(result.uncostedHours).toBe(0);
    expect(result.byRole).toHaveLength(2);
    const elec = result.byRole.find((r) => r.role === 'electrician');
    const fore = result.byRole.find((r) => r.role === 'foreman');
    expect(elec).toBeDefined();
    expect(elec!.hours).toBe(8);
    expect(elec!.cost).toBe(640);
    expect(fore).toBeDefined();
    expect(fore!.hours).toBe(4);
    expect(fore!.cost).toBe(400);
  });

  it('mixed — one null-role entry, one unknown-role entry, one costed entry', () => {
    const entries = [
      { hours: 6, role: 'electrician' },
      { hours: 3, role: null },           // null role → uncosted
      { hours: 2, role: 'apprentice' },   // no rate in map → uncosted
    ];
    const rates = new Map<string, number | null>([
      ['electrician', 80],
      // apprentice NOT in the map
    ]);
    const result = rollUpLabourCost(entries, rates);
    // Only electrician is costed: 6 * 80 = 480
    expect(result.labourCost).toBe(480);
    expect(result.costedHours).toBe(6);
    expect(result.uncostedHours).toBe(5); // 3 + 2
    // byRole should include the costed electrician and the two uncosted roles
    const elec = result.byRole.find((r) => r.role === 'electrician');
    expect(elec).toBeDefined();
    expect(elec!.hours).toBe(6);
    expect(elec!.cost).toBe(480);
  });

  it('role in map with null rate → uncosted (hours counted as uncosted)', () => {
    const entries = [{ hours: 5, role: 'apprentice' }];
    const rates = new Map<string, number | null>([['apprentice', null]]);
    const result = rollUpLabourCost(entries, rates);
    expect(result.labourCost).toBe(0);
    expect(result.costedHours).toBe(0);
    expect(result.uncostedHours).toBe(5);
  });

  it('rate present but 0 → costed (0 cost, hours counted as costed)', () => {
    const entries = [{ hours: 4, role: 'apprentice' }];
    const rates = new Map<string, number | null>([['apprentice', 0]]);
    const result = rollUpLabourCost(entries, rates);
    expect(result.labourCost).toBe(0);
    expect(result.costedHours).toBe(4);
    expect(result.uncostedHours).toBe(0);
  });

  it('empty entries → all zeros', () => {
    const result = rollUpLabourCost([], new Map());
    expect(result.labourCost).toBe(0);
    expect(result.costedHours).toBe(0);
    expect(result.uncostedHours).toBe(0);
    expect(result.byRole).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// computeProfit
// ---------------------------------------------------------------------------

describe('computeProfit', () => {
  it('normal case — positive net', () => {
    // revenue 10000, materials 2000, labour 3000
    // gross = 10000 - 2000 = 8000
    // net   = 8000  - 3000 = 5000
    // margin = round1(5000 / 10000 * 100) = 50.0
    const result = computeProfit({
      revenueExGst: 10000,
      materialsCost: 2000,
      labourCost: 3000,
    });
    expect(result.gross).toBe(8000);
    expect(result.net).toBe(5000);
    expect(result.marginPct).toBe(50.0);
  });

  it('revenue null → figures computed with 0, marginPct null', () => {
    const result = computeProfit({
      revenueExGst: null,
      materialsCost: 1500,
      labourCost: 500,
    });
    // revenue treated as 0: gross = 0 - 1500 = -1500, net = -1500 - 500 = -2000
    expect(result.gross).toBe(-1500);
    expect(result.net).toBe(-2000);
    expect(result.marginPct).toBeNull();
  });

  it('negative net (loss case) — marginPct is negative', () => {
    // revenue 5000, materials 4000, labour 2000
    // gross = 5000 - 4000 = 1000
    // net   = 1000 - 2000 = -1000
    // margin = round1(-1000 / 5000 * 100) = -20.0
    const result = computeProfit({
      revenueExGst: 5000,
      materialsCost: 4000,
      labourCost: 2000,
    });
    expect(result.gross).toBe(1000);
    expect(result.net).toBe(-1000);
    expect(result.marginPct).toBe(-20.0);
  });

  it('all nulls → zeros for figures, marginPct null', () => {
    const result = computeProfit({
      revenueExGst: null,
      materialsCost: null,
      labourCost: null,
    });
    expect(result.gross).toBe(0);
    expect(result.net).toBe(0);
    expect(result.marginPct).toBeNull();
  });

  it('marginPct rounds to 1 decimal place', () => {
    // revenue 3, materials 0, labour 1 → net = 2 → 2/3 * 100 = 66.666... → 66.7
    const result = computeProfit({
      revenueExGst: 3,
      materialsCost: 0,
      labourCost: 1,
    });
    expect(result.marginPct).toBe(66.7);
  });
});

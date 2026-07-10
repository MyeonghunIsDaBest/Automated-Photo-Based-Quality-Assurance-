// Pricing floor (migration 94) — Luke's exact story as fixtures:
// a remote costs $100 with a 25% floor → sell $125. He negotiates the buy
// price to $80: the catalogue sell STAYS $125 (fixed-sell discipline — the
// floor never lowers a price). "Revert to minimum" on a quote reprices to
// cost × 1.25: $80 → $100, $50 → $62.50.
import { describe, expect, it } from 'vitest';
import { minSell, isBelowFloor } from '../lib/commercial/money';

describe('minSell (floor = cost × (1 + minMarkupPct))', () => {
  it("Luke's base case: $100 cost at 25% floors at $125", () => {
    expect(minSell(100, 0.25)).toBe(125);
  });

  it('negotiated buy $80 → revert-to-minimum target $100', () => {
    expect(minSell(80, 0.25)).toBe(100);
  });

  it('negotiated buy $50 → revert-to-minimum target $62.50', () => {
    expect(minSell(50, 0.25)).toBe(62.5);
  });

  it('rounds to cents', () => {
    expect(minSell(9.99, 0.25)).toBe(12.49); // 12.4875 → 12.49
  });

  it('uncosted has no floor', () => {
    expect(minSell(null, 0.25)).toBeNull();
    expect(minSell(undefined, 0.25)).toBeNull();
    expect(minSell(0, 0.25)).toBeNull();
    expect(minSell(-5, 0.25)).toBeNull();
  });

  it('zero floor markup means floor = cost', () => {
    expect(minSell(100, 0)).toBe(100);
  });
});

describe('isBelowFloor', () => {
  it('fixed sell $125 on an $80 buy is comfortably above floor ($100)', () => {
    expect(isBelowFloor(125, 80, 0.25)).toBe(false);
  });

  it('selling at $95 on a $100 cost (25% floor = $125) flags', () => {
    expect(isBelowFloor(95, 100, 0.25)).toBe(true);
  });

  it('selling exactly at the floor does not flag', () => {
    expect(isBelowFloor(125, 100, 0.25)).toBe(false);
  });

  it('half-cent rounding tolerance: floor-priced line never flags', () => {
    // cost 9.99 → floor 12.49 (rounded); a 12.49 sell must not flag.
    expect(isBelowFloor(12.49, 9.99, 0.25)).toBe(false);
  });

  it('one cent under the floor flags', () => {
    expect(isBelowFloor(12.48, 9.99, 0.25)).toBe(true);
  });

  it('uncosted lines never flag', () => {
    expect(isBelowFloor(50, null, 0.25)).toBe(false);
    expect(isBelowFloor(50, 0, 0.25)).toBe(false);
  });

  it('unpriced sell never flags', () => {
    expect(isBelowFloor(null, 100, 0.25)).toBe(false);
    expect(isBelowFloor(undefined, 100, 0.25)).toBe(false);
  });
});

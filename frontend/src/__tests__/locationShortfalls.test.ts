// P9.BS WS2 — per-location shortfall derivation: factory rows suggest ORDERS,
// van/storage/site rows suggest TRANSFERS from the factory, with the factory's
// own holding carried on transfer rows for honesty. Pure; single-fork.

import { describe, it, expect } from 'vitest';
import { computeLocationShortfalls, type LocationReorderRule } from '../lib/api/purchasing';

const locations = [
  { id: 'fac', name: 'Factory', type: 'factory', isActive: true },
  { id: 'van1', name: 'Van 1 — Rene', type: 'van', isActive: true },
  { id: 'old', name: 'Retired Van', type: 'van', isActive: false },
];

const totals = [
  {
    materialId: 'mat1', name: 'Conduit 20mm', sku: 'AUS20MD', unit: 'ea',
    byLocation: [{ locationId: 'fac', qty: 50 }, { locationId: 'van1', qty: 2 }],
  },
  {
    materialId: 'mat2', name: 'Cable 2.5mm', sku: 'ETC25', unit: 'm',
    byLocation: [{ locationId: 'fac', qty: 5 }],
  },
];

const rule = (over: Partial<LocationReorderRule>): LocationReorderRule => ({
  locationId: 'van1', materialId: 'mat1', minQty: 10, targetQty: 20, ...over,
});

describe('computeLocationShortfalls', () => {
  it('van below min → transfer row with factory holding + top-up to target', () => {
    const out = computeLocationShortfalls([rule({})], locations, totals);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      locationId: 'van1', action: 'transfer', onHand: 2, suggestedQty: 18, factoryOnHand: 50,
    });
  });

  it('factory below min → order row, factoryOnHand null', () => {
    const out = computeLocationShortfalls(
      [rule({ locationId: 'fac', materialId: 'mat2', minQty: 10, targetQty: 40 })],
      locations, totals,
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ action: 'order', onHand: 5, suggestedQty: 35, factoryOnHand: null });
  });

  it('at-or-above min is excluded', () => {
    const out = computeLocationShortfalls([rule({ minQty: 2 })], locations, totals);
    expect(out).toEqual([]);
  });

  it('target 0 falls back to topping up to min', () => {
    const out = computeLocationShortfalls([rule({ targetQty: 0 })], locations, totals);
    expect(out[0].suggestedQty).toBe(8); // min 10 − onHand 2
  });

  it('no level row at the ruled location counts as 0 on hand', () => {
    const out = computeLocationShortfalls([rule({ materialId: 'mat2', targetQty: 0 })], locations, totals);
    expect(out[0].onHand).toBe(0);
    expect(out[0].factoryOnHand).toBe(5);
  });

  it('zeroed-out rules and inactive/unknown locations are ignored', () => {
    const out = computeLocationShortfalls(
      [rule({ minQty: 0 }), rule({ locationId: 'old' }), rule({ locationId: 'ghost' })],
      locations, totals,
    );
    expect(out).toEqual([]);
  });
});

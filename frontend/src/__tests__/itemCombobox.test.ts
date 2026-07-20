// P9.BS WS1 — the ItemCombobox's pure filter. Single-fork.

import { describe, it, expect } from 'vitest';
import { filterComboOptions, type ComboOption } from '../components/ui/ItemCombobox';

const opts: ComboOption[] = [
  { id: '1', label: 'Conduit PVC Solid 20mm MD', sublabel: 'AUS20MD' },
  { id: '2', label: 'Cable Flat 2C 7/0.50 1.5mm', sublabel: 'ETCFT2C7050' },
  { id: '3', label: 'Powerpoint Double 10A Clipsal', sublabel: 'CLI3025-VW' },
  ...Array.from({ length: 12 }, (_, i) => ({ id: `x${i}`, label: `Filler item ${i}`, sublabel: null })),
];

describe('filterComboOptions', () => {
  it('matches on label, case-insensitively', () => {
    const out = filterComboOptions(opts, 'powerpoint', 8);
    expect(out.map((o) => o.id)).toEqual(['3']);
  });

  it('matches on sublabel (SKU) too', () => {
    const out = filterComboOptions(opts, 'aus20', 8);
    expect(out.map((o) => o.id)).toEqual(['1']);
  });

  it('empty query returns the head of the list, capped', () => {
    const out = filterComboOptions(opts, '   ', 8);
    expect(out).toHaveLength(8);
    expect(out[0].id).toBe('1');
  });

  it('caps matches at max', () => {
    const out = filterComboOptions(opts, 'filler', 5);
    expect(out).toHaveLength(5);
  });

  it('no matches → empty array', () => {
    expect(filterComboOptions(opts, 'zzz-nothing', 8)).toEqual([]);
  });
});

// P9.BS WS5.6 — bulk stock-take by CSV: the lenient ref,qty parser + the
// catalogue matcher that turns parsed rows into per-material counts.
// Pure functions; run single-fork (house rule).

import { describe, it, expect } from 'vitest';
import { parseStockCountCsv, matchStockCounts } from '../lib/stock/csv';

describe('parseStockCountCsv', () => {
  it('parses ref,qty rows and auto-skips a header line', () => {
    const { rows, errors } = parseStockCountCsv('ref,qty\nAUS20MD,40\nCable Ties 280mm Pack,12.5');
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      { ref: 'AUS20MD', qty: 40 },
      { ref: 'Cable Ties 280mm Pack', qty: 12.5 },
    ]);
  });

  it('handles quoted names with embedded commas', () => {
    const { rows, errors } = parseStockCountCsv('"Saddle, 25mm",8');
    expect(errors).toEqual([]);
    expect(rows).toEqual([{ ref: 'Saddle, 25mm', qty: 8 }]);
  });

  it('reports bad lines with line numbers, keeps good rows', () => {
    const { rows, errors } = parseStockCountCsv('AUS20MD,40\n,5\nGOOD-1,abc\nGOOD-2,7');
    expect(rows.map((r) => r.ref)).toEqual(['AUS20MD', 'GOOD-2']);
    expect(errors).toHaveLength(2);
    expect(errors[0]).toContain('Line 2');
    expect(errors[1]).toContain('Line 3');
  });
});

describe('matchStockCounts', () => {
  const items = [
    { id: 'm1', sku: 'AUS20MD', name: 'Conduit PVC Solid 20mm MD' },
    { id: 'm2', sku: null, name: 'Cable Ties 280mm Pack' },
    { id: 'm3', sku: 'CLI3025-VW', name: 'Powerpoint Double 10A' },
  ];

  it('matches SKU first (case-insensitive), then exact name', () => {
    const { matched, unmatched } = matchStockCounts(
      [{ ref: 'aus20md', qty: 40 }, { ref: 'cable ties 280mm pack', qty: 12 }],
      items,
    );
    expect(matched).toEqual([
      { materialId: 'm1', qty: 40 },
      { materialId: 'm2', qty: 12 },
    ]);
    expect(unmatched).toEqual([]);
  });

  it('lists unmatched refs honestly, never drops them silently', () => {
    const { matched, unmatched } = matchStockCounts([{ ref: 'NOT-A-THING', qty: 3 }], items);
    expect(matched).toEqual([]);
    expect(unmatched).toEqual(['NOT-A-THING']);
  });

  it('later duplicate refs overwrite earlier ones — the last count wins', () => {
    const { matched } = matchStockCounts(
      [{ ref: 'AUS20MD', qty: 10 }, { ref: 'Conduit PVC Solid 20mm MD', qty: 25 }],
      items,
    );
    expect(matched).toEqual([{ materialId: 'm1', qty: 25 }]);
  });
});

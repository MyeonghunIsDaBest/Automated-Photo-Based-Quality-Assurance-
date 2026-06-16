import { describe, it, expect } from 'vitest';
import { parseMaterialsCsv, planImport, type CsvMaterialRow } from '../lib/catalogue/csv';

describe('parseMaterialsCsv', () => {
  it('parses the documented header set and coerces prices', () => {
    const text = 'sku,name,unit,cost_price,sell_price,tags,description\n' +
      'TPS25,"2.5mm TPS cable",m,1.10,2.20,cable|consumable,Twin and earth';
    const { rows, errors } = parseMaterialsCsv(text);
    expect(errors).toEqual([]);
    expect(rows).toEqual([{ sku: 'TPS25', name: '2.5mm TPS cable', unit: 'm',
      costPrice: 1.1, sellPrice: 2.2, tags: ['cable', 'consumable'], description: 'Twin and earth' }]);
  });
  it('handles quoted commas + missing optionals + blank lines', () => {
    const text = 'sku,name,unit,cost_price,sell_price,tags,description\n' +
      ',"Saddle, 25mm",ea,,,,\n\n';
    const { rows, errors } = parseMaterialsCsv(text);
    expect(errors).toEqual([]);
    expect(rows[0]).toEqual({ sku: null, name: 'Saddle, 25mm', unit: 'ea',
      costPrice: null, sellPrice: null, tags: [], description: null });
  });
  it('reports row-level errors (missing name, bad price) with row numbers, keeps good rows', () => {
    const text = 'sku,name,unit,cost_price,sell_price,tags,description\n' +
      'X1,,ea,,,,\nX2,Okay,ea,abc,,,';
    const { rows, errors } = parseMaterialsCsv(text);
    expect(rows).toHaveLength(0 + 0); // both rows invalid: missing name / bad price
    expect(errors).toHaveLength(2);
    expect(errors[0]).toMatch(/row 2/i);
    expect(errors[1]).toMatch(/row 3/i);
  });
  it('rejects a wrong header line outright', () => {
    const { rows, errors } = parseMaterialsCsv('foo,bar\n1,2');
    expect(rows).toEqual([]);
    expect(errors[0]).toMatch(/header/i);
  });
  it('rejects negative cost_price as a row error', () => {
    const text = 'sku,name,unit,cost_price,sell_price,tags,description\n' +
      'X1,Widget,ea,-1.00,,,';
    const { rows, errors } = parseMaterialsCsv(text);
    expect(rows).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/row 2/i);
    expect(errors[0]).toMatch(/cost_price/i);
  });
  it('rejects Infinity sell_price as a row error', () => {
    const text = 'sku,name,unit,cost_price,sell_price,tags,description\n' +
      'X2,Widget,ea,,Infinity,,';
    const { rows, errors } = parseMaterialsCsv(text);
    expect(rows).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/row 2/i);
    expect(errors[0]).toMatch(/sell_price/i);
  });
  it('accepts zero cost_price (free item)', () => {
    const text = 'sku,name,unit,cost_price,sell_price,tags,description\n' +
      'X3,Freebie,ea,0,0,,';
    const { rows, errors } = parseMaterialsCsv(text);
    expect(errors).toHaveLength(0);
    expect(rows[0].costPrice).toBe(0);
    expect(rows[0].sellPrice).toBe(0);
  });
});

describe('planImport', () => {
  const existing = [
    { id: 'a', sku: 'TPS25', name: 'TPS 2.5', isActive: true },
    { id: 'b', sku: null, name: 'Saddle 25mm', isActive: true },
  ];
  const row = (over: Partial<CsvMaterialRow>): CsvMaterialRow => ({
    sku: null, name: 'New', unit: 'ea', costPrice: null, sellPrice: null, tags: [], description: null, ...over,
  });
  it('matches by sku → update', () => {
    const plan = planImport(existing, [row({ sku: 'TPS25', name: 'Renamed' })]);
    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0].id).toBe('a');
  });
  it('no sku but active name match → skip with reason', () => {
    const plan = planImport(existing, [row({ name: 'saddle 25MM' })]); // case-insensitive
    expect(plan.skips).toHaveLength(1);
    expect(plan.skips[0].reason).toMatch(/name/i);
  });
  it('unmatched → add', () => {
    const plan = planImport(existing, [row({ name: 'Brand new thing' })]);
    expect(plan.adds).toHaveLength(1);
  });
});

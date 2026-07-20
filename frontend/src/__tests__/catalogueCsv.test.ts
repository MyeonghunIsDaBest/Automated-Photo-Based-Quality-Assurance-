import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { parseMaterialsCsv, planImport, type CsvMaterialRow } from '../lib/catalogue/csv';

describe('parseMaterialsCsv', () => {
  it('parses the documented header set and coerces prices', () => {
    const text = 'sku,name,unit,cost_price,sell_price,tags,description\n' +
      'TPS25,"2.5mm TPS cable",m,1.10,2.20,cable|consumable,Twin and earth';
    const { rows, errors } = parseMaterialsCsv(text);
    expect(errors).toEqual([]);
    expect(rows).toEqual([{ sku: 'TPS25', name: '2.5mm TPS cable', unit: 'm',
      costPrice: 1.1, sellPrice: 2.2, tags: ['cable', 'consumable'], description: 'Twin and earth',
      category: null, subcategory: null, isStockItem: null, isFavourite: null,
      supplier: null, supplierSku: null }]);
  });
  it('handles quoted commas + missing optionals + blank lines', () => {
    const text = 'sku,name,unit,cost_price,sell_price,tags,description\n' +
      ',"Saddle, 25mm",ea,,,,\n\n';
    const { rows, errors } = parseMaterialsCsv(text);
    expect(errors).toEqual([]);
    expect(rows[0]).toEqual({ sku: null, name: 'Saddle, 25mm', unit: 'ea',
      costPrice: null, sellPrice: null, tags: [], description: null,
      category: null, subcategory: null, isStockItem: null, isFavourite: null,
      supplier: null, supplierSku: null });
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
    sku: null, name: 'New', unit: 'ea', costPrice: null, sellPrice: null, tags: [], description: null,
    category: null, subcategory: null, isStockItem: null, isFavourite: null,
    supplier: null, supplierSku: null, ...over,
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

// ─── P3 import pipeline: optional columns (category/subcategory/stock/favourite) ───

import { parsePrebuildsCsv, planPrebuildImport } from '../lib/catalogue/prebuildCsv';

describe('parseMaterialsCsv — optional P3 columns', () => {
  const HDR11 = 'sku,name,unit,cost_price,sell_price,tags,description,category,subcategory,is_stock_item,is_favourite';

  it('old 7-column files still parse, optional fields null', () => {
    const { rows, errors } = parseMaterialsCsv('sku,name,unit,cost_price,sell_price,tags,description\nA1,Widget,ea,10,15,,');
    expect(errors).toEqual([]);
    expect(rows[0].category).toBeNull();
    expect(rows[0].isStockItem).toBeNull();
    expect(rows[0].isFavourite).toBeNull();
  });

  it('parses the new columns with lenient booleans', () => {
    const { rows, errors } = parseMaterialsCsv(`${HDR11}\nA1,Widget,ea,10,15,,,Electrical,Cables,yes,0`);
    expect(errors).toEqual([]);
    expect(rows[0].category).toBe('Electrical');
    expect(rows[0].subcategory).toBe('Cables');
    expect(rows[0].isStockItem).toBe(true);
    expect(rows[0].isFavourite).toBe(false);
  });

  it('blank optional cells stay null (never clobber on update)', () => {
    const { rows } = parseMaterialsCsv(`${HDR11}\nA1,Widget,ea,10,15,,,,,,`);
    expect(rows[0].category).toBeNull();
    expect(rows[0].isStockItem).toBeNull();
  });

  it('rejects a garbage boolean with a row error', () => {
    const { rows, errors } = parseMaterialsCsv(`${HDR11}\nA1,Widget,ea,10,15,,,,,maybe,`);
    expect(rows).toEqual([]);
    expect(errors[0]).toContain('is_stock_item');
  });

  it('tolerates a UTF-8 BOM on the header (Excel exports)', () => {
    const { rows, errors } = parseMaterialsCsv('﻿sku,name,unit,cost_price,sell_price,tags,description\nA1,Widget,ea,10,15,,');
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
  });

  // Review fixes (P3 adversarial pass)

  it('keeps a blank unit as null so updates never clobber it (inserts default later)', () => {
    const { rows } = parseMaterialsCsv('sku,name,unit,cost_price,sell_price,tags,description\nA1,Widget,,10,15,,');
    expect(rows[0].unit).toBeNull();
  });

  it('reports an empty file as empty, not as a missing header', () => {
    const { errors } = parseMaterialsCsv('');
    expect(errors[0]).toContain('file is empty');
  });

  it('skips in-file duplicate SKUs (second occurrence) instead of dooming the insert chunk', () => {
    const text = 'sku,name,unit,cost_price,sell_price,tags,description\nD1,First,ea,1,2,,\nD1,Second,ea,3,4,,';
    const { rows } = parseMaterialsCsv(text);
    const plan = planImport([], rows);
    expect(plan.adds).toHaveLength(1);
    expect(plan.adds[0].name).toBe('First');
    expect(plan.skips).toHaveLength(1);
    expect(plan.skips[0].reason).toContain('earlier in this file');
  });

  it('skips in-file duplicate names for sku-less adds', () => {
    const text = 'sku,name,unit,cost_price,sell_price,tags,description\n,Same Thing,ea,1,2,,\n,same thing,ea,3,4,,';
    const { rows } = parseMaterialsCsv(text);
    const plan = planImport([], rows);
    expect(plan.adds).toHaveLength(1);
    expect(plan.skips).toHaveLength(1);
    expect(plan.skips[0].reason).toContain('earlier in this file');
  });
});

// ─── P3: pre-build CSV parser + planner ───

describe('parsePrebuildsCsv', () => {
  const HDR = 'prebuild_name,category,subcategory,is_favourite,item_sku,item_qty';

  it('groups repeated rows into one prebuild, first row wins meta', () => {
    const { prebuilds, errors } = parsePrebuildsCsv(
      `${HDR}\nDownlight point,Electrical,Points,yes,CBL-TPS25,12\nDownlight point,,,,DLK-9W,1`,
    );
    expect(errors).toEqual([]);
    expect(prebuilds).toHaveLength(1);
    expect(prebuilds[0].category).toBe('Electrical');
    expect(prebuilds[0].isFavourite).toBe(true);
    expect(prebuilds[0].items).toEqual([
      { sku: 'CBL-TPS25', qty: 12, line: 2 },
      { sku: 'DLK-9W', qty: 1, line: 3 },
    ]);
  });

  it('rejects zero/negative/garbage quantities with line numbers', () => {
    const { errors } = parsePrebuildsCsv(`${HDR}\nGPO point,,,,GPO-DBL,0\nGPO point,,,,CBL-TPS25,abc`);
    expect(errors).toHaveLength(2);
    expect(errors[0]).toContain('row 2');
    expect(errors[1]).toContain('row 3');
  });

  it('flags duplicate SKU rows within one prebuild', () => {
    const { errors } = parsePrebuildsCsv(`${HDR}\nGPO point,,,,GPO-DBL,1\nGPO point,,,,GPO-DBL,2`);
    expect(errors[0]).toContain('duplicate item');
  });

  it('missing header column fails fast', () => {
    const { errors } = parsePrebuildsCsv('prebuild_name,item_sku,item_qty\nX,A,1');
    expect(errors[0]).toContain('missing required column');
  });

  // Review fixes (P3 adversarial pass)

  it('drops the WHOLE assembly when any of its rows is invalid (no partial assemblies)', () => {
    const { prebuilds, errors } = parsePrebuildsCsv(
      `${HDR}\nGPO point,,,,GPO-DBL,8\nGPO point,,,,CBL-TPS25,1x\nGPO point,,,,SW-1G,1\nDownlight point,,,,DLK-9W,1`,
    );
    // The two good GPO rows must NOT survive their sibling's bad qty.
    expect(prebuilds).toHaveLength(1);
    expect(prebuilds[0].name).toBe('Downlight point');
    expect(errors.some((e) => e.includes('skipped entirely'))).toBe(true);
  });

  it('drops the assembly even when the FIRST (meta-carrying) row is the bad one', () => {
    const { prebuilds } = parsePrebuildsCsv(
      `${HDR}\nDownlight point,Electrical,Points,yes,CBL-TPS25,abc\nDownlight point,,,,DLK-9W,1`,
    );
    expect(prebuilds).toHaveLength(0);
  });

  it('rejects a qty that rounds to zero at 2dp (DB column is numeric(10,2))', () => {
    const { prebuilds, errors } = parsePrebuildsCsv(`${HDR}\nGPO point,,,,GPO-DBL,0.004`);
    expect(prebuilds).toHaveLength(0);
    expect(errors[0]).toContain('at least 0.01');
  });
});

// ─── P3 task 80: dry-run the pipeline against the REAL repo starter CSV ───
// The starter CSV was removed from the repo once Luke's real catalogue took
// over — the dry-run only executes when the file is present locally.

const STARTER_CSV = resolve(process.cwd(), '..', 'casone-catalogue-starter.csv');

describe.runIf(existsSync(STARTER_CSV))('starter CSV dry-run (casone-catalogue-starter.csv)', () => {
  // Guarded read: vitest executes this factory during collection even when
  // runIf is false, so the read itself must not throw on a missing file.
  const text = existsSync(STARTER_CSV) ? readFileSync(STARTER_CSV, 'utf-8') : '';

  it('parses clean: 42 rows, zero errors, every row stocked + categorised', () => {
    const { rows, errors } = parseMaterialsCsv(text);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(42);
    for (const r of rows) {
      expect(r.sku).not.toBeNull();
      expect(r.isStockItem).toBe(true);
      expect(r.category).not.toBeNull();
      expect(r.subcategory).not.toBeNull();
    }
  });

  it('plans as 42 adds against an empty catalogue, with fields carried through', () => {
    const { rows } = parseMaterialsCsv(text);
    const plan = planImport([], rows);
    expect(plan.adds).toHaveLength(42);
    expect(plan.updates).toHaveLength(0);
    expect(plan.skips).toHaveLength(0);
    const tps = plan.adds.find((r) => r.sku === 'CBL-TPS25');
    expect(tps).toBeDefined();
    expect(tps?.category).toBe('Electrical');
    expect(tps?.subcategory).toBe('Cable & Conduit');
    expect(tps?.isFavourite).toBe(true);
  });

  it('re-import of the same file plans as pure updates (idempotent, no dupes)', () => {
    const { rows } = parseMaterialsCsv(text);
    const existing = rows.map((r, i) => ({ id: `m${i}`, sku: r.sku, name: r.name, isActive: true }));
    const plan = planImport(existing, rows);
    expect(plan.adds).toHaveLength(0);
    expect(plan.updates).toHaveLength(42);
  });
});

describe('planPrebuildImport', () => {
  const parsed = parsePrebuildsCsv(
    'prebuild_name,category,subcategory,is_favourite,item_sku,item_qty\n' +
    'Downlight point,Electrical,Points,yes,CBL-TPS25,12\n' +
    'Downlight point,,,,DLK-9W,1\n' +
    'GPO point,Electrical,Points,,GPO-DBL,1\n' +
    'Old assembly,,,,CBL-TPS25,4',
  ).prebuilds;

  const materials = [
    { id: 'm1', sku: 'CBL-TPS25' },
    { id: 'm2', sku: 'DLK-9W' },
    { id: 'm3', sku: null },
  ];

  it('creates fully-resolved prebuilds, skips existing names + missing SKUs', () => {
    const plan = planPrebuildImport([{ id: 'p1', name: 'old ASSEMBLY' }], materials, parsed);
    expect(plan.creates).toHaveLength(1);
    expect(plan.creates[0].prebuild.name).toBe('Downlight point');
    expect(plan.creates[0].items).toEqual([
      { materialId: 'm1', qty: 12 },
      { materialId: 'm2', qty: 1 },
    ]);
    // GPO point → missing SKU; Old assembly → name exists (case-insensitive)
    expect(plan.skips).toHaveLength(2);
    expect(plan.missingSkus).toEqual([{ prebuild: 'GPO point', sku: 'GPO-DBL', line: 4 }]);
  });
});

// P9.BS A2/A3 — the optional wholesaler columns (supplier, supplier_sku) and
// the supplier-resolution planner, plus a dry-run over Luke's REAL stock list
// (casone-stock-import.csv at the repo root) so the file and the parser can
// never drift apart silently. Run single-fork (house rule).

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { parseMaterialsCsv, planImport, planSupplierResolution } from '../lib/catalogue/csv';

const HDR13 =
  'sku,name,unit,cost_price,sell_price,tags,description,category,subcategory,is_stock_item,is_favourite,supplier,supplier_sku';

describe('parseMaterialsCsv — supplier columns', () => {
  it('carries supplier + supplier_sku through; blanks stay null', () => {
    const { rows, errors } = parseMaterialsCsv(
      `${HDR13}\nA1,Widget,ea,10,,,,Electrical,Cables,yes,no,AWM Electrical,10023756\nA2,Gadget,ea,5,,,,,,yes,no,,`,
    );
    expect(errors).toEqual([]);
    expect(rows[0].supplier).toBe('AWM Electrical');
    expect(rows[0].supplierSku).toBe('10023756');
    expect(rows[1].supplier).toBeNull();
    expect(rows[1].supplierSku).toBeNull();
  });

  it('11-column files (no supplier columns) still parse with nulls', () => {
    const { rows, errors } = parseMaterialsCsv(
      'sku,name,unit,cost_price,sell_price,tags,description,category,subcategory,is_stock_item,is_favourite\nA1,Widget,ea,10,,,,,,yes,no',
    );
    expect(errors).toEqual([]);
    expect(rows[0].supplier).toBeNull();
    expect(rows[0].supplierSku).toBeNull();
  });
});

describe('planSupplierResolution', () => {
  const parse = (body: string) => parseMaterialsCsv(`${HDR13}\n${body}`).rows;

  it('links case-insensitively, creates unknowns once (first casing wins)', () => {
    const rows = parse(
      'A1,W1,ea,1,,,,,,yes,no,awm electrical,111\n' +
      'A2,W2,ea,1,,,,,,yes,no,AWM Electrical,222\n' +
      'A3,W3,ea,1,,,,,,yes,no,Rexel,333\n' +
      'A4,W4,ea,1,,,,,,yes,no,rexel,444',
    );
    const plan = planSupplierResolution([{ id: 's1', name: 'AWM Electrical' }], rows);
    expect(plan.links.get('awm electrical')).toBe('s1');
    expect(plan.creates).toEqual(['Rexel']);
  });

  it('rows without a supplier name contribute nothing', () => {
    const rows = parse('A1,W1,ea,1,,,,,,yes,no,,123');
    const plan = planSupplierResolution([], rows);
    expect(plan.links.size).toBe(0);
    expect(plan.creates).toEqual([]);
  });
});

// ─── Dry-run over the REAL file (repo root; vitest cwd = frontend/) ─────────

const LUKE_CSV = resolve(process.cwd(), '..', 'casone-stock-import.csv');

describe.runIf(existsSync(LUKE_CSV))("Luke's stock list dry-run (casone-stock-import.csv)", () => {
  const text = existsSync(LUKE_CSV) ? readFileSync(LUKE_CSV, 'utf-8') : '';

  it('parses clean: 312 rows, zero errors, every row stocked + coded', () => {
    const { rows, errors } = parseMaterialsCsv(text);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(312);
    for (const r of rows) {
      expect(r.sku).not.toBeNull();
      expect(r.isStockItem).toBe(true);
      expect(r.category).not.toBeNull();
      // A3 regeneration: every row carries the wholesaler item code…
      expect(r.supplierSku).toMatch(/^\d+$/);
      // …and no code was left behind as free text in the description.
      expect(r.description ?? '').not.toMatch(/Supplier \d+/);
    }
  });

  it('plans as 312 adds on a fresh catalogue; supplier names still blank pending Luke', () => {
    const { rows } = parseMaterialsCsv(text);
    const plan = planImport([], rows);
    expect(plan.adds).toHaveLength(312);
    expect(plan.skips).toHaveLength(0);
    const sup = planSupplierResolution([], rows);
    expect(sup.creates).toEqual([]); // supplier column intentionally blank until named
  });

  it('re-import of the same file plans as pure updates (idempotent)', () => {
    const { rows } = parseMaterialsCsv(text);
    const existing = rows.map((r, i) => ({ id: `m${i}`, sku: r.sku, name: r.name, isActive: true }));
    const plan = planImport(existing, rows);
    expect(plan.adds).toHaveLength(0);
    expect(plan.updates).toHaveLength(312);
  });
});

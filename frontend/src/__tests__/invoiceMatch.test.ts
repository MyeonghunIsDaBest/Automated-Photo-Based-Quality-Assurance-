import { describe, it, expect } from 'vitest';
import { planInvoiceMatch, type OpenPoItem, type SupplierSkuEntry } from '../lib/purchasing/invoiceMatch';
import type { ParsedInvoiceLine } from '../lib/purchasing/invoiceCsv';

let seq = 0;
const iline = (over: Partial<ParsedInvoiceLine>): ParsedInvoiceLine => ({
  supplierSku: null, description: null, qty: null, unitPrice: null, lineTotal: null, orderRef: null, sortOrder: seq++, ...over,
});
const po = (over: Partial<OpenPoItem>): OpenPoItem => ({
  poItemId: 'pi-' + Math.round(over.unitCost ?? 0) + '-' + (over.poNumber ?? 'x'), poId: 'po', poNumber: 'PO-1',
  materialId: 'M', sku: null, name: null, qtyOrdered: 100, qtyInvoicedSoFar: 0, unitCost: 1, ...over,
});

describe('planInvoiceMatch', () => {
  it('matches a clean line by OUR sku within qty + price tolerance', () => {
    const plan = planInvoiceMatch(
      [po({ poItemId: 'A', sku: 'M1', qtyOrdered: 100, unitCost: 1.5 })],
      [iline({ supplierSku: 'M1', qty: 100, unitPrice: 1.5, lineTotal: 150 })],
      [],
    );
    expect(plan.lines).toHaveLength(1);
    expect(plan.lines[0]).toMatchObject({ poItemId: 'A', qty: 100, matchStatus: 'matched' });
    expect(plan.summary.matchedCount).toBe(1);
  });

  it('flags a price variance beyond tolerance', () => {
    const plan = planInvoiceMatch(
      [po({ poItemId: 'A', sku: 'M1', unitCost: 2 })],
      [iline({ supplierSku: 'M1', qty: 10, unitPrice: 3.5, lineTotal: 35 })],
      [],
    );
    expect(plan.lines[0].matchStatus).toBe('price_variance');
    expect(plan.summary.varianceCount).toBe(1);
  });

  it('applies the pack factor from supplier-SKU memory before qty/price checks', () => {
    const memory: SupplierSkuEntry[] = [{ supplierSku: 'DRUM', materialId: 'cable', qtyMultiplier: 100 }];
    const plan = planInvoiceMatch(
      [po({ poItemId: 'A', materialId: 'cable', qtyOrdered: 200, unitCost: 1.5 })],
      // 2 drums @ $150/drum → 200 of our metres @ $1.50 → matches the PO exactly.
      [iline({ supplierSku: 'DRUM', qty: 2, unitPrice: 150, lineTotal: 300 })],
      memory,
    );
    expect(plan.lines[0]).toMatchObject({ poItemId: 'A', materialId: 'cable', qty: 200, unitPrice: 1.5, matchStatus: 'matched' });
  });

  it('greedily allocates one invoice line across two PO lines (part shipment)', () => {
    const plan = planInvoiceMatch(
      [po({ poItemId: 'A', sku: 'M', qtyOrdered: 100, unitCost: 1 }), po({ poItemId: 'B', sku: 'M', qtyOrdered: 100, unitCost: 1 })],
      [iline({ supplierSku: 'M', qty: 150, unitPrice: 1, lineTotal: 150 })],
      [],
    );
    expect(plan.lines).toHaveLength(2);
    expect(plan.lines.map((l) => l.qty)).toEqual([100, 50]);
    expect(plan.lines.map((l) => l.poItemId)).toEqual(['A', 'B']);
    expect(plan.summary.matchedCount).toBe(2);
  });

  it('raises a qty variance when more is invoiced than the PO has remaining', () => {
    const plan = planInvoiceMatch(
      [po({ poItemId: 'A', sku: 'M', qtyOrdered: 100, unitCost: 1 })],
      [iline({ supplierSku: 'M', qty: 120, unitPrice: 1, lineTotal: 120 })],
      [],
    );
    expect(plan.lines).toHaveLength(2);
    expect(plan.lines[0]).toMatchObject({ qty: 100, matchStatus: 'matched' });
    expect(plan.lines[1]).toMatchObject({ qty: 20, matchStatus: 'qty_variance' });
  });

  it('respects qtyInvoicedSoFar so re-uploads cannot over-invoice', () => {
    const plan = planInvoiceMatch(
      [po({ poItemId: 'A', sku: 'M', qtyOrdered: 100, qtyInvoicedSoFar: 80, unitCost: 1 })],
      [iline({ supplierSku: 'M', qty: 30, unitPrice: 1, lineTotal: 30 })],
      [],
    );
    expect(plan.lines[0]).toMatchObject({ qty: 20, matchStatus: 'matched' }); // only 20 remained
    expect(plan.lines[1]).toMatchObject({ qty: 10, matchStatus: 'qty_variance' });
  });

  it('classifies a freight line as freight_or_fee', () => {
    const plan = planInvoiceMatch(
      [po({ poItemId: 'A', sku: 'M' })],
      [iline({ description: 'Freight & handling', qty: 1, unitPrice: 25, lineTotal: 25 })],
      [],
    );
    expect(plan.lines[0].matchStatus).toBe('freight_or_fee');
    expect(plan.summary.freightCount).toBe(1);
  });

  it('leaves an unknown item unmatched', () => {
    const plan = planInvoiceMatch(
      [po({ poItemId: 'A', sku: 'M' })],
      [iline({ supplierSku: 'ZZZ', description: 'Mystery', qty: 5, unitPrice: 2, lineTotal: 10 })],
      [],
    );
    expect(plan.lines[0].matchStatus).toBe('unmatched');
    expect(plan.summary.unmatchedCount).toBe(1);
  });

  it('scopes allocation to the invoice line order-ref (PO number)', () => {
    const plan = planInvoiceMatch(
      [po({ poItemId: 'A', sku: 'M', poNumber: 'PO-1' }), po({ poItemId: 'B', sku: 'M', poNumber: 'PO-2' })],
      [iline({ supplierSku: 'M', qty: 50, unitPrice: 1, lineTotal: 50, orderRef: 'PO-2' })],
      [],
    );
    expect(plan.lines[0].poItemId).toBe('B');
  });

  it('flags aggregate drift when the invoice total exceeds the matched PO total', () => {
    const plan = planInvoiceMatch(
      [po({ poItemId: 'A', sku: 'M', qtyOrdered: 100, unitCost: 1 })],
      [
        iline({ supplierSku: 'M', qty: 100, unitPrice: 1, lineTotal: 100 }),   // matched → PO total 100
        iline({ description: 'Freight', qty: 1, unitPrice: 50, lineTotal: 50 }), // adds 50 to invoice total only
      ],
      [],
    );
    expect(plan.summary.invoiceTotalExGst).toBe(150);
    expect(plan.summary.matchedPoTotalExGst).toBe(100);
    expect(plan.summary.driftFlagged).toBe(true);
  });
});

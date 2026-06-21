import { describe, expect, it } from 'vitest';
import { lineTotal, docTotals, quoteCostMargin, quoteFinancials, type MarginLine } from '../lib/commercial/money';

describe('lineTotal', () => {
  it('multiplies qty by unit price and rounds to 2dp', () => {
    expect(lineTotal({ qty: 3, unitPriceExGst: 1.115 })).toBe(3.35);
  });

  it('simple integer case', () => {
    expect(lineTotal({ qty: 2, unitPriceExGst: 5.00 })).toBe(10.00);
  });

  it('rounds half-up where JS float allows (1.115 * 3 = 3.345 → 3.35)', () => {
    // Covered by the first test; IEEE-754 means 1.005*100 is actually 100.4999...
    // so we use the 3.345 case which correctly rounds up.
    expect(lineTotal({ qty: 3, unitPriceExGst: 1.115 })).toBe(3.35);
  });

  it('zero qty', () => {
    expect(lineTotal({ qty: 0, unitPriceExGst: 99.99 })).toBe(0.00);
  });
});

describe('docTotals', () => {
  it('empty items returns all zeros', () => {
    const result = docTotals([], 0.10);
    expect(result.subtotalExGst).toBe(0);
    expect(result.gstAmount).toBe(0);
    expect(result.totalIncGst).toBe(0);
  });

  it('zero gst rate returns gst 0', () => {
    const items = [
      { qty: 2, unitPriceExGst: 10.00 },
      { qty: 1, unitPriceExGst: 5.00 },
    ];
    const result = docTotals(items, 0);
    expect(result.subtotalExGst).toBe(25.00);
    expect(result.gstAmount).toBe(0);
    expect(result.totalIncGst).toBe(25.00);
  });

  it('standard 10% GST on simple items', () => {
    const items = [
      { qty: 2, unitPriceExGst: 10.00 },
      { qty: 1, unitPriceExGst: 5.00 },
    ];
    const result = docTotals(items, 0.10);
    expect(result.subtotalExGst).toBe(25.00);
    expect(result.gstAmount).toBe(2.50);
    expect(result.totalIncGst).toBe(27.50);
  });

  // Discriminating case: doc-level GST differs from sum-of-per-line-GST.
  // 3 items: qty=1, unitPriceExGst=0.333 each.
  //   lineTotal per item: round2(1 * 0.333) = round2(0.333) = 0.33
  //   subtotal = 0.33 + 0.33 + 0.33 = 0.99
  //   doc gst  = round2(0.99 * 0.1) = round2(0.099) = 0.10
  //   total    = round2(0.99 + 0.10) = 1.09
  //   per-line gst sum = 3 * round2(0.33 * 0.1) = 3 * round2(0.033) = 3 * 0.03 = 0.09
  //   doc-level 0.10 != per-line sum 0.09  ✓
  it('doc-level GST != sum of per-line GST (rounding-order discriminator)', () => {
    const items = [
      { qty: 1, unitPriceExGst: 0.333 },
      { qty: 1, unitPriceExGst: 0.333 },
      { qty: 1, unitPriceExGst: 0.333 },
    ];
    const result = docTotals(items, 0.10);
    expect(result.subtotalExGst).toBe(0.99);
    expect(result.gstAmount).toBe(0.10);
    expect(result.totalIncGst).toBe(1.09);
    // Confirm the doc GST differs from naive per-line sum
    const naivePerLineGstSum = 3 * Math.round(0.33 * 0.1 * 100) / 100;
    expect(naivePerLineGstSum).toBe(0.09);
    expect(result.gstAmount).not.toBe(naivePerLineGstSum);
  });

  it('single item', () => {
    const result = docTotals([{ qty: 3, unitPriceExGst: 1.115 }], 0.10);
    expect(result.subtotalExGst).toBe(3.35);
    expect(result.gstAmount).toBe(0.34); // round2(3.35 * 0.1) = round2(0.335) = 0.34
    expect(result.totalIncGst).toBe(3.69); // round2(3.35 + 0.34) = 3.69
  });
});

describe('quoteCostMargin', () => {
  it('empty items returns zeros and null margin', () => {
    const r = quoteCostMargin([], 0.10);
    expect(r.sellExGst).toBe(0);
    expect(r.materialsCost).toBe(0);
    expect(r.labourCost).toBe(0);
    expect(r.otherCost).toBe(0);
    expect(r.uncostedLabourLines).toBe(0);
    expect(r.profit.net).toBe(0);
    expect(r.profit.marginPct).toBeNull(); // revenue 0 → margin undefined
  });

  it('splits cost by kind, marks up labour, and flags uncosted labour', () => {
    const items: MarginLine[] = [
      // material: sell 45, cost 20, qty 4
      { kind: 'material', qty: 4, unitPriceExGst: 45, costPriceExGst: 20 },
      // labour marked up: sell 140/hr, cost 95/hr, 4 hr
      { kind: 'labour', qty: 4, unitPriceExGst: 140, costPriceExGst: 95 },
      // custom line with no cost
      { kind: 'custom', qty: 1, unitPriceExGst: 50, costPriceExGst: null },
      // labour line with no rate → uncosted, sell 0
      { kind: 'labour', qty: 2, unitPriceExGst: 0, costPriceExGst: null },
    ];
    const r = quoteCostMargin(items, 0.10);
    expect(r.sellExGst).toBe(790);     // 180 + 560 + 50 + 0
    expect(r.materialsCost).toBe(80);  // 4 * 20
    expect(r.labourCost).toBe(380);    // 4 * 95 (only the costed labour line)
    expect(r.otherCost).toBe(0);       // custom cost is null
    expect(r.uncostedLabourLines).toBe(1);
    expect(r.profit.gross).toBe(710);  // 790 - 80
    expect(r.profit.net).toBe(330);    // 710 - (380 + 0)
    expect(r.profit.marginPct).toBe(41.8); // round1(330 / 790 * 100)
  });

  it('discount reduces the net sell and the margin', () => {
    const items: MarginLine[] = [
      { kind: 'material', qty: 1, unitPriceExGst: 1000, costPriceExGst: 600 },
    ];
    const r = quoteCostMargin(items, 0.10, 200); // $200 discount
    expect(r.sellExGst).toBe(800);        // 1000 - 200
    expect(r.discountExGst).toBe(200);
    expect(r.materialsCost).toBe(600);
    expect(r.profit.gross).toBe(200);     // 800 - 600
    expect(r.grossMarginPct).toBe(25);    // 200 / 800 × 100
  });
});

describe('quoteFinancials', () => {
  it('applies discount before GST, then subtracts STC + VEEC rebates', () => {
    const items = [{ qty: 1, unitPriceExGst: 10000 }];
    const r = quoteFinancials(items, 0.10, { discountExGst: 400, stcRebate: 1533, veecRebate: 220 });
    expect(r.subtotalExGst).toBe(10000);
    expect(r.discountExGst).toBe(400);
    expect(r.netSubtotalExGst).toBe(9600);  // 10000 - 400
    expect(r.gstAmount).toBe(960);          // 9600 × 0.10
    expect(r.totalIncGst).toBe(10560);      // 9600 + 960
    expect(r.rebatesTotal).toBe(1753);      // 1533 + 220
    expect(r.customerPays).toBe(8807);      // 10560 - 1753
  });

  it('no discount/rebates returns plain totals', () => {
    const r = quoteFinancials([{ qty: 2, unitPriceExGst: 50 }], 0.10);
    expect(r.netSubtotalExGst).toBe(100);
    expect(r.totalIncGst).toBe(110);
    expect(r.rebatesTotal).toBe(0);
    expect(r.customerPays).toBe(110);
  });
});

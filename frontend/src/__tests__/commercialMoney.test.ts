import { describe, expect, it } from 'vitest';
import { lineTotal, docTotals } from '../lib/commercial/money';

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

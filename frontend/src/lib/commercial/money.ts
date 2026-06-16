// ─────────────────────────────────────────────────────────────────────────────
// lib/commercial/money.ts — Pure GST money math for quotes, invoices, and
// variations.  No I/O; no Supabase imports.
//
// Rounding discipline:
//   - Every line total is rounded to 2dp independently (Math.round half-up).
//   - GST is computed on the SUM of rounded line totals (subtotal), not on
//     per-line amounts, then rounded to 2dp.
//   - The document total is round2(subtotal + gstAmount).
//
// This order deliberately differs from computing GST per line then summing,
// which can produce a 1-cent discrepancy (see tests).
// ─────────────────────────────────────────────────────────────────────────────

/** Input shape for a single line in any document (quote, invoice, variation). */
export interface MoneyLine {
  qty: number;
  unitPriceExGst: number;
}

/** Round a number to 2 decimal places using half-up semantics. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Compute the rounded line total for a single document line.
 * Result is always rounded to 2dp.
 */
export function lineTotal(line: MoneyLine): number {
  return round2(line.qty * line.unitPriceExGst);
}

/** Document-level totals returned by `docTotals`. */
export interface DocTotals {
  subtotalExGst: number;
  gstAmount: number;
  totalIncGst: number;
}

/**
 * Compute document-level totals from an array of line items and a GST rate
 * (e.g. 0.10 for 10%).
 *
 * Algorithm:
 *   1. Sum the ROUNDED line totals to get subtotalExGst.
 *   2. gstAmount = round2(subtotal * rate).
 *   3. totalIncGst = round2(subtotal + gstAmount).
 */
export function docTotals(items: MoneyLine[], gstRate: number): DocTotals {
  const subtotalExGst = items.reduce((sum, item) => sum + lineTotal(item), 0);
  const subtotalRounded = round2(subtotalExGst);
  const gstAmount = round2(subtotalRounded * gstRate);
  const totalIncGst = round2(subtotalRounded + gstAmount);
  return { subtotalExGst: subtotalRounded, gstAmount, totalIncGst };
}

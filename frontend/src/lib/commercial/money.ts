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

import { computeProfit, type ProfitResult } from './costing';

/** Input shape for a single line in any document (quote, invoice, variation). */
export interface MoneyLine {
  qty: number;
  unitPriceExGst: number;
}

/** Round a number to 2 decimal places using half-up semantics. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Round a number to 1 decimal place (for margin %). */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
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

// ─────────────────────────────────────────────────────────────────────────────
// Manager-only cost / margin rollup for a quote (or invoice/variation).
//
// Each line carries a `kind` (material | labour | custom) and an optional
// `costPriceExGst` snapshot. Sell is the usual qty×unitPrice subtotal; cost is
// summed per kind. The profit is computed via the shared costing engine so the
// margin pill matches the per-job ProfitSummaryCard. A labour line with no cost
// (the role had no rate set) is counted in `uncostedLabourLines` so the UI can
// flag that the margin is understated.
// ─────────────────────────────────────────────────────────────────────────────

/** A line for the cost/margin rollup — a MoneyLine plus its kind + cost. */
export interface MarginLine extends MoneyLine {
  kind: 'material' | 'labour' | 'custom';
  costPriceExGst: number | null;
}

export interface QuoteCostMargin {
  /** Net sell ex-GST (document subtotal − discount) — the actual revenue. */
  sellExGst: number;
  /** Document discount applied (ex-GST). */
  discountExGst: number;
  materialsCost: number;
  labourCost: number;
  otherCost: number;
  /** gross = sell − materials; net = gross − (labour + other); marginPct on sell. */
  profit: ProfitResult;
  /** Gross margin % = gross / sell × 100, null when sell ≤ 0. */
  grossMarginPct: number | null;
  /** Count of labour lines with no cost (role had no rate) — margin understated. */
  uncostedLabourLines: number;
}

export function quoteCostMargin(
  items: MarginLine[],
  gstRate: number,
  discountExGst = 0,
): QuoteCostMargin {
  const rawSubtotal = docTotals(items, gstRate).subtotalExGst;
  const sellExGst = round2(rawSubtotal - discountExGst); // net of discount = real revenue

  let materialsCost = 0;
  let labourCost = 0;
  let otherCost = 0;
  let uncostedLabourLines = 0;

  for (const it of items) {
    if (it.kind === 'labour' && it.costPriceExGst === null) uncostedLabourLines += 1;
    if (it.costPriceExGst === null) continue;
    const c = round2(it.qty * it.costPriceExGst);
    if (it.kind === 'material') materialsCost += c;
    else if (it.kind === 'labour') labourCost += c;
    else otherCost += c;
  }

  materialsCost = round2(materialsCost);
  labourCost = round2(labourCost);
  otherCost = round2(otherCost);

  const profit = computeProfit({
    revenueExGst: sellExGst,
    materialsCost,
    labourCost: round2(labourCost + otherCost),
  });
  const grossMarginPct = sellExGst > 0 ? round1((profit.gross / sellExGst) * 100) : null;

  return {
    sellExGst,
    discountExGst: round2(discountExGst),
    materialsCost,
    labourCost,
    otherCost,
    profit,
    grossMarginPct,
    uncostedLabourLines,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Customer-facing quote money — discount, GST, and solar rebates (STC/VEEC).
//   subtotal(ex GST) − discount → GST on the net → total(inc GST)
//   − STC rebate − VEEC rebate = what the customer pays.
// Rebates are a pass-through (revenue-neutral to margin); the discount reduces
// the net sell (and therefore margin — see quoteCostMargin).
// ─────────────────────────────────────────────────────────────────────────────

export interface QuoteFinancials {
  subtotalExGst: number;
  discountExGst: number;
  netSubtotalExGst: number;
  gstAmount: number;
  totalIncGst: number;
  rebatesTotal: number;
  customerPays: number;
}

export function quoteFinancials(
  items: MoneyLine[],
  gstRate: number,
  opts: { discountExGst?: number; stcRebate?: number; veecRebate?: number } = {},
): QuoteFinancials {
  const subtotalExGst = docTotals(items, gstRate).subtotalExGst;
  const discountExGst = round2(opts.discountExGst ?? 0);
  const netSubtotalExGst = round2(Math.max(0, subtotalExGst - discountExGst));
  const gstAmount = round2(netSubtotalExGst * gstRate);
  const totalIncGst = round2(netSubtotalExGst + gstAmount);
  const rebatesTotal = round2((opts.stcRebate ?? 0) + (opts.veecRebate ?? 0));
  const customerPays = round2(Math.max(0, totalIncGst - rebatesTotal));
  return { subtotalExGst, discountExGst, netSubtotalExGst, gstAmount, totalIncGst, rebatesTotal, customerPays };
}

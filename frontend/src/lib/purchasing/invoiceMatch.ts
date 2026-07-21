// ─────────────────────────────────────────────────────────────────────────────
// lib/purchasing/invoiceMatch.ts — match parsed invoice lines against a supplier's
// open PO lines, per the P7 design (docs/WHOLESALER_INGESTION_PLAN.md §4.3).
//
// PURE + deterministic (unit-tested). Supplier-scoped, ALLOCATION-based (not 1:1):
// one invoice line's qty fills across candidate PO lines (part shipments), so it
// can split into several matched lines. The supplier-SKU memory applies the PACK
// FACTOR (their "1 drum" = 100 of our "m") BEFORE any qty/price check.
//
// Nothing here writes to the DB — it produces a plan the confirm UI (P7.1b) turns
// into supplier_invoice_lines rows. Fuzzy/description matches are SUGGESTIONS only,
// never auto-accepted.
// ─────────────────────────────────────────────────────────────────────────────

import type { ParsedInvoiceLine } from './invoiceCsv';

export interface OpenPoItem {
  poItemId: string;
  poId: string;
  poNumber: string | null;
  materialId: string;
  sku: string | null;        // OUR sku (some invoices carry it directly)
  name: string | null;
  qtyOrdered: number;
  /** Σ qty of already-persisted matched lines for this PO item (from the DB) —
   *  so part shipments and re-uploads can never over-invoice. */
  qtyInvoicedSoFar: number;
  unitCost: number;          // PO line unit cost (ex-GST)
}

export interface SupplierSkuEntry {
  supplierSku: string;
  materialId: string;
  qtyMultiplier: number;     // pack factor: 1 of theirs = qtyMultiplier of ours
}

export interface MatchTolerances {
  pricePct: number;    // e.g. 0.02 (2%)
  priceAbs: number;    // e.g. 1.00 ($1)
  roundingAbs: number; // cents-level tolerance for line_total ≠ qty×price
  driftPct: number;    // aggregate invoice-vs-PO drift flag threshold, e.g. 0.01
}

export const DEFAULT_TOLERANCES: MatchTolerances = { pricePct: 0.02, priceAbs: 1, roundingAbs: 0.02, driftPct: 0.01 };

export type LineMatchStatus = 'matched' | 'price_variance' | 'qty_variance' | 'unmatched' | 'freight_or_fee' | 'credit';

export interface MatchedInvoiceLine {
  sourceSortOrder: number;   // which parsed line this came from (one → many)
  poItemId: string | null;
  materialId: string | null;
  supplierSku: string | null;
  description: string | null;
  qty: number | null;        // in OUR units (pack factor applied)
  unitPrice: number | null;  // ex-GST per OUR unit
  lineTotal: number | null;  // ex-GST
  matchStatus: LineMatchStatus;
  note: string | null;
}

export interface InvoiceMatchPlan {
  lines: MatchedInvoiceLine[];
  summary: {
    invoiceTotalExGst: number;
    matchedPoTotalExGst: number;   // Σ allocated qty × PO unit cost
    driftAbs: number;
    driftFlagged: boolean;
    matchedCount: number;
    varianceCount: number;         // price + qty variances
    unmatchedCount: number;
    freightCount: number;
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();
const FREIGHT_RE = /\b(freight|delivery|cartage|handling|surcharge|fee|postage|shipping)\b/i;

/** Allocation-based supplier-scoped match. `openPoItems` must already be filtered
 *  to this supplier's non-cancelled POs. */
export function planInvoiceMatch(
  openPoItems: OpenPoItem[],
  invoiceLines: ParsedInvoiceLine[],
  memory: SupplierSkuEntry[],
  tolerances: MatchTolerances = DEFAULT_TOLERANCES,
): InvoiceMatchPlan {
  // Working copy with a mutable remaining balance per PO item, preserving input
  // order as the deterministic tiebreak.
  const pool = openPoItems.map((it, i) => ({
    ...it,
    left: Math.max(0, round2(it.qtyOrdered - it.qtyInvoicedSoFar)),
    order: i,
  }));
  const memByCode = new Map<string, SupplierSkuEntry>();
  for (const m of memory) memByCode.set(norm(m.supplierSku), m);

  const out: MatchedInvoiceLine[] = [];
  let matchedPoTotal = 0;

  const priceStatus = (ourUnit: number | null, poCost: number): LineMatchStatus => {
    if (ourUnit === null) return 'matched'; // no price to compare — accept, noted upstream
    const tol = Math.max(tolerances.pricePct * poCost, tolerances.priceAbs);
    return Math.abs(ourUnit - poCost) <= tol ? 'matched' : 'price_variance';
  };

  for (const line of invoiceLines) {
    // 1. Resolve material + pack factor: supplier-SKU memory first, then our-SKU
    //    exact, else unresolved.
    let materialId: string | null = null;
    let packFactor = 1;
    let resolvedBy: 'memory' | 'our_sku' | null = null;

    const memHit = line.supplierSku ? memByCode.get(norm(line.supplierSku)) : undefined;
    if (memHit) {
      materialId = memHit.materialId;
      packFactor = memHit.qtyMultiplier > 0 ? memHit.qtyMultiplier : 1;
      resolvedBy = 'memory';
    } else if (line.supplierSku) {
      const ourHit = pool.find((p) => p.sku && norm(p.sku) === norm(line.supplierSku));
      if (ourHit) { materialId = ourHit.materialId; resolvedBy = 'our_sku'; }
    }

    // 2. Unresolved → freight/fee (heuristic) or unmatched (with a fuzzy hint).
    if (!materialId) {
      const looksFreight = FREIGHT_RE.test(line.description ?? '') || (line.qty === null && line.lineTotal !== null);
      if (looksFreight) {
        out.push(baseLine(line, { poItemId: null, materialId: null, qty: line.qty, matchStatus: 'freight_or_fee', note: 'Freight / fee — on a job PO this can be added to job cost at confirm.' }));
      } else {
        const fuzzy = line.description ? pool.find((p) => norm(p.name).length > 0 && norm(p.name) === norm(line.description)) : undefined;
        out.push(baseLine(line, { poItemId: null, materialId: null, qty: line.qty, matchStatus: 'unmatched', note: fuzzy ? `Possible match: ${fuzzy.name} (confirm manually)` : null }));
      }
      continue;
    }

    // 3. Convert to OUR units via pack factor.
    const ourQtyTotal = line.qty !== null ? round2(line.qty * packFactor) : null;
    const ourUnitPrice =
      line.unitPrice !== null ? round2(line.unitPrice / packFactor)
      : line.lineTotal !== null && ourQtyTotal ? round2(line.lineTotal / ourQtyTotal)
      : null;
    const packNote = packFactor !== 1 ? `Pack factor ×${packFactor} (${resolvedBy === 'memory' ? 'learned code' : 'manual'}).` : null;

    // 4. Candidate PO lines for this material, remaining-first then input order.
    //    Order-ref (when the invoice carries our PO number) narrows first.
    let candidates = pool.filter((p) => p.materialId === materialId);
    if (line.orderRef) {
      const refScoped = candidates.filter((p) => p.poNumber && norm(p.poNumber) === norm(line.orderRef));
      if (refScoped.length > 0) candidates = refScoped;
    }
    candidates = candidates.slice().sort((a, b) => (b.left > 0 ? 1 : 0) - (a.left > 0 ? 1 : 0) || a.order - b.order);

    if (ourQtyTotal === null) {
      // A resolved material with no qty — treat as a single line against the best
      // candidate, price-checked, qty left unknown.
      const best = candidates[0] ?? null;
      const status = best ? priceStatus(ourUnitPrice, best.unitCost) : 'unmatched';
      out.push(baseLine(line, { poItemId: best?.poItemId ?? null, materialId, qty: null, unitPrice: ourUnitPrice, matchStatus: best ? status : 'unmatched', note: joinNotes(packNote, best ? null : 'No open PO line to attribute to.') }));
      continue;
    }

    // 5. Greedy allocation across candidates.
    let remaining = ourQtyTotal;
    let allocatedAny = false;
    for (const cand of candidates) {
      if (remaining <= 0) break;
      if (cand.left <= 0) continue;
      const alloc = round2(Math.min(cand.left, remaining));
      if (alloc <= 0) continue;
      cand.left = round2(cand.left - alloc);
      remaining = round2(remaining - alloc);
      allocatedAny = true;
      const status = priceStatus(ourUnitPrice, cand.unitCost);
      const allocTotal = ourUnitPrice !== null ? round2(ourUnitPrice * alloc) : null;
      matchedPoTotal = round2(matchedPoTotal + alloc * cand.unitCost);
      const roundNote = line.lineTotal !== null && allocTotal !== null && candidates.length === 1 && remaining <= 0 && Math.abs(line.lineTotal - allocTotal) > tolerances.roundingAbs
        ? `Line total ${line.lineTotal} ≠ qty×price ${allocTotal}.` : null;
      out.push(baseLine(line, { poItemId: cand.poItemId, materialId, qty: alloc, unitPrice: ourUnitPrice, lineTotal: allocTotal, matchStatus: status, note: joinNotes(packNote, roundNote) }));
    }

    // 6. Qty overflow (invoiced more than any open PO line has remaining).
    if (remaining > tolerances.roundingAbs) {
      const overflowTotal = ourUnitPrice !== null ? round2(ourUnitPrice * remaining) : null;
      out.push(baseLine(line, { poItemId: null, materialId, qty: remaining, unitPrice: ourUnitPrice, lineTotal: overflowTotal, matchStatus: 'qty_variance', note: joinNotes(packNote, allocatedAny ? 'More invoiced than remained on the PO.' : 'No open PO quantity remained for this item.') }));
    }
  }

  // Summary + aggregate drift.
  const invoiceTotalExGst = round2(invoiceLines.reduce((s, l) => s + (l.lineTotal ?? 0), 0));
  matchedPoTotal = round2(matchedPoTotal);
  const driftAbs = round2(Math.abs(invoiceTotalExGst - matchedPoTotal));
  const driftFlagged = matchedPoTotal > 0 && driftAbs / matchedPoTotal > tolerances.driftPct;

  const count = (s: LineMatchStatus) => out.filter((l) => l.matchStatus === s).length;
  return {
    lines: out,
    summary: {
      invoiceTotalExGst,
      matchedPoTotalExGst: matchedPoTotal,
      driftAbs,
      driftFlagged,
      matchedCount: count('matched'),
      varianceCount: count('price_variance') + count('qty_variance'),
      unmatchedCount: count('unmatched'),
      freightCount: count('freight_or_fee'),
    },
  };
}

// ── helpers ──────────────────────────────────────────────────────────────────

function baseLine(src: ParsedInvoiceLine, over: Partial<MatchedInvoiceLine>): MatchedInvoiceLine {
  return {
    sourceSortOrder: src.sortOrder,
    poItemId: null,
    materialId: null,
    supplierSku: src.supplierSku,
    description: src.description,
    qty: null,
    unitPrice: null,
    lineTotal: src.lineTotal,
    matchStatus: 'unmatched',
    note: null,
    ...over,
  };
}

function joinNotes(...notes: (string | null)[]): string | null {
  const kept = notes.filter((n): n is string => !!n);
  return kept.length ? kept.join(' ') : null;
}

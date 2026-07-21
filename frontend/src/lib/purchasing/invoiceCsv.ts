// ─────────────────────────────────────────────────────────────────────────────
// lib/purchasing/invoiceCsv.ts — parse a wholesaler's invoice CSV into normalised
// ex-GST lines, per the P7 design (docs/WHOLESALER_INGESTION_PLAN.md §4.2).
//
// PURE + deterministic (unit-tested single-fork, the P3 pattern). No network, no
// DB — it turns text + a per-wholesaler column mapping into `ParsedInvoiceLine[]`
// plus honest errors and a hard "this isn't an ingestible invoice" stop.
//
// Reuses `parseCsvLine` (quoted fields, doubled-quote escapes) from the catalogue
// importer and replicates its caller-side BOM strip + \r?\n split (those live in
// the caller, not in parseCsvLine). Inherits the no-embedded-newlines limitation.
// ─────────────────────────────────────────────────────────────────────────────

import { parseCsvLine } from '../catalogue/csv';

/** Per-wholesaler column mapping. Header names are matched case-insensitively.
 *  Finalised per wholesaler once Luke's real sample invoices land (P7 task 169);
 *  until then a mapping is supplied by the caller/test. */
export interface InvoiceCsvMapping {
  columns: {
    supplierSku?: string;   // their item code
    description?: string;
    qty?: string;
    unitPrice?: string;     // per-unit price
    lineTotal?: string;     // extended line total — AUTHORITATIVE when present
    orderRef?: string;      // our PO number carried per line
    netPrice?: string;      // optional post-discount unit price (wins over unitPrice)
  };
  /** Price columns GST-inclusive? Then normalise ÷ (1 + gstRate) before compare. */
  pricesIncludeGst: boolean;
  /** GST rate as a fraction (AU = 0.10). */
  gstRate: number;
}

export interface ParsedInvoiceLine {
  supplierSku: string | null;
  description: string | null;
  qty: number | null;
  /** ex-GST per-unit price (normalised). null when unknown. */
  unitPrice: number | null;
  /** ex-GST extended line total (authoritative). null when unknown. */
  lineTotal: number | null;
  orderRef: string | null;
  sortOrder: number;
}

export type InvoiceStopKind = 'empty' | 'header' | 'credit_note' | 'delivery_docket' | 'price_file';

export interface ParseInvoiceResult {
  lines: ParsedInvoiceLine[];
  errors: string[];
  /** Non-null = do NOT ingest; the reason is customer-safe copy. */
  stop: { kind: InvoiceStopKind; message: string } | null;
  /** Σ of line totals (ex-GST) — the reconciliation anchor at confirm time. */
  totalExGst: number;
}

/** Money parse tolerant of "$1,234.56", "(1.20)" (accounting negatives), blanks.
 *  Returns null for blank, NaN for un-parseable (caller decides). */
function parseAmount(raw: string): number | null {
  let t = raw.trim();
  if (t === '') return null;
  let sign = 1;
  // Accounting parentheses = negative.
  if (/^\(.*\)$/.test(t)) { sign = -1; t = t.slice(1, -1); }
  t = t.replace(/[$\s]/g, '').replace(/,/g, '');
  if (t.startsWith('-')) { sign = -1; t = t.slice(1); }
  const n = Number(t);
  return Number.isFinite(n) ? sign * n : NaN;
}

function parseQty(raw: string): number | null {
  const n = parseAmount(raw);
  return n === null || Number.isNaN(n) ? null : n;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Parse an invoice CSV. `line_total` (when present) is authoritative — the
 * effective unit price is derived from it (line_total ÷ qty). GST-inclusive
 * prices are normalised ÷ (1 + gstRate) so every stored/compared number is ex-GST.
 */
export function parseInvoiceCsv(text: string, mapping: InvoiceCsvMapping): ParseInvoiceResult {
  const errors: string[] = [];
  const lines: ParsedInvoiceLine[] = [];

  const rawLines = text.split(/\r?\n/);
  if (rawLines.length === 0 || rawLines[0].trim() === '') {
    return { lines, errors: ['file is empty'], stop: { kind: 'empty', message: 'The file is empty.' }, totalExGst: 0 };
  }

  // Header (strip a UTF-8 BOM — Excel exports lead with one).
  const headerFields = parseCsvLine(rawLines[0].replace(/^﻿/, '')).map((h) => h.trim().toLowerCase());
  const colIndex = (name?: string): number => (name ? headerFields.indexOf(name.trim().toLowerCase()) : -1);
  const idx = {
    supplierSku: colIndex(mapping.columns.supplierSku),
    description: colIndex(mapping.columns.description),
    qty: colIndex(mapping.columns.qty),
    unitPrice: colIndex(mapping.columns.unitPrice),
    lineTotal: colIndex(mapping.columns.lineTotal),
    orderRef: colIndex(mapping.columns.orderRef),
    netPrice: colIndex(mapping.columns.netPrice),
  };

  // A usable invoice needs at least one price signal AND a quantity. No qty
  // column at all → it's a price file, not an invoice (§3 wrong-document guard).
  const hasPriceCol = idx.unitPrice >= 0 || idx.lineTotal >= 0 || idx.netPrice >= 0;
  if (!hasPriceCol) {
    return {
      lines, errors: ['no price/total column found'],
      stop: { kind: 'header', message: 'No price or line-total column was found — check the column mapping.' },
      totalExGst: 0,
    };
  }
  if (idx.qty < 0) {
    return {
      lines, errors: ['no quantity column found'],
      stop: { kind: 'price_file', message: 'This looks like a price file (no quantity column), not an invoice.' },
      totalExGst: 0,
    };
  }

  const gstDivisor = mapping.pricesIncludeGst ? 1 + mapping.gstRate : 1;
  const exGst = (n: number) => n / gstDivisor;

  let totalExGst = 0;
  let anyPrice = false;

  for (let r = 1; r < rawLines.length; r++) {
    const rowText = rawLines[r];
    if (rowText.trim() === '') continue; // skip blank rows
    const f = parseCsvLine(rowText);
    const at = (i: number): string => (i >= 0 && i < f.length ? f[i] : '');

    const supplierSku = idx.supplierSku >= 0 ? at(idx.supplierSku).trim() || null : null;
    const description = idx.description >= 0 ? at(idx.description).trim() || null : null;
    const orderRef = idx.orderRef >= 0 ? at(idx.orderRef).trim() || null : null;
    const qty = parseQty(at(idx.qty));

    // A row with nothing identifying and no qty is noise (trailing totals row etc.).
    if (supplierSku === null && description === null && qty === null) continue;

    // Raw price signals (may be GST-inclusive).
    const rawLineTotal = idx.lineTotal >= 0 ? parseAmount(at(idx.lineTotal)) : null;
    const rawNet = idx.netPrice >= 0 ? parseAmount(at(idx.netPrice)) : null;
    const rawUnit = idx.unitPrice >= 0 ? parseAmount(at(idx.unitPrice)) : null;

    // Surface un-parseable numbers as row errors rather than silently zeroing.
    if (rawLineTotal !== null && Number.isNaN(rawLineTotal)) errors.push(`row ${r + 1}: line total isn't a number`);
    if (rawNet !== null && Number.isNaN(rawNet)) errors.push(`row ${r + 1}: net price isn't a number`);
    if (rawUnit !== null && Number.isNaN(rawUnit)) errors.push(`row ${r + 1}: unit price isn't a number`);

    const cleanLineTotal = rawLineTotal !== null && !Number.isNaN(rawLineTotal) ? rawLineTotal : null;
    const cleanNet = rawNet !== null && !Number.isNaN(rawNet) ? rawNet : null;
    const cleanUnit = rawUnit !== null && !Number.isNaN(rawUnit) ? rawUnit : null;

    // line_total is authoritative; else prefer net (post-discount) over gross unit.
    const lineTotalExGst = cleanLineTotal !== null ? round2(exGst(cleanLineTotal)) : null;
    const perUnitRaw = cleanNet !== null ? cleanNet : cleanUnit;

    let unitPriceExGst: number | null = null;
    if (lineTotalExGst !== null && qty !== null && qty !== 0) {
      unitPriceExGst = round2(lineTotalExGst / qty);
    } else if (perUnitRaw !== null) {
      unitPriceExGst = round2(exGst(perUnitRaw));
    }

    // Derive a line total if the file only gave a unit price.
    const derivedTotal =
      lineTotalExGst !== null
        ? lineTotalExGst
        : unitPriceExGst !== null && qty !== null
          ? round2(unitPriceExGst * qty)
          : null;

    // A zero total counts toward the sum but NOT as "has a price" — an all-zero
    // file is a delivery docket, not an invoice (§3 wrong-document guard).
    if (derivedTotal !== null) { totalExGst += derivedTotal; if (derivedTotal !== 0) anyPrice = true; }

    lines.push({
      supplierSku,
      description,
      qty,
      unitPrice: unitPriceExGst,
      lineTotal: derivedTotal,
      orderRef,
      sortOrder: lines.length,
    });
  }

  totalExGst = round2(totalExGst);

  // Doc-type / credit-note stops (§3, §4.2). Order matters: an empty parse first.
  let stop: ParseInvoiceResult['stop'] = null;
  if (lines.length === 0) {
    stop = { kind: 'header', message: 'No data rows were found under the header.' };
  } else if (!anyPrice) {
    stop = { kind: 'delivery_docket', message: 'Every line has a blank/zero price — this looks like a delivery docket, not an invoice.' };
  } else if (totalExGst < 0) {
    stop = { kind: 'credit_note', message: 'The document total is negative — this looks like a credit note. Record it manually against the original invoice (v1).' };
  }

  return { lines, errors, stop, totalExGst };
}

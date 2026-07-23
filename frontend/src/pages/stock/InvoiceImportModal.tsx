// ─────────────────────────────────────────────────────────────────────────────
// pages/stock/InvoiceImportModal.tsx — P7.1b: wholesaler invoice upload →
// column mapping → line-by-line match preview → confirm.
//
// Sample-independent by design: the per-wholesaler column mapping is edited in
// the modal (auto-guessed from the header row) and remembered per supplier in
// localStorage — Luke's real invoices VALIDATE mappings rather than block the
// build. Server-side mapping presets are a follow-up once formats are locked.
//
// Confirm writes the header + every line with its match status via
// createSupplierInvoiceWithLines (mig 104); "remember this code" teaches the
// supplier-SKU memory (mig 98); substitutions never teach. Nothing writes until
// the human confirms — the engine only proposes.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from "react";
import { Upload, Loader2, AlertTriangle, FileText, Check } from "lucide-react";

import MotionDrawer from "../../components/ui/MotionDrawer";
import { DrawerHeader, DrawerBody, DrawerFooter } from "../../components/ui/Sheet";
import { btnPrimary, btnGhost, inputField, StatusPill, type ToneKey } from "../gantt/components/ledger";
import { Toaster, type ToastState } from "../../components/ui/Toaster";
import { fmtMoney, fmtQty } from "../../lib/format";

import { parseCsvLine } from "../../lib/catalogue/csv";
import { parseInvoiceCsv, type InvoiceCsvMapping, type ParseInvoiceResult } from "../../lib/purchasing/invoiceCsv";
import { planInvoiceMatch, type InvoiceMatchPlan, type MatchedInvoiceLine, type OpenPoItem, type LineMatchStatus } from "../../lib/purchasing/invoiceMatch";
import {
  listOpenPoItemsForSupplier, listSupplierSkusForSupplier, createSupplierInvoiceWithLines, upsertSupplierSku,
} from "../../lib/api/purchasing";
import { listSuppliers, type Supplier } from "../../lib/api/suppliers";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Fired after a successful confirm so the Orders list can refresh. */
  onDone: (message: string) => void;
}

// ─── column mapping ───────────────────────────────────────────────────────────

type MapField = "supplierSku" | "description" | "qty" | "unitPrice" | "lineTotal" | "orderRef" | "netPrice";
const MAP_FIELDS: { key: MapField; label: string; hint: string }[] = [
  { key: "supplierSku", label: "Their item code", hint: "the wholesaler's SKU column" },
  { key: "description", label: "Description", hint: "item description" },
  { key: "qty", label: "Quantity", hint: "required — a file without one is a price list" },
  { key: "unitPrice", label: "Unit price", hint: "per-unit price" },
  { key: "lineTotal", label: "Line total", hint: "authoritative when present" },
  { key: "orderRef", label: "Our PO number", hint: "per-line order reference, if their export carries it" },
  { key: "netPrice", label: "Net price", hint: "post-discount unit price (wins over unit price)" },
];

// Header-name auto-guesses per field (checked in order, case-insensitive).
const GUESSES: Record<MapField, string[]> = {
  supplierSku: ["code", "item code", "product code", "sku", "part", "cat no", "catalogue"],
  description: ["desc", "description", "item", "product"],
  qty: ["qty", "quantity", "qty shipped", "supplied"],
  unitPrice: ["unit price", "price", "unit", "each", "rate"],
  lineTotal: ["total", "line total", "amount", "ext", "extended", "value"],
  orderRef: ["po", "order", "your ref", "order no", "reference"],
  netPrice: ["net", "net price", "nett"],
};

function guessColumn(field: MapField, headers: string[]): string {
  const lower = headers.map((h) => h.toLowerCase());
  for (const g of GUESSES[field]) {
    const i = lower.findIndex((h) => h === g || h.includes(g));
    if (i >= 0) return headers[i];
  }
  return "";
}

const mappingKey = (supplierId: string) => `casone.invoiceMapping.${supplierId}`;

const STATUS_TONE: Record<LineMatchStatus, ToneKey> = {
  matched: "sage", price_variance: "amber", qty_variance: "amber",
  unmatched: "red", freight_or_fee: "slate", credit: "red",
};
const STATUS_LABEL: Record<LineMatchStatus, string> = {
  matched: "Matched", price_variance: "Price differs", qty_variance: "Qty differs",
  unmatched: "Unmatched", freight_or_fee: "Freight / fee", credit: "Credit",
};

const round2 = (n: number) => Math.round(n * 100) / 100;

// ─── component ───────────────────────────────────────────────────────────────

export default function InvoiceImportModal({ open, onClose, onDone }: Props) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [fileText, setFileText] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [colMap, setColMap] = useState<Record<MapField, string>>({ supplierSku: "", description: "", qty: "", unitPrice: "", lineTotal: "", orderRef: "", netPrice: "" });
  const [incGst, setIncGst] = useState(false);

  const [parsed, setParsed] = useState<ParseInvoiceResult | null>(null);
  const [plan, setPlan] = useState<InvoiceMatchPlan | null>(null);
  const [openItems, setOpenItems] = useState<OpenPoItem[]>([]);
  const [planning, setPlanning] = useState(false);

  // Reviewed lines (manual fixes applied on top of the plan).
  const [lines, setLines] = useState<MatchedInvoiceLine[]>([]);
  // "Remember this code" ticks, keyed by LINE INDEX (not by code — two lines can
  // share a wholesaler code and must not alias one checkbox); deduped at confirm.
  const [teach, setTeach] = useState<Map<number, { sku: string; materialId: string }>>(new Map());
  // The parse total last used to default the header amount — a re-preview only
  // re-defaults the field if the operator hasn't typed their own figure over it.
  const prevParsedTotalRef = useRef<string | null>(null);

  // Header fields typed from the paper invoice.
  const [invNumber, setInvNumber] = useState("");
  const [invDate, setInvDate] = useState("");
  const [invAmount, setInvAmount] = useState("");
  const [invGst, setInvGst] = useState("");
  const [acceptDiff, setAcceptDiff] = useState(false);

  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    listSuppliers().then(setSuppliers).catch(() => {});
  }, [open]);

  // Supplier picked → load their remembered mapping (if any).
  useEffect(() => {
    if (!supplierId) return;
    try {
      const raw = localStorage.getItem(mappingKey(supplierId));
      if (raw) {
        const stored = JSON.parse(raw) as { colMap?: Record<MapField, string>; incGst?: boolean };
        if (stored.colMap) setColMap((prev) => ({ ...prev, ...stored.colMap }));
        if (typeof stored.incGst === "boolean") setIncGst(stored.incGst);
      }
    } catch { /* corrupt preset — ignore */ }
  }, [supplierId]);

  function reset() {
    setSupplierId(""); setFileText(null); setFileName(""); setHeaders([]);
    setColMap({ supplierSku: "", description: "", qty: "", unitPrice: "", lineTotal: "", orderRef: "", netPrice: "" });
    setIncGst(false); setParsed(null); setPlan(null); setLines([]); setTeach(new Map());
    setInvNumber(""); setInvDate(""); setInvAmount(""); setInvGst(""); setAcceptDiff(false);
    prevParsedTotalRef.current = null;
  }
  function close() { if (!saving) { reset(); onClose(); } }

  function handleFile(f: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      setFileText(text);
      setFileName(f.name);
      // A new file voids the old plan AND its side-state: stale teach ticks or a
      // stale accept-the-difference tick must never carry into the next preview.
      setParsed(null); setPlan(null); setLines([]);
      setTeach(new Map()); setAcceptDiff(false);
      const headerLine = text.split(/\r?\n/)[0]?.replace(/^﻿/, "") ?? "";
      const hs = parseCsvLine(headerLine).map((h) => h.trim()).filter(Boolean);
      setHeaders(hs);
      // Auto-guess any unmapped columns from the header names.
      setColMap((prev) => {
        const next = { ...prev };
        for (const f2 of MAP_FIELDS) {
          if (!next[f2.key] || !hs.includes(next[f2.key])) next[f2.key] = guessColumn(f2.key, hs);
        }
        return next;
      });
    };
    reader.onerror = () => setToast({ message: "Couldn't read the file — try again.", type: "error" });
    reader.readAsText(f);
  }

  async function runPreview() {
    if (!fileText || !supplierId) return;
    setPlanning(true);
    try {
      const mapping: InvoiceCsvMapping = {
        columns: {
          supplierSku: colMap.supplierSku || undefined,
          description: colMap.description || undefined,
          qty: colMap.qty || undefined,
          unitPrice: colMap.unitPrice || undefined,
          lineTotal: colMap.lineTotal || undefined,
          orderRef: colMap.orderRef || undefined,
          netPrice: colMap.netPrice || undefined,
        },
        pricesIncludeGst: incGst,
        gstRate: 0.1,
      };
      // A fresh plan replaces the lines — teach ticks and the accept-difference
      // tick belong to the OLD lines and would otherwise be written invisibly.
      setTeach(new Map());
      setAcceptDiff(false);
      const p = parseInvoiceCsv(fileText, mapping);
      setParsed(p);
      if (p.stop) { setPlan(null); setLines([]); return; }
      const [items, memory] = await Promise.all([
        listOpenPoItemsForSupplier(supplierId),
        listSupplierSkusForSupplier(supplierId),
      ]);
      setOpenItems(items);
      const mp = planInvoiceMatch(items, p.lines, memory);
      // Completeness guard: the matcher drops resolved lines whose qty is
      // negative/zero (a return/credit inside an overall-positive invoice — the
      // doc-level credit-note stop only fires on a whole-negative total). Every
      // parsed line MUST survive to the preview and the persisted record, so
      // re-surface dropped ones as 'credit' rows (never allocated to a PO).
      const covered = new Set(mp.lines.map((l) => l.sourceSortOrder));
      const creditRows: MatchedInvoiceLine[] = p.lines
        .filter((pl) => !covered.has(pl.sortOrder))
        .map((pl) => ({
          sourceSortOrder: pl.sortOrder,
          poItemId: null,
          materialId: null,
          supplierSku: pl.supplierSku,
          description: pl.description,
          qty: pl.qty,
          unitPrice: pl.unitPrice,
          lineTotal: pl.lineTotal,
          matchStatus: "credit" as LineMatchStatus,
          note: "Credit / return line — recorded but not allocated to an order; reconcile against the original invoice.",
        }));
      setPlan(mp);
      setLines([...mp.lines, ...creditRows]);
      // Default the header amount from the parse — but never clobber a figure
      // the operator already typed from the paper invoice.
      setInvAmount((prev) => (prev === "" || prev === prevParsedTotalRef.current ? String(p.totalExGst) : prev));
      prevParsedTotalRef.current = String(p.totalExGst);
      // Remember this wholesaler's mapping for next time.
      try { localStorage.setItem(mappingKey(supplierId), JSON.stringify({ colMap, incGst })); } catch { /* private mode */ }
    } catch (ex) {
      setToast({ message: ex instanceof Error ? ex.message : "Preview failed", type: "error" });
    } finally {
      setPlanning(false);
    }
  }

  /** Manually attach an unmatched line to an open PO item — re-running the SAME
   *  price/qty checks the auto-matcher applies, so a manual fix can't silently
   *  record a mispriced or over-quantity line as clean "matched". */
  function attachLine(idx: number, poItem: OpenPoItem, remaining: number) {
    setLines((prev) => prev.map((l, i) => {
      if (i !== idx) return l;
      // Effective per-unit price: the parsed one, else derived from the total —
      // an unresolved line often carries only a lineTotal.
      const unitPrice = l.unitPrice ?? (l.lineTotal != null && l.qty ? round2(l.lineTotal / l.qty) : null);
      const priceTol = Math.max(0.02 * poItem.unitCost, 1);
      let matchStatus: LineMatchStatus = "matched";
      const notes: string[] = [l.note ?? "", `Matched manually to ${poItem.poNumber ?? "PO"} · ${poItem.name ?? ""}.`];
      if (l.qty != null && l.qty > remaining + 0.02) {
        matchStatus = "qty_variance";
        notes.push(`More than the order line has left (${fmtQty(remaining)}).`);
      } else if (unitPrice != null && Math.abs(unitPrice - poItem.unitCost) > priceTol) {
        matchStatus = "price_variance";
        notes.push(`Price differs from the order (${fmtMoney(poItem.unitCost)}).`);
      }
      return { ...l, poItemId: poItem.poItemId, materialId: poItem.materialId, unitPrice, matchStatus, note: notes.filter(Boolean).join(" ") };
    }));
  }

  /** Revert a manual attach — restores the engine's original line so one
   *  mis-click never costs the session's other manual fixes. */
  function undoAttach(idx: number) {
    if (!plan || idx >= plan.lines.length) return;
    setLines((prev) => prev.map((l, i) => (i === idx ? plan.lines[idx] : l)));
    setTeach((prev) => { const next = new Map(prev); next.delete(idx); return next; });
  }

  function toggleTeach(idx: number, sku: string, materialId: string | null, on: boolean) {
    setTeach((prev) => {
      const next = new Map(prev);
      if (on && materialId) next.set(idx, { sku, materialId }); else next.delete(idx);
      return next;
    });
  }

  // Header ↔ lines reconciliation: warn (and require an explicit tick) when the
  // typed invoice amount drifts from the matched lines beyond max(1%, $1).
  const sumLines = round2(lines.reduce((s, l) => s + (l.lineTotal ?? 0), 0));
  const typedAmount = Number(invAmount);
  const amountOk = invAmount.trim() !== "" && isFinite(typedAmount);
  const diffAbs = amountOk ? round2(Math.abs(typedAmount - sumLines)) : 0;
  const diffTooBig = amountOk && diffAbs > Math.max(0.01 * Math.max(sumLines, 1), 1);
  const canConfirm = !!plan && lines.length > 0 && invNumber.trim() !== "" && amountOk && (!diffTooBig || acceptDiff) && !saving;

  async function confirm() {
    if (!canConfirm || !plan) return;
    setSaving(true);
    try {
      const gst = invGst.trim() === "" ? null : Number(invGst);
      await createSupplierInvoiceWithLines({
        supplierId,
        number: invNumber.trim(),
        invoiceDate: invDate || null,
        subtotalExGst: typedAmount,
        gstAmount: gst != null && isFinite(gst) ? gst : null,
        notes: diffTooBig ? `Header amount differs from matched lines by ${fmtMoney(diffAbs)} — accepted at confirm.` : null,
        lines,
      });
      // Teach the remembered codes (best-effort — a failed teach never voids the
      // invoice). Deduped by code; a code ticked against two DIFFERENT materials
      // in one invoice is ambiguous — skipped rather than taught as a coin-flip.
      const bySku = new Map<string, string | null>();
      for (const { sku, materialId } of teach.values()) {
        const existing = bySku.get(sku);
        if (existing === undefined) bySku.set(sku, materialId);
        else if (existing !== materialId) bySku.set(sku, null);
      }
      for (const [sku, materialId] of bySku) {
        if (!materialId) continue;
        try { await upsertSupplierSku(supplierId, sku, materialId); } catch { /* re-teach next time */ }
      }
      onDone(`Invoice ${invNumber.trim()} recorded — ${liveCounts.matched} matched, ${liveCounts.variance} variance${liveCounts.variance === 1 ? "" : "s"}, ${liveCounts.unmatched} unmatched${liveCounts.credit > 0 ? `, ${liveCounts.credit} credit` : ""}.`);
      reset();
      onClose();
    } catch (ex) {
      setToast({ message: ex instanceof Error ? ex.message : "Failed to record the invoice", type: "error" });
    } finally {
      setSaving(false);
    }
  }

  const supplierPicked = supplierId !== "";

  // Quantity already claimed by the CURRENT plan (auto-matches + this session's
  // manual attaches), per PO line — the DB-side qtyInvoicedSoFar only knows
  // PERSISTED invoices, so without this a PO line fully consumed by this very
  // upload would still offer its full quantity and one confirm could double-book.
  const plannedByPoItem = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of lines) {
      if (l.poItemId && l.qty != null) m.set(l.poItemId, round2((m.get(l.poItemId) ?? 0) + l.qty));
    }
    return m;
  }, [lines]);

  const candidatesFor = useMemo(() => {
    // Manual-attach options: open PO lines with quantity remaining AFTER both the
    // persisted invoices and everything the current plan has already allocated.
    return openItems
      .map((it) => ({ it, remaining: round2(it.qtyOrdered - it.qtyInvoicedSoFar - (plannedByPoItem.get(it.poItemId) ?? 0)) }))
      .filter((c) => c.remaining > 0);
  }, [openItems, plannedByPoItem]);

  // Live per-status counts — the pills and the confirm toast must reflect manual
  // fixes, not the preview-time snapshot.
  const liveCounts = useMemo(() => ({
    matched: lines.filter((l) => l.matchStatus === "matched").length,
    variance: lines.filter((l) => l.matchStatus === "price_variance" || l.matchStatus === "qty_variance").length,
    unmatched: lines.filter((l) => l.matchStatus === "unmatched").length,
    freight: lines.filter((l) => l.matchStatus === "freight_or_fee").length,
    credit: lines.filter((l) => l.matchStatus === "credit").length,
  }), [lines]);

  return (
    <>
      <MotionDrawer open={open} onClose={close} variant="modal" ariaLabel="Import a wholesaler invoice" sizeClass="sm:max-w-[860px]">
        <DrawerHeader title="Import a wholesaler invoice" subtitle="CSV in → matched line-by-line against the open orders → you confirm" onClose={close} />
        <DrawerBody>
          {/* Step 1 — supplier + file + mapping */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label>
              <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.08em] text-[#A0A0A0]">Wholesaler</span>
              <select
                value={supplierId}
                onChange={(e) => {
                  // Changing the wholesaler INVALIDATES everything planned so far:
                  // the plan's PO lines, SKU memory, and teach ticks all belong to
                  // the previous supplier — confirming them under the new one would
                  // record the invoice against the wrong business. Force a re-preview.
                  setSupplierId(e.target.value);
                  setParsed(null); setPlan(null); setLines([]); setOpenItems([]);
                  setTeach(new Map()); setAcceptDiff(false);
                }}
                className={inputField}
                disabled={saving}
              >
                <option value="">Select the wholesaler…</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <div>
              <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.08em] text-[#A0A0A0]">Invoice file (CSV)</span>
              <button type="button" onClick={() => fileRef.current?.click()} disabled={!supplierPicked || saving} className={`${btnGhost} w-full justify-center disabled:opacity-40`}>
                <Upload className="h-4 w-4" /> {fileName || "Choose the CSV export…"}
              </button>
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
            </div>
          </div>

          {/* Column mapping — auto-guessed, editable, remembered per wholesaler */}
          {headers.length > 0 && (
            <div className="rounded-[10px] border border-[#E6E1D4] bg-[#FAF8F2] p-4">
              <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.08em] text-[#6B6B6B]">Column mapping — {fileName}</p>
              <p className="mb-3 text-[11.5px] text-[#A0A0A0]">Which of their columns is which? Guessed from the header row; corrections are remembered for this wholesaler.</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {MAP_FIELDS.map((f) => (
                  <label key={f.key}>
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.06em] text-[#A0A0A0]" title={f.hint}>{f.label}</span>
                    <select value={colMap[f.key]} onChange={(e) => setColMap((prev) => ({ ...prev, [f.key]: e.target.value }))} className={inputField} disabled={saving}>
                      <option value="">— not in this file —</option>
                      {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </label>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-4">
                <label className="flex cursor-pointer items-center gap-1.5 text-[13px] text-[#3A3A3A]">
                  <input type="checkbox" checked={incGst} onChange={(e) => setIncGst(e.target.checked)} className="h-4 w-4 accent-[#2F8F5C]" />
                  Prices in this file include GST
                </label>
                <button type="button" onClick={() => void runPreview()} disabled={planning || saving} className={btnPrimary}>
                  {planning ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} Preview the match
                </button>
              </div>
            </div>
          )}

          {/* Hard stop — wrong document type */}
          {parsed?.stop && (
            <div className="flex items-start gap-2 rounded-[10px] border border-[#E6C9C9] bg-[#FBE5E5] px-4 py-3 text-[13px] text-[#C44545]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span><b>Not imported:</b> {parsed.stop.message}</span>
            </div>
          )}
          {parsed && !parsed.stop && parsed.errors.length > 0 && (
            <div className="rounded-[10px] border border-[#E8D8B5] bg-[#F9EFD9] px-4 py-2.5 text-[12px] text-[#8A6B1E]">
              {parsed.errors.slice(0, 5).join(" · ")}{parsed.errors.length > 5 ? ` · +${parsed.errors.length - 5} more` : ""}
            </div>
          )}

          {/* Step 2 — the match preview */}
          {plan && !parsed?.stop && (
            <>
              <div className="flex flex-wrap items-center gap-2 text-[12px]">
                <StatusPill tone="sage">{liveCounts.matched} matched</StatusPill>
                <StatusPill tone="amber">{liveCounts.variance} variance{liveCounts.variance === 1 ? "" : "s"}</StatusPill>
                <StatusPill tone="red">{liveCounts.unmatched} unmatched</StatusPill>
                {liveCounts.freight > 0 && <StatusPill tone="slate">{liveCounts.freight} freight/fee</StatusPill>}
                {liveCounts.credit > 0 && <StatusPill tone="red">{liveCounts.credit} credit</StatusPill>}
                <span className="ml-auto tabular-nums text-[#6B6B6B]">
                  Invoice {fmtMoney(plan.summary.invoiceTotalExGst)} · PO-matched {fmtMoney(plan.summary.matchedPoTotalExGst)}
                  {plan.summary.driftFlagged && <span className="ml-1.5 font-semibold text-[#C8841E]">drift {fmtMoney(plan.summary.driftAbs)}</span>}
                </span>
              </div>

              <div className="overflow-x-auto rounded-[10px] border border-[#E6E1D4]">
                <table className="min-w-full text-[12.5px]">
                  <thead>
                    <tr className="border-b border-[#E6E1D4] bg-[#FAF8F2]">
                      <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.07em] text-[#6B6B6B]">Line</th>
                      <th className="w-20 px-3 py-2 text-right text-[10px] font-bold uppercase tracking-[0.07em] text-[#6B6B6B]">Qty</th>
                      <th className="w-24 px-3 py-2 text-right text-[10px] font-bold uppercase tracking-[0.07em] text-[#6B6B6B]">Unit ex-GST</th>
                      <th className="w-24 px-3 py-2 text-right text-[10px] font-bold uppercase tracking-[0.07em] text-[#6B6B6B]">Total</th>
                      <th className="w-32 px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.07em] text-[#6B6B6B]">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EFEBE0]">
                    {lines.map((l, idx) => (
                      <tr key={`${l.sourceSortOrder}-${idx}`} className={l.matchStatus === "unmatched" ? "bg-[#FDF6F6]" : undefined}>
                        <td className="px-3 py-2">
                          <span className="block font-medium text-[#1A1A1A]">{l.description ?? l.supplierSku ?? "(line)"}</span>
                          <span className="block text-[11px] text-[#A0A0A0]">
                            {l.supplierSku && <>code {l.supplierSku} · </>}{l.note}
                          </span>
                          {l.matchStatus === "unmatched" && candidatesFor.length > 0 && (
                            <span className="mt-1 flex flex-wrap items-center gap-2">
                              <select
                                defaultValue=""
                                onChange={(e) => {
                                  const c = candidatesFor.find((x) => x.it.poItemId === e.target.value);
                                  if (c) attachLine(idx, c.it, c.remaining);
                                }}
                                className="rounded-[8px] border border-[#E6E1D4] bg-white px-2 py-1 text-[11.5px] text-[#3A3A3A] focus:border-[#2F8F5C] focus:outline-none"
                              >
                                <option value="">Match to an open order line…</option>
                                {candidatesFor.map(({ it, remaining }) => (
                                  <option key={it.poItemId} value={it.poItemId}>
                                    {it.poNumber ?? "PO"} · {it.name ?? it.sku ?? "item"} · {fmtQty(remaining)} left @ {fmtMoney(it.unitCost)}
                                  </option>
                                ))}
                              </select>
                            </span>
                          )}
                          {l.note?.includes("Matched manually") && (
                            <span className="mt-1 flex flex-wrap items-center gap-3">
                              {l.supplierSku && l.materialId && (
                                <label className="flex cursor-pointer items-center gap-1.5 text-[11.5px] text-[#3A3A3A]">
                                  <input
                                    type="checkbox"
                                    checked={teach.has(idx)}
                                    onChange={(e) => toggleTeach(idx, l.supplierSku as string, l.materialId, e.target.checked)}
                                    className="h-3.5 w-3.5 accent-[#2F8F5C]"
                                  />
                                  Remember this code (auto-match next time) — untick if it's a one-off substitution
                                </label>
                              )}
                              <button type="button" onClick={() => undoAttach(idx)} className="text-[11.5px] font-semibold text-[#C44545] hover:underline">
                                Undo match
                              </button>
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{l.qty != null ? fmtQty(l.qty) : "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{l.unitPrice != null ? fmtMoney(l.unitPrice) : "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{l.lineTotal != null ? fmtMoney(l.lineTotal) : "—"}</td>
                        <td className="px-3 py-2"><StatusPill tone={STATUS_TONE[l.matchStatus]}>{STATUS_LABEL[l.matchStatus]}</StatusPill></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Step 3 — header details from the paper invoice */}
              <div className="rounded-[10px] border border-[#E6E1D4] bg-[#FAF8F2] p-4">
                <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.08em] text-[#6B6B6B]">Invoice details (from the document)</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                  <label>
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.06em] text-[#A0A0A0]">Invoice no. *</span>
                    <input value={invNumber} onChange={(e) => setInvNumber(e.target.value)} className={inputField} placeholder="e.g. 458812" disabled={saving} />
                  </label>
                  <label>
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.06em] text-[#A0A0A0]">Date</span>
                    <input type="date" value={invDate} onChange={(e) => setInvDate(e.target.value)} className={inputField} disabled={saving} />
                  </label>
                  <label>
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.06em] text-[#A0A0A0]">Amount ex-GST *</span>
                    <input type="number" step="0.01" min="0" value={invAmount} onChange={(e) => setInvAmount(e.target.value)} className={`${inputField} text-right tabular-nums`} disabled={saving} />
                  </label>
                  <label>
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.06em] text-[#A0A0A0]">GST</span>
                    <input type="number" step="0.01" min="0" value={invGst} onChange={(e) => setInvGst(e.target.value)} className={`${inputField} text-right tabular-nums`} disabled={saving} />
                  </label>
                </div>
                {diffTooBig && (
                  <div className="mt-3 flex items-start gap-2 rounded-[8px] border border-[#E8D8B5] bg-[#F9EFD9] px-3 py-2 text-[12px] text-[#8A6B1E]">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <label className="flex cursor-pointer items-start gap-1.5">
                      <input type="checkbox" checked={acceptDiff} onChange={(e) => setAcceptDiff(e.target.checked)} className="mt-0.5 h-3.5 w-3.5 accent-[#C8841E]" />
                      <span>The typed amount ({fmtMoney(typedAmount)}) differs from the matched lines ({fmtMoney(sumLines)}) by <b>{fmtMoney(diffAbs)}</b>. Tick to record anyway — the difference is noted on the invoice.</span>
                    </label>
                  </div>
                )}
              </div>
            </>
          )}
        </DrawerBody>
        <DrawerFooter>
          <button type="button" onClick={close} disabled={saving} className={btnGhost}>Cancel</button>
          <button type="button" onClick={() => void confirm()} disabled={!canConfirm} className={btnPrimary}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Record invoice
          </button>
        </DrawerFooter>
      </MotionDrawer>
      {toast && <Toaster message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </>
  );
}

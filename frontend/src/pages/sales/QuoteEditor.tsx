// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// pages/sales/QuoteEditor.tsx â€” paper-document editor for a single quote.
//
// Design: white sheet card (rounded-[14px], hairline, shadow) on the cream
// desk. Header: business name + ABN left, quote number + dates right. Customer
// block. Line-items table with inline qty/price editing (blur â†’ save). Three
// ADD row modes: catalogue search / prebuild picker / free line. Totals footer.
// Notes textarea (debounced). Status action bar. Print styles.
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft, Printer, Plus, Trash2, RefreshCw, Search, Package, Clock,
} from "lucide-react";

import { FRAUNCES, TONE, cardShell, btnPrimary, btnGhost } from "../gantt/components/ledger";
import { SkeletonLine } from "../../components/ui/skeleton";
import { Toaster } from "../../components/ui/Toaster";
import { lineTotal, quoteCostMargin, quoteFinancials } from "../../lib/commercial/money";

import {
  getQuote,
  updateQuote,
  setQuoteStatus,
  addQuoteItemFromMaterial,
  addQuoteItemFromPrebuild,
  addQuoteItemFree,
  addQuoteItemLabour,
  updateQuoteItem,
  removeQuoteItem,
  convertQuoteToJob,
  setQuoteDiscount,
  setQuoteRebates,
  getCommercialSettings,
  type Quote,
  type QuoteItem,
  type CommercialSettings,
} from "../../lib/api/commercial";
import { listMaterials, listPrebuilds, type Material, type Prebuild } from "../../lib/api/materials";
import { listLabourRates, type LabourRate } from "../../lib/api/labourRates";

// â”€â”€â”€ types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type ToastState = { message: string; type: "success" | "error" | "info" } | null;
type AddMode = "catalogue" | "prebuild" | "free" | "labour" | null;

interface Props {
  quoteId: string;
  onClose: () => void;
  onChanged: () => void;
  /** Manager-only: show the internal cost/margin view + labour cost. The /sales
   *  surface is already manager-gated, so this is true there; default false keeps
   *  cost hidden anywhere the editor is reused without the flag. */
  canSeeCost?: boolean;
}

// â”€â”€â”€ helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function fmtMoney(n: number): string {
  return "$" + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function stripSearchChars(s: string): string {
  return s.replace(/[*,()/]/g, "");
}

// â”€â”€â”€ inline-edit cell â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function NumCell({
  value,
  onCommit,
  disabled,
}: {
  value: number;
  onCommit: (v: number) => void;
  disabled: boolean;
}) {
  const [local, setLocal] = useState(String(value));
  useEffect(() => { setLocal(String(value)); }, [value]);
  return (
    <input
      type="number"
      value={local}
      min="0"
      step="any"
      disabled={disabled}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        const n = parseFloat(local);
        if (!isNaN(n) && n !== value) onCommit(n);
      }}
      className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-right tabular-nums text-sm focus:border-[#E6E1D4] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#2F8F5C] disabled:opacity-40"
    />
  );
}

// â”€â”€â”€ component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function QuoteEditor({ quoteId, onClose, onChanged, canSeeCost = false }: Props) {
  const [quote, setQuote]           = useState<Quote | null>(null);
  const [settings, setSettings]     = useState<CommercialSettings | null>(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [saving, setSaving]         = useState(false);
  const [toast, setToast]           = useState<ToastState>(null);

  const [notes, setNotes]           = useState("");
  const notesDebRef                 = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Dirty flag: set on user edit, cleared on successful save. Prevents loadQuote
  // from clobbering in-flight notes when item ops trigger a refetch.
  const notesDirtyRef               = useRef(false);

  const [addMode, setAddMode]       = useState<AddMode>(null);

  // Catalogue search
  const [catalogueSearch, setCatalogueSearch] = useState("");
  const [catalogueResults, setCatalogueResults] = useState<Material[]>([]);
  const catDebRef                   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [addingMat, setAddingMat]   = useState(false);

  // Prebuild picker
  const [prebuilds, setPrebuilds]   = useState<Prebuild[]>([]);
  const [prebuildId, setPrebuildId] = useState("");
  const [addingPb, setAddingPb]     = useState(false);

  // Free line form
  const [freeDesc, setFreeDesc]     = useState("");
  const [freeQty, setFreeQty]       = useState("1");
  const [freeUnit, setFreeUnit]     = useState("ea");
  const [freePrice, setFreePrice]   = useState("0");
  const [addingFree, setAddingFree] = useState(false);

  // Labour line form
  const [labourRates, setLabourRates] = useState<LabourRate[]>([]);
  const [labourRole, setLabourRole] = useState("");
  const [labourHours, setLabourHours] = useState("1");
  const [addingLabour, setAddingLabour] = useState(false);

  // Discount + solar-rebate inputs (synced from the quote; commit on blur)
  const [discountStr, setDiscountStr] = useState("0");
  const [stcCountStr, setStcCountStr] = useState("0");
  const [stcPriceStr, setStcPriceStr] = useState("0");
  const [veecStr, setVeecStr] = useState("0");

  const loadQuote = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [q, s] = await Promise.all([getQuote(quoteId), getCommercialSettings()]);
      if (!q) { setError("Quote not found."); return; }
      setQuote(q);
      setSettings(s);
      // Only sync notes from server when the textarea is not dirty (no unsaved user edits)
      if (!notesDirtyRef.current) {
        setNotes(q.notes ?? "");
      }
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : "Failed to load quote");
    } finally {
      setLoading(false);
    }
  }, [quoteId]);

  useEffect(() => { void loadQuote(); }, [loadQuote]);

  // Sync the discount/rebate inputs whenever the quote (re)loads. STC unit price
  // prefills from settings when the quote hasn't set its own yet.
  useEffect(() => {
    if (!quote) return;
    setDiscountStr(String(quote.discountExGst ?? 0));
    setStcCountStr(String(quote.stcCount ?? 0));
    setStcPriceStr(String(quote.stcUnitPriceExGst || settings?.stcUnitPrice || 0));
    setVeecStr(String(quote.veecRebateExGst || 0));
  }, [quote, settings]);

  // Debounced notes save
  useEffect(() => {
    if (!quote || notes === (quote.notes ?? "")) return;
    notesDirtyRef.current = true;
    if (notesDebRef.current) clearTimeout(notesDebRef.current);
    notesDebRef.current = setTimeout(async () => {
      try {
        await updateQuote(quoteId, { notes });
        notesDirtyRef.current = false;
        void loadQuote();
        onChanged();
      } catch { /* silent */ }
    }, 700);
    return () => { if (notesDebRef.current) clearTimeout(notesDebRef.current); };
  }, [notes, quote, quoteId, loadQuote, onChanged]);

  // Debounced catalogue search
  useEffect(() => {
    if (addMode !== "catalogue") return;
    if (catDebRef.current) clearTimeout(catDebRef.current);
    catDebRef.current = setTimeout(async () => {
      const q = stripSearchChars(catalogueSearch.trim());
      try {
        const mats = await listMaterials({ search: q || undefined });
        setCatalogueResults(mats.slice(0, 12));
      } catch { setCatalogueResults([]); }
    }, 300);
    return () => { if (catDebRef.current) clearTimeout(catDebRef.current); };
  }, [catalogueSearch, addMode]);

  // Load prebuilds once when mode opens
  useEffect(() => {
    if (addMode !== "prebuild" || prebuilds.length > 0) return;
    listPrebuilds().then(setPrebuilds).catch(() => {});
  }, [addMode, prebuilds.length]);

  // Load active labour rates once when the labour mode opens
  useEffect(() => {
    if (addMode !== "labour" || labourRates.length > 0) return;
    listLabourRates(false).then(setLabourRates).catch(() => {});
  }, [addMode, labourRates.length]);

  async function handleItemUpdate(item: QuoteItem, patch: { qty?: number; unitPriceExGst?: number }) {
    setSaving(true);
    try {
      await updateQuoteItem(item.id, quoteId, patch);
      await loadQuote();
      onChanged();
    } catch (ex) {
      setToast({ message: ex instanceof Error ? ex.message : "Save failed", type: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveItem(item: QuoteItem) {
    setSaving(true);
    try {
      await removeQuoteItem(item.id, quoteId);
      await loadQuote();
      onChanged();
    } catch (ex) {
      setToast({ message: ex instanceof Error ? ex.message : "Remove failed", type: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function handleAddFromMaterial(mat: Material) {
    setAddingMat(true);
    try {
      await addQuoteItemFromMaterial(quoteId, mat.id, 1);
      setAddMode(null);
      setCatalogueSearch("");
      setCatalogueResults([]);
      await loadQuote();
      onChanged();
    } catch (ex) {
      setToast({ message: ex instanceof Error ? ex.message : "Failed to add item", type: "error" });
    } finally {
      setAddingMat(false);
    }
  }

  async function handleAddPrebuild() {
    if (!prebuildId) return;
    setAddingPb(true);
    try {
      await addQuoteItemFromPrebuild(quoteId, prebuildId);
      setAddMode(null);
      setPrebuildId("");
      await loadQuote();
      onChanged();
    } catch (ex) {
      setToast({ message: ex instanceof Error ? ex.message : "Failed to add prebuild", type: "error" });
    } finally {
      setAddingPb(false);
    }
  }

  async function handleAddFree(e: React.FormEvent) {
    e.preventDefault();
    setAddingFree(true);
    try {
      await addQuoteItemFree(quoteId, {
        description: freeDesc,
        qty: parseFloat(freeQty) || 1,
        unit: freeUnit,
        unitPriceExGst: parseFloat(freePrice) || 0,
      });
      setAddMode(null);
      setFreeDesc(""); setFreeQty("1"); setFreeUnit("ea"); setFreePrice("0");
      await loadQuote();
      onChanged();
    } catch (ex) {
      setToast({ message: ex instanceof Error ? ex.message : "Failed to add line", type: "error" });
    } finally {
      setAddingFree(false);
    }
  }

  async function handleAddLabour(e: React.FormEvent) {
    e.preventDefault();
    if (!labourRole) return;
    setAddingLabour(true);
    try {
      await addQuoteItemLabour(quoteId, labourRole, parseFloat(labourHours) || 0);
      setAddMode(null);
      setLabourRole(""); setLabourHours("1");
      await loadQuote();
      onChanged();
    } catch (ex) {
      setToast({ message: ex instanceof Error ? ex.message : "Failed to add labour", type: "error" });
    } finally {
      setAddingLabour(false);
    }
  }

  async function commitDiscount() {
    if (!quote) return;
    const v = Math.max(0, parseFloat(discountStr) || 0);
    if (v === quote.discountExGst) return;
    setSaving(true);
    try {
      await setQuoteDiscount(quoteId, v);
      await loadQuote();
      onChanged();
    } catch (ex) {
      setToast({ message: ex instanceof Error ? ex.message : "Failed to save discount", type: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function commitRebates() {
    if (!quote) return;
    const stcCount = Math.max(0, parseInt(stcCountStr, 10) || 0);
    const stcUnitPriceExGst = Math.max(0, parseFloat(stcPriceStr) || 0);
    const veecRebateExGst = Math.max(0, parseFloat(veecStr) || 0);
    if (
      stcCount === quote.stcCount &&
      stcUnitPriceExGst === quote.stcUnitPriceExGst &&
      veecRebateExGst === quote.veecRebateExGst
    ) return;
    setSaving(true);
    try {
      await setQuoteRebates(quoteId, { stcCount, stcUnitPriceExGst, veecRebateExGst });
      await loadQuote();
      onChanged();
    } catch (ex) {
      setToast({ message: ex instanceof Error ? ex.message : "Failed to save rebates", type: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusAction(action: "send" | "accept" | "decline" | "convertJob") {
    if (!quote) return;
    setSaving(true);
    try {
      if (action === "send") {
        await setQuoteStatus(quoteId, "sent");
        setToast({ message: "Quote marked as sent. Send it manually to the client for now.", type: "info" });
      } else if (action === "accept") {
        await setQuoteStatus(quoteId, "accepted");
        setToast({ message: "Quote accepted.", type: "success" });
      } else if (action === "decline") {
        await setQuoteStatus(quoteId, "declined");
        setToast({ message: "Quote declined.", type: "info" });
      } else if (action === "convertJob") {
        const job = await convertQuoteToJob(quoteId);
        setToast({ message: `Job "${job.title}" created â€” find it on the Jobs board.`, type: "success" });
        onChanged();
      }
      await loadQuote();
      onChanged();
    } catch (ex) {
      setToast({ message: ex instanceof Error ? ex.message : "Action failed", type: "error" });
    } finally {
      setSaving(false);
    }
  }

  // â”€â”€ Loading / error states â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  if (loading) {
    return (
      <div className={`${cardShell} p-8`}>
        <div className="space-y-3">
          <SkeletonLine className="w-40" />
          <SkeletonLine className="w-64" />
          <SkeletonLine className="w-full" />
        </div>
      </div>
    );
  }

  if (error || !quote) {
    return (
      <div className={`${cardShell} flex items-center justify-between p-6`}>
        <p className="text-sm text-[#C44545]">{error ?? "Quote not found."}</p>
        <div className="flex gap-2">
          <button type="button" onClick={() => void loadQuote()} className={btnGhost}>
            <RefreshCw className="h-4 w-4" /> Retry
          </button>
          <button type="button" onClick={onClose} className={btnGhost}>
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
        </div>
      </div>
    );
  }

  const items = quote.items ?? [];
  const statusTone = {
    draft: TONE.ink, sent: TONE.slate, viewed: TONE.amber,
    accepted: TONE.sage, declined: TONE.red, expired: TONE.orange,
  }[quote.status] ?? TONE.ink;

  const isLocked = quote.status === "accepted" || quote.status === "declined" || quote.status === "expired";

  const gstRate = settings?.gstRate ?? 0.1;
  // Customer-facing money: discount → GST → total → minus STC/VEEC rebates.
  const fin = quoteFinancials(items, gstRate, {
    discountExGst: quote.discountExGst,
    stcRebate: quote.stcCount * quote.stcUnitPriceExGst,
    veecRebate: quote.veecRebateExGst,
  });

  // Manager-only cost/margin rollup (never rendered when canSeeCost is false,
  // and always print:hidden so it can't leak onto the customer's PDF). Discount
  // folds into the net sell so the margin reflects the real revenue.
  const margin = canSeeCost ? quoteCostMargin(items, gstRate, quote.discountExGst) : null;
  const marginTone =
    margin === null
      ? TONE.ink
      : margin.profit.net < 0
        ? TONE.red
        : margin.profit.marginPct !== null && margin.profit.marginPct < 10
          ? TONE.amber
          : TONE.sage;

  return (
    <>
      {/* â”€â”€ Back bar (screen only) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="mb-4 flex items-center gap-3 print:hidden">
        <button type="button" onClick={onClose} className={btnGhost}>
          <ArrowLeft className="h-4 w-4" />
          All quotes
        </button>
        <span className="text-xs text-[#A0A0A0]">{saving ? "Saving..." : "All changes auto-saved"}</span>
        <button
          type="button"
          onClick={() => {
            document.body.classList.add("printing-commercial-doc");
            window.addEventListener("afterprint", () => {
              document.body.classList.remove("printing-commercial-doc");
            }, { once: true });
            window.print();
          }}
          className={btnGhost + " ml-auto"}
        >
          <Printer className="h-4 w-4" />
          Print / PDF
        </button>
      </div>

      {/* â”€â”€ Paper sheet â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div
        id="quote-print-sheet"
        className="print-sheet rounded-[14px] border border-[#E6E1D4] bg-white p-8 shadow-[0_2px_12px_rgba(20,20,20,0.07)] sm:p-10"
        style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}
      >

        {/* Document header */}
        <div className="mb-8 flex flex-wrap items-start justify-between gap-6">
          <div>
            <p
              className="text-[22px] font-semibold text-[#1A1A1A]"
              style={{ fontFamily: FRAUNCES }}
            >
              {settings?.businessName ?? "Your Business"}
            </p>
            {settings?.abn && (
              <p className="mt-0.5 text-sm text-[#6B6B6B]">ABN {settings.abn}</p>
            )}
          </div>
          <div className="text-right">
            <p
              className="text-[28px] font-medium text-[#1A1A1A]"
              style={{ fontFamily: FRAUNCES, letterSpacing: "-0.02em" }}
            >
              {quote.number ?? "QTE-??????"}
            </p>
            <p className="text-xs text-[#6B6B6B]">
              Created {new Date(quote.createdAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
            </p>
            {quote.validUntil && (
              <p className="text-xs text-[#6B6B6B]">
                Valid until {new Date(quote.validUntil).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
              </p>
            )}
            {/* Status stamp */}
            {(quote.status === "accepted" || quote.status === "declined") && (
              <span
                className="mt-2 inline-block rounded px-3 py-1 text-[12px] font-bold uppercase tracking-[0.18em]"
                style={{
                  backgroundColor: statusTone.bg,
                  color: statusTone.fg,
                  boxShadow: `0 0 0 1.5px ${statusTone.dot}`,
                  transform: "rotate(-2deg)",
                }}
              >
                {quote.status === "accepted" ? "ACCEPTED" : "DECLINED"}
              </span>
            )}
          </div>
        </div>

        {/* Customer / client block */}
        <div className="mb-8 border-t border-[#EFEBE0] pt-6">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#A0A0A0]">Quote for</p>
          <p className="text-base font-semibold text-[#1A1A1A]">
            {quote.clientName ?? (quote.customerId ? "(customer linked)" : "â€”")}
          </p>
          {quote.clientEmail && (
            <p className="text-sm text-[#6B6B6B]">{quote.clientEmail}</p>
          )}
        </div>

        {/* â”€â”€ Line items table â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <div className="mb-6 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-[#E6E1D4] bg-[#FAF8F2]">
                <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Description</th>
                <th className="w-20 px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Qty</th>
                <th className="w-16 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Unit</th>
                <th className="w-28 px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Unit price</th>
                <th className="w-28 px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Line total</th>
                {!isLocked && (
                  <th className="w-10 px-3 py-2 print:hidden" aria-label="Actions" />
                )}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-10 text-center text-xs text-[#A0A0A0]">
                    No line items yet. Add one below.
                  </td>
                </tr>
              )}
              {items.map((item) => {
                const lt = lineTotal({ qty: item.qty, unitPriceExGst: item.unitPriceExGst });
                return (
                  <tr key={item.id} className="border-b border-[#EFEBE0] hover:bg-[#FAF8F2]">
                    <td className="px-3 py-2.5 text-[#1A1A1A]">
                      {item.description}
                      {item.kind !== "material" && (
                        <span className="ml-2 rounded-full bg-[#EFEBE0] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#6B6B6B] print:hidden">
                          {item.kind === "labour" ? "Labour" : "Custom"}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {isLocked ? (
                        <span className="tabular-nums">{item.qty}</span>
                      ) : (
                        <NumCell
                          value={item.qty}
                          disabled={saving}
                          onCommit={(v) => void handleItemUpdate(item, { qty: v })}
                        />
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-[#6B6B6B]">{item.unit}</td>
                    <td className="px-3 py-2.5 text-right">
                      {isLocked ? (
                        <span className="tabular-nums">{fmtMoney(item.unitPriceExGst)}</span>
                      ) : (
                        <NumCell
                          value={item.unitPriceExGst}
                          disabled={saving}
                          onCommit={(v) => void handleItemUpdate(item, { unitPriceExGst: v })}
                        />
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-medium text-[#1A1A1A]">
                      {fmtMoney(lt)}
                    </td>
                    {!isLocked && (
                      <td className="px-3 py-2.5 print:hidden">
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void handleRemoveItem(item)}
                          className="text-[#C0BAB0] hover:text-[#C44545] disabled:opacity-40"
                          aria-label="Remove line"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* â”€â”€ Add row controls â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        {!isLocked && (
          <div className="mb-8 print:hidden">
            {addMode === null && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setAddMode("catalogue")}
                  className={btnGhost}
                >
                  <Search className="h-4 w-4" />
                  From catalogue
                </button>
                <button
                  type="button"
                  onClick={() => setAddMode("prebuild")}
                  className={btnGhost}
                >
                  <Package className="h-4 w-4" />
                  From prebuild
                </button>
                <button
                  type="button"
                  onClick={() => setAddMode("free")}
                  className={btnGhost}
                >
                  <Plus className="h-4 w-4" />
                  Free line
                </button>
                <button
                  type="button"
                  onClick={() => setAddMode("labour")}
                  className={btnGhost}
                >
                  <Clock className="h-4 w-4" />
                  Labour
                </button>
              </div>
            )}

            {/* Catalogue search */}
            {addMode === "catalogue" && (
              <div className="rounded-[10px] border border-[#E6E1D4] bg-[#FAF8F2] p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#6B6B6B]">Search catalogue</p>
                  <button type="button" onClick={() => { setAddMode(null); setCatalogueSearch(""); setCatalogueResults([]); }} className="text-xs text-[#A0A0A0] hover:text-[#C44545]">Cancel</button>
                </div>
                <input
                  autoFocus
                  value={catalogueSearch}
                  onChange={(e) => setCatalogueSearch(e.target.value)}
                  placeholder="Type to search materials..."
                  className="w-full rounded-md border border-[#E6E1D4] bg-white px-3 py-2 text-sm focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]"
                />
                {catalogueResults.length > 0 && (
                  <ul className="mt-2 divide-y divide-[#EFEBE0] rounded-md border border-[#E6E1D4] bg-white">
                    {catalogueResults.map((mat) => (
                      <li key={mat.id}>
                        <button
                          type="button"
                          disabled={addingMat}
                          onClick={() => void handleAddFromMaterial(mat)}
                          className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm hover:bg-[#FAF8F2] disabled:opacity-50"
                        >
                          <span className="font-medium text-[#1A1A1A]">{mat.name}</span>
                          <span className="ml-2 flex-shrink-0 tabular-nums text-[#6B6B6B]">
                            {mat.sellPrice != null ? fmtMoney(mat.sellPrice) : "â€”"} / {mat.unit}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {catalogueSearch.length > 0 && catalogueResults.length === 0 && (
                  <p className="mt-2 text-xs text-[#A0A0A0]">No materials match.</p>
                )}
              </div>
            )}

            {/* Prebuild picker */}
            {addMode === "prebuild" && (
              <div className="rounded-[10px] border border-[#E6E1D4] bg-[#FAF8F2] p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#6B6B6B]">Pick a prebuild bundle</p>
                  <button type="button" onClick={() => { setAddMode(null); setPrebuildId(""); }} className="text-xs text-[#A0A0A0] hover:text-[#C44545]">Cancel</button>
                </div>
                <div className="flex gap-2">
                  <select
                    value={prebuildId}
                    onChange={(e) => setPrebuildId(e.target.value)}
                    className="flex-1 rounded-md border border-[#E6E1D4] bg-white px-3 py-2 text-sm focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]"
                  >
                    <option value="">Select a prebuild...</option>
                    {prebuilds.map((pb) => (
                      <option key={pb.id} value={pb.id}>{pb.name}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => void handleAddPrebuild()}
                    disabled={!prebuildId || addingPb}
                    className={btnPrimary}
                  >
                    {addingPb ? "Adding..." : "Add bundle"}
                  </button>
                </div>
              </div>
            )}

            {/* Free line form */}
            {addMode === "free" && (
              <form
                onSubmit={(e) => void handleAddFree(e)}
                className="rounded-[10px] border border-[#E6E1D4] bg-[#FAF8F2] p-4"
              >
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#6B6B6B]">Free line item</p>
                  <button type="button" onClick={() => setAddMode(null)} className="text-xs text-[#A0A0A0] hover:text-[#C44545]">Cancel</button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <input
                    autoFocus
                    required
                    value={freeDesc}
                    onChange={(e) => setFreeDesc(e.target.value)}
                    placeholder="Description"
                    className="flex-[3] min-w-[160px] rounded-md border border-[#E6E1D4] bg-white px-3 py-2 text-sm focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]"
                  />
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={freeQty}
                    onChange={(e) => setFreeQty(e.target.value)}
                    placeholder="Qty"
                    className="w-20 rounded-md border border-[#E6E1D4] bg-white px-3 py-2 text-sm focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]"
                  />
                  <input
                    value={freeUnit}
                    onChange={(e) => setFreeUnit(e.target.value)}
                    placeholder="Unit"
                    className="w-20 rounded-md border border-[#E6E1D4] bg-white px-3 py-2 text-sm focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]"
                  />
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={freePrice}
                    onChange={(e) => setFreePrice(e.target.value)}
                    placeholder="Unit price (ex GST)"
                    className="w-36 rounded-md border border-[#E6E1D4] bg-white px-3 py-2 text-sm focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]"
                  />
                  <button type="submit" disabled={addingFree} className={btnPrimary}>
                    {addingFree ? "Adding..." : "Add line"}
                  </button>
                </div>
              </form>
            )}

            {/* Labour line form */}
            {addMode === "labour" && (
              <div className="rounded-[10px] border border-[#E6E1D4] bg-[#FAF8F2] p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#6B6B6B]">Labour line</p>
                  <button type="button" onClick={() => { setAddMode(null); setLabourRole(""); setLabourHours("1"); }} className="text-xs text-[#A0A0A0] hover:text-[#C44545]">Cancel</button>
                </div>
                <form onSubmit={(e) => void handleAddLabour(e)} className="flex flex-wrap items-center gap-2">
                  <select
                    autoFocus
                    required
                    value={labourRole}
                    onChange={(e) => setLabourRole(e.target.value)}
                    className="flex-1 min-w-[180px] rounded-md border border-[#E6E1D4] bg-white px-3 py-2 text-sm focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]"
                  >
                    <option value="">Select a role...</option>
                    {labourRates.map((r) => (
                      <option key={r.id} value={r.role}>
                        {r.role}{r.loadedRate != null ? ` - ${fmtMoney(r.loadedRate)}/hr` : " - no rate set"}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={labourHours}
                    onChange={(e) => setLabourHours(e.target.value)}
                    placeholder="Hours"
                    className="w-24 rounded-md border border-[#E6E1D4] bg-white px-3 py-2 text-sm focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]"
                  />
                  <button type="submit" disabled={!labourRole || addingLabour} className={btnPrimary}>
                    {addingLabour ? "Adding..." : "Add labour"}
                  </button>
                </form>
                {labourRates.length === 0 && (
                  <p className="mt-2 text-[11px] text-[#A0A0A0]">No labour roles configured yet — add rates in Sales settings.</p>
                )}
                {labourRole !== "" && labourRates.find((r) => r.role === labourRole)?.loadedRate == null && (
                  <p className="mt-2 text-[11px] text-[#C8841E]">
                    This role has no rate set — the line will be added uncosted (price 0); mark it up on the quote.
                  </p>
                )}
                <p className="mt-2 text-[11px] text-[#A0A0A0]">
                  The line prefills at the role&rsquo;s rate; edit the unit price to mark it up.
                </p>
              </div>
            )}
          </div>
        )}

        {/* â”€â”€ Totals footer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        {/* ── Discount & solar rebates (manager-only, screen-only) ────────── */}
        {canSeeCost && !isLocked && (
          <div className="mb-6 rounded-[10px] border border-[#E6E1D4] bg-[#FAF8F2] p-4 print:hidden">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-[#6B6B6B]">Discount &amp; solar rebates</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <label className="flex flex-col gap-1 text-[11px] font-medium text-[#6B6B6B]">
                Discount (ex GST)
                <input
                  type="number" min="0" step="any" value={discountStr}
                  onChange={(e) => setDiscountStr(e.target.value)}
                  onBlur={() => void commitDiscount()}
                  className="rounded-md border border-[#E6E1D4] bg-white px-2 py-1.5 text-sm tabular-nums text-[#1A1A1A] focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]"
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-medium text-[#6B6B6B]">
                STCs (count)
                <input
                  type="number" min="0" step="1" value={stcCountStr}
                  onChange={(e) => setStcCountStr(e.target.value)}
                  onBlur={() => void commitRebates()}
                  className="rounded-md border border-[#E6E1D4] bg-white px-2 py-1.5 text-sm tabular-nums text-[#1A1A1A] focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]"
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-medium text-[#6B6B6B]">
                STC price (ea)
                <input
                  type="number" min="0" step="any" value={stcPriceStr}
                  onChange={(e) => setStcPriceStr(e.target.value)}
                  onBlur={() => void commitRebates()}
                  className="rounded-md border border-[#E6E1D4] bg-white px-2 py-1.5 text-sm tabular-nums text-[#1A1A1A] focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]"
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-medium text-[#6B6B6B]">
                VEEC rebate
                <input
                  type="number" min="0" step="any" value={veecStr}
                  onChange={(e) => setVeecStr(e.target.value)}
                  onBlur={() => void commitRebates()}
                  className="rounded-md border border-[#E6E1D4] bg-white px-2 py-1.5 text-sm tabular-nums text-[#1A1A1A] focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]"
                />
              </label>
            </div>
            <p className="mt-2 text-[11px] text-[#A0A0A0]">
              Rebates reduce what the customer pays; they don&rsquo;t change your margin (you claim the certificate value).
            </p>
          </div>
        )}

        {/* ── Totals footer ───────────────────────────────────────────────── */}
        <div className="mb-8 flex justify-end">
          <div className="w-full max-w-xs space-y-1">
            <div className="flex items-center justify-between text-sm text-[#6B6B6B]">
              <span>Subtotal (ex GST)</span>
              <span className="tabular-nums">{fmtMoney(fin.subtotalExGst)}</span>
            </div>
            {fin.discountExGst > 0 && (
              <div className="flex items-center justify-between text-sm text-[#6B6B6B]">
                <span>Discount</span>
                <span className="tabular-nums">-{fmtMoney(fin.discountExGst)}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-sm text-[#6B6B6B]">
              <span>GST ({(gstRate * 100).toFixed(0)}%)</span>
              <span className="tabular-nums">{fmtMoney(fin.gstAmount)}</span>
            </div>
            <div className="flex items-center justify-between border-t border-[#E6E1D4] pt-2 text-base font-semibold text-[#1A1A1A]">
              <span>Total (inc GST)</span>
              <span className="tabular-nums text-[18px]" style={{ fontFamily: FRAUNCES }}>
                {fmtMoney(fin.totalIncGst)}
              </span>
            </div>
            {fin.rebatesTotal > 0 && (
              <>
                {quote.stcCount > 0 && quote.stcUnitPriceExGst > 0 && (
                  <div className="flex items-center justify-between pt-1 text-sm text-[#6B6B6B]">
                    <span>STC rebate ({quote.stcCount}&times;)</span>
                    <span className="tabular-nums">-{fmtMoney(quote.stcCount * quote.stcUnitPriceExGst)}</span>
                  </div>
                )}
                {quote.veecRebateExGst > 0 && (
                  <div className="flex items-center justify-between text-sm text-[#6B6B6B]">
                    <span>VEEC rebate</span>
                    <span className="tabular-nums">-{fmtMoney(quote.veecRebateExGst)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between border-t border-[#E6E1D4] pt-2 text-base font-semibold text-[#2F8F5C]">
                  <span>Customer pays</span>
                  <span className="tabular-nums text-[18px]" style={{ fontFamily: FRAUNCES }}>
                    {fmtMoney(fin.customerPays)}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* â”€â”€ Notes textarea â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        {/* ── Manager-only cost / margin (screen only; never printed) ───────── */}
        {canSeeCost && margin && (
          <div className="mb-8 flex justify-end print:hidden">
            <div className="w-full max-w-xs rounded-[10px] border border-dashed border-[#D8D2C4] bg-[#FAF8F2] p-3">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#A0A0A0]">
                Internal — not shown to customer
              </p>
              <div className="space-y-1 text-[13px]">
                <div className="flex items-center justify-between text-[#6B6B6B]">
                  <span>Sell (ex GST){margin.discountExGst > 0 ? " · after disc." : ""}</span>
                  <span className="tabular-nums">{fmtMoney(margin.sellExGst)}</span>
                </div>
                <div className="flex items-center justify-between text-[#6B6B6B]">
                  <span>Materials cost</span>
                  <span className="tabular-nums">{fmtMoney(margin.materialsCost)}</span>
                </div>
                <div className="flex items-center justify-between border-t border-[#E6E1D4] pt-1.5 font-medium text-[#1A1A1A]">
                  <span>Gross profit</span>
                  <span className="tabular-nums">{fmtMoney(margin.profit.gross)}</span>
                </div>
                <div className="flex items-center justify-between text-[#6B6B6B]">
                  <span>Gross margin</span>
                  <span className="tabular-nums">{margin.grossMarginPct === null ? "—" : `${margin.grossMarginPct.toFixed(1)}%`}</span>
                </div>
                <div className="flex items-center justify-between text-[#6B6B6B]">
                  <span>Labour cost</span>
                  <span className="tabular-nums">{fmtMoney(margin.labourCost + margin.otherCost)}</span>
                </div>
                <div className="flex items-center justify-between border-t border-[#E6E1D4] pt-1.5 font-medium text-[#1A1A1A]">
                  <span>Nett profit</span>
                  <span className="tabular-nums">{fmtMoney(margin.profit.net)}</span>
                </div>
                <div className="flex items-center justify-between pt-0.5">
                  <span className="text-[#6B6B6B]">Nett margin</span>
                  <span
                    className="rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums"
                    style={{ backgroundColor: marginTone.bg, color: marginTone.fg }}
                  >
                    {margin.profit.marginPct === null ? "—" : `${margin.profit.marginPct.toFixed(1)}%`}
                  </span>
                </div>
              </div>
              {margin.uncostedLabourLines > 0 && (
                <p className="mt-2 text-[11px] text-[#C8841E]">
                  {margin.uncostedLabourLines} labour line{margin.uncostedLabourLines > 1 ? "s" : ""} uncosted — margin may be overstated.
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── Notes textarea ─────────────────────────────────────────────── */}
        <div className="mb-8">
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#A0A0A0]">
            Customer-visible notes
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            disabled={isLocked}
            placeholder="Add any notes for the customer â€” these will appear on the printed quote."
            className="w-full rounded-md border border-[#E6E1D4] px-3 py-2 text-sm focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C] disabled:opacity-50 print:border-0 print:px-0"
          />
        </div>

        {/* â”€â”€ Status action bar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <div className="flex flex-wrap items-center gap-3 border-t border-[#EFEBE0] pt-5 print:hidden">
          <span
            className="inline-flex rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em]"
            style={{ backgroundColor: statusTone.bg, color: statusTone.fg }}
          >
            {quote.status}
          </span>

          <div className="ml-auto flex flex-wrap gap-2">
            {quote.status === "draft" && (
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleStatusAction("send")}
                className={btnPrimary}
              >
                Mark sent
              </button>
            )}
            {(quote.status === "sent" || quote.status === "viewed") && (
              <>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleStatusAction("accept")}
                  className={btnPrimary}
                >
                  Mark accepted
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleStatusAction("decline")}
                  className={btnGhost}
                >
                  Mark declined
                </button>
              </>
            )}
            {quote.status === "accepted" && !quote.convertedJobId && (
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleStatusAction("convertJob")}
                className={btnPrimary}
              >
                Convert to job
              </button>
            )}
            {quote.status === "accepted" && quote.convertedJobId && (
              <span className="text-xs text-[#2F8F5C]">
                Job created â€” find it on the Jobs board.
              </span>
            )}
          </div>

          {quote.status === "draft" && (
            <p className="w-full text-[11px] text-[#A0A0A0]">
              Email sending arrives with the mail hookup â€” send manually for now.
            </p>
          )}
        </div>

      </div>

      {toast && (
        <Toaster message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}

      {/* â”€â”€ Print stylesheet â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <style>{`
        @media print {
          body.printing-commercial-doc * { visibility: hidden; }
          body.printing-commercial-doc .print-sheet,
          body.printing-commercial-doc .print-sheet * { visibility: visible; }
          body.printing-commercial-doc .print-sheet {
            position: absolute;
            inset: 0 auto auto 0;
            width: 100%;
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
          }
          body.printing-commercial-doc .print\\:hidden { visibility: hidden !important; }
          body.printing-commercial-doc .print\\:border-0 { border: none !important; }
          body.printing-commercial-doc .print\\:px-0 { padding-left: 0 !important; padding-right: 0 !important; }
        }
      `}</style>
    </>
  );
}

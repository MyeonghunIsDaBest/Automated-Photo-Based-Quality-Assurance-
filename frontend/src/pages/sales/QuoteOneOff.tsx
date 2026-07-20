// ─────────────────────────────────────────────────────────────────────────────
// pages/sales/QuoteOneOff.tsx — the "One Off Items" sub-tab of a quote's Parts &
// Labour strip (Simpro replication, Phase 1 Part 8).
//
// A one-off line is a part/price entered just for this quote that isn't in the
// catalogue (name, qty, unit, sell, optional cost). It lands as a custom line via
// addQuoteItemFree. Optionally tick "save to catalogue" so a good one-off becomes
// a reusable material (createMaterial) for next time.
//
// Screen-only (parent renders inside a print:hidden block); cost field shown only
// when canSeeCost.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { Plus, Loader2 } from "lucide-react";

import { addQuoteItemFree } from "../../lib/api/commercial";
import { createMaterial } from "../../lib/api/materials";

interface Props {
  quoteId: string;
  canSeeCost: boolean;
  isLocked: boolean;
  onAdded: () => void;
  onToast?: (message: string, type: "success" | "error" | "info") => void;
  /** Cost centre new lines land in (null = General). */
  activeSectionId?: string | null;
}

const INPUT =
  "min-h-11 w-full rounded-md border border-[#E6E1D4] bg-white px-3 py-2 text-sm text-[#1A1A1A] placeholder:text-[#C0BAB0] focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C] sm:min-h-0";
const LABEL = "mb-1 block text-[11px] font-medium uppercase tracking-wider text-[#6B6B6B]";

export default function QuoteOneOff({ quoteId, canSeeCost, isLocked, onAdded, onToast, activeSectionId = null }: Props) {
  const [desc, setDesc] = useState("");
  const [qty, setQty] = useState("1");
  const [unit, setUnit] = useState("ea");
  const [sell, setSell] = useState("0");
  const [cost, setCost] = useState("");
  const [saveToCatalogue, setSaveToCatalogue] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setDesc(""); setQty("1"); setUnit("ea"); setSell("0"); setCost(""); setSaveToCatalogue(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const description = desc.trim();
    if (!description) { setError("Description is required."); return; }
    const qtyNum = parseFloat(qty) || 1;
    const sellNum = parseFloat(sell) || 0;
    const costNum = cost.trim() === "" ? null : parseFloat(cost);
    if (cost.trim() !== "" && (costNum === null || isNaN(costNum))) { setError("Cost must be a number."); return; }

    setBusy(true);
    try {
      await addQuoteItemFree(quoteId, {
        description,
        qty: qtyNum,
        unit: unit.trim() || "ea",
        unitPriceExGst: sellNum,
        costPriceExGst: costNum,
        sectionId: activeSectionId,
      });
      if (saveToCatalogue) {
        try {
          await createMaterial({
            name: description,
            unit: unit.trim() || "ea",
            costPrice: costNum,
            sellPrice: sellNum,
          });
        } catch (ex) {
          // The line was added to the quote; surface the catalogue-save failure
          // without losing that success.
          onToast?.(ex instanceof Error ? `Added to quote, but catalogue save failed: ${ex.message}` : "Added to quote, but catalogue save failed", "info");
          onAdded();
          reset();
          return;
        }
      }
      onAdded();
      onToast?.(`Added ${description}${saveToCatalogue ? " (also saved to catalogue)" : ""}`, "success");
      reset();
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : "Failed to add one-off item");
    } finally {
      setBusy(false);
    }
  }

  if (isLocked) {
    return (
      <div className="mb-8 rounded-[10px] border border-dashed border-[#D8D2C4] bg-[#FAF8F2] px-4 py-8 text-center text-sm text-[#A0A0A0] print:hidden">
        This quote is locked — reopen it to add one-off items.
      </div>
    );
  }

  return (
    <div className="mb-8 print:hidden">
      <form onSubmit={(e) => void handleSubmit(e)} className="rounded-[10px] border border-[#E6E1D4] bg-[#FAF8F2] p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-[#6B6B6B]">Add a one-off item</p>
        <p className="mb-4 text-[11px] text-[#A0A0A0]">
          A line that isn&rsquo;t in your catalogue — entered just for this quote. Tick &ldquo;save to catalogue&rdquo; to reuse it later.
        </p>

        <div className="mb-3">
          <label className={LABEL}>Description</label>
          <input autoFocus value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="e.g. Special-order isolator" className={INPUT} disabled={busy} />
        </div>

        <div className={`grid gap-3 ${canSeeCost ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"}`}>
          <div>
            <label className={LABEL}>Qty</label>
            <input type="number" min="0" step="0.01" value={qty} onChange={(e) => setQty(e.target.value)} className={`${INPUT} text-right tabular-nums`} disabled={busy} />
          </div>
          <div>
            <label className={LABEL}>Unit</label>
            <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="ea" className={INPUT} disabled={busy} />
          </div>
          {canSeeCost && (
            <div>
              <label className={LABEL}>Cost <span className="normal-case text-[#A0A0A0]">(ex-GST)</span></label>
              <input type="number" min="0" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="—" className={`${INPUT} text-right tabular-nums`} disabled={busy} />
            </div>
          )}
          <div>
            <label className={LABEL}>Sell <span className="normal-case text-[#A0A0A0]">(ex-GST)</span></label>
            <input type="number" min="0" step="0.01" value={sell} onChange={(e) => setSell(e.target.value)} className={`${INPUT} text-right tabular-nums`} disabled={busy} />
          </div>
        </div>

        {error && <p className="mt-3 text-xs text-[#C44545]">{error}</p>}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-[#3A3A3A]">
            <input type="checkbox" checked={saveToCatalogue} onChange={(e) => setSaveToCatalogue(e.target.checked)} className="h-4 w-4 accent-[#2F8F5C]" disabled={busy} />
            Also save to catalogue for reuse
          </label>
          <button
            type="submit"
            disabled={busy}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-md bg-[#2F8F5C] px-4 py-2 text-sm font-semibold text-white hover:bg-[#287a4e] disabled:opacity-60 sm:min-h-[36px]"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Add to quote
          </button>
        </div>
      </form>
    </div>
  );
}

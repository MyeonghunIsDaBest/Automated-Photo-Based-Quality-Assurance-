// ─────────────────────────────────────────────────────────────────────────────
// pages/stock/LocationMinimums.tsx — THIS location's own minimums (migration
// 99): "does this building/van hold enough?", distinct from the company-wide
// buying rules. Below-min rows suggest the type-appropriate action — the
// factory/warehouse drafts a restock ORDER destined for itself; vans, sites,
// and storage ask for a TRANSFER from the factory (parent opens its transfer
// modal). Collapsed by default to keep the detail view calm.
//
// Same save-on-blur buffer contract as the reorder-rules editor: onChange
// writes only the buffer, onBlur persists (optimistic local update).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, ChevronDown, Loader2, Search, ShoppingCart, X } from "lucide-react";

import type { ToastState } from "../../components/ui/Toaster";
import { cardShell, StatusPill } from "../gantt/components/ledger";
import { cn } from "../../lib/cn";
import { listMaterials, type Material } from "../../lib/api/materials";
import type { StockLevel, StockLocation } from "../../lib/api/stock";
import {
  createPurchaseOrder, listLocationReorderRules, upsertLocationReorderRule, type LocationReorderRule,
} from "../../lib/api/purchasing";
import { fmtQty } from "../../lib/format";

const numCell =
  "w-16 rounded-[8px] border border-[#E6E1D4] bg-white px-2 py-1.5 text-center text-[12.5px] tabular-nums text-[#1A1A1A] focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]";
const rowGrid = "grid grid-cols-[minmax(0,1.6fr)_90px_80px_80px_minmax(0,1fr)] items-center gap-2.5";

interface Props {
  location: StockLocation;
  levels: StockLevel[];
  onToast: (t: ToastState) => void;
  /** Van/storage/site top-ups: the parent opens its transfer modal. */
  onRequestTransfer: () => void;
  /** Fired after a factory restock PO drafts so the parent can refetch. */
  onChanged?: () => void;
}

export default function LocationMinimums({ location, levels, onToast, onRequestTransfer, onChanged }: Props) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Material[]>([]);
  const [rules, setRules] = useState<Map<string, LocationReorderRule>>(new Map());
  const [edits, setEdits] = useState<Record<string, { min?: string; target?: string }>>({});
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [drafting, setDrafting] = useState(false);

  // Load lazily on first expand — most detail visits never open this section.
  useEffect(() => {
    if (!open || loaded) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      listMaterials().then((m) => m.filter((x) => x.isStockItem)).catch(() => [] as Material[]),
      listLocationReorderRules(location.id).catch(() => [] as LocationReorderRule[]),
    ])
      .then(([mats, rls]) => {
        if (cancelled) return;
        setItems(mats);
        setRules(new Map(rls.map((r) => [r.materialId, r])));
        setLoaded(true);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, loaded, location.id]);

  // Rule count for the collapsed label — cheap fetch once per location.
  const [ruleCount, setRuleCount] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    listLocationReorderRules(location.id)
      .then((rls) => { if (!cancelled) setRuleCount(rls.filter((r) => r.minQty > 0 || r.targetQty > 0).length); })
      .catch(() => { if (!cancelled) setRuleCount(null); });
    return () => { cancelled = true; };
  }, [location.id]);

  const onHand = useMemo(() => new Map(levels.map((l) => [l.materialId, l.qty])), [levels]);

  function ruleFor(id: string): LocationReorderRule {
    return rules.get(id) ?? { locationId: location.id, materialId: id, minQty: 0, targetQty: 0 };
  }

  async function saveRule(materialId: string, patch: { minQty?: number; targetQty?: number }) {
    const next = { ...ruleFor(materialId), ...patch };
    setRules((prev) => new Map(prev).set(materialId, next));
    setRuleCount(null); // recount lazily next visit; the open table is the truth while editing
    try {
      await upsertLocationReorderRule(location.id, materialId, patch);
    } catch (ex) {
      onToast({ message: ex instanceof Error ? ex.message : "Failed to save (is migration 99 applied?)", type: "error" });
    }
  }

  const term = search.trim().toLowerCase();
  const shown = useMemo(() => {
    const base = term
      ? items.filter((m) => m.name.toLowerCase().includes(term) || (m.sku ?? "").toLowerCase().includes(term))
      : items;
    // Ruled + below-min rows float to the top so the section opens onto signal.
    return [...base].sort((a, b) => {
      const ra = ruleFor(a.id); const rb = ruleFor(b.id);
      const wa = (ra.minQty > 0 ? 1 : 0) + ((onHand.get(a.id) ?? 0) < ra.minQty && ra.minQty > 0 ? 2 : 0);
      const wb = (rb.minQty > 0 ? 1 : 0) + ((onHand.get(b.id) ?? 0) < rb.minQty && rb.minQty > 0 ? 2 : 0);
      return wb - wa || a.name.localeCompare(b.name);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, term, rules, onHand]);

  const belowMin = shown.filter((m) => { const r = ruleFor(m.id); return r.minQty > 0 && (onHand.get(m.id) ?? 0) < r.minQty; });

  // Factory action: one draft PO destined for THIS location covering every
  // below-min row (top up to target, or min when no target).
  async function draftFactoryOrder() {
    if (belowMin.length === 0) return;
    setDrafting(true);
    try {
      const po = await createPurchaseOrder({
        kind: "restock",
        supplierId: null,
        destinationLocationId: location.id,
        status: "draft",
        notes: `Drafted from ${location.name}'s own minimums.`,
        items: belowMin.map((m) => {
          const r = ruleFor(m.id);
          const goal = r.targetQty > 0 ? r.targetQty : r.minQty;
          const qty = Math.max(0, Math.round((goal - (onHand.get(m.id) ?? 0)) * 100) / 100);
          return { materialId: m.id, description: m.name, qtyOrdered: qty, unitCost: m.costPrice ?? null };
        }),
      });
      onToast({ message: `${po.number} drafted for ${belowMin.length} item${belowMin.length === 1 ? "" : "s"} — review it in Orders.`, type: "success" });
      onChanged?.();
    } catch (ex) {
      onToast({ message: ex instanceof Error ? ex.message : "Failed to draft order", type: "error" });
    } finally {
      setDrafting(false);
    }
  }

  return (
    <div className={cn(cardShell, "rounded-[16px] overflow-hidden")}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center justify-between gap-3 px-5 py-3.5 text-left transition-colors hover:bg-[#FAF8F2]"
      >
        <span className="flex min-w-0 items-center gap-2.5 text-[13.5px] font-bold text-[#1A1A1A]">
          This location’s minimums
          {ruleCount != null && <span className="rounded-full bg-[#FAF8F2] px-2 py-0.5 text-[11.5px] font-semibold tabular-nums text-[#6B6B6B]">{ruleCount} set</span>}
        </span>
        <span className="flex shrink-0 items-center gap-3">
          {open && belowMin.length > 0 && <StatusPill tone="red">{belowMin.length} below min</StatusPill>}
          <ChevronDown className={cn("h-4 w-4 text-[#6B6B6B] transition-transform duration-200", open && "rotate-180")} />
        </span>
      </button>

      {open && (
        <div className="border-t border-[#EFEBE0]">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
            <p className="text-[12px] text-[#6B6B6B]">
              {location.type === "factory"
                ? "When the factory itself runs under a minimum, draft a restock order straight to it — even if the company total looks fine because the stock is out in vans."
                : "When this location runs under a minimum, it shows on the Restock tab as a top-up — moved from the factory, never bought."}
            </p>
            {location.type === "factory" ? (
              <button
                type="button"
                onClick={() => void draftFactoryOrder()}
                disabled={drafting || belowMin.length === 0}
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-[#E6E1D4] bg-white px-3.5 py-2 text-[12.5px] font-semibold text-[#3A3A3A] transition-colors hover:border-[#2F8F5C] hover:text-[#2F8F5C] disabled:opacity-50"
              >
                {drafting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShoppingCart className="h-3.5 w-3.5" />}
                Draft restock order{belowMin.length > 0 ? ` (${belowMin.length})` : ""}
              </button>
            ) : (
              <button
                type="button"
                onClick={onRequestTransfer}
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-[#E6E1D4] bg-white px-3.5 py-2 text-[12.5px] font-semibold text-[#3A3A3A] transition-colors hover:border-[#2F8F5C] hover:text-[#2F8F5C]"
              >
                <ArrowLeftRight className="h-3.5 w-3.5" /> Transfer from factory
              </button>
            )}
          </div>

          <div className="relative mx-5 mb-3 max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A0A0A0]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search item or SKU…"
              className="w-full rounded-full border border-[#E6E1D4] bg-white py-1.5 pl-9 pr-8 text-[13px] focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]"
            />
            {search && <button type="button" onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-[#A0A0A0] hover:text-[#C44545]" aria-label="Clear"><X className="h-3.5 w-3.5" /></button>}
          </div>

          {loading ? (
            <p className="flex items-center gap-2 px-5 pb-5 text-sm text-[#A0A0A0]"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[560px]">
                <div className={cn(rowGrid, "border-y border-[#E6E1D4] bg-[#FAF8F2] px-5 py-2 text-[10px] font-bold uppercase tracking-[0.06em] text-[#6B6B6B]")}>
                  <span>Item</span><span>Here now</span><span>Min</span><span>Target</span><span>Suggested</span>
                </div>
                <div className="max-h-[360px] overflow-y-auto">
                  {shown.length === 0 && <p className="px-5 py-6 text-center text-sm text-[#A0A0A0]">Nothing matches.</p>}
                  {shown.map((m) => {
                    const r = ruleFor(m.id);
                    const buf = edits[m.id] ?? {};
                    const oh = onHand.get(m.id) ?? 0;
                    const low = r.minQty > 0 && oh < r.minQty;
                    const goal = r.targetQty > 0 ? r.targetQty : r.minQty;
                    const suggested = low ? Math.max(0, Math.round((goal - oh) * 100) / 100) : 0;
                    return (
                      <div key={m.id} className={cn(rowGrid, "border-b border-[#EFEBE0] px-5 py-2 text-[13px] last:border-b-0")}>
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-[#1A1A1A]">{m.name}</span>
                          {m.sku && <span className="block truncate text-[11px] text-[#A0A0A0]">{m.sku}</span>}
                        </span>
                        <span className={cn("tabular-nums font-semibold", low ? "text-[#C44545]" : "text-[#3A3A3A]")}>
                          {fmtQty(oh)} <span className="text-[11px] font-normal text-[#A0A0A0]">{m.unit}</span>
                        </span>
                        <input
                          type="number" min={0} step="any" inputMode="decimal"
                          aria-label={`Minimum for ${m.name} at ${location.name}`}
                          value={buf.min ?? String(r.minQty)}
                          onChange={(e) => setEdits((p) => ({ ...p, [m.id]: { ...p[m.id], min: e.target.value } }))}
                          onBlur={(e) => void saveRule(m.id, { minQty: parseFloat(e.target.value) || 0 })}
                          className={numCell}
                        />
                        <input
                          type="number" min={0} step="any" inputMode="decimal"
                          aria-label={`Target for ${m.name} at ${location.name}`}
                          value={buf.target ?? String(r.targetQty)}
                          onChange={(e) => setEdits((p) => ({ ...p, [m.id]: { ...p[m.id], target: e.target.value } }))}
                          onBlur={(e) => void saveRule(m.id, { targetQty: parseFloat(e.target.value) || 0 })}
                          className={numCell}
                        />
                        <span className={cn("tabular-nums", suggested > 0 ? "font-semibold text-[#1A1A1A]" : "text-[#A0A0A0]")}>
                          {suggested > 0 ? `${location.type === "factory" ? "order" : "move"} +${fmtQty(suggested)}` : "—"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

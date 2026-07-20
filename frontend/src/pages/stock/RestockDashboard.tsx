// ─────────────────────────────────────────────────────────────────────────────
// pages/stock/RestockDashboard.tsx — manager restock hub: what's below minimum
// (with editable order quantities + per-item "Order now"), items already on an
// open order, one-tap "Generate restock orders" (drafts POs per wholesaler +
// alerts the controller), the restock POs, and stock transfers.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw, ArrowLeftRight, Check, ChevronRight, ShoppingCart, SlidersHorizontal, Truck, Factory as FactoryIcon, MapPin, Warehouse } from "lucide-react";

import { Toaster, type ToastState } from "../../components/ui/Toaster";
import { cn } from "../../lib/cn";
import ReorderRulesEditor from "./ReorderRulesEditor";
import { cardShell, btnPrimary, btnGhost, inputField, touchTarget, FRAUNCES, StatusPill, MetaChip, type ToneKey } from "../gantt/components/ledger";
import {
  getLowStock, listPurchaseOrders, draftRestocks, createPurchaseOrder, getOnOrderMap, getLocationShortfalls,
  type LowStockItem, type PurchaseOrder, type POStatus, type LocationShortfall,
} from "../../lib/api/purchasing";
import { listStockLocations } from "../../lib/api/stock";
import { listSuppliers, type Supplier } from "../../lib/api/suppliers";
import { fmtQty } from "../../lib/format";
import TransferStockModal from "./TransferStockModal";

const PO_TONE: Record<POStatus, ToneKey> = {
  suggested: "amber", draft: "slate", sent: "sage", partial: "amber", received: "sage", cancelled: "red",
};
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString();

export default function RestockDashboard({ onGoToOrders }: { onGoToOrders?: () => void }) {
  const [low, setLow] = useState<LowStockItem[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [onOrder, setOnOrder] = useState<Map<string, string>>(new Map());
  const [shortfalls, setShortfalls] = useState<LocationShortfall[]>([]);
  const [factoryId, setFactoryId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [orderingId, setOrderingId] = useState<string | null>(null);
  const [orderQty, setOrderQty] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<ToastState>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  // "Set minimums" scrolls to the in-page editor now (it used to jump to Settings).
  const minimumsRef = useRef<HTMLDivElement>(null);
  const scrollToMinimums = () => minimumsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  async function refetch() {
    const [l, o, s, oo, locs, sf] = await Promise.all([
      getLowStock().catch(() => []),
      listPurchaseOrders({ kind: "restock" }).catch(() => []),
      listSuppliers().catch(() => []),
      getOnOrderMap().catch(() => new Map<string, string>()),
      listStockLocations().catch(() => []),
      getLocationShortfalls().catch(() => []),
    ]);
    setLow(l); setOrders(o); setSuppliers(s); setOnOrder(oo); setShortfalls(sf);
    setFactoryId(locs.find((x) => x.type === "factory")?.id ?? null);
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    refetch().catch(() => {}).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const supplierName = (id: string | null) => (id ? (suppliers.find((s) => s.id === id)?.name ?? "—") : "—");
  const stillNeeded = low.filter((l) => !onOrder.has(l.materialId));

  async function handleGenerate() {
    setGenerating(true);
    try {
      const res = await draftRestocks();
      await refetch();
      setToast({
        message: res.ordersCreated === 0 ? "Nothing to reorder — all shortfalls are already on an open order." : `Drafted ${res.ordersCreated} restock order${res.ordersCreated === 1 ? "" : "s"} for ${res.itemsDrafted} item${res.itemsDrafted === 1 ? "" : "s"}.`,
        type: "success",
      });
    } catch (ex) {
      setToast({ message: ex instanceof Error ? ex.message : "Failed to generate restock", type: "error" });
    } finally {
      setGenerating(false);
    }
  }

  async function handleOrderNow(l: LowStockItem) {
    const qty = parseFloat(orderQty[l.materialId] ?? "");
    const orderNow = Number.isFinite(qty) && qty > 0 ? qty : l.needed;
    setOrderingId(l.materialId);
    try {
      const po = await createPurchaseOrder({
        kind: "restock",
        supplierId: l.supplierId,
        destinationLocationId: factoryId,
        status: "draft",
        notes: "Ordered from the Restock dashboard.",
        items: [{ materialId: l.materialId, description: l.name, qtyOrdered: orderNow, unitCost: l.costPrice }],
      });
      await refetch();
      setToast({ message: `${po.number} drafted — ${fmtQty(orderNow)} ${l.unit} of ${l.name}. Review it in Orders.`, type: "success" });
    } catch (ex) {
      setToast({ message: ex instanceof Error ? ex.message : "Failed to draft order", type: "error" });
    } finally {
      setOrderingId(null);
    }
  }

  // A factory/warehouse below ITS OWN minimum — draft a PO destined for that
  // location. Supplier comes from the company rule/material fallback when one
  // exists in the low list; otherwise unassigned (picked in the drawer).
  async function handleOrderShortfall(s: LocationShortfall) {
    setOrderingId(s.materialId);
    try {
      const known = low.find((l) => l.materialId === s.materialId);
      const po = await createPurchaseOrder({
        kind: "restock",
        supplierId: known?.supplierId ?? null,
        destinationLocationId: s.locationId,
        status: "draft",
        notes: `Ordered from Location shortfalls — top up ${s.locationName}.`,
        items: [{ materialId: s.materialId, description: s.name, qtyOrdered: s.suggestedQty, unitCost: known?.costPrice ?? null }],
      });
      await refetch();
      setToast({ message: `${po.number} drafted — ${fmtQty(s.suggestedQty)} ${s.unit} of ${s.name} to ${s.locationName}.`, type: "success" });
    } catch (ex) {
      setToast({ message: ex instanceof Error ? ex.message : "Failed to draft order", type: "error" });
    } finally {
      setOrderingId(null);
    }
  }

  if (loading) {
    return <div className={cn(cardShell, "flex items-center gap-2 rounded-[16px] px-5 py-8 text-sm text-[#A0A0A0]")}><Loader2 className="h-4 w-4 animate-spin" /> Loading restock…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#6B6B6B]">
          {low.length === 0 ? "Items below minimum" : `${low.length} item${low.length === 1 ? "" : "s"} below minimum${stillNeeded.length !== low.length ? ` · ${low.length - stillNeeded.length} already on order` : ""}`}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={scrollToMinimums} className={cn(btnGhost, touchTarget)}><SlidersHorizontal className="h-4 w-4" /> Set minimums</button>
          <button type="button" onClick={() => setTransferOpen(true)} className={cn(btnGhost, touchTarget)}><ArrowLeftRight className="h-4 w-4" /> Transfer stock</button>
          <button type="button" onClick={() => void handleGenerate()} disabled={generating || stillNeeded.length === 0} className={cn(btnPrimary, touchTarget)}>
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Generate restock orders
          </button>
        </div>
      </div>

      {/* Low stock */}
      {low.length === 0 ? (
        <div className={cn(cardShell, "rounded-[16px] px-6 py-10 text-center")}>
          <span className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full border-[1.5px] border-[#2F8F5C] text-[#2F8F5C]" aria-hidden>
            <Check className="h-[22px] w-[22px]" strokeWidth={2} />
          </span>
          <p className="text-[16px] font-semibold text-[#1A1A1A]">Everything’s above its minimum</p>
          <p className="mx-auto mt-1.5 max-w-md text-[13px] text-[#6B6B6B]">
            When an item’s company total drops below its minimum it shows here.
            {" "}Set minimums per item in <button type="button" onClick={scrollToMinimums} className="font-semibold text-[#2F8F5C] transition-colors hover:text-[#246F47]">Minimums &amp; targets</button> below.
          </p>
        </div>
      ) : (
        <div className={cn(cardShell, "rounded-[16px] overflow-x-auto")}>
          <table className="min-w-full text-[13px]">
            <thead>
              <tr className="border-b border-[#E6E1D4] bg-[#FAF8F2]">
                <th className="px-5 py-2.5 text-left text-[10.5px] font-bold uppercase tracking-[0.07em] text-[#6B6B6B]">Item</th>
                <th className="w-24 px-3 py-2.5 text-right text-[10.5px] font-bold uppercase tracking-[0.07em] text-[#6B6B6B]">On hand</th>
                <th className="w-20 px-3 py-2.5 text-right text-[10.5px] font-bold uppercase tracking-[0.07em] text-[#6B6B6B]">Min</th>
                <th className="px-3 py-2.5 text-left text-[10.5px] font-bold uppercase tracking-[0.07em] text-[#6B6B6B]">Wholesaler</th>
                <th className="w-24 px-3 py-2.5 text-right text-[10.5px] font-bold uppercase tracking-[0.07em] text-[#6B6B6B]">Order qty</th>
                <th className="w-36 px-3 py-2.5" aria-label="Order" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E6E1D4]">
              {low.map((l) => {
                const poNumber = onOrder.get(l.materialId);
                return (
                  <tr key={l.materialId}>
                    <td className="px-5 py-3">
                      <span className="block font-semibold text-[#1A1A1A]">{l.name}</span>
                      {l.sku && <span className="block text-[11px] text-[#A0A0A0]">{l.sku}</span>}
                    </td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums text-[#C44545]">{fmtQty(l.total)} <span className="text-[11px] font-normal text-[#A0A0A0]">{l.unit}</span></td>
                    <td className="px-3 py-3 text-right tabular-nums text-[#6B6B6B]">{fmtQty(l.minQty)}</td>
                    <td className="px-3 py-3 text-[#6B6B6B]">{supplierName(l.supplierId)}</td>
                    {poNumber ? (
                      <td className="px-3 py-3 text-right" colSpan={2}>
                        <MetaChip>On order · {poNumber}</MetaChip>
                      </td>
                    ) : (
                      <>
                        <td className="px-3 py-3 text-right">
                          <input
                            type="number" min={0} step="any" inputMode="decimal"
                            value={orderQty[l.materialId] ?? ""}
                            placeholder={fmtQty(l.needed)}
                            onChange={(e) => setOrderQty((p) => ({ ...p, [l.materialId]: e.target.value }))}
                            className={`${inputField} w-20 text-right tabular-nums`}
                            aria-label={`Order quantity for ${l.name}`}
                          />
                        </td>
                        <td className="px-3 py-3 pr-5 text-right">
                          <button
                            type="button"
                            onClick={() => void handleOrderNow(l)}
                            disabled={orderingId === l.materialId}
                            className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-[#E6E1D4] bg-white px-3 py-1.5 text-xs font-semibold text-[#3A3A3A] transition-colors hover:border-[#2F8F5C] hover:text-[#2F8F5C] disabled:opacity-60"
                          >
                            {orderingId === l.materialId && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                            Order now
                          </button>
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Restock orders */}
      <div>
        <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.1em] text-[#6B6B6B]">Recent restock orders</p>
        {orders.length === 0 ? (
          <div className={cn(cardShell, "rounded-[16px] px-5 py-8 text-center text-sm text-[#A0A0A0]")}>No restock orders yet. Use “Order now” on a low item, or “Generate restock orders” to draft everything at once.</div>
        ) : (
          <div className={cn(cardShell, "rounded-[16px] overflow-hidden")}>
            {orders.map((o) => (
              <div key={o.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-[#E6E1D4] px-5 py-3.5">
                <span className="flex min-w-0 items-center gap-3">
                  <span className="text-[13.5px] font-semibold text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>{o.number}</span>
                  <span className="truncate text-[12.5px] text-[#6B6B6B]">{o.supplierName ?? "—"}</span>
                </span>
                <span className="flex shrink-0 items-center gap-3.5">
                  <span className="text-[11.5px] tabular-nums text-[#A0A0A0]">{o.itemsCount ?? 0} items · {fmtDate(o.createdAt)}</span>
                  <StatusPill tone={PO_TONE[o.status]} className="uppercase tracking-wide">{o.status}</StatusPill>
                </span>
              </div>
            ))}
            {onGoToOrders && (
              <div className="px-5 py-3">
                <button type="button" onClick={onGoToOrders} className="flex min-h-11 items-center gap-1.5 text-left text-[12.5px] font-semibold text-[#6B6B6B] transition-colors hover:text-[#1A1A1A]">
                  Open the Orders tab to review, send, and receive these into the factory <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                </button>
              </div>
            )}
          </div>
        )}
        {!onGoToOrders && <p className="mt-2 text-[11px] text-[#A0A0A0]">Open the Orders tab to review, send, and receive these into the factory.</p>}
      </div>

      {/* ── Location shortfalls — per-warehouse/van minimums (migration 99).
             Distinct from the company list above: this asks "does THIS building
             or van hold enough?", and the action differs by type — the factory
             ORDERS, everything else gets a TRANSFER from the factory. ── */}
      <div>
        <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.1em] text-[#6B6B6B]">Location shortfalls</p>
        {shortfalls.length === 0 ? (
          <p className={cn(cardShell, "rounded-[16px] px-5 py-6 text-[13px] text-[#6B6B6B]")}>
            No location is below its own minimum. Per-location minimums live on each location’s page — open the factory or a van under Locations to set them.
          </p>
        ) : (
          <div className="space-y-3">
            {[...new Map(shortfalls.map((s) => [s.locationId, s.locationName])).keys()].map((locId) => {
              const rows = shortfalls.filter((s) => s.locationId === locId);
              const first = rows[0];
              const isOrder = first.action === "order";
              const TypeIcon = first.locationType === "factory" ? FactoryIcon : first.locationType === "van" ? Truck : first.locationType === "site" ? MapPin : Warehouse;
              return (
                <div key={locId} className={cn(cardShell, "rounded-[16px] overflow-hidden")}>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E6E1D4] px-5 py-3">
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[9px] bg-[#FAF8F2] text-[#2F8F5C]" aria-hidden><TypeIcon className="h-4 w-4" /></span>
                      <span className="truncate text-[13.5px] font-bold text-[#1A1A1A]">{first.locationName}</span>
                      <StatusPill tone={isOrder ? "amber" : "sky"} className="uppercase tracking-wide">{isOrder ? "Needs ordering" : "Needs a top-up"}</StatusPill>
                    </span>
                    {!isOrder && (
                      <button type="button" onClick={() => setTransferOpen(true)} className={btnGhost}><ArrowLeftRight className="h-4 w-4" /> Transfer stock</button>
                    )}
                  </div>
                  {rows.map((s) => {
                    const factoryShort = s.action === "transfer" && s.factoryOnHand != null && s.factoryOnHand < s.suggestedQty;
                    return (
                      <div key={s.materialId} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-[#EFEBE0] px-5 py-2.5 text-[13px] last:border-b-0">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold text-[#1A1A1A]">{s.name}</span>
                          {s.sku && <span className="block truncate text-[11px] text-[#A0A0A0]">{s.sku}</span>}
                        </span>
                        <span className="tabular-nums text-[#C44545]">{fmtQty(s.onHand)} <span className="text-[11px] text-[#A0A0A0]">/ min {fmtQty(s.minQty)} {s.unit}</span></span>
                        <span className="tabular-nums text-[#3A3A3A]">
                          {s.action === "transfer" ? "move" : "order"} +{fmtQty(s.suggestedQty)}
                          {s.action === "transfer" && s.factoryOnHand != null && (
                            <span className={cn("ml-1.5 text-[11px]", factoryShort ? "font-semibold text-[#C44545]" : "text-[#A0A0A0]")}>
                              (factory holds {fmtQty(s.factoryOnHand)}{factoryShort ? " — short" : ""})
                            </span>
                          )}
                        </span>
                        {s.action === "order" && (
                          <button
                            type="button"
                            onClick={() => void handleOrderShortfall(s)}
                            disabled={orderingId === s.materialId}
                            className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-[#E6E1D4] bg-white px-3 py-1.5 text-xs font-semibold text-[#3A3A3A] transition-colors hover:border-[#2F8F5C] hover:text-[#2F8F5C] disabled:opacity-60"
                          >
                            {orderingId === s.materialId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShoppingCart className="h-3.5 w-3.5" />}
                            Order now
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Minimums & targets — moved here from Settings (P9.BS WS4): the
             thresholds live beside the below-minimum list they drive. ── */}
      <div ref={minimumsRef} className="scroll-mt-4">
        <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.1em] text-[#6B6B6B]">Minimums &amp; targets</p>
        <ReorderRulesEditor onToast={setToast} onRulesChanged={() => void refetch()} />
      </div>

      <TransferStockModal open={transferOpen} onClose={() => setTransferOpen(false)} onDone={(m) => { setToast({ message: m, type: "success" }); void refetch(); }} />

      {toast && <Toaster message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

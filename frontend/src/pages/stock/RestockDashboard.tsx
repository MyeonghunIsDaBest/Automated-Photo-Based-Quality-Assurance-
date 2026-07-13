// ─────────────────────────────────────────────────────────────────────────────
// pages/stock/RestockDashboard.tsx — manager restock hub: what's below minimum
// (with editable order quantities + per-item "Order now"), items already on an
// open order, one-tap "Generate restock orders" (drafts POs per wholesaler +
// alerts the controller), the restock POs, and stock transfers.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { Loader2, RefreshCw, ArrowLeftRight, AlertTriangle, ShoppingCart, CheckCircle2, SlidersHorizontal } from "lucide-react";

import { Toaster, type ToastState } from "../../components/ui/Toaster";
import { cardShell, btnPrimary, btnGhost, inputField, StatusPill, MetaChip, type ToneKey } from "../gantt/components/ledger";
import {
  getLowStock, listPurchaseOrders, draftRestocks, createPurchaseOrder, getOnOrderMap,
  type LowStockItem, type PurchaseOrder, type POStatus,
} from "../../lib/api/purchasing";
import { listStockLocations } from "../../lib/api/stock";
import { listSuppliers, type Supplier } from "../../lib/api/suppliers";
import { fmtQty } from "../../lib/format";
import TransferStockModal from "./TransferStockModal";

const PO_TONE: Record<POStatus, ToneKey> = {
  suggested: "amber", draft: "slate", sent: "sage", partial: "amber", received: "sage", cancelled: "red",
};
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString();

export default function RestockDashboard({ onGoToSettings }: { onGoToSettings?: () => void }) {
  const [low, setLow] = useState<LowStockItem[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [onOrder, setOnOrder] = useState<Map<string, string>>(new Map());
  const [factoryId, setFactoryId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [orderingId, setOrderingId] = useState<string | null>(null);
  const [orderQty, setOrderQty] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<ToastState>(null);
  const [transferOpen, setTransferOpen] = useState(false);

  async function refetch() {
    const [l, o, s, oo, locs] = await Promise.all([
      getLowStock().catch(() => []),
      listPurchaseOrders({ kind: "restock" }).catch(() => []),
      listSuppliers().catch(() => []),
      getOnOrderMap().catch(() => new Map<string, string>()),
      listStockLocations().catch(() => []),
    ]);
    setLow(l); setOrders(o); setSuppliers(s); setOnOrder(oo);
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

  if (loading) {
    return <div className={`flex items-center gap-2 px-5 py-8 text-sm text-[#A0A0A0] ${cardShell}`}><Loader2 className="h-4 w-4 animate-spin" /> Loading restock…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6B6B6B]">
          {low.length === 0 ? "All stock above minimum" : `${low.length} item${low.length === 1 ? "" : "s"} below minimum${stillNeeded.length !== low.length ? ` · ${low.length - stillNeeded.length} already on order` : ""}`}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {onGoToSettings && (
            <button type="button" onClick={onGoToSettings} className={btnGhost}><SlidersHorizontal className="h-4 w-4" /> Set minimums</button>
          )}
          <button type="button" onClick={() => setTransferOpen(true)} className={btnGhost}><ArrowLeftRight className="h-4 w-4" /> Transfer stock</button>
          <button type="button" onClick={() => void handleGenerate()} disabled={generating || stillNeeded.length === 0} className={btnPrimary}>
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Generate restock orders
          </button>
        </div>
      </div>

      {/* Low stock */}
      {low.length === 0 ? (
        <div className={`flex flex-col items-center gap-2 px-5 py-10 text-center ${cardShell}`}>
          <CheckCircle2 className="h-7 w-7 text-[#2F8F5C]" />
          <p className="text-sm font-medium text-[#1A1A1A]">Everything's above its minimum</p>
          <p className="text-sm text-[#6B6B6B]">
            When an item's company total drops below its minimum it shows here.
            {onGoToSettings && <> Set minimums per item in <button type="button" onClick={onGoToSettings} className="font-semibold text-[#2F8F5C] underline">Settings</button>.</>}
          </p>
        </div>
      ) : (
        <div className={`overflow-x-auto ${cardShell}`}>
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-[#E6E1D4] bg-[#FAF8F2]">
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Item</th>
                <th className="w-24 px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]">On hand</th>
                <th className="w-20 px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Min</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Wholesaler</th>
                <th className="w-24 px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Order qty</th>
                <th className="w-36 px-3 py-2.5" aria-label="Order" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EFEBE0]">
              {low.map((l) => {
                const poNumber = onOrder.get(l.materialId);
                return (
                  <tr key={l.materialId} className="hover:bg-[#FAF8F2]">
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center gap-1.5 font-medium text-[#1A1A1A]"><AlertTriangle className="h-3.5 w-3.5 text-[#C8841E]" />{l.name}</span>
                      {l.sku && <span className="ml-2 text-[11px] text-[#A0A0A0]">{l.sku}</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[#C44545]">{fmtQty(l.total)} <span className="text-[11px] text-[#A0A0A0]">{l.unit}</span></td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[#6B6B6B]">{fmtQty(l.minQty)}</td>
                    <td className="px-3 py-2.5 text-[#6B6B6B]">{supplierName(l.supplierId)}</td>
                    {poNumber ? (
                      <td className="px-3 py-2.5 text-right" colSpan={2}>
                        <MetaChip>On order · {poNumber}</MetaChip>
                      </td>
                    ) : (
                      <>
                        <td className="px-3 py-2.5 text-right">
                          <input
                            type="number" min={0} step="any" inputMode="decimal"
                            value={orderQty[l.materialId] ?? ""}
                            placeholder={fmtQty(l.needed)}
                            onChange={(e) => setOrderQty((p) => ({ ...p, [l.materialId]: e.target.value }))}
                            className={`${inputField} w-20 text-right tabular-nums`}
                            aria-label={`Order quantity for ${l.name}`}
                          />
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => void handleOrderNow(l)}
                            disabled={orderingId === l.materialId}
                            className="inline-flex items-center gap-1 rounded-md bg-[#2F8F5C] px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-[#287a4e] disabled:opacity-60"
                          >
                            {orderingId === l.materialId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShoppingCart className="h-3.5 w-3.5" />}
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
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6B6B6B]">Restock orders</p>
        {orders.length === 0 ? (
          <div className={`px-5 py-8 text-center text-sm text-[#A0A0A0] ${cardShell}`}>No restock orders yet. Use “Order now” on a low item, or “Generate restock orders” to draft everything at once.</div>
        ) : (
          <div className={`overflow-x-auto ${cardShell}`}>
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-[#E6E1D4] bg-[#FAF8F2]">
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Order</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Wholesaler</th>
                  <th className="w-20 px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Items</th>
                  <th className="w-28 px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Status</th>
                  <th className="w-28 px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EFEBE0]">
                {orders.map((o) => (
                  <tr key={o.id} className="hover:bg-[#FAF8F2]">
                    <td className="px-4 py-2.5 font-medium text-[#1A1A1A]">{o.number}</td>
                    <td className="px-4 py-2.5 text-[#3A3A3A]">{o.supplierName ?? "—"}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-[#6B6B6B]">{o.itemsCount ?? 0}</td>
                    <td className="px-4 py-2.5"><StatusPill tone={PO_TONE[o.status]} className="uppercase tracking-wide">{o.status}</StatusPill></td>
                    <td className="px-4 py-2.5 text-[#6B6B6B]">{fmtDate(o.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-[11px] text-[#A0A0A0]">Open the Orders tab to review, send, and receive these into the factory.</p>
      </div>

      <TransferStockModal open={transferOpen} onClose={() => setTransferOpen(false)} onDone={(m) => { setToast({ message: m, type: "success" }); void refetch(); }} />

      {toast && <Toaster message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

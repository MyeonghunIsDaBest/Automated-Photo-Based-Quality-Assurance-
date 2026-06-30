// ─────────────────────────────────────────────────────────────────────────────
// pages/stock/RestockDashboard.tsx — manager Phase 2: what's below minimum,
// a one-tap "Generate restock orders" (drafts POs to the preferred wholesaler +
// alerts the controller), the drafted restock POs, and a stock-transfer tool.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { Loader2, RefreshCw, ArrowLeftRight, AlertTriangle, X } from "lucide-react";

import { Toaster } from "../../components/ui/Toaster";
import MotionDrawer from "../../components/ui/MotionDrawer";
import { cardShell, btnPrimary, btnGhost, inputField, StatusPill, type ToneKey } from "../gantt/components/ledger";
import { getLowStock, listPurchaseOrders, draftRestocks, type LowStockItem, type PurchaseOrder, type POStatus } from "../../lib/api/purchasing";
import { listStockLocations, transferStock, type StockLocation } from "../../lib/api/stock";
import { listMaterials, type Material } from "../../lib/api/materials";
import { listSuppliers, type Supplier } from "../../lib/api/suppliers";

type ToastState = { message: string; type: "success" | "error" | "info" } | null;

const PO_TONE: Record<POStatus, ToneKey> = {
  suggested: "amber", draft: "slate", sent: "sage", partial: "amber", received: "sage", cancelled: "red",
};
const fmtQty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString();

export default function RestockDashboard() {
  const [low, setLow] = useState<LowStockItem[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const [transferOpen, setTransferOpen] = useState(false);

  async function refetch() {
    const [l, o, s] = await Promise.all([getLowStock().catch(() => []), listPurchaseOrders({ kind: "restock" }).catch(() => []), listSuppliers().catch(() => [])]);
    setLow(l); setOrders(o); setSuppliers(s);
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    refetch().catch(() => {}).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const supplierName = (id: string | null) => (id ? (suppliers.find((s) => s.id === id)?.name ?? "—") : "—");

  async function handleGenerate() {
    setGenerating(true);
    try {
      const res = await draftRestocks();
      await refetch();
      setToast({
        message: res.ordersCreated === 0 ? "Nothing to reorder — all stock above minimum (or already on order)." : `Drafted ${res.ordersCreated} restock order${res.ordersCreated === 1 ? "" : "s"} for ${res.itemsDrafted} item${res.itemsDrafted === 1 ? "" : "s"}.`,
        type: "success",
      });
    } catch (ex) {
      setToast({ message: ex instanceof Error ? ex.message : "Failed to generate restock", type: "error" });
    } finally {
      setGenerating(false);
    }
  }

  if (loading) {
    return <div className={`flex items-center gap-2 px-5 py-8 text-sm text-[#A0A0A0] ${cardShell}`}><Loader2 className="h-4 w-4 animate-spin" /> Loading restock…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6B6B6B]">
          {low.length === 0 ? "All stock above minimum" : `${low.length} item${low.length === 1 ? "" : "s"} below minimum`}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setTransferOpen(true)} className={btnGhost}><ArrowLeftRight className="h-4 w-4" /> Transfer stock</button>
          <button type="button" onClick={() => void handleGenerate()} disabled={generating || low.length === 0} className={btnPrimary}>
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Generate restock orders
          </button>
        </div>
      </div>

      {/* Low stock */}
      <div className={`overflow-x-auto ${cardShell}`}>
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-[#E6E1D4] bg-[#FAF8F2]">
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Item</th>
              <th className="w-24 px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]">On hand</th>
              <th className="w-20 px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Min</th>
              <th className="w-24 px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Order qty</th>
              <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Wholesaler</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EFEBE0]">
            {low.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-[#A0A0A0]">Everything's above its minimum. Set minimums in the Settings tab.</td></tr>
            )}
            {low.map((l) => (
              <tr key={l.materialId} className="hover:bg-[#FAF8F2]">
                <td className="px-4 py-2.5">
                  <span className="inline-flex items-center gap-1.5 font-medium text-[#1A1A1A]"><AlertTriangle className="h-3.5 w-3.5 text-[#C8841E]" />{l.name}</span>
                  {l.sku && <span className="ml-2 text-[11px] text-[#A0A0A0]">{l.sku}</span>}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-[#C44545]">{fmtQty(l.total)} <span className="text-[11px] text-[#A0A0A0]">{l.unit}</span></td>
                <td className="px-3 py-2.5 text-right tabular-nums text-[#6B6B6B]">{fmtQty(l.minQty)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-[#1A1A1A]">{fmtQty(l.needed)}</td>
                <td className="px-3 py-2.5 text-[#6B6B6B]">{supplierName(l.supplierId)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Drafted restock orders */}
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6B6B6B]">Restock orders</p>
        {orders.length === 0 ? (
          <div className={`px-5 py-8 text-center text-sm text-[#A0A0A0] ${cardShell}`}>No restock orders yet. Hit “Generate restock orders” when items drop below minimum.</div>
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
        <p className="mt-2 text-[11px] text-[#A0A0A0]">Sending orders to the wholesaler + receiving them into the factory comes in Phase 3.</p>
      </div>

      <TransferModal open={transferOpen} onClose={() => setTransferOpen(false)} onDone={(m) => { setToast({ message: m, type: "success" }); void refetch(); }} />

      {toast && <Toaster message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

// ─── Transfer stock between locations ───────────────────────────────────────────
function TransferModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (msg: string) => void }) {
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [items, setItems] = useState<Material[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [qty, setQty] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null); setFrom(""); setTo(""); setMaterialId(""); setQty("");
    void Promise.all([listStockLocations().catch(() => []), listMaterials().catch(() => [])]).then(([locs, mats]) => {
      setLocations(locs);
      setItems(mats.filter((m) => m.isStockItem));
    });
  }, [open]);

  const n = parseFloat(qty);
  const canSubmit = from && to && from !== to && materialId && Number.isFinite(n) && n > 0 && !saving;

  async function submit() {
    if (!canSubmit) { setError("Pick different from/to locations, an item and a quantity."); return; }
    setSaving(true);
    try {
      const mat = items.find((i) => i.id === materialId);
      await transferStock(from, to, materialId, n, mat?.costPrice ?? null);
      onDone(`Transferred ${fmtQty(n)} ${mat?.unit ?? ""} of ${mat?.name ?? "item"}.`);
      onClose();
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : "Transfer failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <MotionDrawer open={open} onClose={onClose} variant="modal" ariaLabel="Transfer stock" sizeClass="sm:w-[460px]">
      <div className="flex items-center justify-between border-b border-[#E6E1D4] px-5 py-4">
        <h2 className="text-lg font-semibold text-[#1A1A1A]">Transfer stock</h2>
        <button type="button" onClick={onClose} className="text-[#A0A0A0] hover:text-[#C44545]"><X className="h-4 w-4" /></button>
      </div>
      <div className="space-y-3 px-5 py-4">
        <div className="grid grid-cols-2 gap-3">
          <label><span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">From</span>
            <select value={from} onChange={(e) => setFrom(e.target.value)} className={inputField}>
              <option value="">Choose…</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </label>
          <label><span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">To</span>
            <select value={to} onChange={(e) => setTo(e.target.value)} className={inputField}>
              <option value="">Choose…</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </label>
        </div>
        <label className="block"><span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Item</span>
          <select value={materialId} onChange={(e) => setMaterialId(e.target.value)} className={inputField}>
            <option value="">Choose an item…</option>
            {items.map((m) => <option key={m.id} value={m.id}>{m.name}{m.sku ? ` (${m.sku})` : ""}</option>)}
          </select>
        </label>
        <label className="block max-w-[160px]"><span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Quantity</span>
          <input type="number" min={0} step="any" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} className={`${inputField} text-right tabular-nums`} />
        </label>
        {error && <p className="text-sm text-[#C44545]">{error}</p>}
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-[#E6E1D4] px-5 py-4">
        <button type="button" onClick={onClose} className={btnGhost}>Cancel</button>
        <button type="button" onClick={() => void submit()} disabled={!canSubmit} className={btnPrimary}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowLeftRight className="h-4 w-4" />} Transfer
        </button>
      </div>
    </MotionDrawer>
  );
}

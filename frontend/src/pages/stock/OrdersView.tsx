// ─────────────────────────────────────────────────────────────────────────────
// pages/stock/OrdersView.tsx — manager Phase 3: all purchase orders (restock +
// on-the-job), create a new order, and open one to send / receive / match its
// invoice (PurchaseOrderDrawer).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2, X } from "lucide-react";

import { Toaster } from "../../components/ui/Toaster";
import MotionDrawer from "../../components/ui/MotionDrawer";
import { cardShell, btnPrimary, btnGhost, inputField, StatusPill, type ToneKey } from "../gantt/components/ledger";
import {
  listPurchaseOrders, createPurchaseOrder, type PurchaseOrder, type POStatus, type POKind, type POLineInput,
} from "../../lib/api/purchasing";
import { listStockLocations, type StockLocation, type JobKind } from "../../lib/api/stock";
import { listSuppliers, type Supplier } from "../../lib/api/suppliers";
import { listMaterials, type Material } from "../../lib/api/materials";
import { listServiceJobs } from "../../lib/api/serviceJobs";
import { listSimproJobs } from "../../lib/api/simproJobs";
import PurchaseOrderDrawer from "./PurchaseOrderDrawer";

type ToastState = { message: string; type: "success" | "error" | "info" } | null;
const PO_TONE: Record<POStatus, ToneKey> = { suggested: "amber", draft: "slate", sent: "sage", partial: "amber", received: "sage", cancelled: "red" };
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString();

let rowSeq = 1;
interface LineDraft { key: number; materialId: string; qty: string }

export default function OrdersView() {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPoId, setSelectedPoId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  async function refetch() {
    const o = await listPurchaseOrders().catch(() => []);
    setOrders(o);
  }
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    refetch().catch(() => {}).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return <div className={`flex items-center gap-2 px-5 py-8 text-sm text-[#A0A0A0] ${cardShell}`}><Loader2 className="h-4 w-4 animate-spin" /> Loading orders…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6B6B6B]">Purchase orders</p>
        <button type="button" onClick={() => setNewOpen(true)} className="inline-flex items-center gap-1.5 rounded-md bg-[#2F8F5C] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#287a4e]"><Plus className="h-3.5 w-3.5" /> New order</button>
      </div>

      <div className={`overflow-x-auto ${cardShell}`}>
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-[#E6E1D4] bg-[#FAF8F2]">
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Order</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Kind</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Wholesaler</th>
              <th className="w-16 px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Items</th>
              <th className="w-28 px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Status</th>
              <th className="w-28 px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EFEBE0]">
            {orders.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-[#A0A0A0]">No purchase orders yet. Auto-drafted restocks appear here, or create one with “New order”.</td></tr>
            )}
            {orders.map((o) => (
              <tr key={o.id} onClick={() => setSelectedPoId(o.id)} className="cursor-pointer hover:bg-[#FAF8F2]">
                <td className="px-4 py-2.5 font-medium text-[#2F8F5C]">{o.number}</td>
                <td className="px-4 py-2.5 text-[#6B6B6B] capitalize">{o.kind}</td>
                <td className="px-4 py-2.5 text-[#3A3A3A]">{o.supplierName ?? "—"}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-[#6B6B6B]">{o.itemsCount ?? 0}</td>
                <td className="px-4 py-2.5"><StatusPill tone={PO_TONE[o.status]} className="uppercase tracking-wide">{o.status}</StatusPill></td>
                <td className="px-4 py-2.5 text-[#6B6B6B]">{fmtDate(o.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <PurchaseOrderDrawer poId={selectedPoId} onClose={() => setSelectedPoId(null)} onChanged={() => void refetch()} />
      <NewOrderModal open={newOpen} onClose={() => setNewOpen(false)} onDone={(m) => { setToast({ message: m, type: "success" }); void refetch(); }} />
      {toast && <Toaster message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

// ─── New order (restock or on-the-job) ──────────────────────────────────────────
function NewOrderModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (msg: string) => void }) {
  const [kind, setKind] = useState<POKind>("restock");
  const [supplierId, setSupplierId] = useState("");
  const [jobValue, setJobValue] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([{ key: rowSeq++, materialId: "", qty: "" }]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [factory, setFactory] = useState<StockLocation | null>(null);
  const [jobs, setJobs] = useState<{ value: string; kind: JobKind; id: string; label: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null); setKind("restock"); setSupplierId(""); setJobValue(""); setLines([{ key: rowSeq++, materialId: "", qty: "" }]);
    void Promise.all([
      listSuppliers().catch(() => []),
      listMaterials().catch(() => []),
      listStockLocations().catch(() => []),
      listServiceJobs().catch(() => []),
      listSimproJobs({ limit: 200 }).catch(() => []),
    ]).then(([sups, mats, locs, svc, sim]) => {
      setSuppliers(sups);
      setMaterials(mats.filter((m) => m.isStockItem));
      setFactory(locs.find((l) => l.type === "factory") ?? null);
      setJobs([
        ...svc.map((j) => ({ value: `service:${j.id}`, kind: "service" as JobKind, id: j.id, label: j.title })),
        ...sim.map((j) => ({ value: `simpro:${j.id}`, kind: "simpro" as JobKind, id: j.id, label: `${j.externalRef}${j.description ? ` — ${j.description}` : ""}` })),
      ]);
    });
  }, [open]);

  function setLine(key: number, patch: Partial<LineDraft>) { setLines((p) => p.map((l) => (l.key === key ? { ...l, ...patch } : l))); }
  const job = jobs.find((j) => j.value === jobValue) ?? null;
  const validLines: POLineInput[] = lines
    .map((l) => ({ l, n: parseFloat(l.qty) }))
    .filter((x) => x.l.materialId && Number.isFinite(x.n) && x.n > 0)
    .map((x) => {
      const m = materials.find((mm) => mm.id === x.l.materialId);
      return { materialId: x.l.materialId, description: m?.name ?? null, qtyOrdered: x.n, unitCost: m?.costPrice ?? null };
    });
  const canSubmit = validLines.length > 0 && (kind === "restock" || !!job) && !saving;

  async function submit() {
    if (kind === "job" && !job) { setError("Pick the job this order is for."); return; }
    if (validLines.length === 0) { setError("Add at least one item with a quantity."); return; }
    setSaving(true);
    try {
      const po = await createPurchaseOrder({
        kind,
        supplierId: supplierId || null,
        destinationLocationId: kind === "restock" ? (factory?.id ?? null) : null,
        serviceJobId: kind === "job" && job?.kind === "service" ? job.id : null,
        simproJobId: kind === "job" && job?.kind === "simpro" ? job.id : null,
        status: "draft",
        items: validLines,
      });
      onDone(`Created ${po.number}.`);
      onClose();
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : "Failed to create order.");
    } finally { setSaving(false); }
  }

  return (
    <MotionDrawer open={open} onClose={onClose} ariaLabel="New purchase order" sizeClass="sm:w-[520px]">
      <div className="flex items-center justify-between border-b border-[#E6E1D4] px-5 py-4">
        <h2 className="text-lg font-semibold text-[#1A1A1A]">New purchase order</h2>
        <button type="button" onClick={onClose} className="text-[#A0A0A0] hover:text-[#C44545]"><X className="h-4 w-4" /></button>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
        <div className="flex gap-1 rounded-full border border-[#E6E1D4] bg-[#FAF8F2] p-0.5 text-sm">
          {(["restock", "job"] as POKind[]).map((k) => (
            <button key={k} type="button" onClick={() => setKind(k)} className={`flex-1 rounded-full px-3 py-1.5 font-medium capitalize transition-colors ${kind === k ? "bg-[#1A1A1A] text-white" : "text-[#6B6B6B] hover:text-[#1A1A1A]"}`}>{k === "restock" ? "Restock (to factory)" : "On the job"}</button>
          ))}
        </div>

        <label className="block"><span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Wholesaler</span>
          <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={inputField}>
            <option value="">—</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>

        {kind === "job" && (
          <label className="block"><span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Job *</span>
            <select value={jobValue} onChange={(e) => setJobValue(e.target.value)} className={inputField}>
              <option value="">Select the job…</option>
              {jobs.map((j) => <option key={j.value} value={j.value}>{j.label}</option>)}
            </select>
          </label>
        )}

        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Items</p>
          <div className="space-y-2">
            {lines.map((l) => (
              <div key={l.key} className="flex items-center gap-2">
                <select value={l.materialId} onChange={(e) => setLine(l.key, { materialId: e.target.value })} className={`${inputField} flex-1`}>
                  <option value="">Choose an item…</option>
                  {materials.map((m) => <option key={m.id} value={m.id}>{m.name}{m.sku ? ` (${m.sku})` : ""}</option>)}
                </select>
                <input type="number" min={0} step="any" inputMode="decimal" value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value })} placeholder="Qty" className={`${inputField} w-24 text-right tabular-nums`} />
                <button type="button" onClick={() => setLines((p) => (p.length > 1 ? p.filter((x) => x.key !== l.key) : p))} disabled={lines.length === 1} className="rounded p-1.5 text-[#A0A0A0] hover:text-[#C44545] disabled:opacity-40"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
            <button type="button" onClick={() => setLines((p) => [...p, { key: rowSeq++, materialId: "", qty: "" }])} className="inline-flex items-center gap-1 rounded-md border border-[#E6E1D4] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#2F8F5C] hover:bg-[#FAF8F2]"><Plus className="h-3.5 w-3.5" /> Add item</button>
          </div>
        </div>
        {error && <p className="text-sm text-[#C44545]">{error}</p>}
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-[#E6E1D4] px-5 py-4">
        <button type="button" onClick={onClose} className={btnGhost}>Cancel</button>
        <button type="button" onClick={() => void submit()} disabled={!canSubmit} className={btnPrimary}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Create order</button>
      </div>
    </MotionDrawer>
  );
}

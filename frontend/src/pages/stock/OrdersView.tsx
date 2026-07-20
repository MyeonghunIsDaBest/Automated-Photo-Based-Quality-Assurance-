// ─────────────────────────────────────────────────────────────────────────────
// pages/stock/OrdersView.tsx — manager Phase 3: all purchase orders (restock +
// on-the-job), create a new order, and open one to send / receive / match its
// invoice (PurchaseOrderDrawer).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Trash2, X, Search } from "lucide-react";

import { Toaster, type ToastState } from "../../components/ui/Toaster";
import MotionDrawer from "../../components/ui/MotionDrawer";
import ItemCombobox from "../../components/ui/ItemCombobox";
import NewSupplierMiniModal from "./NewSupplierMiniModal";
import { cn } from "../../lib/cn";
import { cardShell, btnPrimary, btnGhost, inputField, FRAUNCES, StatusPill, TONE, type ToneKey } from "../gantt/components/ledger";
import {
  listPurchaseOrders, createPurchaseOrder, type PurchaseOrder, type POStatus, type POKind, type POLineInput,
} from "../../lib/api/purchasing";
import { listStockLocations, type StockLocation, type JobKind } from "../../lib/api/stock";
import { listSuppliers, type Supplier } from "../../lib/api/suppliers";
import { listMaterials, type Material } from "../../lib/api/materials";
import { listServiceJobs } from "../../lib/api/serviceJobs";
import { listSimproJobs } from "../../lib/api/simproJobs";
import { fmtMoney } from "../../lib/format";
import PurchaseOrderDrawer from "./PurchaseOrderDrawer";

const PO_TONE: Record<POStatus, ToneKey> = { suggested: "amber", draft: "slate", sent: "sage", partial: "amber", received: "sage", cancelled: "red" };
const PO_STATUSES: POStatus[] = ["suggested", "draft", "sent", "partial", "received", "cancelled"];
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString();

let rowSeq = 1;
interface LineDraft { key: number; materialId: string; qty: string; cost: string }

export default function OrdersView() {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPoId, setSelectedPoId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const [statusFilter, setStatusFilter] = useState<POStatus | null>(null);
  const [kindFilter, setKindFilter] = useState<POKind | null>(null);
  const [search, setSearch] = useState("");

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

  const statusCounts = useMemo(() => {
    const c = Object.fromEntries(PO_STATUSES.map((s) => [s, 0])) as Record<POStatus, number>;
    for (const o of orders) c[o.status] += 1;
    return c;
  }, [orders]);

  const term = search.trim().toLowerCase();
  const visible = useMemo(() => orders.filter((o) => {
    if (statusFilter && o.status !== statusFilter) return false;
    if (kindFilter && o.kind !== kindFilter) return false;
    if (term && !(o.number.toLowerCase().includes(term) || (o.supplierName ?? "").toLowerCase().includes(term))) return false;
    return true;
  }), [orders, statusFilter, kindFilter, term]);

  if (loading) {
    return <div className={cn(cardShell, "flex items-center gap-2 rounded-[16px] px-5 py-8 text-sm text-[#A0A0A0]")}><Loader2 className="h-4 w-4 animate-spin" /> Loading orders…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#6B6B6B]">Purchase orders</p>
        <button type="button" onClick={() => setNewOpen(true)} className={btnPrimary}><Plus className="h-4 w-4" /> New purchase order</button>
      </div>

      {/* Filters + search */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex flex-wrap items-center gap-1">
          <button type="button" onClick={() => setStatusFilter(null)}
            className={`flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${statusFilter === null ? "border-[#1A1A1A] bg-[#1A1A1A] text-white shadow-sm" : "border-[#E6E1D4] bg-white text-[#3A3A3A] hover:border-[#D8D2C4] hover:bg-[#FAF8F2]"}`}>
            All
            <span className={`rounded-full px-1.5 text-[11px] font-semibold tabular-nums ${statusFilter === null ? "bg-white/20 text-white" : "bg-[#F0EDE4] text-[#6B6B6B]"}`}>{orders.length}</span>
          </button>
          {PO_STATUSES.filter((s) => statusCounts[s] > 0).map((s) => {
            const active = statusFilter === s;
            return (
              <button key={s} type="button" onClick={() => setStatusFilter(active ? null : s)}
                className={`flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold capitalize transition-colors ${active ? "border-[#1A1A1A] bg-[#1A1A1A] text-white shadow-sm" : "border-[#E6E1D4] bg-white text-[#3A3A3A] hover:border-[#D8D2C4] hover:bg-[#FAF8F2]"}`}>
                {!active && <span className="h-1.5 w-1.5 rounded-full" style={{ background: TONE[PO_TONE[s]].dot }} />}
                {s}
                <span className={`rounded-full px-1.5 text-[11px] font-semibold tabular-nums ${active ? "bg-white/20 text-white" : "bg-[#F0EDE4] text-[#6B6B6B]"}`}>{statusCounts[s]}</span>
              </button>
            );
          })}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex gap-1 rounded-full border border-[#E6E1D4] bg-[#FAF8F2] p-0.5 text-xs">
            {([null, "restock", "job"] as (POKind | null)[]).map((k) => (
              <button key={k ?? "all"} type="button" onClick={() => setKindFilter(k)}
                className={`rounded-full px-2.5 py-1 font-medium capitalize transition-colors ${kindFilter === k ? "bg-[#1A1A1A] text-white" : "text-[#6B6B6B] hover:text-[#1A1A1A]"}`}>
                {k ?? "All kinds"}
              </button>
            ))}
          </div>
          <div className="relative w-56">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A0A0A0]" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search order or wholesaler…"
              className="w-full rounded-full border border-[#E6E1D4] bg-white py-2 pl-10 pr-3 text-[13.5px] placeholder:text-[#A0A0A0] focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]" />
          </div>
        </div>
      </div>

      <div className={cn(cardShell, "rounded-[16px] overflow-x-auto")}>
        <table className="min-w-full text-[13px]">
          <thead>
            <tr className="border-b border-[#E6E1D4] bg-[#FAF8F2]">
              <th className="px-5 py-2.5 text-left text-[10.5px] font-bold uppercase tracking-[0.07em] text-[#6B6B6B]">Order</th>
              <th className="px-4 py-2.5 text-left text-[10.5px] font-bold uppercase tracking-[0.07em] text-[#6B6B6B]">Kind</th>
              <th className="px-4 py-2.5 text-left text-[10.5px] font-bold uppercase tracking-[0.07em] text-[#6B6B6B]">Wholesaler</th>
              <th className="w-16 px-4 py-2.5 text-right text-[10.5px] font-bold uppercase tracking-[0.07em] text-[#6B6B6B]">Items</th>
              <th className="w-28 px-4 py-2.5 text-right text-[10.5px] font-bold uppercase tracking-[0.07em] text-[#6B6B6B]">Total</th>
              <th className="w-28 px-4 py-2.5 text-left text-[10.5px] font-bold uppercase tracking-[0.07em] text-[#6B6B6B]">Status</th>
              <th className="w-32 px-4 py-2.5 text-left text-[10.5px] font-bold uppercase tracking-[0.07em] text-[#6B6B6B]">Expected / received</th>
              <th className="w-28 px-4 py-2.5 text-left text-[10.5px] font-bold uppercase tracking-[0.07em] text-[#6B6B6B]">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E6E1D4]">
            {visible.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-[#A0A0A0]">
                {orders.length === 0 ? "No purchase orders yet. Auto-drafted restocks appear here, or create one with “New order”." : "Nothing matches this filter/search."}
              </td></tr>
            )}
            {visible.map((o) => (
              <tr key={o.id} onClick={() => setSelectedPoId(o.id)} className="cursor-pointer transition-colors hover:bg-[#FAF8F2]">
                <td className="px-5 py-3 font-semibold text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>{o.number}</td>
                <td className="px-4 py-3 capitalize text-[#6B6B6B]">{o.kind}</td>
                <td className="max-w-[220px] truncate px-4 py-3 text-[#3A3A3A]">{o.supplierName ?? "—"}</td>
                <td className="px-4 py-3 text-right tabular-nums text-[#6B6B6B]">{o.itemsCount ?? 0}</td>
                <td className="px-4 py-3 text-right tabular-nums text-[#1A1A1A]">{o.orderedTotal != null ? fmtMoney(o.orderedTotal) : "—"}</td>
                <td className="px-4 py-3"><StatusPill tone={PO_TONE[o.status]} className="uppercase tracking-wide">{o.status}</StatusPill></td>
                <td className="px-4 py-3 text-[#6B6B6B]">
                  {o.receivedAt ? `✓ ${fmtDate(o.receivedAt)}` : o.expectedDate ? fmtDate(o.expectedDate) : "—"}
                </td>
                <td className="px-4 py-3 text-[12px] text-[#A0A0A0]">{fmtDate(o.createdAt)}</td>
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

// ─── New order (restock or on-the-job) — centered pop-out per the mock ─────────
function NewOrderModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (msg: string) => void }) {
  const [kind, setKind] = useState<POKind>("restock");
  const [supplierId, setSupplierId] = useState("");
  const [jobValue, setJobValue] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([{ key: rowSeq++, materialId: "", qty: "", cost: "" }]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [factory, setFactory] = useState<StockLocation | null>(null);
  const [jobs, setJobs] = useState<{ value: string; kind: JobKind; id: string; label: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [miniOpen, setMiniOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null); setKind("restock"); setSupplierId(""); setJobValue(""); setExpectedDate("");
    setLines([{ key: rowSeq++, materialId: "", qty: "", cost: "" }]);
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

  const materialOptions = materials.map((m) => ({ id: m.id, label: m.name, sublabel: m.sku }));
  const jobOptions = jobs.map((j) => ({ id: j.value, label: j.label }));
  const supplierOptions = suppliers.map((s) => ({ id: s.id, label: s.name }));

  // A picked line's cost defaults from the catalogue but stays editable — the
  // old behavior (silent m.costPrice) made visible.
  const validLines: POLineInput[] = lines
    .map((l) => ({ l, n: parseFloat(l.qty), c: parseFloat(l.cost) }))
    .filter((x) => x.l.materialId && Number.isFinite(x.n) && x.n > 0)
    .map((x) => {
      const m = materials.find((mm) => mm.id === x.l.materialId);
      const unitCost = Number.isFinite(x.c) && x.c >= 0 ? x.c : (m?.costPrice ?? null);
      return { materialId: x.l.materialId, description: m?.name ?? null, qtyOrdered: x.n, unitCost };
    });
  const orderTotal = validLines.reduce((sum, l) => sum + (l.unitCost != null ? l.qtyOrdered * l.unitCost : 0), 0);
  const uncostedCount = validLines.filter((l) => l.unitCost == null).length;
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
        expectedDate: expectedDate || null,
        items: validLines,
      });
      onDone(`Created ${po.number}.`);
      onClose();
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : "Failed to create order.");
    } finally { setSaving(false); }
  }

  return (
    <MotionDrawer
      open={open}
      // Esc-guard: while the mini wholesaler modal is stacked on top, both
      // document-level Esc handlers fire — the parent must ignore its own.
      onClose={() => { if (!miniOpen) onClose(); }}
      variant="modal"
      ariaLabel="New purchase order"
      sizeClass="max-w-[680px]"
    >
      <div className="flex items-center justify-between border-b border-[#E6E1D4] px-5 py-4">
        <h2 className="text-[19px] font-semibold text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>New purchase order</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="grid h-[30px] w-[30px] place-items-center rounded-full text-[#A0A0A0] transition-colors hover:bg-[#FAF8F2] hover:text-[#1A1A1A]"><X className="h-4 w-4" /></button>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
        <div className="flex gap-0.5 rounded-full bg-[#FAF8F2] p-[3px] text-sm">
          {(["restock", "job"] as POKind[]).map((k) => (
            <button key={k} type="button" onClick={() => setKind(k)} className={`flex-1 whitespace-nowrap rounded-full px-4 py-2 text-center text-[13.5px] font-semibold capitalize transition-colors ${kind === k ? "bg-[#1A1A1A] text-white" : "text-[#6B6B6B] hover:text-[#1A1A1A]"}`}>{k === "restock" ? "Restock (to factory)" : "On the job"}</button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block"><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.08em] text-[#A0A0A0]">Wholesaler</span>
            <ItemCombobox
              options={supplierOptions}
              value={supplierId}
              onChange={setSupplierId}
              placeholder="Type to find a wholesaler…"
              ariaLabel="Wholesaler"
              emptyText={suppliers.length === 0 ? "No wholesalers yet." : "No matches."}
              footer={
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setMiniOpen(true)}
                  className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-[12.5px] font-semibold text-[#2F8F5C] transition-colors hover:bg-[#E5F2EA]"
                >
                  <Plus className="h-3.5 w-3.5" /> New wholesaler
                </button>
              }
            />
          </label>
          <label className="block"><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.08em] text-[#A0A0A0]">Needed by</span>
            <input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} className={inputField} />
          </label>
        </div>
        {!supplierId && (
          <p className="-mt-2 text-[11.5px] text-[#A0A0A0]">You can draft without a wholesaler — “Email order” needs one before sending.</p>
        )}

        {kind === "job" && (
          <label className="block"><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.08em] text-[#A0A0A0]">Job *</span>
            <ItemCombobox
              options={jobOptions}
              value={jobValue}
              onChange={setJobValue}
              placeholder="Type to find the job…"
              ariaLabel="Job"
              footnote="Searches the loaded jobs — service jobs plus the latest 200 Sim-Pro jobs."
            />
          </label>
        )}

        <div>
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#A0A0A0]">Items</p>
            <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#A0A0A0]">Qty · Unit cost</p>
          </div>
          <div className="space-y-2">
            {lines.map((l) => (
              <div key={l.key} className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <ItemCombobox
                    options={materialOptions}
                    value={l.materialId}
                    onChange={(id) => {
                      const m = materials.find((mm) => mm.id === id);
                      setLine(l.key, { materialId: id, cost: m?.costPrice != null ? String(m.costPrice) : "" });
                    }}
                    placeholder="Type to find an item…"
                    ariaLabel="Item"
                  />
                </div>
                <input type="number" min={0} step="any" inputMode="decimal" value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value })} placeholder="Qty" aria-label="Quantity" className={cn(inputField, "w-[74px] text-center tabular-nums")} />
                <input type="number" min={0} step="any" inputMode="decimal" value={l.cost} onChange={(e) => setLine(l.key, { cost: e.target.value })} placeholder="$/unit" aria-label="Unit cost" className={cn(inputField, "w-[92px] text-right tabular-nums")} />
                <button type="button" onClick={() => setLines((p) => (p.length > 1 ? p.filter((x) => x.key !== l.key) : p))} disabled={lines.length === 1} aria-label="Remove item line" className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] border border-[#E6E1D4] bg-white text-[#A0A0A0] transition-colors hover:border-[#C44545] hover:text-[#C44545] disabled:opacity-40"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
            <button type="button" onClick={() => setLines((p) => [...p, { key: rowSeq++, materialId: "", qty: "", cost: "" }])} className="inline-flex items-center gap-1.5 rounded-full border border-[#E6E1D4] bg-white px-3.5 py-2 text-[12.5px] font-semibold text-[#2F8F5C] transition-colors hover:bg-[#E5F2EA]"><Plus className="h-3.5 w-3.5" /> Add item</button>
          </div>
        </div>
        {error && <p className="text-sm text-[#C44545]">{error}</p>}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E6E1D4] px-5 py-4">
        <p className="text-[13px] text-[#6B6B6B]">
          Order total{" "}
          <span className="text-[15px] font-semibold tabular-nums text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>{fmtMoney(orderTotal)}</span>
          {uncostedCount > 0 && <span className="ml-1.5 text-[11px] text-[#A0A0A0]">(+{uncostedCount} uncosted line{uncostedCount === 1 ? "" : "s"})</span>}
        </p>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onClose} className={btnGhost}>Cancel</button>
          <button type="button" onClick={() => void submit()} disabled={!canSubmit} className={btnPrimary}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Create order</button>
        </div>
      </div>

      <NewSupplierMiniModal
        open={miniOpen}
        onClose={() => setMiniOpen(false)}
        onCreated={(s) => { setSuppliers((prev) => [...prev, s].sort((a, b) => a.name.localeCompare(b.name))); setSupplierId(s.id); }}
      />
    </MotionDrawer>
  );
}

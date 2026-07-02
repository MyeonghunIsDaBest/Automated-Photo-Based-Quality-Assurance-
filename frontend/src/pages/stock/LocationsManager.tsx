// ─────────────────────────────────────────────────────────────────────────────
// pages/stock/LocationsManager.tsx — manager view: the factory + vans (with item
// count / units / value / last activity), add a van + assign a driver, and drill
// into a location to search its stock, adjust quantities, run a stock-take, view
// its movement history, rename/deactivate it, and open any item's detail. Live.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import { Plus, Loader2, ChevronRight, Truck, Factory, ClipboardCheck, Search, X, Pencil, Check, Archive, ArrowLeftRight, ArchiveRestore } from "lucide-react";

import { Toaster } from "../../components/ui/Toaster";
import { cardShell, btnPrimary, btnGhost, inputField, StatusPill, type ToneKey } from "../gantt/components/ledger";
import {
  listStockLocations, createLocation, updateLocation, listStockLevels, getCompanyTotals,
  recordStocktake, adjustStock, listMovements, subscribeToStockLevels,
  type StockLocation, type StockLevel, type MovementView, type MovementReason,
} from "../../lib/api/stock";
import { listProfilesByRole } from "../../lib/api/profiles";
import { listMaterials, type Material } from "../../lib/api/materials";
import StockItemDrawer from "./StockItemDrawer";
import TransferStockModal from "./TransferStockModal";
import type { Profile, SecurityGroup } from "../../types";

const INTERNAL_GROUPS: SecurityGroup[] = ["company_admin", "construction_mgr", "project_manager", "worker", "dev"];
const fullName = (p: Profile) => `${p.firstName} ${p.lastName}`.trim() || p.email;
const fmtQty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
const fmtMoney = (n: number) => "$" + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString();
const REASON: Record<MovementReason, { label: string; tone: ToneKey }> = {
  usage: { label: "Used", tone: "orange" }, receipt: { label: "Received", tone: "sage" },
  transfer_out: { label: "Transfer out", tone: "slate" }, transfer_in: { label: "Transfer in", tone: "slate" },
  adjustment: { label: "Adjustment", tone: "amber" }, stocktake: { label: "Stock-take", tone: "ink" },
};

type ToastState = { message: string; type: "success" | "error" | "info" } | null;
interface LocSummary { items: number; units: number; value: number; lastActivity: string | null }

export default function LocationsManager() {
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [staff, setStaff] = useState<Profile[]>([]);
  const [summary, setSummary] = useState<Map<string, LocSummary>>(new Map());
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<ToastState>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDriver, setNewDriver] = useState("");
  const [savingAdd, setSavingAdd] = useState(false);

  const staffName = useCallback((id: string | null) => (id ? (staff.find((s) => s.id === id) ? fullName(staff.find((s) => s.id === id)!) : "—") : "—"), [staff]);

  const loadAll = useCallback(async () => {
    const [locs, totals, moves] = await Promise.all([
      listStockLocations(showInactive).catch(() => []),
      getCompanyTotals().catch(() => []),
      listMovements({ limit: 400 }).catch(() => []),
    ]);
    setLocations(locs);
    const sum = new Map<string, LocSummary>();
    for (const t of totals) {
      for (const b of t.byLocation) {
        if (b.qty === 0) continue;
        const e = sum.get(b.locationId) ?? { items: 0, units: 0, value: 0, lastActivity: null };
        e.items += 1;
        e.units += b.qty;
        e.value += t.costPrice != null ? b.qty * t.costPrice : 0;
        sum.set(b.locationId, e);
      }
    }
    for (const m of moves) {
      const e = sum.get(m.locationId) ?? { items: 0, units: 0, value: 0, lastActivity: null };
      if (!e.lastActivity || m.createdAt > e.lastActivity) e.lastActivity = m.createdAt;
      sum.set(m.locationId, e);
    }
    setSummary(sum);
  }, [showInactive]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([loadAll(), listProfilesByRole(INTERNAL_GROUPS).then((p) => { if (!cancelled) setStaff(p); }).catch(() => {})])
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    const unsub = subscribeToStockLevels(null, () => void loadAll());
    return () => { cancelled = true; unsub(); };
  }, [loadAll]);

  async function handleAddVan() {
    if (!newName.trim()) return;
    setSavingAdd(true);
    try {
      await createLocation({ name: newName.trim(), type: "van", assignedWorkerId: newDriver || null });
      setNewName(""); setNewDriver(""); setShowAdd(false);
      await loadAll();
      setToast({ message: "Van added.", type: "success" });
    } catch (ex) {
      setToast({ message: ex instanceof Error ? ex.message : "Failed to add van", type: "error" });
    } finally {
      setSavingAdd(false);
    }
  }

  async function handleReassign(loc: StockLocation, workerId: string) {
    try {
      await updateLocation(loc.id, { assignedWorkerId: workerId || null });
      setLocations((prev) => prev.map((l) => (l.id === loc.id ? { ...l, assignedWorkerId: workerId || null } : l)));
      setToast({ message: "Driver updated.", type: "success" });
    } catch (ex) {
      setToast({ message: ex instanceof Error ? ex.message : "Failed to update driver", type: "error" });
    }
  }

  const selected = locations.find((l) => l.id === selectedId) ?? null;

  if (loading) {
    return <div className={`flex items-center gap-2 px-5 py-8 text-sm text-[#A0A0A0] ${cardShell}`}><Loader2 className="h-4 w-4 animate-spin" /> Loading locations…</div>;
  }

  if (selected) {
    return (
      <LocationDetail
        location={selected}
        staff={staff}
        staffName={staffName}
        onBack={() => setSelectedId(null)}
        onReassign={handleReassign}
        onChanged={() => void loadAll()}
        onToast={setToast}
        toast={toast}
        clearToast={() => setToast(null)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6B6B6B]">Factory + vans</p>
        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-[#6B6B6B]">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="h-3.5 w-3.5 accent-[#2F8F5C]" />
            Show inactive
          </label>
          {!showAdd && (
            <button type="button" onClick={() => setShowAdd(true)} className="inline-flex items-center gap-1.5 rounded-md bg-[#2F8F5C] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#287a4e]">
              <Plus className="h-3.5 w-3.5" /> Add van
            </button>
          )}
        </div>
      </div>

      {showAdd && (
        <div className={`px-4 py-4 ${cardShell}`}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label>
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Van name</span>
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Van 1 — Rene" className={inputField} />
            </label>
            <label>
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Driver</span>
              <select value={newDriver} onChange={(e) => setNewDriver(e.target.value)} className={inputField}>
                <option value="">Unassigned</option>
                {staff.map((s) => <option key={s.id} value={s.id}>{fullName(s)}</option>)}
              </select>
            </label>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={() => { setShowAdd(false); setNewName(""); setNewDriver(""); }} className={btnGhost}>Cancel</button>
            <button type="button" onClick={() => void handleAddVan()} disabled={savingAdd || !newName.trim()} className={btnPrimary}>
              {savingAdd ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add van
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {locations.map((loc) => {
          const s = summary.get(loc.id);
          const isFactory = loc.type === "factory";
          return (
            <button
              key={loc.id}
              type="button"
              onClick={() => setSelectedId(loc.id)}
              className="flex flex-col rounded-[12px] border border-[#E6E1D4] bg-white p-4 text-left shadow-[0_1px_2px_rgba(20,20,20,0.04)] hover:border-[#D8D2C4]"
            >
              <div className="mb-2 flex items-center gap-2">
                {isFactory ? <Factory className="h-4 w-4 text-[#2F8F5C]" /> : <Truck className="h-4 w-4 text-[#2F8F5C]" />}
                <span className="text-sm font-semibold text-[#1A1A1A]">{loc.name}</span>
                {!loc.isActive && <StatusPill tone="slate" className="uppercase tracking-wide">Inactive</StatusPill>}
                <ChevronRight className="ml-auto h-4 w-4 text-[#A0A0A0]" />
              </div>
              {!isFactory && <p className="mb-1 text-xs text-[#6B6B6B]">Driver: {staffName(loc.assignedWorkerId)}</p>}
              <p className="text-xs text-[#3A3A3A]">
                {s ? `${s.items} item${s.items === 1 ? "" : "s"} · ${fmtQty(s.units)} units${s.value ? ` · ${fmtMoney(s.value)}` : ""}` : "Empty"}
              </p>
              <p className="mt-auto pt-1 text-[11px] text-[#A0A0A0]">{s?.lastActivity ? `Last activity ${fmtDate(s.lastActivity)}` : "No activity yet"}</p>
            </button>
          );
        })}
      </div>

      {toast && <Toaster message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

// ─── Location detail ────────────────────────────────────────────────────────────
function LocationDetail({
  location, staff, staffName, onBack, onReassign, onChanged, onToast, toast, clearToast,
}: {
  location: StockLocation;
  staff: Profile[];
  staffName: (id: string | null) => string;
  onBack: () => void;
  onReassign: (loc: StockLocation, workerId: string) => void;
  onChanged: () => void;
  onToast: (t: ToastState) => void;
  toast: ToastState;
  clearToast: () => void;
}) {
  const [levels, setLevels] = useState<StockLevel[]>([]);
  const [moves, setMoves] = useState<MovementView[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedMaterial, setSelectedMaterial] = useState<string | null>(null);

  const [takeMode, setTakeMode] = useState(false);
  const [stockItems, setStockItems] = useState<Material[]>([]);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [savingTake, setSavingTake] = useState(false);

  // inline quick-adjust
  const [adjustFor, setAdjustFor] = useState<string | null>(null);
  const [adjustVal, setAdjustVal] = useState("");

  // transfer-from-here
  const [transferOpen, setTransferOpen] = useState(false);

  // rename / deactivate
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(location.name);
  const [editRego, setEditRego] = useState(location.rego ?? "");
  const [savingEdit, setSavingEdit] = useState(false);

  const refetch = useCallback(async () => {
    const [rows, mv] = await Promise.all([
      listStockLevels(location.id).catch(() => []),
      listMovements({ locationId: location.id, limit: 40 }).catch(() => []),
    ]);
    setLevels(rows);
    setMoves(mv);
  }, [location.id]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setEditName(location.name); setEditRego(location.rego ?? "");
    refetch().finally(() => { if (!cancelled) setLoading(false); });
    const unsub = subscribeToStockLevels(location.id, () => void refetch());
    return () => { cancelled = true; unsub(); };
  }, [refetch, location.id, location.name, location.rego]);

  async function startStocktake() {
    const mats = (await listMaterials().catch(() => [])).filter((m) => m.isStockItem);
    setStockItems(mats);
    const levelById = new Map(levels.map((l) => [l.materialId, l.qty]));
    const seed: Record<string, string> = {};
    for (const m of mats) seed[m.id] = String(levelById.get(m.id) ?? 0);
    setCounts(seed);
    setTakeMode(true);
  }
  async function saveStocktake() {
    setSavingTake(true);
    try {
      const entries = Object.entries(counts).map(([materialId, v]) => ({ materialId, countedQty: parseFloat(v) })).filter((c) => Number.isFinite(c.countedQty));
      await recordStocktake(location.id, entries);
      setTakeMode(false);
      await refetch();
      onToast({ message: "Stock-take saved.", type: "success" });
    } catch (ex) {
      onToast({ message: ex instanceof Error ? ex.message : "Failed to save stock-take", type: "error" });
    } finally { setSavingTake(false); }
  }

  async function saveAdjust(materialId: string) {
    const delta = parseFloat(adjustVal);
    if (!Number.isFinite(delta) || delta === 0) { setAdjustFor(null); return; }
    try {
      await adjustStock(location.id, materialId, delta, "Manual adjustment");
      setAdjustFor(null); setAdjustVal("");
      await refetch();
      onToast({ message: "Stock adjusted.", type: "success" });
    } catch (ex) {
      onToast({ message: ex instanceof Error ? ex.message : "Failed to adjust", type: "error" });
    }
  }

  async function saveEdit() {
    if (!editName.trim()) return;
    setSavingEdit(true);
    try {
      await updateLocation(location.id, { name: editName.trim(), rego: editRego.trim() || null });
      setEditing(false);
      onChanged();
      onToast({ message: "Location updated.", type: "success" });
    } catch (ex) {
      onToast({ message: ex instanceof Error ? ex.message : "Failed to update", type: "error" });
    } finally { setSavingEdit(false); }
  }
  async function setActive(active: boolean) {
    try {
      await updateLocation(location.id, { isActive: active });
      onToast({ message: `${location.name} ${active ? "reactivated" : "deactivated"}.`, type: "success" });
      onChanged();
      if (!active) onBack();
    } catch (ex) {
      onToast({ message: ex instanceof Error ? ex.message : "Failed to update", type: "error" });
    }
  }

  const term = search.trim().toLowerCase();
  const shownLevels = term ? levels.filter((l) => l.name.toLowerCase().includes(term) || (l.sku ?? "").toLowerCase().includes(term)) : levels;

  return (
    <div className="space-y-4">
      {/* Breadcrumb + header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 text-sm">
          <button type="button" onClick={onBack} className="font-medium text-[#2F8F5C] hover:underline">Locations</button>
          <ChevronRight className="h-3.5 w-3.5 text-[#A0A0A0]" />
          <span className="font-semibold text-[#1A1A1A]">{location.name}</span>
          <StatusPill tone={location.type === "factory" ? "slate" : "sage"} className="ml-2 uppercase tracking-wide">{location.type}</StatusPill>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setTransferOpen(true)} className="inline-flex items-center gap-1.5 rounded-md border border-[#E6E1D4] bg-white px-3 py-1.5 text-xs font-semibold text-[#3A3A3A] hover:bg-[#FAF8F2]"><ArrowLeftRight className="h-3.5 w-3.5" /> Transfer from here</button>
          <button type="button" onClick={() => setEditing((v) => !v)} className="inline-flex items-center gap-1.5 rounded-md border border-[#E6E1D4] bg-white px-3 py-1.5 text-xs font-semibold text-[#3A3A3A] hover:bg-[#FAF8F2]"><Pencil className="h-3.5 w-3.5" /> Edit</button>
          {!takeMode && (
            <button type="button" onClick={() => void startStocktake()} className="inline-flex items-center gap-1.5 rounded-md border border-[#E6E1D4] bg-white px-3 py-1.5 text-xs font-semibold text-[#2F8F5C] hover:bg-[#FAF8F2]"><ClipboardCheck className="h-3.5 w-3.5" /> Run stock-take</button>
          )}
        </div>
      </div>

      {/* Edit (rename / rego / deactivate) */}
      {editing && (
        <div className={`flex flex-wrap items-end gap-3 px-4 py-3 ${cardShell}`}>
          <label><span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Name</span>
            <input value={editName} onChange={(e) => setEditName(e.target.value)} className={inputField} /></label>
          {location.type === "van" && (
            <label><span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Rego</span>
              <input value={editRego} onChange={(e) => setEditRego(e.target.value)} className={inputField} /></label>
          )}
          <button type="button" onClick={() => void saveEdit()} disabled={savingEdit || !editName.trim()} className={btnPrimary}>{savingEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save</button>
          {location.type === "van" && (
            location.isActive ? (
              <button type="button" onClick={() => void setActive(false)} className="inline-flex items-center gap-1.5 rounded-md border border-[#E6C9C9] bg-white px-3 py-2 text-[13px] font-semibold text-[#C44545] hover:bg-[#FBE5E5]"><Archive className="h-3.5 w-3.5" /> Deactivate</button>
            ) : (
              <button type="button" onClick={() => void setActive(true)} className="inline-flex items-center gap-1.5 rounded-md border border-[#E6E1D4] bg-white px-3 py-2 text-[13px] font-semibold text-[#2F8F5C] hover:bg-[#FAF8F2]"><ArchiveRestore className="h-3.5 w-3.5" /> Reactivate</button>
            )
          )}
        </div>
      )}

      {/* Driver assignment (vans) */}
      {location.type === "van" && (
        <div className={`flex flex-wrap items-center gap-3 px-4 py-3 ${cardShell}`}>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Driver</span>
          <select value={location.assignedWorkerId ?? ""} onChange={(e) => onReassign(location, e.target.value)} className={`${inputField} max-w-xs`}>
            <option value="">Unassigned</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{staffName(s.id)}</option>)}
          </select>
        </div>
      )}

      {takeMode ? (
        <div className={`overflow-hidden ${cardShell}`}>
          <div className="flex items-center justify-between border-b border-[#E6E1D4] bg-[#FAF8F2] px-4 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Stock-take — enter the counted quantity for each item</p>
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            <table className="min-w-full text-sm">
              <tbody className="divide-y divide-[#EFEBE0]">
                {stockItems.length === 0 && <tr><td className="px-4 py-8 text-center text-sm text-[#A0A0A0]">No stock items yet — flag materials as stocked in Catalogue → Materials.</td></tr>}
                {stockItems.map((m) => (
                  <tr key={m.id}>
                    <td className="px-4 py-2 text-[#1A1A1A]">{m.name}{m.sku && <span className="ml-2 text-[11px] text-[#A0A0A0]">{m.sku}</span>}</td>
                    <td className="w-32 px-4 py-2 text-right">
                      <input type="number" min={0} step="any" inputMode="decimal" value={counts[m.id] ?? ""} onChange={(e) => setCounts((prev) => ({ ...prev, [m.id]: e.target.value }))} className={`${inputField} w-24 text-right tabular-nums`} />
                    </td>
                    <td className="w-12 px-2 py-2 text-xs text-[#A0A0A0]">{m.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-[#E6E1D4] px-4 py-3">
            <button type="button" onClick={() => setTakeMode(false)} className={btnGhost}>Cancel</button>
            <button type="button" onClick={() => void saveStocktake()} disabled={savingTake || stockItems.length === 0} className={btnPrimary}>{savingTake ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />} Save stock-take</button>
          </div>
        </div>
      ) : loading ? (
        <div className={`flex items-center gap-2 px-5 py-8 text-sm text-[#A0A0A0] ${cardShell}`}><Loader2 className="h-4 w-4 animate-spin" /> Loading stock…</div>
      ) : (
        <>
          {/* On-hand + search + quick adjust */}
          {levels.length > 0 && (
            <div className="relative max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A0A0A0]" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search this location…" className="w-full rounded-md border border-[#E6E1D4] bg-white py-2 pl-9 pr-9 text-sm focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]" />
              {search && <button type="button" onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-[#A0A0A0] hover:text-[#C44545]" aria-label="Clear"><X className="h-4 w-4" /></button>}
            </div>
          )}
          {levels.length === 0 ? (
            <div className={`px-5 py-10 text-center text-sm text-[#A0A0A0] ${cardShell}`}>No stock recorded here yet. Run a stock-take to enter what's on hand.</div>
          ) : (
            <div className={`overflow-x-auto ${cardShell}`}>
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-[#E6E1D4] bg-[#FAF8F2]">
                    <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Item</th>
                    <th className="w-28 px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]">On hand</th>
                    <th className="w-44 px-3 py-2.5" aria-label="Adjust" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EFEBE0]">
                  {shownLevels.map((l) => {
                    const out = l.qty <= 0;
                    const adjusting = adjustFor === l.materialId;
                    return (
                      <tr key={l.id} onClick={() => setSelectedMaterial(l.materialId)} className="cursor-pointer hover:bg-[#FAF8F2]">
                        <td className="px-4 py-2.5 text-[#1A1A1A]">{l.name}{l.sku && <span className="ml-2 text-[11px] text-[#A0A0A0]">{l.sku}</span>}</td>
                        <td className={`px-4 py-2.5 text-right tabular-nums ${out ? "text-[#C44545]" : "text-[#1A1A1A]"}`}>{fmtQty(l.qty)} <span className="text-[11px] text-[#A0A0A0]">{l.unit}</span></td>
                        <td className="px-3 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                          {adjusting ? (
                            <div className="flex items-center justify-end gap-1">
                              <input autoFocus type="number" step="any" inputMode="decimal" value={adjustVal} onChange={(e) => setAdjustVal(e.target.value)} placeholder="+/−" className={`${inputField} w-20 text-right tabular-nums`} />
                              <button type="button" onClick={() => void saveAdjust(l.materialId)} className="rounded p-1.5 text-[#2F8F5C] hover:bg-[#E5F2EA]"><Check className="h-4 w-4" /></button>
                              <button type="button" onClick={() => { setAdjustFor(null); setAdjustVal(""); }} className="rounded p-1.5 text-[#A0A0A0] hover:text-[#C44545]"><X className="h-4 w-4" /></button>
                            </div>
                          ) : (
                            <button type="button" onClick={() => { setAdjustFor(l.materialId); setAdjustVal(""); }} className="rounded-md border border-[#E6E1D4] bg-white px-2 py-1 text-xs font-semibold text-[#6B6B6B] hover:bg-[#FAF8F2] hover:text-[#1A1A1A]">Adjust</button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Movement history for this location */}
          {moves.length > 0 && (
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6B6B6B]">Recent activity here</p>
              <div className={`overflow-hidden ${cardShell}`}>
                <ul className="max-h-[40vh] divide-y divide-[#EFEBE0] overflow-y-auto">
                  {moves.map((m) => {
                    const r = REASON[m.reason]; const up = m.qtyDelta >= 0;
                    return (
                      <li key={m.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                        <span className="w-20 shrink-0 text-xs text-[#A0A0A0]">{fmtDate(m.createdAt)}</span>
                        <StatusPill tone={r.tone}>{r.label}</StatusPill>
                        <span className="min-w-0 flex-1 truncate text-[#3A3A3A]">{m.name}</span>
                        <span className={`shrink-0 tabular-nums ${up ? "text-[#246F47]" : "text-[#C44545]"}`}>{up ? "+" : ""}{fmtQty(m.qtyDelta)} <span className="text-[11px] text-[#A0A0A0]">{m.unit}</span></span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          )}
        </>
      )}

      <StockItemDrawer materialId={selectedMaterial} onClose={() => setSelectedMaterial(null)} />
      <TransferStockModal
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        defaultFrom={location.id}
        onDone={(m) => { onToast({ message: m, type: "success" }); void refetch(); onChanged(); }}
      />
      {toast && <Toaster message={toast.message} type={toast.type} onClose={clearToast} />}
    </div>
  );
}

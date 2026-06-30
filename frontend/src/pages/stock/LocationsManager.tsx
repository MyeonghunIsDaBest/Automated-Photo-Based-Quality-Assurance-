// ─────────────────────────────────────────────────────────────────────────────
// pages/stock/LocationsManager.tsx — manager view: the factory + vans, add a van
// and assign its driver, drill into a location's stock, and run a stock-take to
// seed/correct quantities. Live.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Loader2, ChevronRight, Truck, Factory, ClipboardCheck } from "lucide-react";

import { Toaster } from "../../components/ui/Toaster";
import { cardShell, btnPrimary, btnGhost, inputField, StatusPill } from "../gantt/components/ledger";
import {
  listStockLocations, createLocation, updateLocation, listStockLevels, getCompanyTotals,
  recordStocktake, subscribeToStockLevels,
  type StockLocation, type StockLevel,
} from "../../lib/api/stock";
import { listProfilesByRole } from "../../lib/api/profiles";
import { listMaterials, type Material } from "../../lib/api/materials";
import type { Profile, SecurityGroup } from "../../types";

const INTERNAL_GROUPS: SecurityGroup[] = ["company_admin", "construction_mgr", "project_manager", "worker", "dev"];
const fullName = (p: Profile) => `${p.firstName} ${p.lastName}`.trim() || p.email;
const fmtQty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

type ToastState = { message: string; type: "success" | "error" | "info" } | null;

export default function LocationsManager() {
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [staff, setStaff] = useState<Profile[]>([]);
  const [summary, setSummary] = useState<Map<string, { items: number; units: number }>>(new Map());
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<ToastState>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);

  // add-van form
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDriver, setNewDriver] = useState("");
  const [savingAdd, setSavingAdd] = useState(false);

  const staffName = useCallback((id: string | null) => (id ? (staff.find((s) => s.id === id) ? fullName(staff.find((s) => s.id === id)!) : "—") : "—"), [staff]);

  const loadAll = useCallback(async () => {
    const [locs, totals] = await Promise.all([listStockLocations().catch(() => []), getCompanyTotals().catch(() => [])]);
    setLocations(locs);
    const sum = new Map<string, { items: number; units: number }>();
    for (const t of totals) {
      for (const b of t.byLocation) {
        if (b.qty === 0) continue;
        const e = sum.get(b.locationId) ?? { items: 0, units: 0 };
        e.items += 1;
        e.units += b.qty;
        sum.set(b.locationId, e);
      }
    }
    setSummary(sum);
  }, []);

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
        onToast={setToast}
        toast={toast}
        clearToast={() => setToast(null)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6B6B6B]">Factory + vans</p>
        {!showAdd && (
          <button type="button" onClick={() => setShowAdd(true)} className="inline-flex items-center gap-1.5 rounded-md bg-[#2F8F5C] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#287a4e]">
            <Plus className="h-3.5 w-3.5" /> Add van
          </button>
        )}
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
              className={`flex flex-col rounded-[12px] border border-[#E6E1D4] bg-white p-4 text-left shadow-[0_1px_2px_rgba(20,20,20,0.04)] hover:border-[#D8D2C4]`}
            >
              <div className="mb-2 flex items-center gap-2">
                {isFactory ? <Factory className="h-4 w-4 text-[#2F8F5C]" /> : <Truck className="h-4 w-4 text-[#2F8F5C]" />}
                <span className="text-sm font-semibold text-[#1A1A1A]">{loc.name}</span>
                <ChevronRight className="ml-auto h-4 w-4 text-[#A0A0A0]" />
              </div>
              {!isFactory && <p className="mb-1 text-xs text-[#6B6B6B]">Driver: {staffName(loc.assignedWorkerId)}</p>}
              <p className="mt-auto text-xs text-[#A0A0A0]">
                {s ? `${s.items} item${s.items === 1 ? "" : "s"} · ${fmtQty(s.units)} units` : "Empty"}
              </p>
            </button>
          );
        })}
      </div>

      {toast && <Toaster message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

// ─── Location detail (levels + reassign driver + stock-take) ────────────────────
function LocationDetail({
  location, staff, staffName, onBack, onReassign, onToast, toast, clearToast,
}: {
  location: StockLocation;
  staff: Profile[];
  staffName: (id: string | null) => string;
  onBack: () => void;
  onReassign: (loc: StockLocation, workerId: string) => void;
  onToast: (t: ToastState) => void;
  toast: ToastState;
  clearToast: () => void;
}) {
  const [levels, setLevels] = useState<StockLevel[]>([]);
  const [loading, setLoading] = useState(true);
  const [takeMode, setTakeMode] = useState(false);
  const [stockItems, setStockItems] = useState<Material[]>([]);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [savingTake, setSavingTake] = useState(false);

  const refetch = useCallback(async () => {
    const rows = await listStockLevels(location.id).catch(() => []);
    setLevels(rows);
  }, [location.id]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    refetch().finally(() => { if (!cancelled) setLoading(false); });
    const unsub = subscribeToStockLevels(location.id, () => void refetch());
    return () => { cancelled = true; unsub(); };
  }, [refetch, location.id]);

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
      const entries = Object.entries(counts)
        .map(([materialId, v]) => ({ materialId, countedQty: parseFloat(v) }))
        .filter((c) => Number.isFinite(c.countedQty));
      await recordStocktake(location.id, entries);
      setTakeMode(false);
      await refetch();
      onToast({ message: "Stock-take saved.", type: "success" });
    } catch (ex) {
      onToast({ message: ex instanceof Error ? ex.message : "Failed to save stock-take", type: "error" });
    } finally {
      setSavingTake(false);
    }
  }

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
        {!takeMode && (
          <button type="button" onClick={() => void startStocktake()} className="inline-flex items-center gap-1.5 rounded-md border border-[#E6E1D4] bg-white px-3 py-1.5 text-xs font-semibold text-[#2F8F5C] hover:bg-[#FAF8F2]">
            <ClipboardCheck className="h-3.5 w-3.5" /> Run stock-take
          </button>
        )}
      </div>

      {/* Driver assignment (vans) */}
      {location.type === "van" && (
        <div className={`flex flex-wrap items-center gap-3 px-4 py-3 ${cardShell}`}>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Driver</span>
          <select
            value={location.assignedWorkerId ?? ""}
            onChange={(e) => onReassign(location, e.target.value)}
            className={`${inputField} max-w-xs`}
          >
            <option value="">Unassigned</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{staffName(s.id)}</option>)}
          </select>
        </div>
      )}

      {/* Stock-take editor */}
      {takeMode ? (
        <div className={`overflow-hidden ${cardShell}`}>
          <div className="flex items-center justify-between border-b border-[#E6E1D4] bg-[#FAF8F2] px-4 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Stock-take — enter the counted quantity for each item</p>
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            <table className="min-w-full text-sm">
              <tbody className="divide-y divide-[#EFEBE0]">
                {stockItems.length === 0 && (
                  <tr><td className="px-4 py-8 text-center text-sm text-[#A0A0A0]">No stock items yet — flag materials as stocked in Catalogue → Materials.</td></tr>
                )}
                {stockItems.map((m) => (
                  <tr key={m.id}>
                    <td className="px-4 py-2 text-[#1A1A1A]">{m.name}{m.sku && <span className="ml-2 text-[11px] text-[#A0A0A0]">{m.sku}</span>}</td>
                    <td className="w-32 px-4 py-2 text-right">
                      <input
                        type="number" min={0} step="any" inputMode="decimal"
                        value={counts[m.id] ?? ""}
                        onChange={(e) => setCounts((prev) => ({ ...prev, [m.id]: e.target.value }))}
                        className={`${inputField} w-24 text-right tabular-nums`}
                      />
                    </td>
                    <td className="w-12 px-2 py-2 text-xs text-[#A0A0A0]">{m.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-[#E6E1D4] px-4 py-3">
            <button type="button" onClick={() => setTakeMode(false)} className={btnGhost}>Cancel</button>
            <button type="button" onClick={() => void saveStocktake()} disabled={savingTake || stockItems.length === 0} className={btnPrimary}>
              {savingTake ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />} Save stock-take
            </button>
          </div>
        </div>
      ) : loading ? (
        <div className={`flex items-center gap-2 px-5 py-8 text-sm text-[#A0A0A0] ${cardShell}`}><Loader2 className="h-4 w-4 animate-spin" /> Loading stock…</div>
      ) : levels.length === 0 ? (
        <div className={`px-5 py-10 text-center text-sm text-[#A0A0A0] ${cardShell}`}>
          No stock recorded here yet. Run a stock-take to enter what's on hand.
        </div>
      ) : (
        <div className={`overflow-x-auto ${cardShell}`}>
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-[#E6E1D4] bg-[#FAF8F2]">
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Item</th>
                <th className="w-32 px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]">On hand</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EFEBE0]">
              {levels.map((l) => {
                const out = l.qty <= 0;
                return (
                  <tr key={l.id} className="hover:bg-[#FAF8F2]">
                    <td className="px-4 py-2.5 text-[#1A1A1A]">{l.name}{l.sku && <span className="ml-2 text-[11px] text-[#A0A0A0]">{l.sku}</span>}</td>
                    <td className={`px-4 py-2.5 text-right tabular-nums ${out ? "text-[#C44545]" : "text-[#1A1A1A]"}`}>
                      {fmtQty(l.qty)} <span className="text-[11px] text-[#A0A0A0]">{l.unit}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {toast && <Toaster message={toast.message} type={toast.type} onClose={clearToast} />}
    </div>
  );
}

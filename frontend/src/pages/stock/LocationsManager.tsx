// ─────────────────────────────────────────────────────────────────────────────
// pages/stock/LocationsManager.tsx — manager view: every stock location —
// factory, vans, job SITES, and STORAGE spots (migration 96) — with item count /
// units / value / last activity, an "Add location" form (type-aware: driver for
// vans, job link for sites, map pin for all), a company-wide "find an item"
// search ("where's my 100mm conduit?"), and a drill-in per location to search
// its stock, adjust, stock-take, transfer, view history, rename/archive. Live.
// ─────────────────────────────────────────────────────────────────────────────

import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Loader2, ChevronRight, Truck, Factory, Warehouse, ClipboardCheck, Search, X, Pencil, Check, Archive, ArrowLeftRight, ArchiveRestore, MapPin, Route, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";

import { Toaster, type ToastState } from "../../components/ui/Toaster";
import { cardShell, btnPrimary, btnGhost, inputField, StatusPill, type ToneKey } from "../gantt/components/ledger";
import {
  listStockLocations, createLocation, updateLocation, listStockLevels, getCompanyTotals,
  recordStocktake, adjustStock, listMovements, subscribeToStockLevels,
  type StockLocation, type StockLevel, type MovementView, type MovementReason, type UpdateLocationInput,
  type LocationType, type CompanyTotal,
} from "../../lib/api/stock";
import { listProfilesByRole } from "../../lib/api/profiles";
import { listMaterials, type Material } from "../../lib/api/materials";
import { listServiceJobs, getServiceJob, type ServiceJob } from "../../lib/api/serviceJobs";
import { getOrGeocode, haversineKm } from "../../lib/geo";
import { fmtMoney, fmtQty } from "../../lib/format";
import AddressSearchInput from "../../components/geo/AddressSearchInput";
import StockItemDrawer from "./StockItemDrawer";
import TransferStockModal from "./TransferStockModal";
import type { Profile, SecurityGroup } from "../../types";

// Leaflet stays out of the main bundle — the map loads only when a form needs it.
const MapPicker = lazy(() => import("../../components/geo/MapPicker"));

const MapFallback = ({ heightClass = "h-56" }: { heightClass?: string }) => (
  <div className={`animate-pulse rounded-[10px] border border-[#E6E1D4] bg-[#FAF8F2] ${heightClass}`} />
);

const INTERNAL_GROUPS: SecurityGroup[] = ["company_admin", "construction_mgr", "project_manager", "worker", "dev"];
const fullName = (p: Profile) => `${p.firstName} ${p.lastName}`.trim() || p.email;
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString();
const REASON: Record<MovementReason, { label: string; tone: ToneKey }> = {
  usage: { label: "Used", tone: "orange" }, receipt: { label: "Received", tone: "sage" },
  transfer_out: { label: "Transfer out", tone: "slate" }, transfer_in: { label: "Transfer in", tone: "slate" },
  adjustment: { label: "Adjustment", tone: "amber" }, stocktake: { label: "Stock-take", tone: "ink" },
};

interface LocSummary { items: number; units: number; value: number; lastActivity: string | null }

// Per-type presentation — one source for cards, breadcrumbs, and the add form.
const TYPE_META: Record<LocationType, { label: string; icon: typeof Truck; tone: ToneKey }> = {
  factory: { label: "Factory", icon: Factory, tone: "slate" },
  van:     { label: "Van",     icon: Truck, tone: "sage" },
  site:    { label: "Site",    icon: MapPin, tone: "amber" },
  storage: { label: "Storage", icon: Warehouse, tone: "ink" },
};
const ADDABLE_TYPES: LocationType[] = ["van", "site", "storage"];

export default function LocationsManager() {
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [staff, setStaff] = useState<Profile[]>([]);
  const [summary, setSummary] = useState<Map<string, LocSummary>>(new Map());
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<ToastState>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  const [showAdd, setShowAdd] = useState(false);
  const [newType, setNewType] = useState<LocationType>("van");
  const [newName, setNewName] = useState("");
  const [newDriver, setNewDriver] = useState("");
  const [newJob, setNewJob] = useState("");        // sites: linked service job
  const [jobOptions, setJobOptions] = useState<ServiceJob[]>([]);
  const [newAddress, setNewAddress] = useState("");
  const [newPin, setNewPin] = useState<{ lat: number; lng: number } | null>(null);
  const [savingAdd, setSavingAdd] = useState(false);

  // Find an item — "where's my 100mm conduit?" across every location.
  const [totals, setTotals] = useState<CompanyTotal[]>([]);
  const [findTerm, setFindTerm] = useState("");
  const [findItem, setFindItem] = useState<string | null>(null);

  const staffName = useCallback((id: string | null) => (id ? (staff.find((s) => s.id === id) ? fullName(staff.find((s) => s.id === id)!) : "—") : "—"), [staff]);

  const loadAll = useCallback(async () => {
    const [locs, totals, moves] = await Promise.all([
      listStockLocations(showInactive).catch(() => []),
      getCompanyTotals().catch(() => []),
      listMovements({ limit: 400 }).catch(() => []),
    ]);
    setLocations(locs);
    setTotals(totals);
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

  // Sites can link to the job they serve — load the picker lazily, first time
  // the type flips to "site". Open jobs only: closed jobs don't get new sites.
  useEffect(() => {
    if (newType !== "site" || jobOptions.length > 0) return;
    listServiceJobs()
      .then((jobs) => setJobOptions(jobs.filter((j) => j.status === "pending" || j.status === "scheduled" || j.status === "in_progress")))
      .catch(() => {});
  }, [newType, jobOptions.length]);

  async function handleAddLocation() {
    if (!newName.trim()) return;
    setSavingAdd(true);
    try {
      await createLocation({
        name: newName.trim(),
        type: newType,
        assignedWorkerId: newType === "van" ? (newDriver || null) : null,
        serviceJobId: newType === "site" ? (newJob || null) : null,
        address: newAddress.trim() || null,
        lat: newPin?.lat ?? null,
        lng: newPin?.lng ?? null,
      });
      setNewName(""); setNewDriver(""); setNewJob(""); setNewAddress(""); setNewPin(null); setShowAdd(false);
      await loadAll();
      setToast({ message: `${TYPE_META[newType].label} added.`, type: "success" });
    } catch (ex) {
      setToast({ message: ex instanceof Error ? ex.message : "Failed to add location", type: "error" });
    } finally {
      setSavingAdd(false);
    }
  }

  // Find-an-item rows: name/SKU match with per-location holdings. Capped for
  // display but never silently — the footer reports the full match count.
  const findResult = useMemo(() => {
    const q = findTerm.trim().toLowerCase();
    if (!q) return { rows: [] as CompanyTotal[], matches: 0 };
    const matched = totals.filter((t) => t.name.toLowerCase().includes(q) || (t.sku ?? "").toLowerCase().includes(q));
    return { rows: matched.slice(0, 8), matches: matched.length };
  }, [totals, findTerm]);
  const findRows = findResult.rows;

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
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6B6B6B]">All stock locations</p>
        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-[#6B6B6B]">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="h-3.5 w-3.5 accent-[#2F8F5C]" />
            Show inactive
          </label>
          {!showAdd && (
            <button type="button" onClick={() => setShowAdd(true)} className="inline-flex items-center gap-1.5 rounded-md bg-[#2F8F5C] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#287a4e]">
              <Plus className="h-3.5 w-3.5" /> Add location
            </button>
          )}
        </div>
      </div>

      {/* Find an item — every place it's sitting, in one hit */}
      <div className={`px-4 py-3 ${cardShell}`}>
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A0A0A0]" />
          <input
            value={findTerm}
            onChange={(e) => setFindTerm(e.target.value)}
            placeholder="Find an item — name or SKU (e.g. 100mm conduit)…"
            className="w-full rounded-md border border-[#E6E1D4] bg-white py-2 pl-9 pr-9 text-sm focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]"
          />
          {findTerm && (
            <button type="button" onClick={() => setFindTerm("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-[#A0A0A0] hover:text-[#C44545]" aria-label="Clear search">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {findTerm.trim() !== "" && (
          findRows.length === 0 ? (
            <p className="mt-2 text-sm text-[#A0A0A0]">Nothing on hand matches — check Catalogue → Materials for items never counted anywhere.</p>
          ) : (
            <ul className="mt-2 divide-y divide-[#EFEBE0]">
              {findRows.map((t) => (
                <li key={t.materialId}>
                  <button type="button" onClick={() => setFindItem(t.materialId)} className="flex w-full flex-wrap items-center gap-2 py-2 text-left hover:bg-[#FAF8F2]">
                    <span className="text-sm font-medium text-[#1A1A1A]">{t.name}</span>
                    {t.sku && <span className="text-[11px] text-[#A0A0A0]">{t.sku}</span>}
                    <span className="text-xs tabular-nums text-[#6B6B6B]">{fmtQty(t.total)} {t.unit} total</span>
                    <span className="flex flex-wrap gap-1">
                      {t.byLocation.filter((b) => b.qty !== 0).map((b) => (
                        <span key={b.locationId} className={`rounded-full px-2 py-0.5 text-[11px] ${b.isActive ? "bg-[#F0EDE4] text-[#3A3A3A]" : "bg-[#F0EDE4] text-[#A0A0A0]"}`}>
                          {b.locationName}: {fmtQty(b.qty)}{!b.isActive && " (archived)"}
                        </span>
                      ))}
                    </span>
                  </button>
                </li>
              ))}
              {findResult.matches > findRows.length && (
                <li className="py-2 text-xs text-[#A0A0A0]">
                  Showing {findRows.length} of {findResult.matches} matches — keep typing to narrow.
                </li>
              )}
            </ul>
          )
        )}
      </div>

      {showAdd && (
        <div className={`px-4 py-4 ${cardShell}`}>
          {/* Type picker first — it shapes the rest of the form */}
          <div className="mb-3 flex flex-wrap gap-1.5">
            {ADDABLE_TYPES.map((t) => {
              const M = TYPE_META[t];
              const active = newType === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setNewType(t)}
                  aria-pressed={active}
                  className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${
                    active ? "border-[#2F8F5C] bg-[#E5F2EA] text-[#246F47]" : "border-[#E6E1D4] bg-white text-[#6B6B6B] hover:bg-[#FAF8F2]"
                  }`}
                >
                  <M.icon className="h-3.5 w-3.5" /> {M.label}
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label>
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">{TYPE_META[newType].label} name</span>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={newType === "van" ? "e.g. Van 1 — Rene" : newType === "site" ? "e.g. Elsternwick — Smith build" : "e.g. Elsternwick container"}
                className={inputField}
              />
            </label>
            {newType === "van" && (
              <label>
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Driver</span>
                <select value={newDriver} onChange={(e) => setNewDriver(e.target.value)} className={inputField}>
                  <option value="">Unassigned</option>
                  {staff.map((s) => <option key={s.id} value={s.id}>{fullName(s)}</option>)}
                </select>
              </label>
            )}
            {newType === "site" && (
              <label>
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Linked job (optional)</span>
                <select value={newJob} onChange={(e) => setNewJob(e.target.value)} className={inputField}>
                  <option value="">No linked job</option>
                  {jobOptions.map((j) => <option key={j.id} value={j.id}>{[j.jobNumber, j.title].filter(Boolean).join(" · ")}</option>)}
                </select>
              </label>
            )}
          </div>
          <div className="mt-3">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">
              {newType === "van" ? "Home base (for delivery distances)" : "Address (map pin)"}
            </span>
            <AddressSearchInput
              value={newAddress}
              onChange={(v) => { setNewAddress(v); setNewPin(null); }} // hand-edited text ≠ the old pin
              onSelect={(r) => { setNewAddress(r.label); setNewPin({ lat: r.lat, lng: r.lng }); }}
              placeholder={newType === "van" ? "Search the van's home base address…" : "Search the site/storage address…"}
            />
            <div className="mt-2">
              <Suspense fallback={<MapFallback heightClass="h-48" />}>
                <MapPicker lat={newPin?.lat ?? null} lng={newPin?.lng ?? null} onPick={(lat, lng) => setNewPin({ lat, lng })} heightClass="h-48" />
              </Suspense>
              <p className="mt-1 text-[11px] text-[#A0A0A0]">Search above, or tap the map to drop the pin — drag it to fine-tune.</p>
            </div>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={() => { setShowAdd(false); setNewName(""); setNewDriver(""); setNewJob(""); setNewAddress(""); setNewPin(null); }} className={btnGhost}>Cancel</button>
            <button type="button" onClick={() => void handleAddLocation()} disabled={savingAdd || !newName.trim()} className={btnPrimary}>
              {savingAdd ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add {TYPE_META[newType].label.toLowerCase()}
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {locations.map((loc) => {
          const s = summary.get(loc.id);
          const M = TYPE_META[loc.type];
          return (
            <button
              key={loc.id}
              type="button"
              onClick={() => setSelectedId(loc.id)}
              className="flex flex-col rounded-[12px] border border-[#E6E1D4] bg-white p-4 text-left shadow-[0_1px_2px_rgba(20,20,20,0.04)] hover:border-[#D8D2C4]"
            >
              <div className="mb-2 flex items-center gap-2">
                <M.icon className="h-4 w-4 text-[#2F8F5C]" />
                <span className="text-sm font-semibold text-[#1A1A1A]">{loc.name}</span>
                {loc.type !== "factory" && loc.type !== "van" && (
                  <StatusPill tone={M.tone} className="uppercase tracking-wide">{M.label}</StatusPill>
                )}
                {!loc.isActive && <StatusPill tone="slate" className="uppercase tracking-wide">Inactive</StatusPill>}
                <ChevronRight className="ml-auto h-4 w-4 text-[#A0A0A0]" />
              </div>
              {loc.type === "van" && <p className="mb-1 text-xs text-[#6B6B6B]">Driver: {staffName(loc.assignedWorkerId)}</p>}
              {loc.type === "site" && loc.serviceJobId && <p className="mb-1 text-xs text-[#6B6B6B]">Linked to a job</p>}
              {loc.address && (
                <p className="mb-1 flex items-center gap-1 truncate text-[11px] text-[#A0A0A0]">
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span className="truncate">{loc.address.split(",").slice(0, 2).join(",")}</span>
                </p>
              )}
              <p className="text-xs text-[#3A3A3A]">
                {s ? `${s.items} item${s.items === 1 ? "" : "s"} · ${fmtQty(s.units)} units${s.value ? ` · ${fmtMoney(s.value)}` : ""}` : "Empty"}
              </p>
              <p className="mt-auto pt-1 text-[11px] text-[#A0A0A0]">{s?.lastActivity ? `Last activity ${fmtDate(s.lastActivity)}` : "No activity yet"}</p>
            </button>
          );
        })}
      </div>

      <StockItemDrawer materialId={findItem} onClose={() => setFindItem(null)} />
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

  // rename / deactivate / re-pin
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(location.name);
  const [editRego, setEditRego] = useState(location.rego ?? "");
  const [editAddress, setEditAddress] = useState(location.address ?? "");
  const [editPin, setEditPin] = useState<{ lat: number; lng: number } | null>(
    location.lat != null && location.lng != null ? { lat: location.lat, lng: location.lng } : null,
  );
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
    setEditAddress(location.address ?? "");
    setEditPin(location.lat != null && location.lng != null ? { lat: location.lat, lng: location.lng } : null);
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
      // Geo keys go in the patch ONLY when actually changed — a plain rename
      // keeps working on databases where migration 92 isn't applied yet.
      const patch: UpdateLocationInput = { name: editName.trim(), rego: editRego.trim() || null };
      const nextAddress = editAddress.trim() || null;
      const nextLat = editPin?.lat ?? null;
      const nextLng = editPin?.lng ?? null;
      if (nextAddress !== (location.address ?? null)) patch.address = nextAddress;
      if (nextLat !== location.lat) patch.lat = nextLat;
      if (nextLng !== location.lng) patch.lng = nextLng;
      await updateLocation(location.id, patch);
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
          <StatusPill tone={TYPE_META[location.type].tone} className="ml-2 uppercase tracking-wide">{TYPE_META[location.type].label}</StatusPill>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setTransferOpen(true)} className="inline-flex items-center gap-1.5 rounded-md border border-[#E6E1D4] bg-white px-3 py-1.5 text-xs font-semibold text-[#3A3A3A] hover:bg-[#FAF8F2]"><ArrowLeftRight className="h-3.5 w-3.5" /> Transfer from here</button>
          <button type="button" onClick={() => setEditing((v) => !v)} className="inline-flex items-center gap-1.5 rounded-md border border-[#E6E1D4] bg-white px-3 py-1.5 text-xs font-semibold text-[#3A3A3A] hover:bg-[#FAF8F2]"><Pencil className="h-3.5 w-3.5" /> Edit</button>
          {!takeMode && (
            <button type="button" onClick={() => void startStocktake()} className="inline-flex items-center gap-1.5 rounded-md border border-[#E6E1D4] bg-white px-3 py-1.5 text-xs font-semibold text-[#2F8F5C] hover:bg-[#FAF8F2]"><ClipboardCheck className="h-3.5 w-3.5" /> Run stock-take</button>
          )}
        </div>
      </div>

      {/* Edit (rename / rego / base address + pin / deactivate) */}
      {editing && (
        <div className={`px-4 py-3 ${cardShell}`}>
          <div className="flex flex-wrap items-end gap-3">
            <label><span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Name</span>
              <input value={editName} onChange={(e) => setEditName(e.target.value)} className={inputField} /></label>
            {location.type === "van" && (
              <label><span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Rego</span>
                <input value={editRego} onChange={(e) => setEditRego(e.target.value)} className={inputField} /></label>
            )}
            <button type="button" onClick={() => void saveEdit()} disabled={savingEdit || !editName.trim()} className={btnPrimary}>{savingEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save</button>
            {/* Archive parity: vans, sites, and storage all archive; the factory never does. */}
            {location.type !== "factory" && (
              location.isActive ? (
                <button type="button" onClick={() => void setActive(false)} className="inline-flex items-center gap-1.5 rounded-md border border-[#E6C9C9] bg-white px-3 py-2 text-[13px] font-semibold text-[#C44545] hover:bg-[#FBE5E5]"><Archive className="h-3.5 w-3.5" /> Deactivate</button>
              ) : (
                <button type="button" onClick={() => void setActive(true)} className="inline-flex items-center gap-1.5 rounded-md border border-[#E6E1D4] bg-white px-3 py-2 text-[13px] font-semibold text-[#2F8F5C] hover:bg-[#FAF8F2]"><ArchiveRestore className="h-3.5 w-3.5" /> Reactivate</button>
              )
            )}
          </div>
          <div className="mt-3 max-w-xl">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">
              {location.type === "factory" ? "Factory address" : location.type === "van" ? "Home base (for delivery distances)" : "Address (map pin)"}
            </span>
            <AddressSearchInput
              value={editAddress}
              onChange={(v) => { setEditAddress(v); setEditPin(null); }} // hand-edited text ≠ the old pin
              onSelect={(r) => { setEditAddress(r.label); setEditPin({ lat: r.lat, lng: r.lng }); }}
              placeholder="Search an address…"
            />
            <div className="mt-2">
              <Suspense fallback={<MapFallback heightClass="h-48" />}>
                <MapPicker lat={editPin?.lat ?? null} lng={editPin?.lng ?? null} onPick={(lat, lng) => setEditPin({ lat, lng })} heightClass="h-48" />
              </Suspense>
              <p className="mt-1 text-[11px] text-[#A0A0A0]">Search above, or tap the map to drop the pin — drag it to fine-tune. Remember to hit Save.</p>
            </div>
          </div>
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
          {location.address && (
            <span className="flex min-w-0 items-center gap-1 text-[11px] text-[#A0A0A0]">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate">{location.address}</span>
            </span>
          )}
        </div>
      )}

      {/* Sites: the job this stock serves, with a jump link */}
      {location.type === "site" && location.serviceJobId && (
        <SiteJobCard serviceJobId={location.serviceJobId} />
      )}

      {/* Upcoming deliveries + straight-line distances (van with a base pin + driver) */}
      {location.type === "van" && location.lat != null && location.lng != null && location.assignedWorkerId && (
        <UpcomingDeliveries van={location} />
      )}
      {location.type === "van" && (location.lat == null || location.lng == null) && (
        <p className="text-[11px] text-[#A0A0A0]">Set this van's home base (Edit → search the address) to see delivery distances for its jobs.</p>
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

// ─── Site → linked job card (jump straight to the job's drawer) ─────────────────
function SiteJobCard({ serviceJobId }: { serviceJobId: string }) {
  const [job, setJob] = useState<ServiceJob | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setJob(null); setFailed(false);
    getServiceJob(serviceJobId)
      .then((j) => { if (!cancelled) { setJob(j); if (!j) setFailed(true); } })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [serviceJobId]);

  return (
    <div className={`flex flex-wrap items-center gap-3 px-4 py-3 ${cardShell}`}>
      <span className="text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Serves job</span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-[#1A1A1A]">
        {failed ? <span className="font-normal text-[#A0A0A0]">Linked job unavailable (deleted?)</span> : job ? job.title : "Loading…"}
      </span>
      {!failed && (
        <Link
          to={`/jobs?job=${serviceJobId}`}
          className="inline-flex items-center gap-1.5 rounded-md border border-[#E6E1D4] bg-white px-3 py-1.5 text-xs font-semibold text-[#2F8F5C] hover:bg-[#FAF8F2]"
        >
          <ExternalLink className="h-3.5 w-3.5" /> View job
        </Link>
      )}
    </div>
  );
}

// ─── Upcoming deliveries (van home base → the driver's open jobs) ───────────────
function UpcomingDeliveries({ van }: { van: StockLocation }) {
  const [rows, setRows] = useState<{ job: ServiceJob; km: number | null }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const open = (await listServiceJobs().catch(() => [] as ServiceJob[]))
        .filter((j) =>
          j.assignedTo === van.assignedWorkerId &&
          !!j.address &&
          (j.status === "pending" || j.status === "scheduled" || j.status === "in_progress"),
        )
        .slice(0, 8);
      const out: { job: ServiceJob; km: number | null }[] = [];
      for (const job of open) {
        // Sequential on purpose — polite to the free geocoder; the cache
        // (migration 92) absorbs repeat lookups so this is usually instant.
        const pin = await getOrGeocode(job.address as string);
        if (cancelled) return;
        out.push({
          job,
          km: pin && van.lat != null && van.lng != null ? haversineKm({ lat: van.lat, lng: van.lng }, pin) : null,
        });
      }
      if (!cancelled) setRows(out);
    })().finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [van.id, van.assignedWorkerId, van.lat, van.lng]);

  return (
    <div>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6B6B6B]">Upcoming deliveries — distance from base</p>
      <div className={`overflow-hidden ${cardShell}`}>
        {loading ? (
          <p className="flex items-center gap-2 px-3 py-3 text-sm text-[#A0A0A0]"><Loader2 className="h-4 w-4 animate-spin" /> Measuring distances…</p>
        ) : rows.length === 0 ? (
          <p className="px-3 py-3 text-sm text-[#A0A0A0]">No open jobs with a site address for this driver yet.</p>
        ) : (
          <ul className="divide-y divide-[#EFEBE0]">
            {rows.map(({ job, km }) => (
              <li key={job.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <Route className="h-3.5 w-3.5 shrink-0 text-[#2F8F5C]" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-[#1A1A1A]">{job.jobNumber ?? job.externalRef ?? "Job"} · {job.title}</span>
                  <span className="block truncate text-[11px] text-[#A0A0A0]">{job.address}{job.scheduledFor ? ` · ${new Date(job.scheduledFor).toLocaleDateString()}` : ""}</span>
                </span>
                <span className="shrink-0 rounded-full bg-[#E5F2EA] px-2 py-0.5 text-[11px] font-semibold tabular-nums text-[#246F47]">
                  {km != null ? `≈ ${km} km direct` : "address not found"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="mt-1 text-[11px] text-[#A0A0A0]">Straight-line distance from the van's home base — road distance comes later.</p>
    </div>
  );
}

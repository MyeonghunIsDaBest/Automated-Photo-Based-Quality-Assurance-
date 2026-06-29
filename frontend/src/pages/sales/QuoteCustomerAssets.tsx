// ─────────────────────────────────────────────────────────────────────────────
// pages/sales/QuoteCustomerAssets.tsx — the quote's "Customer Assets" tab (Simpro
// replication, Phase 1 Part 10 — the last quote top-tab).
//
// A register of the customer's serviceable equipment (inverters, switchboards,
// A/C, EV chargers…). Add/edit/remove assets and tick the ones this quote relates
// to (quote_assets link). Card-grid layout matched to the ledger system + the
// Schedule tab so the four quote tabs read as one product.
//
// Manager-gated surface (quoting is manager-only). Screen-only (print:hidden).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Loader2, Check, Package, X } from "lucide-react";

import {
  listCustomerAssets,
  createAsset,
  updateAsset,
  deleteAsset,
  listQuoteAssetIds,
  attachAsset,
  detachAsset,
  type CustomerAsset,
} from "../../lib/api/customerAssets";

const ASSET_TYPES = [
  "Solar Inverter", "Solar Panels", "Battery", "Switchboard", "Meter",
  "A/C Unit", "Heat Pump", "Hot Water", "EV Charger", "Lighting", "Security", "Other",
];

interface Props {
  quoteId: string;
  customerId: string | null;
  isLocked: boolean;
  onToast?: (message: string, type: "success" | "error" | "info") => void;
}

interface FormState {
  name: string;
  assetType: string;
  make: string;
  model: string;
  serial: string;
  location: string;
  installDate: string;
  warrantyUntil: string;
  notes: string;
}

const EMPTY_FORM: FormState = {
  name: "", assetType: "", make: "", model: "", serial: "", location: "", installDate: "", warrantyUntil: "", notes: "",
};

const INPUT =
  "w-full rounded-md border border-[#E6E1D4] bg-white px-3 py-2 text-sm text-[#1A1A1A] placeholder:text-[#C0BAB0] focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${Number(d)} ${months[Number(m) - 1] ?? m} ${y}`;
}

export default function QuoteCustomerAssets({ quoteId, customerId, isLocked, onToast }: Props) {
  const [assets, setAssets] = useState<CustomerAsset[]>([]);
  const [attachedIds, setAttachedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [editing, setEditing] = useState<string | "new" | null>(null); // asset id, "new", or closed
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // ── Load ────────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    if (!customerId) { setAssets([]); setAttachedIds(new Set()); setLoading(false); return; }
    setLoading(true);
    setLoadError(null);
    Promise.all([listCustomerAssets(customerId), listQuoteAssetIds(quoteId)])
      .then(([list, ids]) => { if (!cancelled) { setAssets(list); setAttachedIds(new Set(ids)); } })
      .catch((ex) => { if (!cancelled) setLoadError(ex instanceof Error ? ex.message : "Failed to load assets"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [customerId, quoteId]);

  const attachedCount = useMemo(() => assets.filter((a) => attachedIds.has(a.id)).length, [assets, attachedIds]);

  // ── Attach / detach ───────────────────────────────────────────────────────
  async function toggleAttach(asset: CustomerAsset) {
    if (isLocked || busyId) return;
    const on = attachedIds.has(asset.id);
    setBusyId(asset.id);
    // optimistic
    setAttachedIds((prev) => {
      const next = new Set(prev);
      if (on) next.delete(asset.id); else next.add(asset.id);
      return next;
    });
    try {
      if (on) await detachAsset(quoteId, asset.id);
      else await attachAsset(quoteId, asset.id);
    } catch (ex) {
      // revert
      setAttachedIds((prev) => {
        const next = new Set(prev);
        if (on) next.add(asset.id); else next.delete(asset.id);
        return next;
      });
      onToast?.(ex instanceof Error ? ex.message : "Failed to update", "error");
    } finally {
      setBusyId(null);
    }
  }

  // ── Add / edit ──────────────────────────────────────────────────────────
  function openNew() {
    setEditing("new");
    setForm(EMPTY_FORM);
  }
  function openEdit(a: CustomerAsset) {
    setEditing(a.id);
    setForm({
      name: a.name,
      assetType: a.assetType ?? "",
      make: a.make ?? "",
      model: a.model ?? "",
      serial: a.serial ?? "",
      location: a.location ?? "",
      installDate: a.installDate ?? "",
      warrantyUntil: a.warrantyUntil ?? "",
      notes: a.notes ?? "",
    });
  }
  function closeForm() { setEditing(null); setForm(EMPTY_FORM); }

  async function handleSave() {
    if (!customerId || !form.name.trim()) { onToast?.("Asset name is required.", "error"); return; }
    setSaving(true);
    const payload = {
      assetType: form.assetType.trim() || null,
      make: form.make.trim() || null,
      model: form.model.trim() || null,
      serial: form.serial.trim() || null,
      location: form.location.trim() || null,
      installDate: form.installDate || null,
      warrantyUntil: form.warrantyUntil || null,
      notes: form.notes.trim() || null,
    };
    try {
      if (editing === "new") {
        const created = await createAsset({ customerId, name: form.name.trim(), ...payload });
        setAssets((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      } else if (editing) {
        const updated = await updateAsset(editing, { name: form.name.trim(), ...payload });
        setAssets((prev) => prev.map((a) => (a.id === updated.id ? updated : a)).sort((a, b) => a.name.localeCompare(b.name)));
      }
      closeForm();
    } catch (ex) {
      onToast?.(ex instanceof Error ? ex.message : "Failed to save asset", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(a: CustomerAsset) {
    if (isLocked) return;
    setBusyId(a.id);
    try {
      await deleteAsset(a.id);
      setAssets((prev) => prev.filter((x) => x.id !== a.id));
      setAttachedIds((prev) => { const n = new Set(prev); n.delete(a.id); return n; });
    } catch (ex) {
      onToast?.(ex instanceof Error ? ex.message : "Failed to delete asset", "error");
    } finally {
      setBusyId(null);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (!customerId) {
    return (
      <div className="rounded-[10px] border border-dashed border-[#D8D2C4] bg-[#FAF8F2] px-4 py-10 text-center text-sm text-[#A0A0A0] print:hidden">
        Attach a customer to this quote (on the Details tab) to manage their assets.
      </div>
    );
  }
  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-[10px] border border-[#E6E1D4] bg-[#FAF8F2] px-4 py-6 text-sm text-[#A0A0A0] print:hidden">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading assets…
      </div>
    );
  }
  if (loadError) {
    return (
      <div className="rounded-[10px] border border-dashed border-[#E6C9C9] bg-[#FBF4F4] px-4 py-6 text-center text-sm text-[#C44545] print:hidden">
        {loadError}
      </div>
    );
  }

  return (
    <div className="print:hidden">
      {/* Header */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6B6B6B]">
          Customer assets
          <span className="ml-2 normal-case tracking-normal text-[#A0A0A0]">
            {attachedCount} on this quote · {assets.length} total
          </span>
        </h3>
        {!isLocked && editing === null && (
          <button
            type="button"
            onClick={openNew}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#2F8F5C] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#287a4e]"
          >
            <Plus className="h-3.5 w-3.5" /> Add asset
          </button>
        )}
      </div>

      {/* Add / edit form */}
      {editing !== null && (
        <div className="mb-4 rounded-[10px] border border-[#E6E1D4] bg-[#FAF8F2] p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#6B6B6B]">{editing === "new" ? "New asset" : "Edit asset"}</p>
            <button type="button" onClick={closeForm} className="text-[#A0A0A0] hover:text-[#C44545]" aria-label="Cancel"><X className="h-4 w-4" /></button>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="sm:col-span-2 lg:col-span-1">
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[#6B6B6B]">Name *</span>
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Rooftop inverter" className={INPUT} />
            </label>
            <label>
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[#6B6B6B]">Type</span>
              <input list="asset-type-options" value={form.assetType} onChange={(e) => setForm((f) => ({ ...f, assetType: e.target.value }))} placeholder="e.g. Solar Inverter" className={INPUT} />
              <datalist id="asset-type-options">{ASSET_TYPES.map((t) => <option key={t} value={t} />)}</datalist>
            </label>
            <label>
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[#6B6B6B]">Make</span>
              <input value={form.make} onChange={(e) => setForm((f) => ({ ...f, make: e.target.value }))} className={INPUT} />
            </label>
            <label>
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[#6B6B6B]">Model</span>
              <input value={form.model} onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))} className={INPUT} />
            </label>
            <label>
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[#6B6B6B]">Serial no.</span>
              <input value={form.serial} onChange={(e) => setForm((f) => ({ ...f, serial: e.target.value }))} className={INPUT} />
            </label>
            <label>
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[#6B6B6B]">Location</span>
              <input value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} placeholder="e.g. Roof, north array" className={INPUT} />
            </label>
            <label>
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[#6B6B6B]">Installed</span>
              <input type="date" value={form.installDate} onChange={(e) => setForm((f) => ({ ...f, installDate: e.target.value }))} className={INPUT} />
            </label>
            <label>
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[#6B6B6B]">Warranty until</span>
              <input type="date" value={form.warrantyUntil} onChange={(e) => setForm((f) => ({ ...f, warrantyUntil: e.target.value }))} className={INPUT} />
            </label>
            <label className="sm:col-span-2 lg:col-span-3">
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[#6B6B6B]">Notes</span>
              <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} className={`${INPUT} resize-none`} />
            </label>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={closeForm} className="rounded-md border border-[#E6E1D4] bg-white px-3 py-1.5 text-xs font-semibold text-[#3A3A3A] hover:bg-white/70">Cancel</button>
            <button type="button" onClick={() => void handleSave()} disabled={saving || !form.name.trim()} className="inline-flex items-center gap-1.5 rounded-md bg-[#2F8F5C] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#287a4e] disabled:opacity-60">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              {editing === "new" ? "Add asset" : "Save"}
            </button>
          </div>
        </div>
      )}

      {/* Asset cards */}
      {assets.length === 0 ? (
        <div className="rounded-[10px] border border-dashed border-[#D8D2C4] bg-[#FAF8F2] px-4 py-10 text-center text-sm text-[#A0A0A0]">
          No assets recorded for this customer yet. Add the equipment you install or service so it&rsquo;s ready to attach to quotes and jobs.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {assets.map((a) => {
            const on = attachedIds.has(a.id);
            const details: { label: string; value: string }[] = [];
            if (a.make || a.model) details.push({ label: "Make / model", value: [a.make, a.model].filter(Boolean).join(" ") });
            if (a.serial) details.push({ label: "Serial", value: a.serial });
            if (a.location) details.push({ label: "Location", value: a.location });
            if (a.installDate) details.push({ label: "Installed", value: fmtDate(a.installDate) });
            if (a.warrantyUntil) details.push({ label: "Warranty", value: fmtDate(a.warrantyUntil) });
            return (
              <div
                key={a.id}
                className={`flex flex-col rounded-[10px] border bg-white p-3.5 ${on ? "border-[#2F8F5C] ring-1 ring-[#2F8F5C]" : "border-[#E6E1D4]"}`}
              >
                <div className="mb-2 flex items-start gap-2">
                  <Package className={`mt-0.5 h-4 w-4 shrink-0 ${on ? "text-[#2F8F5C]" : "text-[#A0A0A0]"}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[#1A1A1A]">{a.name}</p>
                    {a.assetType && <span className="mt-0.5 inline-block rounded-full bg-[#F0EDE4] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[#6B6B6B]">{a.assetType}</span>}
                  </div>
                  {on && <span className="shrink-0 rounded-full bg-[#E5F2EA] px-2 py-0.5 text-[10px] font-semibold text-[#246F47]">On this quote</span>}
                </div>

                {details.length > 0 && (
                  <dl className="mb-3 space-y-0.5 text-xs">
                    {details.map((d) => (
                      <div key={d.label} className="flex gap-2">
                        <dt className="w-24 shrink-0 text-[#A0A0A0]">{d.label}</dt>
                        <dd className="min-w-0 flex-1 truncate text-[#3A3A3A]">{d.value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {a.notes && <p className="mb-3 line-clamp-2 text-xs italic text-[#6B6B6B]">{a.notes}</p>}

                <div className="mt-auto flex items-center justify-between gap-2 border-t border-[#EFEBE0] pt-2.5">
                  {isLocked ? (
                    <span className="text-xs text-[#A0A0A0]">{on ? "On this quote" : "Not attached"}</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void toggleAttach(a)}
                      disabled={busyId === a.id}
                      className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold disabled:opacity-60 ${
                        on ? "border border-[#2F8F5C] bg-[#E5F2EA] text-[#246F47]" : "border border-[#E6E1D4] bg-white text-[#2F8F5C] hover:bg-[#FAF8F2]"
                      }`}
                    >
                      {busyId === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : on ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                      {on ? "Attached" : "Attach"}
                    </button>
                  )}
                  {!isLocked && (
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => openEdit(a)} className="rounded p-1 text-[#A0A0A0] hover:text-[#2F8F5C]" aria-label="Edit asset"><Pencil className="h-3.5 w-3.5" /></button>
                      <button type="button" onClick={() => void handleDelete(a)} disabled={busyId === a.id} className="rounded p-1 text-[#A0A0A0] hover:text-[#C44545] disabled:opacity-50" aria-label="Delete asset"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

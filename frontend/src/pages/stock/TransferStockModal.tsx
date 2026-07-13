// ─────────────────────────────────────────────────────────────────────────────
// pages/stock/TransferStockModal.tsx — move stock between two locations (e.g.
// factory → van) as a paired movement. Shared by the Restock dashboard and the
// Locations drill-in ("Transfer from here" prefills the source).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { Loader2, ArrowLeftRight, X } from "lucide-react";

import MotionDrawer from "../../components/ui/MotionDrawer";
import { btnPrimary, btnGhost, inputField } from "../gantt/components/ledger";
import { listStockLocations, transferStock, type StockLocation, type LocationType } from "../../lib/api/stock";
import { listMaterials, type Material } from "../../lib/api/materials";
import { fmtQty } from "../../lib/format";

// Locations grouped by type so long lists stay scannable (mig 96 adds sites/storage).
const GROUP_ORDER: { type: LocationType; label: string }[] = [
  { type: "factory", label: "Factory" },
  { type: "van", label: "Vans" },
  { type: "site", label: "Sites" },
  { type: "storage", label: "Storage" },
];

function LocationOptions({ locations }: { locations: StockLocation[] }) {
  return (
    <>
      {GROUP_ORDER.map(({ type, label }) => {
        const group = locations.filter((l) => l.type === type);
        if (group.length === 0) return null;
        return (
          <optgroup key={type} label={label}>
            {group.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </optgroup>
        );
      })}
    </>
  );
}

interface Props {
  open: boolean;
  onClose: () => void;
  onDone: (msg: string) => void;
  /** Prefill the source location (the Locations drill-in passes itself). */
  defaultFrom?: string;
}

export default function TransferStockModal({ open, onClose, onDone, defaultFrom }: Props) {
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
    setError(null); setFrom(defaultFrom ?? ""); setTo(""); setMaterialId(""); setQty("");
    void Promise.all([listStockLocations().catch(() => []), listMaterials().catch(() => [])]).then(([locs, mats]) => {
      setLocations(locs);
      setItems(mats.filter((m) => m.isStockItem));
      // The prefill can point at an archived location (opened from its detail
      // page) — a hidden `from` would let stock move from an invisible source.
      if (defaultFrom && !locs.some((l) => l.id === defaultFrom)) setFrom("");
    });
  }, [open, defaultFrom]);

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
              <LocationOptions locations={locations} />
            </select>
          </label>
          <label><span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">To</span>
            <select value={to} onChange={(e) => setTo(e.target.value)} className={inputField}>
              <option value="">Choose…</option>
              <LocationOptions locations={locations} />
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

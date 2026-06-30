// ─────────────────────────────────────────────────────────────────────────────
// pages/stock/StockSettingsView.tsx — manager stock settings: per-item minimums
// (min / target / preferred wholesaler / auto-reorder on), plus the nominated
// stock controller who gets restock alerts. Phase 2.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { Loader2, Bell } from "lucide-react";

import { Toaster } from "../../components/ui/Toaster";
import { cardShell, inputField } from "../gantt/components/ledger";
import { listMaterials, type Material } from "../../lib/api/materials";
import { listSuppliers, type Supplier } from "../../lib/api/suppliers";
import { listProfilesByRole } from "../../lib/api/profiles";
import {
  listReorderRules, upsertReorderRule, getStockSettings, updateStockSettings, type ReorderRule,
} from "../../lib/api/purchasing";
import type { Profile, SecurityGroup } from "../../types";

const INTERNAL_GROUPS: SecurityGroup[] = ["company_admin", "construction_mgr", "project_manager", "worker", "dev"];
const fullName = (p: Profile) => `${p.firstName} ${p.lastName}`.trim() || p.email;

type ToastState = { message: string; type: "success" | "error" | "info" } | null;

export default function StockSettingsView() {
  const [items, setItems] = useState<Material[]>([]);
  const [rules, setRules] = useState<Map<string, ReorderRule>>(new Map());
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [staff, setStaff] = useState<Profile[]>([]);
  const [controllerId, setControllerId] = useState("");
  const [autoSend, setAutoSend] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<ToastState>(null);
  // local edit buffers for the number inputs (keyed materialId)
  const [edits, setEdits] = useState<Record<string, { min?: string; target?: string }>>({});

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      listMaterials().then((m) => m.filter((x) => x.isStockItem)),
      listReorderRules(),
      listSuppliers(),
      listProfilesByRole(INTERNAL_GROUPS),
      getStockSettings(),
    ])
      .then(([mats, rls, sups, profs, settings]) => {
        if (cancelled) return;
        setItems(mats);
        setRules(new Map(rls.map((r) => [r.materialId, r])));
        setSuppliers(sups);
        setStaff(profs);
        setControllerId(settings.stockControllerId ?? "");
        setAutoSend(settings.autoSend);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  function ruleFor(id: string): ReorderRule {
    return rules.get(id) ?? { materialId: id, minQty: 0, targetQty: 0, supplierId: null, reorderEnabled: true };
  }

  async function saveRule(materialId: string, patch: Parameters<typeof upsertReorderRule>[1]) {
    const next = { ...ruleFor(materialId), ...patch } as ReorderRule;
    setRules((prev) => new Map(prev).set(materialId, next));
    try {
      await upsertReorderRule(materialId, patch);
    } catch (ex) {
      setToast({ message: ex instanceof Error ? ex.message : "Failed to save", type: "error" });
    }
  }

  async function saveSettings(patch: { stockControllerId?: string | null; autoSend?: boolean }) {
    try {
      await updateStockSettings(patch);
      setToast({ message: "Settings saved.", type: "success" });
    } catch (ex) {
      setToast({ message: ex instanceof Error ? ex.message : "Failed to save settings", type: "error" });
    }
  }

  if (loading) {
    return <div className={`flex items-center gap-2 px-5 py-8 text-sm text-[#A0A0A0] ${cardShell}`}><Loader2 className="h-4 w-4 animate-spin" /> Loading settings…</div>;
  }

  return (
    <div className="space-y-4">
      {/* Restock alerts */}
      <div className={`px-5 py-4 ${cardShell}`}>
        <p className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6B6B6B]"><Bell className="h-3.5 w-3.5" /> Restock alerts</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label>
            <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[#6B6B6B]">Stock controller (gets restock alerts)</span>
            <select
              value={controllerId}
              onChange={(e) => { setControllerId(e.target.value); void saveSettings({ stockControllerId: e.target.value || null }); }}
              className={inputField}
            >
              <option value="">Nobody yet</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{fullName(s)}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-[#3A3A3A]">
            <input
              type="checkbox"
              checked={autoSend}
              onChange={(e) => { setAutoSend(e.target.checked); void saveSettings({ autoSend: e.target.checked }); }}
              className="h-4 w-4 accent-[#2F8F5C]"
            />
            Auto-send restock orders to the wholesaler (no review) — Phase 3
          </label>
        </div>
      </div>

      {/* Per-item minimums */}
      <div className={`overflow-x-auto ${cardShell}`}>
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-[#E6E1D4] bg-[#FAF8F2]">
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Item</th>
              <th className="w-24 px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Min</th>
              <th className="w-24 px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Target</th>
              <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Preferred wholesaler</th>
              <th className="w-20 px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Auto-reorder</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EFEBE0]">
            {items.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-[#A0A0A0]">No stock items yet — flag materials as stocked in Catalogue → Materials.</td></tr>
            )}
            {items.map((m) => {
              const r = ruleFor(m.id);
              const buf = edits[m.id] ?? {};
              return (
                <tr key={m.id} className="hover:bg-[#FAF8F2]">
                  <td className="px-4 py-2 text-[#1A1A1A]">{m.name}{m.sku && <span className="ml-2 text-[11px] text-[#A0A0A0]">{m.sku}</span>}</td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number" min={0} step="any" inputMode="decimal"
                      value={buf.min ?? String(r.minQty)}
                      onChange={(e) => setEdits((p) => ({ ...p, [m.id]: { ...p[m.id], min: e.target.value } }))}
                      onBlur={(e) => void saveRule(m.id, { minQty: parseFloat(e.target.value) || 0 })}
                      className={`${inputField} w-20 text-right tabular-nums`}
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number" min={0} step="any" inputMode="decimal"
                      value={buf.target ?? String(r.targetQty)}
                      onChange={(e) => setEdits((p) => ({ ...p, [m.id]: { ...p[m.id], target: e.target.value } }))}
                      onBlur={(e) => void saveRule(m.id, { targetQty: parseFloat(e.target.value) || 0 })}
                      className={`${inputField} w-20 text-right tabular-nums`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={r.supplierId ?? ""}
                      onChange={(e) => void saveRule(m.id, { supplierId: e.target.value || null })}
                      className={inputField}
                    >
                      <option value="">—</option>
                      {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={r.reorderEnabled}
                      onChange={(e) => void saveRule(m.id, { reorderEnabled: e.target.checked })}
                      className="h-4 w-4 accent-[#2F8F5C]"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {toast && <Toaster message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

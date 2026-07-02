// ─────────────────────────────────────────────────────────────────────────────
// pages/stock/StockSettingsView.tsx — manager stock settings: the nominated
// stock controller + per-item reorder rules (min / target / preferred wholesaler
// / auto-reorder) in a searchable, category-grouped table with the current
// on-hand for context, bulk-set tools, and a CSV import (ref,min,target).
// ─────────────────────────────────────────────────────────────────────────────

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Bell, Search, X, Upload, Wand2 } from "lucide-react";

import { Toaster } from "../../components/ui/Toaster";
import { cardShell, inputField, btnGhost } from "../gantt/components/ledger";
import { listMaterials, type Material } from "../../lib/api/materials";
import { listSuppliers, type Supplier } from "../../lib/api/suppliers";
import { listProfilesByRole } from "../../lib/api/profiles";
import { getCompanyTotals, type CompanyTotal } from "../../lib/api/stock";
import {
  listReorderRules, upsertReorderRule, getStockSettings, updateStockSettings, type ReorderRule,
} from "../../lib/api/purchasing";
import type { Profile, SecurityGroup } from "../../types";

const INTERNAL_GROUPS: SecurityGroup[] = ["company_admin", "construction_mgr", "project_manager", "worker", "dev"];
const fullName = (p: Profile) => `${p.firstName} ${p.lastName}`.trim() || p.email;
const fmtQty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
const OTHER_GROUP = "Other";

type ToastState = { message: string; type: "success" | "error" | "info" } | null;

export default function StockSettingsView() {
  const [items, setItems] = useState<Material[]>([]);
  const [rules, setRules] = useState<Map<string, ReorderRule>>(new Map());
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [staff, setStaff] = useState<Profile[]>([]);
  const [onHand, setOnHand] = useState<Map<string, CompanyTotal>>(new Map());
  const [controllerId, setControllerId] = useState("");
  const [autoSend, setAutoSend] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<ToastState>(null);
  const [search, setSearch] = useState("");
  const [edits, setEdits] = useState<Record<string, { min?: string; target?: string }>>({});
  // bulk-set toolbar
  const [bulkMin, setBulkMin] = useState("");
  const [bulkTarget, setBulkTarget] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      listMaterials().then((m) => m.filter((x) => x.isStockItem)),
      listReorderRules(),
      listSuppliers(),
      listProfilesByRole(INTERNAL_GROUPS),
      getStockSettings(),
      getCompanyTotals().catch(() => [] as CompanyTotal[]),
    ])
      .then(([mats, rls, sups, profs, settings, totals]) => {
        if (cancelled) return;
        setItems(mats);
        setRules(new Map(rls.map((r) => [r.materialId, r])));
        setSuppliers(sups);
        setStaff(profs);
        setControllerId(settings.stockControllerId ?? "");
        setAutoSend(settings.autoSend);
        setOnHand(new Map(totals.map((t) => [t.materialId, t])));
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

  // ── Search + grouping ──────────────────────────────────────────────────────
  const term = search.trim().toLowerCase();
  const shown = useMemo(
    () => (term ? items.filter((m) => m.name.toLowerCase().includes(term) || (m.sku ?? "").toLowerCase().includes(term)) : items),
    [items, term],
  );
  const groups = useMemo(() => {
    const by = new Map<string, Material[]>();
    for (const m of shown) {
      const cat = m.category?.trim() || OTHER_GROUP;
      const arr = by.get(cat);
      if (arr) arr.push(m); else by.set(cat, [m]);
    }
    return [...by.entries()]
      .sort((a, b) => (a[0] === OTHER_GROUP ? 1 : b[0] === OTHER_GROUP ? -1 : a[0].localeCompare(b[0])))
      .map(([cat, mats]) => ({ cat, mats: [...mats].sort((a, b) => a.name.localeCompare(b.name)) }));
  }, [shown]);

  // ── Bulk actions ───────────────────────────────────────────────────────────
  async function applyBulk(mats: Material[], patch: Parameters<typeof upsertReorderRule>[1], label: string) {
    if (mats.length === 0) return;
    setBulkBusy(true);
    try {
      for (const m of mats) {
        // Sequential to keep the toasts/faults simple; volumes are small.
        // eslint-disable-next-line no-await-in-loop
        await upsertReorderRule(m.id, patch);
      }
      setRules((prev) => {
        const next = new Map(prev);
        for (const m of mats) next.set(m.id, { ...(next.get(m.id) ?? { materialId: m.id, minQty: 0, targetQty: 0, supplierId: null, reorderEnabled: true }), ...patch } as ReorderRule);
        return next;
      });
      setToast({ message: `${label} applied to ${mats.length} item${mats.length === 1 ? "" : "s"}.`, type: "success" });
    } catch (ex) {
      setToast({ message: ex instanceof Error ? ex.message : "Bulk update failed", type: "error" });
    } finally {
      setBulkBusy(false);
    }
  }

  function handleBulkSet() {
    const min = parseFloat(bulkMin);
    const target = parseFloat(bulkTarget);
    const patch: Parameters<typeof upsertReorderRule>[1] = {};
    if (Number.isFinite(min)) patch.minQty = min;
    if (Number.isFinite(target)) patch.targetQty = target;
    if (Object.keys(patch).length === 0) { setToast({ message: "Enter a min and/or target to apply.", type: "error" }); return; }
    void applyBulk(shown, patch, "Min/target");
  }

  // ── CSV import: ref(min sku or name), min, target ──────────────────────────
  function importCsv(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      let applied = 0;
      const misses: string[] = [];
      void (async () => {
        for (const [i, line] of lines.entries()) {
          const cols = line.split(",").map((c) => c.replace(/^"|"$/g, "").trim());
          if (i === 0 && /^(ref|sku|name|item)$/i.test(cols[0] ?? "")) continue; // header
          const [ref, minS, targetS] = cols;
          if (!ref) continue;
          const min = parseFloat(minS ?? "");
          const target = parseFloat(targetS ?? "");
          if (!Number.isFinite(min) && !Number.isFinite(target)) { misses.push(`${ref} (no numbers)`); continue; }
          const lower = ref.toLowerCase();
          const mat = items.find((m) => (m.sku ?? "").toLowerCase() === lower) ?? items.find((m) => m.name.toLowerCase() === lower);
          if (!mat) { misses.push(ref); continue; }
          const patch: Parameters<typeof upsertReorderRule>[1] = {};
          if (Number.isFinite(min)) patch.minQty = min;
          if (Number.isFinite(target)) patch.targetQty = target;
          // eslint-disable-next-line no-await-in-loop
          await upsertReorderRule(mat.id, patch).catch(() => misses.push(ref));
          setRules((prev) => new Map(prev).set(mat.id, { ...(prev.get(mat.id) ?? { materialId: mat.id, minQty: 0, targetQty: 0, supplierId: null, reorderEnabled: true }), ...patch } as ReorderRule));
          applied += 1;
        }
        setToast({
          message: `Imported ${applied} rule${applied === 1 ? "" : "s"}.${misses.length ? ` Skipped: ${misses.slice(0, 5).join(", ")}${misses.length > 5 ? "…" : ""}` : ""}`,
          type: misses.length ? "info" : "success",
        });
      })();
    };
    reader.readAsText(file);
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
            Auto-send restock orders to the wholesaler (no review) — future
          </label>
        </div>
      </div>

      {/* Toolbar: search + bulk + import */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A0A0A0]" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search item or SKU…"
            className="w-full rounded-md border border-[#E6E1D4] bg-white py-2 pl-9 pr-9 text-sm focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]" />
          {search && <button type="button" onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-[#A0A0A0] hover:text-[#C44545]" aria-label="Clear"><X className="h-4 w-4" /></button>}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Bulk set{term ? " (shown)" : ""}:</span>
          <input type="number" min={0} step="any" inputMode="decimal" value={bulkMin} onChange={(e) => setBulkMin(e.target.value)} placeholder="Min" className={`${inputField} w-20 text-right tabular-nums`} />
          <input type="number" min={0} step="any" inputMode="decimal" value={bulkTarget} onChange={(e) => setBulkTarget(e.target.value)} placeholder="Target" className={`${inputField} w-20 text-right tabular-nums`} />
          <button type="button" onClick={handleBulkSet} disabled={bulkBusy || shown.length === 0} className={btnGhost}>
            {bulkBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />} Apply to {shown.length}
          </button>
          <button type="button" onClick={() => fileRef.current?.click()} className={btnGhost}><Upload className="h-4 w-4" /> Import CSV</button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importCsv(f); e.target.value = ""; }} />
        </div>
      </div>
      <p className="-mt-2 text-[11px] text-[#A0A0A0]">CSV format: <code>sku-or-name, min, target</code> — one item per line (header row optional).</p>

      {/* Per-item rules, grouped by category */}
      <div className={`overflow-x-auto ${cardShell}`}>
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-[#E6E1D4] bg-[#FAF8F2]">
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Item</th>
              <th className="w-24 px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]">On hand</th>
              <th className="w-24 px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Min</th>
              <th className="w-24 px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Target</th>
              <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Preferred wholesaler</th>
              <th className="w-20 px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Auto-reorder</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EFEBE0]">
            {shown.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-[#A0A0A0]">
                {items.length === 0 ? "No stock items yet — flag materials as stocked in Catalogue → Materials." : "Nothing matches this search."}
              </td></tr>
            )}
            {groups.map((g) => (
              <Fragment key={g.cat}>
                <tr className="bg-[#FAF8F2]">
                  <td colSpan={4} className="px-3 py-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">{g.cat}</span>
                    <span className="ml-1.5 rounded-full bg-[#E6E1D4] px-1.5 text-[11px] font-semibold tabular-nums text-[#6B6B6B]">{g.mats.length}</span>
                  </td>
                  <td colSpan={2} className="px-3 py-1.5 text-right">
                    <button type="button" disabled={bulkBusy} onClick={() => void applyBulk(g.mats, { reorderEnabled: true }, "Auto-reorder ON")} className="mr-2 text-[11px] font-semibold text-[#2F8F5C] hover:underline disabled:opacity-50">Enable all</button>
                    <button type="button" disabled={bulkBusy} onClick={() => void applyBulk(g.mats, { reorderEnabled: false }, "Auto-reorder OFF")} className="text-[11px] font-semibold text-[#A0A0A0] hover:text-[#C44545] hover:underline disabled:opacity-50">Disable all</button>
                  </td>
                </tr>
                {g.mats.map((m) => {
                  const r = ruleFor(m.id);
                  const buf = edits[m.id] ?? {};
                  const oh = onHand.get(m.id)?.total ?? 0;
                  const low = r.reorderEnabled && r.minQty > 0 && oh < r.minQty;
                  return (
                    <tr key={m.id} className="hover:bg-[#FAF8F2]">
                      <td className="px-4 py-2 text-[#1A1A1A]">{m.name}{m.sku && <span className="ml-2 text-[11px] text-[#A0A0A0]">{m.sku}</span>}</td>
                      <td className={`px-3 py-2 text-right tabular-nums ${low ? "text-[#C44545]" : "text-[#6B6B6B]"}`}>{fmtQty(oh)} <span className="text-[11px] text-[#A0A0A0]">{m.unit}</span></td>
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
                        <select value={r.supplierId ?? ""} onChange={(e) => void saveRule(m.id, { supplierId: e.target.value || null })} className={inputField}>
                          <option value="">—</option>
                          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <input type="checkbox" checked={r.reorderEnabled} onChange={(e) => void saveRule(m.id, { reorderEnabled: e.target.checked })} className="h-4 w-4 accent-[#2F8F5C]" />
                      </td>
                    </tr>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {toast && <Toaster message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// pages/stock/ReorderRulesEditor.tsx — the per-item reorder rules editor
// (min / target / preferred wholesaler / auto-reorder) in a searchable,
// category-grouped accordion with on-hand context, bulk-set tools, and a CSV
// import (ref,min,target). Extracted VERBATIM from StockSettingsView (P9.BS
// WS4) so it can live on the Restock tab where the work actually happens.
//
// Two load-bearing invariants carried over unchanged:
//   • renderRuleRow stays a PLAIN FUNCTION, not a component — the controlled
//     min/target inputs must never remount mid-keystroke;
//   • the save-on-blur `edits` buffer contract: onChange writes only the
//     buffer, onBlur persists via upsertReorderRule with an optimistic map set.
//
// Toasts route through the parent (one Toaster per tab); rule saves notify the
// parent so the low-stock table above can refetch.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Search, X, Upload, Wand2, ChevronDown } from "lucide-react";

import type { ToastState } from "../../components/ui/Toaster";
import NewSupplierMiniModal from "./NewSupplierMiniModal";
import { cardShell, btnGhost, StatusPill, FRAUNCES } from "../gantt/components/ledger";
import { cn } from "../../lib/cn";
import { listMaterials, type Material } from "../../lib/api/materials";
import { listSuppliers, type Supplier } from "../../lib/api/suppliers";
import { getCompanyTotals, type CompanyTotal } from "../../lib/api/stock";
import { listReorderRules, upsertReorderRule, type ReorderRule } from "../../lib/api/purchasing";
import { fmtQty } from "../../lib/format";

const OTHER_GROUP = "Other";
const NEW_SUPPLIER_SENTINEL = "__new__";

// ── Mock-aligned chrome (test.html settings tab) ─────────────────────────────
const card16 = cn(cardShell, "rounded-[16px]");
const ruleGrid = "grid grid-cols-[minmax(0,1.6fr)_90px_80px_80px_minmax(0,1.1fr)_100px] items-center gap-2.5";
const numCell =
  "w-16 rounded-[8px] border border-[#E6E1D4] bg-white px-2 py-1.5 text-center text-[12.5px] tabular-nums text-[#1A1A1A] focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]";
const selCell =
  "w-full rounded-[8px] border border-[#E6E1D4] bg-white px-2 py-1.5 text-[12px] text-[#3A3A3A] focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]";
const searchPill =
  "flex items-center gap-2 rounded-full border border-[#E6E1D4] bg-white px-3.5 py-2 transition-colors focus-within:border-[#2F8F5C] focus-within:ring-1 focus-within:ring-[#2F8F5C]";
const searchInput = "min-w-0 flex-1 border-none bg-transparent text-[13.5px] text-[#1A1A1A] outline-none placeholder:text-[#C0BAB0]";
const segBtn = (active: boolean) =>
  cn(
    "rounded-full px-4 py-2 text-[13px] font-semibold transition-colors",
    active ? "bg-white text-[#1A1A1A] shadow-[0_1px_2px_rgba(20,20,20,0.08)]" : "text-[#6B6B6B] hover:text-[#3A3A3A]",
  );

interface Props {
  onToast: (t: ToastState) => void;
  /** Fired after any rule write lands so the parent's low-stock table refetches. */
  onRulesChanged?: () => void;
}

export default function ReorderRulesEditor({ onToast, onRulesChanged }: Props) {
  const [items, setItems] = useState<Material[]>([]);
  const [rules, setRules] = useState<Map<string, ReorderRule>>(new Map());
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [onHand, setOnHand] = useState<Map<string, CompanyTotal>>(new Map());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [edits, setEdits] = useState<Record<string, { min?: string; target?: string }>>({});
  // bulk-set toolbar
  const [bulkMin, setBulkMin] = useState("");
  const [bulkTarget, setBulkTarget] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  // Presentational only: Browse | Bulk edit segments + category accordion state.
  const [mode, setMode] = useState<"browse" | "bulk">("browse");
  const [expandedCats, setExpandedCats] = useState<Record<string, boolean>>({});
  const [showAllCats, setShowAllCats] = useState<Record<string, boolean>>({});
  // Wholesaler quick-add: which material's row triggered the mini modal.
  const [newSupplierFor, setNewSupplierFor] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      listMaterials().then((m) => m.filter((x) => x.isStockItem)),
      listReorderRules(),
      listSuppliers(),
      getCompanyTotals().catch(() => [] as CompanyTotal[]),
    ])
      .then(([mats, rls, sups, totals]) => {
        if (cancelled) return;
        setItems(mats);
        setRules(new Map(rls.map((r) => [r.materialId, r])));
        setSuppliers(sups);
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
      onRulesChanged?.();
    } catch (ex) {
      onToast({ message: ex instanceof Error ? ex.message : "Failed to save", type: "error" });
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
      onToast({ message: `${label} applied to ${mats.length} item${mats.length === 1 ? "" : "s"}.`, type: "success" });
      onRulesChanged?.();
    } catch (ex) {
      onToast({ message: ex instanceof Error ? ex.message : "Bulk update failed", type: "error" });
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
    if (Object.keys(patch).length === 0) { onToast({ message: "Enter a min and/or target to apply.", type: "error" }); return; }
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
        onToast({
          message: `Imported ${applied} rule${applied === 1 ? "" : "s"}.${misses.length ? ` Skipped: ${misses.slice(0, 5).join(", ")}${misses.length > 5 ? "…" : ""}` : ""}`,
          type: misses.length ? "info" : "success",
        });
        onRulesChanged?.();
      })();
    };
    reader.readAsText(file);
  }

  // Below-min test — same predicate the row highlight uses (real data only).
  function isBelowMin(m: Material): boolean {
    const r = ruleFor(m.id);
    const oh = onHand.get(m.id)?.total ?? 0;
    return r.reorderEnabled && r.minQty > 0 && oh < r.minQty;
  }

  // ── Rule-row chrome (plain function, NOT a component — the controlled
  //    min/target inputs must never remount mid-keystroke) ────────────────────
  const ruleHeader = (
    <div className={cn(ruleGrid, "border-y border-[#E6E1D4] bg-[#FAF8F2] px-5 py-[9px] text-[10px] font-bold uppercase tracking-[0.06em] text-[#6B6B6B]")}>
      <span>Item</span><span>On hand</span><span>Min</span><span>Target</span><span>Preferred wholesaler</span><span className="text-center">Auto-reorder</span>
    </div>
  );

  function renderRuleRow(m: Material, showCat: boolean) {
    const r = ruleFor(m.id);
    const buf = edits[m.id] ?? {};
    const oh = onHand.get(m.id)?.total ?? 0;
    const low = r.reorderEnabled && r.minQty > 0 && oh < r.minQty;
    const meta = showCat ? [m.sku, m.category?.trim() || OTHER_GROUP].filter(Boolean).join(" · ") : m.sku;
    return (
      <div key={m.id} className={cn(ruleGrid, "border-b border-[#EFEBE0] px-5 py-[9px] text-[13px] last:border-b-0")}>
        <span className="min-w-0">
          <span className="block truncate font-semibold text-[#1A1A1A]">{m.name}</span>
          {meta && <span className="block truncate text-[11px] text-[#A0A0A0]">{meta}</span>}
        </span>
        <span className={cn("tabular-nums font-semibold", low ? "text-[#C44545]" : "text-[#3A3A3A]")}>
          {fmtQty(oh)} <span className="text-[11px] font-normal text-[#A0A0A0]">{m.unit}</span>
        </span>
        <input
          type="number" min={0} step="any" inputMode="decimal"
          aria-label={`Minimum for ${m.name}`}
          value={buf.min ?? String(r.minQty)}
          onChange={(e) => setEdits((p) => ({ ...p, [m.id]: { ...p[m.id], min: e.target.value } }))}
          onBlur={(e) => void saveRule(m.id, { minQty: parseFloat(e.target.value) || 0 })}
          className={numCell}
        />
        <input
          type="number" min={0} step="any" inputMode="decimal"
          aria-label={`Target for ${m.name}`}
          value={buf.target ?? String(r.targetQty)}
          onChange={(e) => setEdits((p) => ({ ...p, [m.id]: { ...p[m.id], target: e.target.value } }))}
          onBlur={(e) => void saveRule(m.id, { targetQty: parseFloat(e.target.value) || 0 })}
          className={numCell}
        />
        <select
          value={r.supplierId ?? ""}
          onChange={(e) => {
            if (e.target.value === NEW_SUPPLIER_SENTINEL) { setNewSupplierFor(m.id); return; }
            void saveRule(m.id, { supplierId: e.target.value || null });
          }}
          aria-label={`Preferred wholesaler for ${m.name}`}
          className={selCell}
        >
          <option value="">—</option>
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          <option value={NEW_SUPPLIER_SENTINEL}>+ New wholesaler…</option>
        </select>
        <span className="flex justify-center">
          <label className="relative inline-block h-5 w-[34px] cursor-pointer before:absolute before:-inset-3 before:content-['']">
            <input
              type="checkbox" role="switch" aria-checked={r.reorderEnabled}
              aria-label={`Auto-reorder ${m.name}`}
              checked={r.reorderEnabled}
              onChange={(e) => void saveRule(m.id, { reorderEnabled: e.target.checked })}
              className="peer sr-only"
            />
            <span
              aria-hidden
              className="absolute inset-0 rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-[#2F8F5C] peer-focus-visible:ring-offset-2"
              style={{ background: r.reorderEnabled ? "#2F8F5C" : "#D8D2C4" }}
            />
            <span
              aria-hidden
              className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.25)] transition-[left]"
              style={{ left: r.reorderEnabled ? 16 : 2 }}
            />
          </label>
        </span>
      </div>
    );
  }

  if (loading) {
    return <div className={cn(card16, "flex items-center gap-2 px-5 py-8 text-sm text-[#A0A0A0]")}><Loader2 className="h-4 w-4 animate-spin" /> Loading minimums…</div>;
  }

  return (
    <div className="space-y-4">
      {/* Browse | Bulk edit segments */}
      <div className="inline-flex items-center gap-0.5 rounded-full border border-[#E6E1D4] bg-[#FAF8F2] p-[3px]">
        <button type="button" onClick={() => setMode("browse")} aria-pressed={mode === "browse"} className={segBtn(mode === "browse")}>Browse</button>
        <button type="button" onClick={() => setMode("bulk")} aria-pressed={mode === "bulk"} className={segBtn(mode === "bulk")}>Bulk edit</button>
      </div>

      {mode === "browse" && (
        <>
          {/* Search */}
          <div className={cn(searchPill, "max-w-[420px]")}>
            <Search className="h-4 w-4 flex-shrink-0 text-[#A0A0A0]" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search item or SKU…" className={searchInput} />
            {search && <button type="button" onClick={() => setSearch("")} className="rounded-full p-0.5 text-[#A0A0A0] transition-colors hover:text-[#C44545]" aria-label="Clear"><X className="h-4 w-4" /></button>}
          </div>

          {shown.length === 0 && (
            <div className={cn(card16, "px-5 py-10 text-center text-sm text-[#A0A0A0]")}>
              {items.length === 0 ? "No stock items yet — flag materials as stocked in Catalogue → Materials." : "Nothing matches this search."}
            </div>
          )}

          {/* Search entered → flat results */}
          {shown.length > 0 && term && (
            <div className={cn(card16, "overflow-hidden")}>
              <div className="overflow-x-auto">
                <div className="min-w-[700px]">
                  {ruleHeader}
                  <div className="max-h-[420px] overflow-y-auto">
                    {shown.map((m) => renderRuleRow(m, true))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* No search → category accordion cards */}
          {shown.length > 0 && !term && (
            <div className="flex flex-col gap-2.5">
              {groups.map((g) => {
                const below = g.mats.filter(isBelowMin).length;
                const isOpen = expandedCats[g.cat] ?? below > 0;
                const showAll = !!showAllCats[g.cat];
                const visible = showAll ? g.mats : g.mats.slice(0, 5);
                return (
                  <div key={g.cat} className={cn(card16, "overflow-hidden")}>
                    <button
                      type="button"
                      onClick={() => setExpandedCats((p) => ({ ...p, [g.cat]: !isOpen }))}
                      aria-expanded={isOpen}
                      className="flex min-h-11 w-full items-center justify-between gap-3 px-5 py-3.5 text-left transition-colors hover:bg-[#FAF8F2]"
                    >
                      <span className="flex min-w-0 items-center gap-2.5 text-[13.5px] font-bold text-[#1A1A1A]">
                        <span className="truncate">{g.cat}</span>
                        <span className="rounded-full bg-[#FAF8F2] px-2 py-0.5 text-[11.5px] font-semibold tabular-nums text-[#6B6B6B]" style={{ fontFamily: FRAUNCES }}>{g.mats.length}</span>
                      </span>
                      <span className="flex flex-shrink-0 items-center gap-3.5">
                        {below > 0 && <StatusPill tone="red">{below} below min</StatusPill>}
                        <ChevronDown className={cn("h-4 w-4 text-[#6B6B6B] transition-transform duration-200", isOpen && "rotate-180")} />
                      </span>
                    </button>
                    {isOpen && (
                      <div>
                        <div className="flex justify-end gap-3.5 px-5 pb-2">
                          <button type="button" disabled={bulkBusy} onClick={() => void applyBulk(g.mats, { reorderEnabled: true }, "Auto-reorder ON")} className="text-[11.5px] font-semibold text-[#2F8F5C] transition-colors hover:text-[#246F47] hover:underline disabled:opacity-50">Enable all</button>
                          <button type="button" disabled={bulkBusy} onClick={() => void applyBulk(g.mats, { reorderEnabled: false }, "Auto-reorder OFF")} className="text-[11.5px] font-semibold text-[#6B6B6B] transition-colors hover:text-[#C44545] hover:underline disabled:opacity-50">Disable all</button>
                        </div>
                        <div className="overflow-x-auto">
                          <div className="min-w-[700px]">
                            {ruleHeader}
                            <div className={g.mats.length > 5 ? "max-h-[360px] overflow-y-auto" : undefined}>
                              {visible.map((m) => renderRuleRow(m, false))}
                            </div>
                          </div>
                        </div>
                        {g.mats.length > 5 && (
                          <div className="px-5 py-2.5">
                            <button type="button" onClick={() => setShowAllCats((p) => ({ ...p, [g.cat]: !showAll }))} className="min-h-8 text-[12px] font-semibold text-[#3A3A3A] transition-colors hover:text-[#1A1A1A]">
                              {showAll ? "Show less" : `Show all ${g.mats.length}`}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {mode === "bulk" && (
        <div className={cn(card16, "p-5")}>
          <p className="mb-3.5 text-[13.5px] font-semibold text-[#1A1A1A]">Set Min / Target for many items at once</p>
          <div className="mb-3.5 flex flex-wrap items-center gap-3">
            <div className={cn(searchPill, "min-w-[220px] flex-1")}>
              <Search className="h-4 w-4 flex-shrink-0 text-[#A0A0A0]" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search item or SKU…" className={searchInput} />
              {search && <button type="button" onClick={() => setSearch("")} className="rounded-full p-0.5 text-[#A0A0A0] transition-colors hover:text-[#C44545]" aria-label="Clear"><X className="h-4 w-4" /></button>}
            </div>
            <input
              type="number" min={0} step="any" inputMode="decimal"
              value={bulkMin} onChange={(e) => setBulkMin(e.target.value)} placeholder="Min" aria-label="Bulk minimum"
              className="w-[110px] rounded-[10px] border border-[#E6E1D4] bg-white px-3 py-2 text-[13px] tabular-nums text-[#1A1A1A] placeholder:text-[#C0BAB0] focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]"
            />
            <input
              type="number" min={0} step="any" inputMode="decimal"
              value={bulkTarget} onChange={(e) => setBulkTarget(e.target.value)} placeholder="Target" aria-label="Bulk target"
              className="w-[110px] rounded-[10px] border border-[#E6E1D4] bg-white px-3 py-2 text-[13px] tabular-nums text-[#1A1A1A] placeholder:text-[#C0BAB0] focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button" onClick={handleBulkSet} disabled={bulkBusy || shown.length === 0}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#1A1A1A] px-[18px] py-2 text-[13px] font-semibold text-white transition-colors hover:bg-[#246F47] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {bulkBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />} Apply to {shown.length}
            </button>
            <button type="button" onClick={() => fileRef.current?.click()} className={btnGhost}><Upload className="h-4 w-4" /> Import CSV</button>
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importCsv(f); e.target.value = ""; }} />
          </div>
          <p className="mt-3.5 text-[11.5px] text-[#A0A0A0]">CSV format: <code>sku-or-name, min, target</code> — one item per line (header row optional).</p>
        </div>
      )}

      {/* Wholesaler quick-add — triggered from a row's "+ New wholesaler…" option */}
      <NewSupplierMiniModal
        open={newSupplierFor !== null}
        onClose={() => setNewSupplierFor(null)}
        onCreated={(s) => {
          setSuppliers((prev) => [...prev, s].sort((a, b) => a.name.localeCompare(b.name)));
          if (newSupplierFor) void saveRule(newSupplierFor, { supplierId: s.id });
        }}
      />
    </div>
  );
}

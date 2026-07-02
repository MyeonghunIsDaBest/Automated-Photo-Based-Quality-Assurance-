// ─────────────────────────────────────────────────────────────────────────────
// pages/stock/StockOverview.tsx — manager company-wide view: every item's total
// on hand (Σ factory + vans) with per-location breakdown, headline stats, search,
// All/Low/Out/Favourites filters, sorting, optional group-by-category, per-item
// drill-in, and CSV export. Live.
// ─────────────────────────────────────────────────────────────────────────────

import { Fragment, useEffect, useMemo, useState } from "react";
import { Search, X, Loader2, AlertTriangle, Download, ChevronDown, ChevronRight } from "lucide-react";

import { cardShell, FRAUNCES, MetaChip, TONE, type ToneKey } from "../gantt/components/ledger";
import {
  getCompanyTotals, listStockLocations, subscribeToStockLevels,
  type CompanyTotal, type StockLocation,
} from "../../lib/api/stock";
import { listReorderRules, type ReorderRule } from "../../lib/api/purchasing";
import { listMaterials } from "../../lib/api/materials";
import { downloadCsv } from "../../lib/stock/csv";
import StockItemDrawer from "./StockItemDrawer";
import StockSetupChecklist from "./StockSetupChecklist";

type Filter = "all" | "low" | "out" | "fav";
type SortBy = "name" | "qty" | "value";

interface MatMeta { fav: boolean; category: string | null }

const FILTER_TONE: Record<Filter, ToneKey | null> = { all: null, low: "amber", out: "red", fav: "sage" };
const OTHER_GROUP = "Other";
const fmtQty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
const fmtMoney = (n: number) => "$" + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

export default function StockOverview({ onGoToRestock, onGoToLocations }: { onGoToRestock?: () => void; onGoToLocations?: () => void }) {
  const [totals, setTotals] = useState<CompanyTotal[]>([]);
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [rules, setRules] = useState<Map<string, ReorderRule>>(new Map());
  const [matMeta, setMatMeta] = useState<Map<string, MatMeta>>(new Map());
  const [stockedCount, setStockedCount] = useState(0);
  const [dbError, setDbError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sortBy, setSortBy] = useState<SortBy>("name");
  const [grouped, setGrouped] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const reload = () => { void getCompanyTotals().then((t) => { if (!cancelled) { setTotals(t); setDbError(false); } }).catch(() => {}); };
    setLoading(true);
    // Per-call catches: a missing stock schema (migrations 87–89 not applied)
    // must surface as a setup notice — not masquerade as "0 items".
    let dbFail = false;
    Promise.all([
      getCompanyTotals().catch(() => { dbFail = true; return [] as CompanyTotal[]; }),
      listStockLocations().catch(() => { dbFail = true; return [] as StockLocation[]; }),
      listReorderRules().catch(() => []),
      listMaterials().catch(() => []),
    ])
      .then(([t, locs, rls, mats]) => {
        if (cancelled) return;
        setDbError(dbFail);
        setTotals(t);
        setLocations(locs);
        setRules(new Map(rls.map((r) => [r.materialId, r])));
        setMatMeta(new Map(mats.map((m) => [m.id, { fav: m.isFavourite, category: m.category }])));
        setStockedCount(mats.filter((m) => m.isStockItem).length);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    const unsub = subscribeToStockLevels(null, reload);
    return () => { cancelled = true; unsub(); };
  }, []);

  const isLow = (t: CompanyTotal) => { const r = rules.get(t.materialId); return !!r && r.reorderEnabled && t.total < r.minQty; };
  const isOut = (t: CompanyTotal) => t.total <= 0;
  const isFav = (t: CompanyTotal) => matMeta.get(t.materialId)?.fav ?? false;
  const catOf = (t: CompanyTotal) => matMeta.get(t.materialId)?.category?.trim() || OTHER_GROUP;

  const counts = useMemo(() => ({
    all: totals.length,
    low: totals.filter(isLow).length,
    out: totals.filter(isOut).length,
    fav: totals.filter(isFav).length,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [totals, rules, matMeta]);

  const term = search.trim().toLowerCase();
  const rows = useMemo(() => {
    let r = totals;
    if (filter === "low") r = r.filter(isLow);
    else if (filter === "out") r = r.filter(isOut);
    else if (filter === "fav") r = r.filter(isFav);
    if (term) r = r.filter((t) => t.name.toLowerCase().includes(term) || (t.sku ?? "").toLowerCase().includes(term));
    const val = (t: CompanyTotal) => (t.costPrice != null ? t.total * t.costPrice : 0);
    return [...r].sort((a, b) =>
      sortBy === "qty" ? b.total - a.total : sortBy === "value" ? val(b) - val(a) : a.name.localeCompare(b.name),
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totals, rules, matMeta, filter, term, sortBy]);

  const groupedRows = useMemo(() => {
    if (!grouped) return [];
    const by = new Map<string, CompanyTotal[]>();
    for (const t of rows) {
      const cat = catOf(t);
      const arr = by.get(cat);
      if (arr) arr.push(t); else by.set(cat, [t]);
    }
    return [...by.entries()]
      .sort((a, b) => (a[0] === OTHER_GROUP ? 1 : b[0] === OTHER_GROUP ? -1 : a[0].localeCompare(b[0])))
      .map(([cat, items]) => ({ cat, items }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grouped, rows, matMeta]);

  function toggleCollapsed(cat: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  }

  const unitsOnHand = totals.reduce((s, t) => s + t.total, 0);
  const stockValue = totals.reduce((s, t) => s + (t.costPrice != null ? t.total * t.costPrice : 0), 0);
  const vanCount = locations.filter((l) => l.type === "van").length;

  function exportCsv() {
    downloadCsv(
      `stock-overview-${new Date().toISOString().slice(0, 10)}`,
      ["Item", "SKU", "Category", "Unit", "On hand", "Value (cost)", "Below min", "Favourite"],
      rows.map((t) => [
        t.name, t.sku ?? "", catOf(t) === OTHER_GROUP ? "" : catOf(t), t.unit, t.total,
        t.costPrice != null ? (t.total * t.costPrice).toFixed(2) : "",
        isLow(t) ? "yes" : "", isFav(t) ? "yes" : "",
      ]),
    );
  }

  if (loading) {
    return <div className={`flex items-center gap-2 px-5 py-8 text-sm text-[#A0A0A0] ${cardShell}`}><Loader2 className="h-4 w-4 animate-spin" /> Loading stock…</div>;
  }

  // The stock tables couldn't be read at all — say so, don't show fake zeros.
  if (dbError) {
    return (
      <div className="flex items-start gap-3 rounded-[10px] border border-[#D69A2E] bg-[#F9EFD9] px-5 py-4">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#C8841E]" />
        <div className="text-sm text-[#C8841E]">
          <p className="font-semibold">Stock isn&rsquo;t switched on yet.</p>
          <p className="mt-0.5">The stock tables couldn&rsquo;t be found — apply database updates <strong>87–89</strong> in Supabase, then refresh this page.</p>
        </div>
      </div>
    );
  }

  // First run: nothing counted anywhere yet → a guided setup card beats a dead dashboard.
  if (totals.length === 0) {
    return <StockSetupChecklist stockedCount={stockedCount} vanCount={vanCount} onGoToLocations={onGoToLocations} />;
  }

  const stats = [
    { value: String(totals.length), label: "Items tracked" },
    { value: fmtQty(unitsOnHand), label: "Units on hand" },
    { value: fmtMoney(stockValue), label: "Stock value (cost)" },
    { value: `${vanCount} van${vanCount === 1 ? "" : "s"} + factory`, label: "Locations" },
  ];
  const chips: { key: Filter; label: string }[] = [
    { key: "all", label: "All" }, { key: "low", label: "Low" }, { key: "out", label: "Out of stock" }, { key: "fav", label: "Favourites" },
  ];

  const renderRow = (t: CompanyTotal) => {
    const low = isLow(t), out = isOut(t);
    return (
      <tr key={t.materialId} onClick={() => setSelected(t.materialId)} className="cursor-pointer hover:bg-[#FAF8F2]">
        <td className="px-4 py-2.5">
          <span className="inline-flex items-center gap-1.5 font-medium text-[#1A1A1A]">
            {(low || out) && <AlertTriangle className={`h-3.5 w-3.5 ${out ? "text-[#C44545]" : "text-[#C8841E]"}`} />}{t.name}
          </span>
          {t.sku && <span className="ml-2 text-[11px] text-[#A0A0A0]">{t.sku}</span>}
        </td>
        <td className={`px-4 py-2.5 text-right tabular-nums ${out ? "text-[#C44545]" : "text-[#1A1A1A]"}`}>{fmtQty(t.total)} <span className="text-[11px] text-[#A0A0A0]">{t.unit}</span></td>
        <td className="px-4 py-2.5">
          <div className="flex flex-wrap gap-1">{t.byLocation.filter((b) => b.qty !== 0).map((b) => <MetaChip key={b.locationId}>{b.locationName}: {fmtQty(b.qty)}</MetaChip>)}</div>
        </td>
        <td className="px-4 py-2.5 text-right tabular-nums text-[#6B6B6B]">{t.costPrice != null ? fmtMoney(t.total * t.costPrice) : "—"}</td>
      </tr>
    );
  };

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className={`overflow-hidden px-5 py-4 ${cardShell}`}>
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label}>
              <div className="text-[24px] font-medium leading-none tabular-nums text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>{s.value}</div>
              <div className="mt-1.5 text-[11px] font-medium uppercase tracking-[0.1em] text-[#6B6B6B]">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Low banner → jumps to Restock */}
      {counts.low > 0 && (
        <div className="flex items-center gap-2 rounded-[10px] border border-[#D69A2E] bg-[#F9EFD9] px-4 py-2.5 text-sm text-[#C8841E]">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            {counts.low} item{counts.low === 1 ? "" : "s"} below minimum —{" "}
            {onGoToRestock ? (
              <button type="button" onClick={onGoToRestock} className="font-semibold underline hover:text-[#A66A12]">open Restock</button>
            ) : (
              <span className="font-semibold">see the Restock tab</span>
            )}{" "}
            to draft orders.
          </span>
        </div>
      )}

      {/* Filters + group + sort + search + export */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex flex-wrap items-center gap-1">
          {chips.map((c) => {
            const active = filter === c.key;
            const tone = FILTER_TONE[c.key];
            return (
              <button key={c.key} type="button" onClick={() => setFilter(c.key)}
                className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors ${active ? "bg-[#1A1A1A] text-white shadow-sm" : "text-[#6B6B6B] hover:bg-[#EFEBE0] hover:text-[#1A1A1A]"}`}>
                {!active && tone && <span className="h-1.5 w-1.5 rounded-full" style={{ background: TONE[tone].dot }} />}
                {c.label}
                <span className={`rounded-full px-1.5 text-[11px] font-semibold tabular-nums ${active ? "bg-white/20 text-white" : "bg-[#E6E1D4] text-[#6B6B6B]"}`}>{counts[c.key]}</span>
              </button>
            );
          })}
        </div>
        <div className="relative ml-auto min-w-[180px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A0A0A0]" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or SKU…"
            className="w-full rounded-md border border-[#E6E1D4] bg-white py-2 pl-9 pr-9 text-sm focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]" />
          {search && <button type="button" onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-[#A0A0A0] hover:text-[#C44545]" aria-label="Clear"><X className="h-4 w-4" /></button>}
        </div>
        <label className="flex cursor-pointer items-center gap-1.5 text-[13px] text-[#3A3A3A]">
          <input type="checkbox" checked={grouped} onChange={(e) => setGrouped(e.target.checked)} className="h-4 w-4 accent-[#2F8F5C]" />
          Group by category
        </label>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortBy)} className="rounded-md border border-[#E6E1D4] bg-white px-2 py-2 text-sm text-[#3A3A3A] focus:border-[#2F8F5C] focus:outline-none">
          <option value="name">Sort: Name</option>
          <option value="qty">Sort: On hand</option>
          <option value="value">Sort: Value</option>
        </select>
        <button type="button" onClick={exportCsv} className="inline-flex items-center gap-1.5 rounded-md border border-[#E6E1D4] bg-white px-3 py-2 text-xs font-semibold text-[#3A3A3A] hover:bg-[#FAF8F2]"><Download className="h-3.5 w-3.5" /> CSV</button>
      </div>

      {/* Totals table */}
      <div className={`overflow-x-auto ${cardShell}`}>
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-[#E6E1D4] bg-[#FAF8F2]">
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Item</th>
              <th className="w-28 px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]">On hand</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]">By location</th>
              <th className="w-28 px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EFEBE0]">
            {rows.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-10 text-center text-sm text-[#A0A0A0]">
                Nothing matches this filter or search — clear them to see all {totals.length} items.
              </td></tr>
            )}
            {!grouped && rows.map(renderRow)}
            {grouped && groupedRows.map((g) => {
              const closed = collapsed.has(g.cat);
              return (
                <Fragment key={g.cat}>
                  <tr className="bg-[#FAF8F2]">
                    <td colSpan={4} className="px-3 py-1.5">
                      <button type="button" onClick={() => toggleCollapsed(g.cat)} className="flex w-full items-center gap-1.5 text-left">
                        {closed ? <ChevronRight className="h-3.5 w-3.5 text-[#A0A0A0]" /> : <ChevronDown className="h-3.5 w-3.5 text-[#A0A0A0]" />}
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">{g.cat}</span>
                        <span className="rounded-full bg-[#E6E1D4] px-1.5 text-[11px] font-semibold tabular-nums text-[#6B6B6B]">{g.items.length}</span>
                      </button>
                    </td>
                  </tr>
                  {!closed && g.items.map(renderRow)}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <StockItemDrawer materialId={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

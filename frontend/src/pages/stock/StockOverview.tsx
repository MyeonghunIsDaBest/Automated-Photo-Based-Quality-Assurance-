// ─────────────────────────────────────────────────────────────────────────────
// pages/stock/StockOverview.tsx — manager company-wide view: every item's total
// on hand (Σ factory + vans) with per-location breakdown, headline stats, search,
// All/Low/Out/Favourites filters, sorting, optional group-by-category, per-item
// drill-in, and CSV export. Live.
// ─────────────────────────────────────────────────────────────────────────────

import { Fragment, useEffect, useMemo, useState } from "react";
import {
  Search, X, Loader2, AlertTriangle, Download, ChevronDown, ChevronRight, ChevronLeft, Package, Upload,
  Warehouse, Truck, MapPin, Archive, LifeBuoy, Boxes,
} from "lucide-react";
import { Link } from "react-router-dom";

import { cn } from "../../lib/cn";
import { cardShell, FRAUNCES, MetaChip, TONE, type ToneKey } from "../gantt/components/ledger";
import {
  getCompanyTotals, listStockLocations, subscribeToStockLevels, countPendingAllocations,
  type CompanyTotal, type StockLocation, type LocationType,
} from "../../lib/api/stock";
import { listReorderRules, type ReorderRule } from "../../lib/api/purchasing";
import { listMaterials } from "../../lib/api/materials";
import { downloadCsv } from "../../lib/stock/csv";
import { fmtMoney, fmtQty } from "../../lib/format";
import MotionDrawer from "../../components/ui/MotionDrawer";
import StockItemDrawer from "./StockItemDrawer";
import StockSetupChecklist from "./StockSetupChecklist";

type Filter = "all" | "low" | "out" | "fav";
type SortBy = "name" | "qty" | "value";

interface MatMeta { fav: boolean; category: string | null }

const FILTER_TONE: Record<Filter, ToneKey | null> = { all: null, low: "amber", out: "red", fav: "sage" };
const OTHER_GROUP = "Other";
// Long imported item lists page 10 at a time (matches the Service Jobs pager) —
// the slice is over the already-sorted in-memory rows, so "Next" is instant.
const PAGE_SIZE = 10;

// Warehouse presentation: icon + label + sort weight per location type. Factory
// leads (it's the source of truth), then vans, then any sites/storage.
const LOC_META: Record<LocationType, { icon: typeof Warehouse; label: string; order: number }> = {
  factory: { icon: Warehouse, label: "Factory", order: 0 },
  van: { icon: Truck, label: "Van", order: 1 },
  site: { icon: MapPin, label: "Site", order: 2 },
  storage: { icon: Archive, label: "Storage", order: 3 },
};

export default function StockOverview({ onGoToRestock, onGoToLocations }: { onGoToRestock?: () => void; onGoToLocations?: () => void }) {
  const [totals, setTotals] = useState<CompanyTotal[]>([]);
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [rules, setRules] = useState<Map<string, ReorderRule>>(new Map());
  const [matMeta, setMatMeta] = useState<Map<string, MatMeta>>(new Map());
  const [stockedCount, setStockedCount] = useState(0);
  const [pendingBoxes, setPendingBoxes] = useState(0);
  const [dbError, setDbError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sortBy, setSortBy] = useState<SortBy>("name");
  const [grouped, setGrouped] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [page, setPage] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const reload = () => {
      void getCompanyTotals().then((t) => { if (!cancelled) { setTotals(t); setDbError(false); } }).catch(() => {});
      // Accepts move stock (→ levels change → we're here), so the outstanding-
      // boxes banner refreshes on the same signal instead of going stale.
      void countPendingAllocations().then((n) => { if (!cancelled) setPendingBoxes(n); }).catch(() => {});
    };
    setLoading(true);
    // Per-call catches: a missing stock schema (migrations 87–89 not applied)
    // must surface as a setup notice — not masquerade as "0 items".
    let dbFail = false;
    Promise.all([
      getCompanyTotals().catch(() => { dbFail = true; return [] as CompanyTotal[]; }),
      listStockLocations().catch(() => { dbFail = true; return [] as StockLocation[]; }),
      listReorderRules().catch(() => []),
      listMaterials().catch(() => []),
      // Job boxes are migration 95 — a missing table must not trip the 87–89 notice.
      countPendingAllocations().catch(() => 0),
    ])
      .then(([t, locs, rls, mats, boxes]) => {
        if (cancelled) return;
        setDbError(dbFail);
        setTotals(t);
        setLocations(locs);
        setRules(new Map(rls.map((r) => [r.materialId, r])));
        setMatMeta(new Map(mats.map((m) => [m.id, { fav: m.isFavourite, category: m.category }])));
        setStockedCount(mats.filter((m) => m.isStockItem).length);
        setPendingBoxes(boxes);
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

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  // A user action that changes the visible set (filter / search / sort / group)
  // jumps back to page 1 — you never land mid-list on a page that no longer fits.
  useEffect(() => { setPage(0); }, [filter, term, sortBy, grouped]);
  // A live update (realtime, an accepted job box) that shrinks the list past the
  // current page clamps back into range instead of showing an empty page.
  useEffect(() => { setPage((p) => Math.min(p, pageCount - 1)); }, [pageCount]);

  function toggleCollapsed(cat: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  }

  // Per-warehouse rollup: fold every item's per-location line into one row per
  // location, then list ALL locations (even empty ones) so a fresh van reads as
  // "0 on hand", not as missing. Read-only view over getCompanyTotals — no
  // machinery touched.
  const warehouses = useMemo(() => {
    const agg = new Map<string, { items: number; units: number; value: number }>();
    for (const t of totals) {
      const price = t.costPrice ?? 0;
      for (const b of t.byLocation) {
        if (b.qty === 0) continue;
        const cur = agg.get(b.locationId) ?? { items: 0, units: 0, value: 0 };
        cur.items += 1;
        cur.units += b.qty;
        cur.value += b.qty * price;
        agg.set(b.locationId, cur);
      }
    }
    return locations
      .filter((l) => l.isActive)
      .map((l) => ({ id: l.id, name: l.name, type: l.type, ...(agg.get(l.id) ?? { items: 0, units: 0, value: 0 }) }))
      .sort((a, b) => LOC_META[a.type].order - LOC_META[b.type].order || a.name.localeCompare(b.name));
  }, [totals, locations]);

  const unitsOnHand = totals.reduce((s, t) => s + t.total, 0);
  const stockValue = totals.reduce((s, t) => s + (t.costPrice != null ? t.total * t.costPrice : 0), 0);
  const vanCount = locations.filter((l) => l.type === "van").length;
  const siteCount = locations.filter((l) => l.type === "site").length;
  const storageCount = locations.filter((l) => l.type === "storage").length;
  // Per-type breakdown (mig 96): only name what exists — "4 vans · 2 sites".
  const locationBreakdown = [
    "factory",
    `${vanCount} van${vanCount === 1 ? "" : "s"}`,
    ...(siteCount > 0 ? [`${siteCount} site${siteCount === 1 ? "" : "s"}`] : []),
    ...(storageCount > 0 ? [`${storageCount} storage`] : []),
  ].join(" · ");

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

  // First run: nothing counted yet. The overview still renders in full (honest
  // zeros + the warehouses that already exist) — the setup guide is one tap away
  // in the popup, so an empty page never masquerades as the whole story.
  const isEmpty = totals.length === 0;

  const stats = [
    { value: String(totals.length), label: "Items tracked" },
    { value: fmtQty(unitsOnHand), label: "Units on hand" },
    { value: fmtMoney(stockValue), label: "Stock value (cost)" },
    { value: String(locations.length), label: locationBreakdown },
  ];
  const chips: { key: Filter; label: string }[] = [
    { key: "all", label: "All" }, { key: "low", label: "Low" }, { key: "out", label: "Out of stock" }, { key: "fav", label: "Favourites" },
  ];

  // Flat view pages 10 at a time; grouped view stays whole (it's the deliberate
  // "show me everything, organised" lens, and paging across categories reads oddly).
  // Clamp the page at RENDER time — the reset/clamp effects run only after paint,
  // so without this a shrunk list (filter change, realtime update) would flash a
  // blank body or an out-of-range "Page 3 of 2" for one frame before correcting.
  const clampedPage = Math.min(page, pageCount - 1);
  const pageStart = clampedPage * PAGE_SIZE;
  const pagedRows = grouped ? rows : rows.slice(pageStart, pageStart + PAGE_SIZE);
  const showPager = !grouped && rows.length > PAGE_SIZE;

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
      {/* Section toolbar — one line of context + the always-on setup helper, so a
          new user can reopen the walk-through any time (not just on an empty page). */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12.5px] text-[#6B6B6B]">
          {isEmpty
            ? "Your locations are ready — count the shelf to start live tallies."
            : "Live running tallies across the factory and every van."}
        </p>
        <button
          type="button"
          onClick={() => setHelpOpen(true)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#E6E1D4] bg-white px-3.5 py-2 text-[13px] font-semibold text-[#3A3A3A] transition-colors hover:border-[#2F8F5C] hover:text-[#2F8F5C]"
        >
          <LifeBuoy className="h-4 w-4" /> Setup guide
        </button>
      </div>

      {/* Stats */}
      <div className={cn(cardShell, "rounded-[16px] overflow-hidden px-5 py-4")}>
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label}>
              <div className="text-[24px] font-medium leading-none tabular-nums text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>{s.value}</div>
              <div className="mt-1.5 text-[11px] font-medium uppercase tracking-[0.1em] text-[#6B6B6B]">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Warehouses — per-location on-hand so "where is my stock" is answered
          without opening each location. Empty locations show 0, not hidden. */}
      {warehouses.length > 0 && (
        <div className={cn(cardShell, "rounded-[16px] px-5 py-4")}>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-[15px] font-semibold text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>Warehouses</h3>
            <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-[#6B6B6B]">
              {warehouses.length} location{warehouses.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {warehouses.map((w) => {
              const M = LOC_META[w.type];
              return (
                <div key={w.id} className="rounded-[12px] border border-[#EFEBE0] bg-[#FAF8F2] px-3.5 py-3">
                  <div className="flex items-center gap-2">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] border border-[#E6E1D4] bg-white text-[#6B6B6B]">
                      <M.icon className="h-4 w-4" strokeWidth={1.75} />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[13.5px] font-semibold text-[#1A1A1A]">{w.name}</p>
                      <p className="text-[11px] uppercase tracking-[0.08em] text-[#A0A0A0]">{M.label}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-end justify-between gap-2">
                    <div>
                      <div className="text-[19px] font-medium leading-none tabular-nums text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>{fmtQty(w.units)}</div>
                      <div className="mt-1 text-[10.5px] uppercase tracking-[0.08em] text-[#6B6B6B]">units · {w.items} item{w.items === 1 ? "" : "s"}</div>
                    </div>
                    <div className="text-right text-[12px] tabular-nums text-[#6B6B6B]">{w.value > 0 ? fmtMoney(w.value) : "—"}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Import shortcut — the item master lives in the Catalogue; one pipeline,
          signposted from Stock (P9.BS WS6) */}
      <div className={cn(cardShell, "rounded-[16px] flex flex-wrap items-center justify-between gap-3 px-5 py-3.5")}>
        <div className="min-w-0">
          <p className="text-[13.5px] font-semibold text-[#1A1A1A]">Import your item list</p>
          <p className="mt-0.5 text-[12px] text-[#6B6B6B]">CSV from your wholesaler or Luke’s sheet — items land in the Catalogue flagged as stock, then get counted here.</p>
        </div>
        <Link
          to="/catalogue?cat=import"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#E6E1D4] bg-white px-3.5 py-2 text-[13px] font-semibold text-[#3A3A3A] transition-colors hover:border-[#2F8F5C] hover:text-[#2F8F5C]"
        >
          <Upload className="h-4 w-4" /> Open the importer
        </Link>
      </div>

      {/* Outstanding job boxes — Luke chases unaccepted pickups from here */}
      {pendingBoxes > 0 && (
        <div className="flex items-center gap-2 rounded-[10px] border border-[#E8D8B5] bg-[#F9EFD9] px-4 py-2.5 text-sm text-[#8A6B1E]">
          <Package className="h-4 w-4 shrink-0" />
          <span>
            <span className="font-semibold">{pendingBoxes} job box{pendingBoxes === 1 ? "" : "es"}</span> packed but not yet accepted —
            techs accept at pickup from My Van; boxes live on each job&rsquo;s drawer.
          </span>
        </div>
      )}

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

      {/* Empty scaffold — the overview chrome above still renders; here a gentle
          prompt replaces a filter bar + table that would have nothing in them. */}
      {isEmpty && (
        <div className={cn(cardShell, "rounded-[16px] px-5 py-10 text-center")}>
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-[14px] border border-[#E6E1D4] bg-[#FAF8F2] text-[#6B6B6B]">
            <Boxes className="h-6 w-6" strokeWidth={1.5} />
          </span>
          <h3 className="mt-4 text-[19px] font-semibold text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>Nothing counted yet</h3>
          <p className="mx-auto mt-2 max-w-[440px] text-[13px] leading-relaxed text-[#6B6B6B]">
            Run an opening stock-take and every item shows here with a live running tally — in the factory and in every van. New to stock? The setup guide walks you through it.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <button type="button" onClick={() => setHelpOpen(true)} className="inline-flex items-center gap-1.5 rounded-full bg-[#1A1A1A] px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-black">
              <LifeBuoy className="h-4 w-4" /> Open the setup guide
            </button>
            {onGoToLocations && (
              <button type="button" onClick={onGoToLocations} className="inline-flex items-center gap-1.5 rounded-full border border-[#E6E1D4] bg-white px-4 py-2 text-[13px] font-semibold text-[#3A3A3A] transition-colors hover:border-[#2F8F5C] hover:text-[#2F8F5C]">
                Count the factory <ChevronRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Filters + group + sort + search + export */}
      {!isEmpty && (<>
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex flex-wrap items-center gap-1">
          {chips.map((c) => {
            const active = filter === c.key;
            const tone = FILTER_TONE[c.key];
            return (
              <button key={c.key} type="button" onClick={() => setFilter(c.key)} aria-pressed={active}
                className={`flex items-center gap-2 rounded-full border px-[15px] py-2 text-[13px] font-semibold transition-colors ${active ? "border-[#1A1A1A] bg-[#1A1A1A] text-white shadow-sm" : "border-[#E6E1D4] bg-white text-[#3A3A3A] hover:border-[#A0A0A0] hover:bg-[#FAF8F2]"}`}>
                {!active && tone && <span className="h-1.5 w-1.5 rounded-full" style={{ background: TONE[tone].dot }} />}
                {c.label}
                <span className={`rounded-full px-1.5 text-[11px] font-semibold tabular-nums ${active ? "bg-white/20 text-white" : "bg-[#EFEBE0] text-[#6B6B6B]"}`}>{counts[c.key]}</span>
              </button>
            );
          })}
        </div>
        <div className="relative ml-auto min-w-[180px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A0A0A0]" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or SKU…"
            className="w-full rounded-full border border-[#E6E1D4] bg-white py-2 pl-10 pr-9 text-[13.5px] text-[#1A1A1A] placeholder:text-[#A0A0A0] focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]" />
          {search && <button type="button" onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-[#A0A0A0] hover:text-[#C44545]" aria-label="Clear"><X className="h-4 w-4" /></button>}
        </div>
        <label className="flex cursor-pointer items-center gap-1.5 text-[13px] text-[#3A3A3A]">
          <input type="checkbox" checked={grouped} onChange={(e) => setGrouped(e.target.checked)} className="h-4 w-4 accent-[#2F8F5C]" />
          Group by category
        </label>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortBy)} className="rounded-[10px] border border-[#E6E1D4] bg-white px-3 py-2 text-[13px] text-[#3A3A3A] focus:border-[#2F8F5C] focus:outline-none">
          <option value="name">Sort: Name</option>
          <option value="qty">Sort: On hand</option>
          <option value="value">Sort: Value</option>
        </select>
        <button type="button" onClick={exportCsv} className="inline-flex items-center gap-1.5 rounded-full border border-[#E6E1D4] bg-white px-3.5 py-2 text-[13px] font-semibold text-[#3A3A3A] transition-colors hover:border-[#A0A0A0] hover:bg-[#FAF8F2]"><Download className="h-3.5 w-3.5" /> CSV</button>
      </div>

      {/* Totals table */}
      <div className={cn(cardShell, "rounded-[16px] overflow-x-auto")}>
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-[#E6E1D4] bg-[#FAF8F2]">
              <th className="px-4 py-2.5 text-left text-[10.5px] font-bold uppercase tracking-[0.07em] text-[#6B6B6B]">Item</th>
              <th className="w-28 px-4 py-2.5 text-right text-[10.5px] font-bold uppercase tracking-[0.07em] text-[#6B6B6B]">On hand</th>
              <th className="px-4 py-2.5 text-left text-[10.5px] font-bold uppercase tracking-[0.07em] text-[#6B6B6B]">By location</th>
              <th className="w-28 px-4 py-2.5 text-right text-[10.5px] font-bold uppercase tracking-[0.07em] text-[#6B6B6B]">Value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EFEBE0]">
            {rows.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-10 text-center text-sm text-[#A0A0A0]">
                Nothing matches this filter or search — clear them to see all {totals.length} items.
              </td></tr>
            )}
            {!grouped && pagedRows.map(renderRow)}
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

      {/* Pager — 10 per page over the already-sorted rows, so Next is instant */}
      {showPager && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-1">
          <span className="text-[12px] tabular-nums text-[#6B6B6B]">
            {pageStart + 1}&ndash;{Math.min(pageStart + PAGE_SIZE, rows.length)} of {rows.length} items
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPage(Math.max(0, clampedPage - 1))}
              disabled={clampedPage === 0}
              className="inline-flex items-center gap-1 rounded-full border border-[#E6E1D4] bg-white px-3 py-1.5 text-[12.5px] font-semibold text-[#3A3A3A] transition-colors hover:border-[#A0A0A0] hover:bg-[#FAF8F2] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[#E6E1D4] disabled:hover:bg-white"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Prev
            </button>
            <span className="px-1 text-[12px] tabular-nums text-[#6B6B6B]">Page {clampedPage + 1} of {pageCount}</span>
            <button
              type="button"
              onClick={() => setPage(Math.min(pageCount - 1, clampedPage + 1))}
              disabled={clampedPage >= pageCount - 1}
              className="inline-flex items-center gap-1 rounded-full border border-[#E6E1D4] bg-white px-3 py-1.5 text-[12.5px] font-semibold text-[#3A3A3A] transition-colors hover:border-[#A0A0A0] hover:bg-[#FAF8F2] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[#E6E1D4] disabled:hover:bg-white"
            >
              Next <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
      </>)}

      <StockItemDrawer materialId={selected} onClose={() => setSelected(null)} />

      {/* Setup guide popup — the old first-run checklist, now a helper any new
          user can reopen from the toolbar rather than a page that hijacks the
          real overview. */}
      <MotionDrawer open={helpOpen} onClose={() => setHelpOpen(false)} variant="modal" ariaLabel="Stock setup guide" sizeClass="sm:max-w-[560px]">
        <div className="flex items-center justify-between border-b border-[#EFEBE0] px-5 py-3.5">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.1em] text-[#6B6B6B]">
            <LifeBuoy className="h-4 w-4 text-[#2F8F5C]" /> Setup guide
          </div>
          <button type="button" onClick={() => setHelpOpen(false)} className="rounded-full p-1.5 text-[#A0A0A0] transition-colors hover:bg-[#FAF8F2] hover:text-[#1A1A1A]" aria-label="Close setup guide">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-y-auto">
          <StockSetupChecklist bare stockedCount={stockedCount} vanCount={vanCount} onGoToLocations={onGoToLocations} onActed={() => setHelpOpen(false)} />
        </div>
      </MotionDrawer>
    </div>
  );
}

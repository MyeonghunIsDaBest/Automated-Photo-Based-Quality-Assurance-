// ─────────────────────────────────────────────────────────────────────────────
// pages/sales/QuoteStock.tsx — the "Stock" sub-tab of a quote's Parts & Labour
// strip (Simpro replication, Phase 1 Part 7).
//
// Same Group → Subgroup → parts browse-and-add as the Catalogue tab, but limited
// to materials flagged as stocked (is_stock_item) and with an extra "On Hand"
// column. Lightweight v1: single on-hand number per material (full multi-location
// inventory deferred). Add drops the item onto the quote at the chosen quantity.
//
// Screen-only (parent renders inside a print:hidden block); cost shown only when
// canSeeCost.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import { Search, X, ChevronRight, Plus, Loader2, Star, Folder } from "lucide-react";

import { listMaterials, updateMaterial } from "../../lib/api/materials";
import { addQuoteItemFromMaterial, getCommercialSettings } from "../../lib/api/commercial";
import { isBelowFloor } from "../../lib/commercial/money";
import { getCompanyTotals } from "../../lib/api/stock";
import { pushRecentMaterial } from "../../lib/recentMaterials";
import { fmtMoney, fmtQty } from "../../lib/format";

const OTHER_GROUP = "Other";

interface Props {
  quoteId: string;
  canSeeCost: boolean;
  isLocked: boolean;
  onAdded: () => void;
  onToast?: (message: string, type: "success" | "error" | "info") => void;
  /** Cost centre new lines land in (null = General). */
  activeSectionId?: string | null;
}

interface StockRow {
  id: string;
  name: string;
  category: string | null;
  subcategory: string | null;
  isFavourite: boolean;
  materialCost: number;
  sell: number;
  onHand: number;
  meta: string; // sku · unit
}

const groupKey = (r: StockRow) => (r.category && r.category.trim() ? r.category.trim() : OTHER_GROUP);
const subKey = (r: StockRow) => (r.subcategory && r.subcategory.trim() ? r.subcategory.trim() : null);

export default function QuoteStock({ quoteId, canSeeCost, isLocked, onAdded, onToast, activeSectionId = null }: Props) {
  const [rows, setRows] = useState<StockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [favOnly, setFavOnly] = useState(false);
  const [path, setPath] = useState<{ group: string | null; subgroup: string | null }>({ group: null, subgroup: null });

  const [qtys, setQtys] = useState<Record<string, number>>({});
  const [addingId, setAddingId] = useState<string | null>(null);
  // Pricing floor (mig 94) for the below-floor sell flags (manager-only).
  const [minMarkup, setMinMarkup] = useState(0.25);
  const [togglingFavId, setTogglingFavId] = useState<string | null>(null);
  // Keyboard nav (search results): ArrowUp/Down + Enter from the search box.
  const [highlightIdx, setHighlightIdx] = useState(-1);

  // ── Load stocked materials, compute display sell with the office markup ──────
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    (async () => {
      const settings = await getCommercialSettings().catch(() => null);
      const markup = settings ? settings.defaultMaterialMarkup : 0.25;
      setMinMarkup(settings?.minMarkupPct ?? 0.25);
      const [mats, totals] = await Promise.all([listMaterials(), getCompanyTotals().catch(() => [])]);
      // On-hand now comes from the live multi-location tally (factory + vans), not
      // the deprecated single materials.stock_on_hand figure.
      const totalsById = new Map(totals.map((t) => [t.materialId, t.total]));
      return mats
        .filter((m) => m.isStockItem)
        .map<StockRow>((m) => {
          const cost = m.costPrice ?? 0;
          const sell = m.sellPrice != null ? m.sellPrice : m.costPrice != null ? m.costPrice * (1 + markup) : 0;
          const meta = [m.sku, m.unit].filter(Boolean).join(" · ");
          return {
            id: m.id,
            name: m.name,
            category: m.category,
            subcategory: m.subcategory,
            isFavourite: m.isFavourite,
            materialCost: cost,
            sell: Math.round(sell * 100) / 100,
            onHand: totalsById.get(m.id) ?? 0,
            meta,
          };
        });
    })()
      .then((r) => { if (!cancelled) setRows(r); })
      .catch((ex) => { if (!cancelled) setLoadError(ex instanceof Error ? ex.message : "Failed to load stock"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const term = search.trim().toLowerCase();
  const flatMode = term.length > 0 || favOnly;

  const groups = useMemo(() => {
    const byKey = new Map<string, number>();
    for (const r of rows) byKey.set(groupKey(r), (byKey.get(groupKey(r)) ?? 0) + 1);
    return [...byKey.entries()]
      .sort((a, b) => (a[0] === OTHER_GROUP ? 1 : b[0] === OTHER_GROUP ? -1 : a[0].localeCompare(b[0])))
      .map(([key, count]) => ({ key, count }));
  }, [rows]);

  const favCount = useMemo(() => rows.filter((r) => r.isFavourite).length, [rows]);

  const groupView = useMemo(() => {
    if (!path.group) return null;
    const inGroup = rows.filter((r) => groupKey(r) === path.group);
    const subMap = new Map<string, number>();
    const directParts: StockRow[] = [];
    for (const r of inGroup) {
      const s = subKey(r);
      if (s) subMap.set(s, (subMap.get(s) ?? 0) + 1);
      else directParts.push(r);
    }
    const subgroups = [...subMap.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([key, count]) => ({ key, count }));
    return { subgroups, directParts };
  }, [rows, path.group]);

  const visibleParts = useMemo(() => {
    if (favOnly && term) return rows.filter((r) => r.isFavourite && r.name.toLowerCase().includes(term));
    if (favOnly) return rows.filter((r) => r.isFavourite);
    if (term) {
      return rows.filter(
        (r) =>
          r.name.toLowerCase().includes(term) ||
          r.meta.toLowerCase().includes(term) ||
          groupKey(r).toLowerCase().includes(term) ||
          (r.subcategory ?? "").toLowerCase().includes(term),
      );
    }
    if (path.group && path.subgroup) {
      return rows.filter((r) => groupKey(r) === path.group && subKey(r) === path.subgroup);
    }
    return [];
  }, [rows, favOnly, term, path.group, path.subgroup]);

  // ── Actions ──────────────────────────────────────────────────────────────
  async function handleAdd(r: StockRow) {
    if (isLocked || addingId) return;
    const qty = Math.max(1, Math.floor(qtys[r.id] ?? 1));
    setAddingId(r.id);
    try {
      await addQuoteItemFromMaterial(quoteId, r.id, qty, activeSectionId);
      pushRecentMaterial(r.id);
      onAdded();
      onToast?.(`Added ${r.name}${qty > 1 ? ` ×${qty}` : ""}`, "success");
    } catch (ex) {
      onToast?.(ex instanceof Error ? ex.message : "Failed to add stock item", "error");
    } finally {
      setAddingId(null);
    }
  }

  async function handleToggleFav(r: StockRow) {
    if (isLocked || togglingFavId) return;
    setTogglingFavId(r.id);
    const next = !r.isFavourite;
    try {
      await updateMaterial(r.id, { isFavourite: next });
      setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, isFavourite: next } : x)));
    } catch (ex) {
      onToast?.(ex instanceof Error ? ex.message : "Failed to update favourite", "error");
    } finally {
      setTogglingFavId(null);
    }
  }

  // ── Render helpers ─────────────────────────────────────────────────────────
  function partsTable(parts: StockRow[], emptyMsg: string, highlight = -1) {
    return (
      <div className="max-h-[60vh] overflow-y-auto">
      <table className="min-w-full text-sm">
        <thead className="sticky top-0 z-10">
          <tr className="border-b border-[#E6E1D4] bg-[#FAF8F2]">
            <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Name</th>
            <th className="w-24 px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">On hand</th>
            {canSeeCost && <th className="w-28 px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Material cost</th>}
            <th className="w-28 px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Sell price</th>
            <th className="w-12 px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]" aria-label="Favourite" />
            {!isLocked && <th className="w-32 px-3 py-2" aria-label="Add" />}
          </tr>
        </thead>
        <tbody>
          {parts.length === 0 && (
            <tr>
              <td colSpan={4 + (canSeeCost ? 1 : 0) + (!isLocked ? 1 : 0)} className="px-3 py-6 text-center text-xs text-[#A0A0A0]">
                {emptyMsg}
              </td>
            </tr>
          )}
          {parts.map((r, idx) => {
            const qty = qtys[r.id] ?? 1;
            return (
              <tr key={r.id} className={`border-b border-[#EFEBE0] last:border-0 ${idx === highlight ? "bg-[#F0EDE4]" : ""}`}>
                <td className="px-3 py-2 text-[#1A1A1A]">
                  {r.name}
                  {r.meta && <span className="ml-2 text-[11px] text-[#A0A0A0]">{r.meta}</span>}
                </td>
                <td className={`px-3 py-2 text-right tabular-nums ${r.onHand <= 0 ? "text-[#C44545]" : "text-[#3A3A3A]"}`}>{fmtQty(r.onHand)}</td>
                {canSeeCost && <td className="px-3 py-2 text-right tabular-nums text-[#A0A0A0]">{fmtMoney(r.materialCost)}</td>}
                <td
                  className={`px-3 py-2 text-right tabular-nums ${canSeeCost && isBelowFloor(r.sell, r.materialCost, minMarkup) ? "font-medium text-[#C8841E]" : "text-[#3A3A3A]"}`}
                  title={canSeeCost && isBelowFloor(r.sell, r.materialCost, minMarkup) ? "Below the minimum-markup floor" : undefined}
                >{fmtMoney(r.sell)}</td>
                <td className="px-3 py-2 text-center">
                  <button
                    type="button"
                    onClick={() => void handleToggleFav(r)}
                    disabled={isLocked || togglingFavId === r.id}
                    className="inline-flex h-11 w-11 items-center justify-center rounded disabled:opacity-50 sm:h-8 sm:w-8"
                    aria-label={r.isFavourite ? "Remove favourite" : "Mark favourite"}
                    title={r.isFavourite ? "Remove favourite" : "Mark favourite"}
                  >
                    <Star className={`h-4 w-4 ${r.isFavourite ? "fill-[#E0A82E] text-[#E0A82E]" : "text-[#C4C0B4] hover:text-[#E0A82E]"}`} />
                  </button>
                </td>
                {!isLocked && (
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1.5">
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={qty}
                        onChange={(e) => {
                          const v = parseInt(e.target.value, 10);
                          setQtys((prev) => ({ ...prev, [r.id]: Number.isFinite(v) && v >= 1 ? v : 1 }));
                        }}
                        className="min-h-11 w-16 rounded-md border border-[#E6E1D4] bg-white px-2 py-1.5 text-right text-sm tabular-nums focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C] sm:min-h-0"
                        aria-label={`Quantity for ${r.name}`}
                      />
                      <button
                        type="button"
                        onClick={() => void handleAdd(r)}
                        disabled={addingId === r.id}
                        className="inline-flex min-h-11 items-center gap-1 rounded-md bg-[#2F8F5C] px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-[#287a4e] disabled:opacity-60 sm:min-h-[36px]"
                      >
                        {addingId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                        Add
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="mb-8 flex items-center gap-2 rounded-[10px] border border-[#E6E1D4] bg-[#FAF8F2] px-4 py-6 text-sm text-[#A0A0A0] print:hidden">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading stock…
      </div>
    );
  }
  if (loadError) {
    return (
      <div className="mb-8 rounded-[10px] border border-dashed border-[#E6C9C9] bg-[#FBF4F4] px-4 py-6 text-center text-sm text-[#C44545] print:hidden">
        {loadError}
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="mb-8 rounded-[10px] border border-dashed border-[#D8D2C4] bg-[#FAF8F2] px-4 py-8 text-center text-sm text-[#A0A0A0] print:hidden">
        No stocked items yet — in <span className="font-medium text-[#3A3A3A]">Catalogue → Materials</span> tick &ldquo;Held in stock&rdquo; on the materials you carry (and set their on-hand quantity) to see them here.
      </div>
    );
  }

  return (
    <div className="mb-8 print:hidden">
      {/* Search + Favourites-only filter */}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A0A0A0]" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setHighlightIdx(-1); }}
            onKeyDown={(e) => {
              if (!flatMode || visibleParts.length === 0) return;
              if (e.key === "ArrowDown") { e.preventDefault(); setHighlightIdx((i) => Math.min(i + 1, visibleParts.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setHighlightIdx((i) => Math.max(i - 1, 0)); }
              else if (e.key === "Enter" && highlightIdx >= 0 && highlightIdx < visibleParts.length) {
                e.preventDefault();
                void handleAdd(visibleParts[highlightIdx]);
              }
            }}
            placeholder="Search stock across all groups…"
            className="w-full rounded-md border border-[#E6E1D4] bg-white py-2 pl-9 pr-9 text-sm focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]"
          />
          {search && (
            <button type="button" onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-[#A0A0A0] hover:text-[#C44545]" aria-label="Clear search">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <label className="flex cursor-pointer items-center gap-1.5 text-sm text-[#3A3A3A]">
          <input type="checkbox" checked={favOnly} onChange={(e) => setFavOnly(e.target.checked)} className="h-4 w-4 accent-[#2F8F5C]" />
          <Star className="h-4 w-4 fill-[#E0A82E] text-[#E0A82E]" /> Favourites only
          {favCount > 0 && <span className="text-[#A0A0A0]">({favCount})</span>}
        </label>
      </div>

      {/* Breadcrumb (drill-down mode only) */}
      {!flatMode && (
        <div className="mb-3 flex items-center gap-1 text-sm">
          <button
            type="button"
            onClick={() => setPath({ group: null, subgroup: null })}
            className={path.group ? "font-medium text-[#2F8F5C] hover:underline" : "font-semibold text-[#1A1A1A]"}
          >
            Stock
          </button>
          {path.group && (
            <>
              <ChevronRight className="h-3.5 w-3.5 text-[#A0A0A0]" />
              <button
                type="button"
                onClick={() => setPath({ group: path.group, subgroup: null })}
                className={path.subgroup ? "font-medium text-[#2F8F5C] hover:underline" : "font-semibold text-[#1A1A1A]"}
              >
                {path.group}
              </button>
            </>
          )}
          {path.subgroup && (
            <>
              <ChevronRight className="h-3.5 w-3.5 text-[#A0A0A0]" />
              <span className="font-semibold text-[#1A1A1A]">{path.subgroup}</span>
            </>
          )}
        </div>
      )}

      {/* ── Flat results (search / favourites) ── */}
      {flatMode && (
        <div className="overflow-x-auto rounded-[10px] border border-[#E6E1D4] bg-white">
          {partsTable(visibleParts, favOnly ? "No favourites yet — star a stock item to add it here." : `No stock items match “${search.trim()}”.`, highlightIdx)}
        </div>
      )}

      {/* ── Root: group list ── */}
      {!flatMode && !path.group && (
        <div className="overflow-hidden rounded-[10px] border border-[#E6E1D4] bg-white">
          {favCount > 0 && (
            <button
              type="button"
              onClick={() => setFavOnly(true)}
              className="flex min-h-11 w-full items-center gap-2 border-b border-[#EFEBE0] bg-[#FFFBF0] px-3 py-2.5 text-left hover:bg-[#FFF6DF]"
            >
              <Star className="h-4 w-4 fill-[#E0A82E] text-[#E0A82E]" />
              <span className="text-sm font-semibold text-[#1A1A1A]">Favourites</span>
              <span className="ml-auto rounded-full bg-[#F0E2BD] px-2 py-0.5 text-[11px] font-medium text-[#8A6D1F]">{favCount}</span>
            </button>
          )}
          {groups.map((g) => (
            <button
              key={g.key}
              type="button"
              onClick={() => setPath({ group: g.key, subgroup: null })}
              className="flex min-h-11 w-full items-center gap-2 border-b border-[#EFEBE0] px-3 py-2.5 text-left last:border-0 hover:bg-[#FAF8F2]"
            >
              <Folder className="h-4 w-4 text-[#2F8F5C]" />
              <span className="text-sm font-medium text-[#1A1A1A]">{g.key}</span>
              <span className="ml-auto rounded-full bg-[#E6E1D4] px-2 py-0.5 text-[11px] font-medium text-[#6B6B6B]">{g.count}</span>
              <ChevronRight className="h-4 w-4 text-[#A0A0A0]" />
            </button>
          ))}
        </div>
      )}

      {/* ── Group view: subgroups + direct parts ── */}
      {!flatMode && path.group && !path.subgroup && groupView && (
        <div className="space-y-4">
          {groupView.subgroups.length > 0 && (
            <div className="overflow-hidden rounded-[10px] border border-[#E6E1D4] bg-white">
              <p className="border-b border-[#EFEBE0] bg-[#FAF8F2] px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Subgroups</p>
              {groupView.subgroups.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setPath({ group: path.group, subgroup: s.key })}
                  className="flex min-h-11 w-full items-center gap-2 border-b border-[#EFEBE0] px-3 py-2.5 text-left last:border-0 hover:bg-[#FAF8F2]"
                >
                  <Folder className="h-4 w-4 text-[#2F8F5C]" />
                  <span className="text-sm font-medium text-[#1A1A1A]">{s.key}</span>
                  <span className="ml-auto rounded-full bg-[#E6E1D4] px-2 py-0.5 text-[11px] font-medium text-[#6B6B6B]">{s.count}</span>
                  <ChevronRight className="h-4 w-4 text-[#A0A0A0]" />
                </button>
              ))}
            </div>
          )}
          {(groupView.directParts.length > 0 || groupView.subgroups.length === 0) && (
            <div className="overflow-x-auto rounded-[10px] border border-[#E6E1D4] bg-white">
              {partsTable(groupView.directParts, "No stock items directly in this group.")}
            </div>
          )}
        </div>
      )}

      {/* ── Subgroup view: parts ── */}
      {!flatMode && path.group && path.subgroup && (
        <div className="overflow-x-auto rounded-[10px] border border-[#E6E1D4] bg-white">
          {partsTable(visibleParts, "No stock items in this subgroup.")}
        </div>
      )}
    </div>
  );
}

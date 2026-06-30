// ─────────────────────────────────────────────────────────────────────────────
// pages/stock/StockOverview.tsx — manager company-wide view: every item's total
// on hand (Σ across factory + all vans) with a per-location breakdown, plus a
// search and headline stats. Read-only; live.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import { Search, X, Loader2 } from "lucide-react";

import { cardShell, FRAUNCES, MetaChip } from "../gantt/components/ledger";
import {
  getCompanyTotals, listStockLocations, subscribeToStockLevels,
  type CompanyTotal, type StockLocation,
} from "../../lib/api/stock";

function fmtQty(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}
function fmtMoney(n: number): string {
  return "$" + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export default function StockOverview() {
  const [totals, setTotals] = useState<CompanyTotal[]>([]);
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void getCompanyTotals().then((t) => { if (!cancelled) setTotals(t); }).catch(() => {});
    };
    setLoading(true);
    Promise.all([getCompanyTotals(), listStockLocations()])
      .then(([t, locs]) => { if (!cancelled) { setTotals(t); setLocations(locs); } })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    const unsub = subscribeToStockLevels(null, load);
    return () => { cancelled = true; unsub(); };
  }, []);

  const term = search.trim().toLowerCase();
  const rows = useMemo(
    () => (term ? totals.filter((t) => t.name.toLowerCase().includes(term) || (t.sku ?? "").toLowerCase().includes(term)) : totals),
    [totals, term],
  );

  const unitsOnHand = totals.reduce((s, t) => s + t.total, 0);
  const stockValue = totals.reduce((s, t) => s + (t.costPrice != null ? t.total * t.costPrice : 0), 0);
  const vanCount = locations.filter((l) => l.type === "van").length;

  if (loading) {
    return (
      <div className={`flex items-center gap-2 px-5 py-8 text-sm text-[#A0A0A0] ${cardShell}`}>
        <Loader2 className="h-4 w-4 animate-spin" /> Loading stock…
      </div>
    );
  }

  const stats: { value: string; label: string }[] = [
    { value: String(totals.length), label: "Items tracked" },
    { value: fmtQty(unitsOnHand), label: "Units on hand" },
    { value: fmtMoney(stockValue), label: "Stock value (cost)" },
    { value: `${vanCount} van${vanCount === 1 ? "" : "s"} + factory`, label: "Locations" },
  ];

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

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A0A0A0]" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search items by name or SKU…"
          className="w-full rounded-md border border-[#E6E1D4] bg-white py-2 pl-9 pr-9 text-sm focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]"
        />
        {search && (
          <button type="button" onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-[#A0A0A0] hover:text-[#C44545]" aria-label="Clear">
            <X className="h-4 w-4" />
          </button>
        )}
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
                {totals.length === 0 ? "No stock items yet — flag materials as stocked in Catalogue → Materials, then run a stock-take." : `No items match “${search.trim()}”.`}
              </td></tr>
            )}
            {rows.map((t) => {
              const out = t.total <= 0;
              return (
                <tr key={t.materialId} className="hover:bg-[#FAF8F2]">
                  <td className="px-4 py-2.5">
                    <span className="font-medium text-[#1A1A1A]">{t.name}</span>
                    {t.sku && <span className="ml-2 text-[11px] text-[#A0A0A0]">{t.sku}</span>}
                  </td>
                  <td className={`px-4 py-2.5 text-right tabular-nums ${out ? "text-[#C44545]" : "text-[#1A1A1A]"}`}>
                    {fmtQty(t.total)} <span className="text-[11px] text-[#A0A0A0]">{t.unit}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {t.byLocation.filter((b) => b.qty !== 0).map((b) => (
                        <MetaChip key={b.locationId}>{b.locationName}: {fmtQty(b.qty)}</MetaChip>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-[#6B6B6B]">
                    {t.costPrice != null ? fmtMoney(t.total * t.costPrice) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

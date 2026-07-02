// ─────────────────────────────────────────────────────────────────────────────
// pages/stock/ReportsView.tsx — stock reporting: a filterable movement history
// (date range / location / reason) with a daily in-vs-out trend chart, materials
// cost by job, valuation by category, top-used items, and CSV exports.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import { Loader2, Download } from "lucide-react";

import { cardShell, StatusPill, inputField, FRAUNCES, type ToneKey } from "../gantt/components/ledger";
import {
  listMovements, listStockLocations, getCompanyTotals,
  type MovementView, type MovementReason, type StockLocation, type CompanyTotal,
} from "../../lib/api/stock";
import { listMaterials } from "../../lib/api/materials";
import { listServiceJobs } from "../../lib/api/serviceJobs";
import { listSimproJobs } from "../../lib/api/simproJobs";
import { downloadCsv } from "../../lib/stock/csv";
import StockTrendChart, { type TrendPoint } from "./StockTrendChart";

const REASON: Record<MovementReason, { label: string; tone: ToneKey }> = {
  usage: { label: "Used", tone: "orange" },
  receipt: { label: "Received", tone: "sage" },
  transfer_out: { label: "Transfer out", tone: "slate" },
  transfer_in: { label: "Transfer in", tone: "slate" },
  adjustment: { label: "Adjustment", tone: "amber" },
  stocktake: { label: "Stock-take", tone: "ink" },
};
const REASON_KEYS = Object.keys(REASON) as MovementReason[];
const OTHER_GROUP = "Other";

const fmtQty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
const fmtMoney = (n: number) => "$" + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString();
const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

export default function ReportsView() {
  const [movements, setMovements] = useState<MovementView[]>([]);
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [totals, setTotals] = useState<CompanyTotal[]>([]);
  const [catByMaterial, setCatByMaterial] = useState<Map<string, string>>(new Map());
  const [jobLabels, setJobLabels] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadingMoves, setLoadingMoves] = useState(false);

  // Filters (default: last 30 days, all locations, all reasons)
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(today());
  const [locationId, setLocationId] = useState("");
  const [reason, setReason] = useState<"" | MovementReason>("");

  // Static context — locations, valuation inputs, job labels.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      listStockLocations().catch(() => []),
      getCompanyTotals().catch(() => []),
      listMaterials().catch(() => []),
      listServiceJobs().catch(() => []),
      listSimproJobs({ limit: 300 }).catch(() => []),
    ])
      .then(([locs, tot, mats, svc, sim]) => {
        if (cancelled) return;
        setLocations(locs);
        setTotals(tot);
        setCatByMaterial(new Map(mats.map((m) => [m.id, m.category?.trim() || OTHER_GROUP])));
        const labels = new Map<string, string>();
        for (const j of svc) labels.set(`service:${j.id}`, j.title);
        for (const j of sim) labels.set(`simpro:${j.id}`, `${j.externalRef}${j.description ? ` — ${j.description}` : ""}`);
        setJobLabels(labels);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Movements — reload when the filters change.
  useEffect(() => {
    let cancelled = false;
    setLoadingMoves(true);
    listMovements({
      locationId: locationId || undefined,
      reason: reason || undefined,
      startDate: from || undefined,
      endDate: to || undefined,
      limit: 500,
    })
      .then((mv) => { if (!cancelled) setMovements(mv); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingMoves(false); });
    return () => { cancelled = true; };
  }, [from, to, locationId, reason]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const trend = useMemo<TrendPoint[]>(() => {
    const byDay = new Map<string, { in: number; out: number; ts: number }>();
    for (const m of movements) {
      const d = new Date(m.createdAt);
      const key = d.toISOString().slice(0, 10);
      const e = byDay.get(key) ?? { in: 0, out: 0, ts: new Date(key).getTime() };
      if (m.qtyDelta >= 0) e.in += m.qtyDelta; else e.out += Math.abs(m.qtyDelta);
      byDay.set(key, e);
    }
    return [...byDay.entries()]
      .sort((a, b) => a[1].ts - b[1].ts)
      .map(([key, e]) => ({
        date: `${new Date(key).getDate()}/${new Date(key).getMonth() + 1}`,
        in: Math.round(e.in * 100) / 100,
        out: Math.round(e.out * 100) / 100,
      }));
  }, [movements]);

  const byJob = useMemo(() => {
    const map = new Map<string, { label: string; cost: number; lines: number }>();
    for (const m of movements) {
      if (m.reason !== "usage") continue;
      const key = m.serviceJobId ? `service:${m.serviceJobId}` : m.simproJobId ? `simpro:${m.simproJobId}` : null;
      if (!key) continue;
      const used = Math.abs(m.qtyDelta);
      const cost = m.unitCost != null ? used * m.unitCost : 0;
      const e = map.get(key) ?? { label: jobLabels.get(key) ?? key, cost: 0, lines: 0 };
      e.cost += cost;
      e.lines += 1;
      map.set(key, e);
    }
    return [...map.values()].map((e) => ({ ...e, cost: Math.round(e.cost * 100) / 100 })).sort((a, b) => b.cost - a.cost);
  }, [movements, jobLabels]);

  const valuation = useMemo(() => {
    const byCat = new Map<string, { items: number; value: number }>();
    for (const t of totals) {
      const cat = catByMaterial.get(t.materialId) ?? OTHER_GROUP;
      const e = byCat.get(cat) ?? { items: 0, value: 0 };
      e.items += 1;
      e.value += t.costPrice != null ? t.total * t.costPrice : 0;
      byCat.set(cat, e);
    }
    const rows = [...byCat.entries()]
      .map(([cat, e]) => ({ cat, items: e.items, value: Math.round(e.value * 100) / 100 }))
      .sort((a, b) => b.value - a.value);
    const totalValue = Math.round(rows.reduce((s, r) => s + r.value, 0) * 100) / 100;
    return { rows, totalValue };
  }, [totals, catByMaterial]);

  const topUsed = useMemo(() => {
    const map = new Map<string, { name: string; unit: string; units: number; cost: number }>();
    for (const m of movements) {
      if (m.reason !== "usage") continue;
      const used = Math.abs(m.qtyDelta);
      const e = map.get(m.materialId) ?? { name: m.name, unit: m.unit, units: 0, cost: 0 };
      e.units += used;
      e.cost += m.unitCost != null ? used * m.unitCost : 0;
      map.set(m.materialId, e);
    }
    return [...map.values()].sort((a, b) => b.units - a.units).slice(0, 10);
  }, [movements]);

  // ── CSV exports ───────────────────────────────────────────────────────────
  const stamp = () => new Date().toISOString().slice(0, 10);
  function exportMovements() {
    downloadCsv(`stock-movements-${stamp()}`, ["Date", "Item", "Location", "Reason", "Qty", "Unit", "Unit cost", "Job"],
      movements.map((m) => [
        fmtDate(m.createdAt), m.name, m.locationName, REASON[m.reason].label, m.qtyDelta, m.unit,
        m.unitCost != null ? m.unitCost.toFixed(2) : "",
        m.serviceJobId ? (jobLabels.get(`service:${m.serviceJobId}`) ?? "") : m.simproJobId ? (jobLabels.get(`simpro:${m.simproJobId}`) ?? "") : "",
      ]));
  }
  function exportByJob() {
    downloadCsv(`materials-cost-by-job-${stamp()}`, ["Job", "Usage lines", "Materials cost"], byJob.map((j) => [j.label, j.lines, j.cost.toFixed(2)]));
  }
  function exportValuation() {
    downloadCsv(`stock-valuation-${stamp()}`, ["Category", "Items", "Value (cost)"],
      [...valuation.rows.map((r) => [r.cat, r.items, r.value.toFixed(2)] as (string | number)[]), ["TOTAL", "", valuation.totalValue.toFixed(2)]]);
  }

  if (loading) {
    return <div className={`flex items-center gap-2 px-5 py-8 text-sm text-[#A0A0A0] ${cardShell}`}><Loader2 className="h-4 w-4 animate-spin" /> Loading reports…</div>;
  }

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-2">
        <label><span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">From</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${inputField} w-40`} /></label>
        <label><span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">To</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={`${inputField} w-40`} /></label>
        <label><span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Location</span>
          <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className={`${inputField} w-44`}>
            <option value="">All locations</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select></label>
        <label><span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Type</span>
          <select value={reason} onChange={(e) => setReason(e.target.value as "" | MovementReason)} className={`${inputField} w-40`}>
            <option value="">All types</option>
            {REASON_KEYS.map((r) => <option key={r} value={r}>{REASON[r].label}</option>)}
          </select></label>
        {loadingMoves && <Loader2 className="mb-2.5 h-4 w-4 animate-spin text-[#A0A0A0]" />}
      </div>

      {/* Trend */}
      <div className={`px-5 py-4 ${cardShell}`}>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6B6B6B]">Daily movement volume</p>
        {trend.length === 0 ? (
          <p className="py-8 text-center text-sm text-[#A0A0A0]">No movements in this range.</p>
        ) : (
          <StockTrendChart data={trend} />
        )}
      </div>

      {/* Cost by job + valuation */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6B6B6B]">Materials cost by job</p>
            <button type="button" onClick={exportByJob} className="inline-flex items-center gap-1 rounded-md border border-[#E6E1D4] bg-white px-2 py-1 text-[11px] font-semibold text-[#3A3A3A] hover:bg-[#FAF8F2]"><Download className="h-3 w-3" /> CSV</button>
          </div>
          <div className={`overflow-x-auto ${cardShell}`}>
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-[#E6E1D4] bg-[#FAF8F2]">
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Job</th>
                  <th className="w-20 px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Lines</th>
                  <th className="w-32 px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EFEBE0]">
                {byJob.length === 0 && <tr><td colSpan={3} className="px-4 py-8 text-center text-sm text-[#A0A0A0]">No materials used on jobs in this range.</td></tr>}
                {byJob.map((j) => (
                  <tr key={j.label} className="hover:bg-[#FAF8F2]">
                    <td className="px-4 py-2.5 text-[#1A1A1A]">{j.label}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-[#6B6B6B]">{j.lines}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-[#1A1A1A]">{fmtMoney(j.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6B6B6B]">Stock value by category</p>
            <button type="button" onClick={exportValuation} className="inline-flex items-center gap-1 rounded-md border border-[#E6E1D4] bg-white px-2 py-1 text-[11px] font-semibold text-[#3A3A3A] hover:bg-[#FAF8F2]"><Download className="h-3 w-3" /> CSV</button>
          </div>
          <div className={`overflow-x-auto ${cardShell}`}>
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-[#E6E1D4] bg-[#FAF8F2]">
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Category</th>
                  <th className="w-20 px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Items</th>
                  <th className="w-32 px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EFEBE0]">
                {valuation.rows.length === 0 && <tr><td colSpan={3} className="px-4 py-8 text-center text-sm text-[#A0A0A0]">No stock on hand yet.</td></tr>}
                {valuation.rows.map((r) => (
                  <tr key={r.cat} className="hover:bg-[#FAF8F2]">
                    <td className="px-4 py-2.5 text-[#1A1A1A]">{r.cat}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-[#6B6B6B]">{r.items}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-[#3A3A3A]">{fmtMoney(r.value)}</td>
                  </tr>
                ))}
              </tbody>
              {valuation.rows.length > 0 && (
                <tfoot>
                  <tr className="border-t border-[#E6E1D4] bg-[#FAF8F2]">
                    <td className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]" colSpan={2}>Total</td>
                    <td className="px-4 py-2 text-right tabular-nums font-semibold text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>{fmtMoney(valuation.totalValue)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>

      {/* Top used items */}
      {topUsed.length > 0 && (
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6B6B6B]">Most-used items (this range)</p>
          <div className={`overflow-x-auto ${cardShell}`}>
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-[#E6E1D4] bg-[#FAF8F2]">
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Item</th>
                  <th className="w-28 px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Units used</th>
                  <th className="w-28 px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EFEBE0]">
                {topUsed.map((t) => (
                  <tr key={t.name} className="hover:bg-[#FAF8F2]">
                    <td className="px-4 py-2.5 text-[#1A1A1A]">{t.name}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-[#3A3A3A]">{fmtQty(t.units)} <span className="text-[11px] text-[#A0A0A0]">{t.unit}</span></td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-[#6B6B6B]">{fmtMoney(Math.round(t.cost * 100) / 100)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Movement history */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6B6B6B]">Movement history</p>
          <button type="button" onClick={exportMovements} className="inline-flex items-center gap-1 rounded-md border border-[#E6E1D4] bg-white px-2 py-1 text-[11px] font-semibold text-[#3A3A3A] hover:bg-[#FAF8F2]"><Download className="h-3 w-3" /> CSV</button>
        </div>
        <div className={`overflow-x-auto ${cardShell}`}>
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-[#E6E1D4] bg-[#FAF8F2]">
                <th className="w-24 px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Date</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Item</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Location</th>
                <th className="w-28 px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Reason</th>
                <th className="w-24 px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Qty</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EFEBE0]">
              {movements.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-[#A0A0A0]">No stock movements match these filters.</td></tr>
              )}
              {movements.map((m) => {
                const r = REASON[m.reason];
                const up = m.qtyDelta >= 0;
                return (
                  <tr key={m.id} className="hover:bg-[#FAF8F2]">
                    <td className="px-4 py-2.5 text-[#6B6B6B]">{fmtDate(m.createdAt)}</td>
                    <td className="px-4 py-2.5 text-[#1A1A1A]">{m.name}</td>
                    <td className="px-4 py-2.5 text-[#3A3A3A]">{m.locationName}</td>
                    <td className="px-4 py-2.5"><StatusPill tone={r.tone}>{r.label}</StatusPill></td>
                    <td className={`px-4 py-2.5 text-right tabular-nums ${up ? "text-[#246F47]" : "text-[#C44545]"}`}>{up ? "+" : ""}{fmtQty(m.qtyDelta)} <span className="text-[11px] text-[#A0A0A0]">{m.unit}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-[#A0A0A0]">Showing up to 500 movements for the selected range.</p>
      </div>
    </div>
  );
}

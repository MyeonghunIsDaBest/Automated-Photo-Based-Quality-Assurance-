// ─────────────────────────────────────────────────────────────────────────────
// pages/stock/ReportsView.tsx — manager Phase 4: materials cost by job (from
// stock usage) + the recent stock-movement history (audit trail).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

import { cardShell, StatusPill, type ToneKey } from "../gantt/components/ledger";
import { listRecentMovements, type MovementView, type MovementReason } from "../../lib/api/stock";
import { listServiceJobs } from "../../lib/api/serviceJobs";
import { listSimproJobs } from "../../lib/api/simproJobs";

const REASON: Record<MovementReason, { label: string; tone: ToneKey }> = {
  usage: { label: "Used", tone: "orange" },
  receipt: { label: "Received", tone: "sage" },
  transfer_out: { label: "Transfer out", tone: "slate" },
  transfer_in: { label: "Transfer in", tone: "slate" },
  adjustment: { label: "Adjustment", tone: "amber" },
  stocktake: { label: "Stock-take", tone: "ink" },
};
const fmtQty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
const fmtMoney = (n: number) => "$" + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString();

export default function ReportsView() {
  const [movements, setMovements] = useState<MovementView[]>([]);
  const [jobLabels, setJobLabels] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      listRecentMovements(300),
      listServiceJobs().catch(() => []),
      listSimproJobs({ limit: 300 }).catch(() => []),
    ])
      .then(([mv, svc, sim]) => {
        if (cancelled) return;
        setMovements(mv);
        const labels = new Map<string, string>();
        for (const j of svc) labels.set(`service:${j.id}`, j.title);
        for (const j of sim) labels.set(`simpro:${j.id}`, `${j.externalRef}${j.description ? ` — ${j.description}` : ""}`);
        setJobLabels(labels);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Materials cost by job — from usage movements (used qty × unit cost).
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

  if (loading) {
    return <div className={`flex items-center gap-2 px-5 py-8 text-sm text-[#A0A0A0] ${cardShell}`}><Loader2 className="h-4 w-4 animate-spin" /> Loading reports…</div>;
  }

  return (
    <div className="space-y-5">
      {/* Materials cost by job */}
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6B6B6B]">Materials cost by job (from van usage)</p>
        <div className={`overflow-x-auto ${cardShell}`}>
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-[#E6E1D4] bg-[#FAF8F2]">
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Job</th>
                <th className="w-24 px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Lines</th>
                <th className="w-32 px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Materials cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EFEBE0]">
              {byJob.length === 0 && (
                <tr><td colSpan={3} className="px-4 py-8 text-center text-sm text-[#A0A0A0]">No materials used on jobs yet. As the boys record usage, the cost per job builds up here.</td></tr>
              )}
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

      {/* Movement history */}
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6B6B6B]">Recent stock movements</p>
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
                <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-[#A0A0A0]">No stock movements yet.</td></tr>
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
        <p className="mt-2 text-[11px] text-[#A0A0A0]">Showing the most recent 300 movements. CSV import + barcode scanning for bulk stock-takes are a future add-on.</p>
      </div>
    </div>
  );
}

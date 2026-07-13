// ─────────────────────────────────────────────────────────────────────────────
// pages/stock/StockItemDrawer.tsx — one item's full picture: where it is (per
// location), its min/target, value on hand, and its recent movement history.
// Opened by a row-click on the Overview or a Location. (Stock enhancement pass.)
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { Loader2, X, AlertTriangle } from "lucide-react";

import MotionDrawer from "../../components/ui/MotionDrawer";
import { cardShell, StatusPill, MetaChip, FRAUNCES, type ToneKey } from "../gantt/components/ledger";
import { getCompanyTotals, listMovements, type CompanyTotal, type MovementView, type MovementReason } from "../../lib/api/stock";
import { listReorderRules, type ReorderRule } from "../../lib/api/purchasing";
import { fmtMoney, fmtQty } from "../../lib/format";

const REASON: Record<MovementReason, { label: string; tone: ToneKey }> = {
  usage: { label: "Used", tone: "orange" },
  receipt: { label: "Received", tone: "sage" },
  transfer_out: { label: "Transfer out", tone: "slate" },
  transfer_in: { label: "Transfer in", tone: "slate" },
  adjustment: { label: "Adjustment", tone: "amber" },
  stocktake: { label: "Stock-take", tone: "ink" },
};
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString();

export default function StockItemDrawer({ materialId, onClose }: { materialId: string | null; onClose: () => void }) {
  const [item, setItem] = useState<CompanyTotal | null>(null);
  const [rule, setRule] = useState<ReorderRule | null>(null);
  const [moves, setMoves] = useState<MovementView[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!materialId) { setItem(null); setMoves([]); setRule(null); return; }
    let cancelled = false;
    setLoading(true);
    Promise.all([
      getCompanyTotals().catch(() => [] as CompanyTotal[]),
      listReorderRules().catch(() => [] as ReorderRule[]),
      listMovements({ materialId, limit: 50 }).catch(() => [] as MovementView[]),
    ])
      .then(([totals, rules, mv]) => {
        if (cancelled) return;
        setItem(totals.find((t) => t.materialId === materialId) ?? null);
        setRule(rules.find((r) => r.materialId === materialId) ?? null);
        setMoves(mv);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [materialId]);

  const total = item?.total ?? 0;
  const value = item && item.costPrice != null ? total * item.costPrice : null;
  const low = rule?.reorderEnabled && total < rule.minQty;

  return (
    <MotionDrawer open={!!materialId} onClose={onClose} ariaLabel="Item detail" sizeClass="sm:w-[480px] lg:w-[520px]">
      {loading || !item ? (
        <div className="flex flex-1 items-center justify-center gap-2 p-8 text-sm text-[#A0A0A0]"><Loader2 className="h-4 w-4 animate-spin" /> Loading item…</div>
      ) : (
        <>
          <div className="flex items-start justify-between border-b border-[#E6E1D4] px-5 py-4">
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold text-[#1A1A1A]">{item.name}</h2>
              <p className="mt-0.5 text-[13px] text-[#6B6B6B]">{[item.sku, item.unit].filter(Boolean).join(" · ")}</p>
            </div>
            <button type="button" onClick={onClose} className="text-[#A0A0A0] hover:text-[#C44545]"><X className="h-4 w-4" /></button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            {/* Headline stats */}
            <div className="mb-4 flex flex-wrap items-end gap-x-8 gap-y-3">
              <div>
                <div className={`text-[26px] font-medium leading-none tabular-nums ${low ? "text-[#C44545]" : "text-[#1A1A1A]"}`} style={{ fontFamily: FRAUNCES }}>{fmtQty(total)}</div>
                <div className="mt-1 text-[11px] font-medium uppercase tracking-[0.1em] text-[#6B6B6B]">On hand ({item.unit})</div>
              </div>
              {value != null && (
                <div>
                  <div className="text-[26px] font-medium leading-none tabular-nums text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>{fmtMoney(value)}</div>
                  <div className="mt-1 text-[11px] font-medium uppercase tracking-[0.1em] text-[#6B6B6B]">Value (cost)</div>
                </div>
              )}
              {rule && (rule.minQty > 0 || rule.targetQty > 0) && (
                <div className="flex items-center gap-2 text-[13px] text-[#6B6B6B]">
                  <span>Min {fmtQty(rule.minQty)} · Target {fmtQty(rule.targetQty)}</span>
                  {low && <span className="inline-flex items-center gap-1 rounded-full bg-[#F9EFD9] px-2 py-0.5 text-[11px] font-semibold text-[#C8841E]"><AlertTriangle className="h-3 w-3" /> Low</span>}
                </div>
              )}
            </div>

            {/* Where it is */}
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Where it is</p>
            <div className="mb-4 flex flex-wrap gap-1.5">
              {item.byLocation.filter((b) => b.qty !== 0).length === 0 && <span className="text-sm text-[#A0A0A0]">Nothing on hand.</span>}
              {item.byLocation.filter((b) => b.qty !== 0).map((b) => (
                <MetaChip key={b.locationId}>{b.locationName}: {fmtQty(b.qty)}</MetaChip>
              ))}
            </div>

            {/* Recent movements */}
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Recent movements</p>
            <div className={`overflow-hidden ${cardShell}`}>
              {moves.length === 0 ? (
                <p className="px-3 py-4 text-sm text-[#A0A0A0]">No movements yet.</p>
              ) : (
                <ul className="divide-y divide-[#EFEBE0]">
                  {moves.map((m) => {
                    const r = REASON[m.reason];
                    const up = m.qtyDelta >= 0;
                    return (
                      <li key={m.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                        <span className="w-20 shrink-0 text-xs text-[#A0A0A0]">{fmtDate(m.createdAt)}</span>
                        <StatusPill tone={r.tone}>{r.label}</StatusPill>
                        <span className="min-w-0 flex-1 truncate text-[#6B6B6B]">{m.locationName}</span>
                        <span className={`shrink-0 tabular-nums ${up ? "text-[#246F47]" : "text-[#C44545]"}`}>{up ? "+" : ""}{fmtQty(m.qtyDelta)}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </MotionDrawer>
  );
}

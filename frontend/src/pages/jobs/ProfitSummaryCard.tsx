// pages/jobs/ProfitSummaryCard.tsx — PP1 profit summary widget.
//
// Intentionally has NO internal role gate — this card only mounts inside
// manager-gated surfaces (e.g. the service-job detail panel, project finance
// panel). The host is responsible for ensuring workers never see it.

import { cardShell, TONE } from "../gantt/components/ledger";
import { SkeletonLine } from "../../components/ui/skeleton";
import { formatAUD } from "../../lib/commercial/costing";
import type { JobProfitResult } from "../../lib/api/labourRates";

// ─── types ───────────────────────────────────────────────────────────────────

interface Props {
  profit: JobProfitResult | null;
  loading?: boolean;
  onSetFinancials?: () => void;
}

// ─── sub-components ──────────────────────────────────────────────────────────

function Row({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  const textCls = bold
    ? "text-[13px] font-semibold text-[#1A1A1A] tabular-nums"
    : "text-[13px] text-[#3A3A3A] tabular-nums";
  return (
    <div className="flex items-center justify-between py-[5px]">
      <span className={bold ? "text-[13px] font-semibold text-[#1A1A1A]" : "text-[13px] text-[#6B6B6B]"}>
        {label}
      </span>
      <span className={textCls}>{value}</span>
    </div>
  );
}

type PillTone = "sage" | "amber" | "red";

function MarginPill({ pct, net }: { pct: number | null; net: number }) {
  if (pct === null) {
    return <span className="text-[13px] text-[#A0A0A0]">{"—"}</span>;
  }

  let tone: PillTone;
  if (net < 0) {
    tone = "red";
  } else if (pct < 10) {
    tone = "amber";
  } else {
    tone = "sage";
  }

  const { fg, bg } = TONE[tone];
  return (
    <span
      className="inline-block rounded-full px-2 py-0.5 text-[12px] font-semibold tabular-nums"
      style={{ color: fg, backgroundColor: bg }}
    >
      {pct.toFixed(1)}%
    </span>
  );
}

// ─── loading state ────────────────────────────────────────────────────────────

function LoadingBody() {
  return (
    <div className="space-y-3 px-5 py-4">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <SkeletonLine key={i} className={i % 2 === 0 ? "w-3/5" : "w-2/3"} />
      ))}
    </div>
  );
}

// ─── main component ──────────────────────────────────────────────────────────

export default function ProfitSummaryCard({ profit, loading, onSetFinancials }: Props) {
  return (
    <div className={`${cardShell} overflow-hidden`}>
      {/* header */}
      <div className="flex items-center justify-between border-b border-[#EFEBE0] px-5 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6B6B6B]">
          Profit
        </p>
        {onSetFinancials && (
          <button
            onClick={onSetFinancials}
            className="inline-flex items-center gap-1 rounded-full border border-[#E6E1D4] bg-transparent px-3 py-1 text-[12px] font-medium text-[#6B6B6B] transition-colors hover:bg-[#FAF8F2] hover:text-[#3A3A3A]"
          >
            Set revenue / materials
          </button>
        )}
      </div>

      {/* body */}
      {loading || profit === null ? (
        <LoadingBody />
      ) : (
        <div className="px-5 py-3">
          {/* inputs */}
          <Row label="Revenue" value={formatAUD(profit.revenue)} />
          <Row label="Materials" value={formatAUD(profit.materials)} />
          <Row label="Labour" value={formatAUD(profit.labour)} />

          {/* divider */}
          <div className="my-2 border-t border-[#EFEBE0]" />

          {/* outputs */}
          <Row label="Gross" value={formatAUD(profit.gross)} bold />

          {/* net row */}
          <Row label="Net" value={formatAUD(profit.net)} bold />

          {/* margin row — the one place the pill appears */}
          <div className="flex items-center justify-between py-[3px]">
            <span className="text-[12px] text-[#A0A0A0]">Margin</span>
            <MarginPill pct={profit.marginPct} net={profit.net} />
          </div>

          {/* honest flags */}
          {(profit.materials === null || profit.uncostedHours > 0) && (
            <div className="mt-3 space-y-1.5 border-t border-[#EFEBE0] pt-3">
              {profit.materials === null && (
                <p className="text-[11px] text-[#A0A0A0]">Materials not entered</p>
              )}
              {profit.uncostedHours > 0 && (
                <p className="text-[11px] text-amber-600">
                  {profit.uncostedHours}h uncosted {"—"} assign a role or set its rate
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

import { useFinanceStore } from '../../store/finance';
import { FRAUNCES } from '../../pages/gantt/components/ledger';
import { DollarSign } from 'lucide-react';

// Command-lens finance summary (Phase 1) — a compact budget-utilisation card
// for the active project, shown on the Dashboard for PM + admins (gated by
// canViewFinance upstream). Read-only glance; the editable detail lives on the
// Reports → Financial tab. Reads the same finance store as Reports.
const fmt = (n: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n);

export default function FinanceSummaryCard({ projectId }: { projectId: string }) {
  const budget = useFinanceStore((s) => s.budgets[projectId]);

  return (
    <section className="overflow-hidden rounded-[16px] border border-[#E6E1D4] bg-white shadow-[0_1px_0_0_rgba(15,23,42,0.04),0_1px_2px_-1px_rgba(15,23,42,0.06)]">
      <div className="flex items-center gap-3 border-b border-[#E6E1D4] px-5 py-4">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] bg-[#1A1A1A] text-white" aria-hidden>
          <DollarSign className="h-4 w-4" strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          <p className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-[#6B6B6B]">Budget</p>
          <h3 className="mt-px text-[18px] font-medium text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>At a glance</h3>
        </div>
      </div>

      <div className="p-5 pt-4">
      {!budget ? (
        <div>
          <p className="num text-2xl font-medium text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>—</p>
          <p className="mt-1 text-sm text-[#6B6B6B]">No budget set. Set one on Reports → Financial.</p>
        </div>
      ) : (() => {
        const spentPct = budget.total > 0 ? Math.round((budget.spent / budget.total) * 100) : 0;
        const committedPct = budget.total > 0 ? Math.round((budget.committed / budget.total) * 100) : 0;
        const remaining = budget.total - budget.spent - budget.committed;
        return (
          <>
            <p className="text-2xl font-semibold tabular-nums text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>
              {fmt(budget.total)}
            </p>
            <p className="mt-1 text-sm text-[#6B6B6B]">{spentPct + committedPct}% allocated</p>
            <div className="mt-3 flex h-2 w-full overflow-hidden rounded-full bg-[#F0EDE4]">
              <div className="h-full bg-[#2F8F5C]" style={{ width: `${Math.min(100, spentPct)}%` }} />
              <div className="h-full bg-[#D69A2E]" style={{ width: `${Math.min(100 - Math.min(100, spentPct), committedPct)}%` }} />
            </div>
            <div className="mt-3 flex flex-wrap justify-between gap-2 text-[11px] text-[#6B6B6B]">
              <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-[#2F8F5C]" /> Spent {fmt(budget.spent)}</span>
              <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-[#D69A2E]" /> Committed {fmt(budget.committed)}</span>
              <span className={`flex items-center gap-1.5 ${remaining < 0 ? 'text-[#C44545]' : ''}`}>
                <span className="inline-block h-2 w-2 rounded-full bg-[#E6E1D4]" /> {remaining < 0 ? 'Over' : 'Left'} {fmt(Math.abs(remaining))}
              </span>
            </div>
          </>
        );
      })()}
      </div>
    </section>
  );
}

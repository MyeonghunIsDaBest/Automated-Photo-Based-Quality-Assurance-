import { useFinanceStore } from '../../store/finance';
import { FRAUNCES } from '../../pages/gantt/components/ledger';
import { DollarSign } from 'lucide-react';

// Command-lens finance summary (Phase 1) — a compact budget-utilisation card
// for the active project, shown on the Dashboard for PM + admins (gated by
// canViewFinance upstream). Read-only glance; the editable detail lives on the
// Reports → Financial tab. Reads the same finance store as Reports.
const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

export default function FinanceSummaryCard({ projectId }: { projectId: string }) {
  const budget = useFinanceStore((s) => s.budgets[projectId]);

  return (
    <section className="rounded-[14px] border border-[#E6E1D4] bg-white p-5 shadow-[0_1px_2px_rgba(20,20,20,0.04)]">
      <div className="mb-3 flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.18em] text-[#6B6B6B]">
        Budget
        <DollarSign className="h-3.5 w-3.5 text-[#2F8F5C]" />
      </div>

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
            <p className="text-2xl font-medium text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>
              {fmt(budget.total)}
            </p>
            <p className="mt-1 text-sm text-[#6B6B6B]">{spentPct + committedPct}% allocated</p>
            <div className="mt-3 flex h-2 w-full overflow-hidden rounded-full bg-[#F0EDE4]">
              <div className="h-full bg-[#2F8F5C]" style={{ width: `${Math.min(100, spentPct)}%` }} />
              <div className="h-full bg-[#C8841E]" style={{ width: `${Math.min(100 - Math.min(100, spentPct), committedPct)}%` }} />
            </div>
            <div className="mt-3 flex flex-wrap justify-between gap-2 text-[11px] text-[#6B6B6B]">
              <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-[#2F8F5C]" /> Spent {fmt(budget.spent)}</span>
              <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-[#C8841E]" /> Committed {fmt(budget.committed)}</span>
              <span className={`flex items-center gap-1.5 ${remaining < 0 ? 'text-[#C44545]' : ''}`}>
                <span className="inline-block h-2 w-2 rounded-full bg-[#E6E1D4]" /> {remaining < 0 ? 'Over' : 'Left'} {fmt(Math.abs(remaining))}
              </span>
            </div>
          </>
        );
      })()}
    </section>
  );
}

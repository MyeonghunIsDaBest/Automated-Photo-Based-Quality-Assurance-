import { useProjectsListStore } from '../../pages/projects/store';
import { usePortfolioRollup } from '../../lib/hooks/usePortfolioRollup';
import { FRAUNCES, StatusPill, type ToneKey } from '../../pages/gantt/components/ledger';
import { Layers, ArrowUpRight } from 'lucide-react';

// Construction Manager's portfolio lens (Phase 1). A multi-project oversight
// band above the single-project dashboard. Clicking a project switches the
// active project so the detail below re-scopes to it (drill-in). Honest about
// data: scheduled position is real for every project (from dates); progress is
// real only for projects whose tasks are loaded, else "—".

const STATUS_TONE: Record<string, { tone: ToneKey; label: string }> = {
  active:    { tone: 'sage',  label: 'Active' },
  on_hold:   { tone: 'amber', label: 'On hold' },
  completed: { tone: 'slate', label: 'Completed' },
  archived:  { tone: 'ink',   label: 'Archived' },
};
const BEHIND_TONE: { tone: ToneKey; label: string } = { tone: 'red', label: 'Behind' };
const toneFor = (s: string) => STATUS_TONE[s] ?? { tone: 'ink' as ToneKey, label: s };

export default function PortfolioRollupBand() {
  const { total, behind, byStatus, rows } = usePortfolioRollup();
  const activeId = useProjectsListStore((s) => s.activeProjectId);
  const setActive = useProjectsListStore((s) => s.setActiveProject);

  if (total === 0) return null;

  // Right-aligned stat cluster — mock colours mapped to ledger TONE fg hexes
  // (ink / emerald / red / amber). All four counts come straight off the
  // already-computed rollup; nothing is derived here.
  const stats: { label: string; value: number; tone: string }[] = [
    { label: 'Projects', value: total, tone: '#1A1A1A' },
    { label: 'Active', value: byStatus.active ?? 0, tone: '#2F8F5C' },
    { label: 'Behind', value: behind, tone: '#C44545' },
    { label: 'On hold', value: byStatus.on_hold ?? 0, tone: '#9A6B12' },
  ];

  return (
    <section className="mb-6 overflow-hidden rounded-[16px] border border-[#E6E1D4] bg-white shadow-[0_1px_0_0_rgba(15,23,42,0.04),0_1px_2px_-1px_rgba(15,23,42,0.06)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#EFEBE0] px-5 py-4">
        <div className="flex min-w-0 items-center gap-[11px]">
          <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-[9px] bg-[#1A1A1A] text-white"><Layers className="h-4 w-4" /></span>
          <div className="min-w-0">
            <p className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-[#6B6B6B]">Portfolio</p>
            <h2 className="mt-px text-[18px] font-semibold leading-tight text-[#1A1A1A]" style={{ fontFamily: FRAUNCES, letterSpacing: '-0.015em' }}>Across your projects</h2>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
          {stats.map((s) => (
            <div key={s.label} className="text-right">
              <div className="text-[19px] font-semibold leading-none tabular-nums" style={{ fontFamily: FRAUNCES, color: s.tone }}>{s.value}</div>
              <div className="mt-[3px] text-[9.5px] font-bold uppercase tracking-[0.08em] text-[#6B6B6B]">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      <ul className="max-h-72 divide-y divide-[#EFEBE0] overflow-y-auto">
        {rows.map((r) => {
          const t = toneFor(r.status);
          const isActive = r.id === activeId;
          return (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => setActive(r.id)}
                className={`group flex w-full items-center justify-between gap-3 px-5 py-3 text-left transition-colors hover:bg-[#FAF8F2] ${isActive ? 'bg-[#E5F2EA]/40' : ''}`}
              >
                <div className="flex min-w-0 items-center gap-3">
                  {isActive && <span className="h-6 w-1 flex-shrink-0 rounded-full bg-[#2F8F5C]" aria-hidden />}
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-medium text-[#1A1A1A]">{r.name}</p>
                    <p className="truncate text-[11.5px] text-[#6B6B6B]">{r.client ?? 'No client'} · {r.daysRemaining}d left</p>
                  </div>
                </div>
                <div className="flex flex-shrink-0 items-center gap-3">
                  <span className="hidden text-right sm:block">
                    <span className="text-[11px] tabular-nums text-[#6B6B6B]">
                      {r.progress != null ? `${r.progress}%` : '—'}
                      <span className="text-[#A0A0A0]"> / {r.scheduledPct}% sched</span>
                    </span>
                  </span>
                  <StatusPill tone={(r.behind ? BEHIND_TONE : t).tone} className="uppercase tracking-wider">
                    {r.behind ? 'Behind' : t.label}
                  </StatusPill>
                  <ArrowUpRight className="h-3.5 w-3.5 flex-shrink-0 text-[#D8D2C4] transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[#246F47]" aria-hidden />
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

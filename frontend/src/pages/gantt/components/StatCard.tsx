import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

// Shared gantt-tab KPI band. One stat-card language across every workspace tab
// (Crew / Supplier / Inventory / Plans / Uploads) so they read as the same
// product as the Overview / AI-Analysis / Defects reference pages. A white
// rounded-2xl card with a short top accent bar, a tinted icon chip, a soft
// corner glow, a Fraunces `.display` value, and a caption. Presentation only —
// each tab feeds it numbers it already computes from live data.

export type StatTone = 'emerald' | 'blue' | 'amber' | 'red' | 'slate' | 'indigo' | 'violet';

const TONES: Record<StatTone, { bar: string; chip: string; glow: string }> = {
  emerald: { bar: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-600', glow: 'bg-emerald-400/15' },
  blue:    { bar: 'bg-blue-500',    chip: 'bg-blue-50 text-blue-600',       glow: 'bg-blue-400/15' },
  amber:   { bar: 'bg-amber-400',   chip: 'bg-amber-50 text-amber-600',     glow: 'bg-amber-300/20' },
  red:     { bar: 'bg-red-500',     chip: 'bg-red-50 text-red-600',         glow: 'bg-red-400/15' },
  slate:   { bar: 'bg-slate-400',   chip: 'bg-slate-100 text-slate-500',    glow: 'bg-slate-300/20' },
  indigo:  { bar: 'bg-indigo-500',  chip: 'bg-indigo-50 text-indigo-600',   glow: 'bg-indigo-400/15' },
  violet:  { bar: 'bg-violet-500',  chip: 'bg-violet-50 text-violet-600',   glow: 'bg-violet-400/15' },
};

export interface StatCardProps {
  icon: LucideIcon;
  label: string;
  /** Number or pre-formatted string (e.g. a currency total). */
  value: ReactNode;
  /** Optional sub-caption under the value. */
  sub?: string;
  tone?: StatTone;
  /** Stagger delay (ms) for the load-in reveal. */
  delay?: number;
}

export function StatCard({ icon: Icon, label, value, sub, tone = 'slate', delay = 0 }: StatCardProps) {
  const t = TONES[tone];
  return (
    <div
      className="sp-rise relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition hover:shadow-md"
      style={{ animationDelay: `${delay}ms` }}
    >
      <span className={`absolute left-6 top-0 h-1 w-10 rounded-b-full ${t.bar}`} aria-hidden="true" />
      <span className={`pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full blur-2xl ${t.glow}`} aria-hidden="true" />
      <div className="flex items-center gap-2.5">
        <span className={`grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl ${t.chip}`}>
          <Icon className="h-5 w-5" />
        </span>
        <span className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</span>
      </div>
      <p
        className="display mt-3 truncate text-[26px] font-medium leading-none tabular-nums text-slate-900 sm:text-3xl"
        title={typeof value === 'string' || typeof value === 'number' ? String(value) : undefined}
      >
        {value}
      </p>
      {sub && <p className="mt-1.5 text-[11px] text-slate-400">{sub}</p>}
    </div>
  );
}

/** Responsive grid wrapper for `StatCard`s — matches the reference bands.
 *  Defaults to 4-up on lg; pass `cols={5}` for a denser five-across band
 *  (narrower cards) where a tab needs a fifth KPI on one row. */
export function StatBand({
  children, className = '', cols = 4,
}: {
  children: ReactNode;
  className?: string;
  cols?: 4 | 5;
}) {
  const lg = cols === 5 ? 'lg:grid-cols-5' : 'lg:grid-cols-4';
  return (
    <div className={`grid grid-cols-2 gap-3 sm:gap-4 ${lg} ${className}`}>
      {children}
    </div>
  );
}

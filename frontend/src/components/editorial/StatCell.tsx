import { statCard, cn } from '../../lib/editorial';

type Accent = 'emerald' | 'blue' | 'amber' | 'rose' | 'violet' | 'slate';

const ACCENT_BAR: Record<Accent, string> = {
  emerald: 'bg-emerald-500',
  blue:    'bg-blue-500',
  amber:   'bg-amber-500',
  rose:    'bg-rose-500',
  violet:  'bg-violet-500',
  slate:   'bg-slate-700',
};

interface StatCellProps {
  label: string;
  value: React.ReactNode;
  /** One-line caption shown below the value. */
  caption?: string;
  accent?: Accent;
  /** Raw hex/rgb override for the accent bar. Wins over `accent` when set —
   *  Reports.tsx uses this to keep its bespoke palette without losing the
   *  shared layout. Default consumers should stick with the named tokens. */
  accentColor?: string;
  /** Optional unit suffix rendered next to the value in muted slate. */
  unit?: string;
  className?: string;
}

export default function StatCell({
  label,
  value,
  caption,
  accent = 'slate',
  accentColor,
  unit,
  className,
}: StatCellProps) {
  return (
    <div className={cn(statCard, className)}>
      <span
        className={cn(
          'absolute top-0 left-0 h-1 w-12 rounded-br-full',
          accentColor ? undefined : ACCENT_BAR[accent],
        )}
        style={accentColor ? { backgroundColor: accentColor } : undefined}
        aria-hidden
      />
      <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
      <p className="mt-3 num text-2xl font-medium text-slate-900 sm:text-3xl">
        {value}
        {unit && <span className="ml-1 text-base font-normal text-slate-400">{unit}</span>}
      </p>
      {caption && <p className="mt-1 text-xs text-slate-500">{caption}</p>}
    </div>
  );
}

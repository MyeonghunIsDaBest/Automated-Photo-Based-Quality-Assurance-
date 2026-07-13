// ─────────────────────────────────────────────────────────────────────────────
// components/ui/Stepper.tsx — thumb-sized quantity control (P9.A).
//
// [−] [ value ] [+] with 44px buttons — for quote line cards, pickers, and any
// qty field a worker touches on a phone. Clamps to min/max on commit; typing
// stays free-form until blur/Enter so decimals aren't fought mid-keystroke.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { cn } from '../../lib/cn';

interface StepperProps {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  id?: string;
  disabled?: boolean;
  className?: string;
  /** Accessible name for the value input, e.g. "Quantity". */
  label?: string;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function Stepper({
  value, onChange, min = 0, max = Number.MAX_SAFE_INTEGER, step = 1,
  id, disabled, className, label = 'Quantity',
}: StepperProps) {
  const [draft, setDraft] = useState(String(value));

  // Follow external value changes (e.g. a reload) without clobbering typing.
  useEffect(() => { setDraft(String(value)); }, [value]);

  const commit = () => {
    const n = parseFloat(draft);
    if (!Number.isFinite(n)) { setDraft(String(value)); return; }
    const next = clamp(n, min, max);
    setDraft(String(next));
    if (next !== value) onChange(next);
  };

  const nudge = (dir: 1 | -1) => {
    const next = clamp((Number.isFinite(parseFloat(draft)) ? parseFloat(draft) : value) + dir * step, min, max);
    setDraft(String(next));
    if (next !== value) onChange(next);
  };

  const btn =
    'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#E6E1D4] bg-white text-[#3A3A3A] transition-colors hover:bg-[#FAF8F2] disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <div className={cn('inline-flex items-center gap-1.5', className)}>
      <button type="button" onClick={() => nudge(-1)} disabled={disabled || value <= min} className={btn} aria-label={`Decrease ${label.toLowerCase()}`}>
        <Minus className="h-4 w-4" />
      </button>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') { commit(); (e.target as HTMLInputElement).blur(); } }}
        disabled={disabled}
        aria-label={label}
        className="h-11 w-16 rounded-[11px] border border-[#E6E1D4] bg-white text-center text-sm tabular-nums text-[#1A1A1A] focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C] disabled:bg-[#FAF8F2]"
      />
      <button type="button" onClick={() => nudge(1)} disabled={disabled || value >= max} className={btn} aria-label={`Increase ${label.toLowerCase()}`}>
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}

// frontend/src/pages/gantt/tabs/sitediary/CalendarPopover.tsx
//
// Mini month grid with a heatmap of headcount density per day. Triggered
// from DayHeader's Calendar button. Click a day to "navigate" — v1 just
// closes the popover, since date selection isn't wired to anything real.

import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Check } from 'lucide-react';
import {
  addMonths, eachDayOfInterval, endOfMonth, format, isSameDay, isSameMonth,
  startOfMonth, subMonths,
} from 'date-fns';

interface CalendarPopoverProps {
  open: boolean;
  onClose: () => void;
  todayISO: string;
  /** Day-of-month -> heatmap level (0=none, 1=low ... 4=high). Mocked. */
  heatmap?: Record<number, 0 | 1 | 2 | 3 | 4>;
}

const HEAT_BG: Record<0 | 1 | 2 | 3 | 4, string> = {
  0: 'bg-transparent',
  1: 'bg-[#C7DBC9]',
  2: 'bg-[#8FBE9A]',
  3: 'bg-[#2F8F5C]',
  4: 'bg-[#246F47]',
};

// Mocked heatmap matching the user's mockup.
const DEFAULT_HEATMAP: Record<number, 0 | 1 | 2 | 3 | 4> = {
   1: 2, 4: 3, 5: 2, 6: 3, 7: 4, 8: 2, 9: 1,
  11: 3, 12: 3, 13: 4, 14: 2, 15: 3, 16: 1,
  18: 4, 19: 3, 20: 4, 21: 3, 22: 2, 23: 1,
  25: 3,
};

export function CalendarPopover({ open, onClose, todayISO, heatmap = DEFAULT_HEATMAP }: CalendarPopoverProps) {
  const today = useMemo(() => new Date(todayISO + 'T00:00:00'), [todayISO]);
  const [cursor, setCursor] = useState(today);
  const [selected, setSelected] = useState(today);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const firstDow = monthStart.getDay();
  const padBefore = (firstDow + 6) % 7;
  const cells: Array<Date | null> = [
    ...Array.from({ length: padBefore }, () => null),
    ...days,
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  if (!open) return null;

  return (
    <>
      <div onClick={onClose} className="fixed inset-0 z-30" />
      <div
        role="dialog"
        className="absolute top-full right-0 mt-2 z-40 w-[320px] bg-white border border-[#E6E1D4] rounded-[14px] shadow-[0_12px_40px_rgba(20,20,20,0.14),0_2px_8px_rgba(20,20,20,0.08)] p-4"
      >
        <div className="flex items-center justify-between mb-3.5">
          <h3 className="text-[16px] font-medium m-0" style={{ fontFamily: "'Fraunces', Georgia, serif", letterSpacing: '-0.01em' }}>
            {format(cursor, 'MMMM')}
            <span className="text-[#6B6B6B] font-normal ml-1">· {format(cursor, 'yyyy')}</span>
          </h3>
          <div className="inline-flex items-center gap-0.5 bg-[#FAF8F2] rounded-full p-0.5">
            <button
              type="button"
              onClick={() => setCursor((d) => subMonths(d, 1))}
              className="w-6 h-6 grid place-items-center rounded-full hover:bg-white"
            >
              <ChevronLeft className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => setCursor((d) => addMonths(d, 1))}
              className="w-6 h-6 grid place-items-center rounded-full hover:bg-white"
            >
              <ChevronRight className="h-3 w-3" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 mb-1">
          {['M','T','W','T','F','S','S'].map((c, i) => (
            <div key={i} className="text-center text-[10px] text-[#A0A0A0] font-semibold tracking-[0.06em]">{c}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-0.5">
          {cells.map((d, i) => {
            if (!d) return <div key={`pad-${i}`} className="aspect-square" />;
            const isToday = isSameDay(d, today);
            const isSelected = isSameDay(d, selected);
            const isCurrentMonth = isSameMonth(d, cursor);
            const heat = isCurrentMonth ? (heatmap[d.getDate()] ?? 0) : 0;
            return (
              <button
                key={d.toISOString()}
                type="button"
                onClick={() => setSelected(d)}
                className={`aspect-square relative grid place-items-center text-xs font-medium rounded-full transition-colors ${
                  isSelected
                    ? 'bg-[#2F8F5C] text-white font-semibold'
                    : isCurrentMonth
                    ? isToday
                      ? 'text-[#246F47] font-bold'
                      : 'text-[#3A3A3A] hover:bg-[#FAF8F2]'
                    : 'text-[#A0A0A0] opacity-50'
                }`}
              >
                {format(d, 'd')}
                {!isSelected && heat > 0 ? (
                  <span className={`absolute bottom-[14%] left-1/2 -translate-x-1/2 rounded-full ${HEAT_BG[heat]} ${heat >= 4 ? 'w-1.5 h-1.5' : 'w-1 h-1'}`} />
                ) : null}
                {isToday && !isSelected ? (
                  <span className="absolute inset-1 rounded-full border border-dashed border-[#2F8F5C] opacity-70 pointer-events-none" />
                ) : null}
              </button>
            );
          })}
        </div>

        {/* Legend */}
        <div className="mt-3 pt-3 border-t border-dashed border-[#E6E1D4] flex items-center justify-between text-[10.5px] text-[#6B6B6B]">
          <span className="font-semibold tracking-wide">Headcount</span>
          <div className="flex items-center gap-1.5">
            <span>Low</span>
            <span className="w-1 h-1 rounded-full bg-[#C7DBC9]" />
            <span className="w-1 h-1 rounded-full bg-[#8FBE9A]" />
            <span className="w-1 h-1 rounded-full bg-[#2F8F5C]" />
            <span className="w-1.5 h-1.5 rounded-full bg-[#246F47]" />
            <span>High</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-dashed border-[#E6E1D4]">
          <button
            type="button"
            onClick={() => { setSelected(today); setCursor(today); onClose(); }}
            className="flex-1 inline-flex items-center justify-center gap-1 px-2.5 py-1.5 bg-[#2F8F5C] text-white border border-[#2F8F5C] rounded-lg text-xs font-semibold hover:bg-[#246F47]"
          >
            <Check className="h-3 w-3" />
            Today
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 inline-flex items-center justify-center px-2.5 py-1.5 bg-[#FAF8F2] border border-[#E6E1D4] rounded-lg text-xs font-medium text-[#3A3A3A] hover:bg-white"
          >
            Jump to date…
          </button>
        </div>
      </div>
    </>
  );
}

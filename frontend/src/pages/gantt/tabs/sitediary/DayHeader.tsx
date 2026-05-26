// frontend/src/pages/gantt/tabs/sitediary/DayHeader.tsx
//
// Day-header card with date tear-off, title, date nav, Calendar button,
// and the live "N entries · Xh total" subtitle.

import { useState } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalIcon, Plus } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { CalendarPopover } from './CalendarPopover';

interface DayHeaderProps {
  projectName: string;
  todayISO: string;
  entryCount: number;
  hoursLogged: number;
  onNewEntry: () => void;
}

export function DayHeader({
  projectName, todayISO, entryCount, hoursLogged, onNewEntry,
}: DayHeaderProps) {
  const [picked] = useState(todayISO);
  const [calOpen, setCalOpen] = useState(false);
  const d = parseISO(picked);
  const hoursDisplay = Math.round(hoursLogged * 10) / 10;

  return (
    <div className="flex items-start justify-between gap-4 bg-white border border-[#E6E1D4] rounded-[14px] px-6 py-5 mb-4 shadow-[0_1px_2px_rgba(20,20,20,0.04)]">
      <div className="flex items-center gap-4">
        {/* Date tear-off */}
        <div className="w-16 min-w-16 border border-[#E6E1D4] rounded-[11px] overflow-hidden bg-white text-center">
          <div className="bg-[#1A1A1A] text-white text-[10px] tracking-[0.16em] py-1 font-semibold">
            {format(d, 'MMM').toUpperCase()}
          </div>
          <div className="text-[30px] leading-none font-medium py-2" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>
            {format(d, 'd')}
          </div>
        </div>

        {/* Title block */}
        <div className="leading-tight">
          <div className="text-[11px] uppercase tracking-[0.14em] text-[#6B6B6B] font-semibold mb-1.5">
            Daily Log · {format(d, 'EEEE')}
          </div>
          <h2 className="text-[28px] font-medium m-0 leading-tight" style={{ fontFamily: "'Fraunces', Georgia, serif", letterSpacing: '-0.015em' }}>
            {format(d, 'MMMM d, yyyy')}
          </h2>
          <div className="text-[#6B6B6B] text-[13px] mt-1">
            {format(d, 'yyyy')} · {projectName}
            <span className="mx-2 text-[#A0A0A0]">·</span>
            <span className={entryCount === 0 ? 'text-[#A0A0A0]' : ''}>
              {entryCount} {entryCount === 1 ? 'entry' : 'entries'} · {hoursDisplay}h total
            </span>
            <span className="mx-2 text-[#A0A0A0]">·</span>
            <span className="text-[#246F47] font-medium">● Live</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Date nav — decorative this pass */}
        <div className="inline-flex items-center bg-white border border-[#E6E1D4] rounded-full p-1 gap-0.5">
          <button type="button" className="w-7 h-7 grid place-items-center rounded-full hover:bg-black/5" aria-label="Previous day">
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <span className="px-2.5 text-[12.5px] font-medium tabular-nums">{format(d, 'MM / dd / yyyy')}</span>
          <button type="button" className="w-7 h-7 grid place-items-center rounded-full hover:bg-black/5" aria-label="Next day">
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Calendar trigger */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setCalOpen((v) => !v)}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full bg-white border border-[#E6E1D4] text-[13px] font-semibold hover:bg-[#FAF8F2]"
          >
            <CalIcon className="h-[15px] w-[15px]" />
            Calendar
            <span className="w-1.5 h-1.5 bg-[#2F8F5C] rounded-full" />
          </button>
          <CalendarPopover open={calOpen} onClose={() => setCalOpen(false)} todayISO={todayISO} />
        </div>

        {/* New entry CTA */}
        <button
          type="button"
          onClick={onNewEntry}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#2F8F5C] text-white text-[13px] font-semibold hover:bg-[#246F47]"
        >
          <Plus className="h-3.5 w-3.5" />
          New entry
        </button>
      </div>
    </div>
  );
}

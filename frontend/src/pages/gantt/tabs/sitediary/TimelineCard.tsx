// frontend/src/pages/gantt/tabs/sitediary/TimelineCard.tsx
//
// Wrapper card: header + filter chips + entry list + quick-add row +
// (optional) children slot for CommonWorksSection underneath.

import { useState, type ReactNode } from 'react';
import type { MockTimelineEntry } from './mockTimeline';
import { TimelineEntry } from './TimelineEntry';
import { QuickAddRow } from './QuickAddRow';

interface TimelineCardProps {
  entries: MockTimelineEntry[];
  quickAddInitials: string;
  children?: ReactNode;
}

type FilterKey = 'all' | 'signed' | 'pending' | 'flagged';

const FILTERS: Array<{ k: FilterKey; label: string }> = [
  { k: 'all', label: 'All' },
  { k: 'signed', label: 'Signed' },
  { k: 'pending', label: 'Pending' },
  { k: 'flagged', label: 'Flagged' },
];

export function TimelineCard({ entries, quickAddInitials, children }: TimelineCardProps) {
  const [filter, setFilter] = useState<FilterKey>('all');
  const visible = filter === 'all' ? entries : entries.filter((e) => e.status === filter);

  return (
    <div className="bg-white border border-[#E6E1D4] rounded-[14px] overflow-hidden shadow-[0_1px_2px_rgba(20,20,20,0.04)]">
      {/* Head */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#EFEBE0]">
        <h3 className="text-[19px] font-medium m-0" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>
          Workers on site today
        </h3>
        <div className="flex gap-1.5">
          {FILTERS.map(({ k, label }) => {
            const on = filter === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setFilter(k)}
                className={`px-2.5 py-1 rounded-full border text-xs font-medium transition-colors ${
                  on
                    ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]'
                    : 'bg-[#FAF8F2] text-[#3A3A3A] border-[#E6E1D4]'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Entry list */}
      <div className="py-1.5">
        {visible.map((e) => (
          <TimelineEntry key={e.id} entry={e} />
        ))}
        {visible.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-[#6B6B6B]">No entries match this filter.</div>
        ) : null}
      </div>

      {/* Quick add */}
      <QuickAddRow initials={quickAddInitials} />

      {/* Slot for CommonWorksSection */}
      {children}
    </div>
  );
}

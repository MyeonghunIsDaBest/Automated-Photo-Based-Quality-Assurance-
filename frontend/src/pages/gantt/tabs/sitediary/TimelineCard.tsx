// frontend/src/pages/gantt/tabs/sitediary/TimelineCard.tsx
//
// Wrapper card: header + filter chips + entry list + quick-add row +
// (optional) children slot for CommonWorksSection underneath. Reads real
// DiaryEntry data; renders an empty-state card when today has none.

import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Clock, Plus, Sparkles } from 'lucide-react';
import type { DiaryEntry } from '../../types';
import { TimelineEntry } from './TimelineEntry';
import { QuickAddRow, type QuickAddRowHandle } from './QuickAddRow';
import { mapEntryToRow } from './diaryRowMapper';

interface TimelineCardProps {
  entries: DiaryEntry[];
  quickAddInitials: string;
  onEntryClick: (entry: DiaryEntry) => void;
  onQuickAdd: (text: string) => void;
  onQuickAddPhoto: () => void;
  onNewEntry: () => void;
  onOpenSparky: () => void;
  children?: ReactNode;
}

type FilterKey = 'all' | 'signed' | 'pending' | 'flagged';

const FILTERS: Array<{ k: FilterKey; label: string }> = [
  { k: 'all', label: 'All' },
  { k: 'signed', label: 'Signed' },
  { k: 'pending', label: 'Pending' },
  { k: 'flagged', label: 'Flagged' },
];

export function TimelineCard({
  entries,
  quickAddInitials,
  onEntryClick,
  onQuickAdd,
  onQuickAddPhoto,
  onNewEntry,
  onOpenSparky,
  children,
}: TimelineCardProps) {
  const [filter, setFilter] = useState<FilterKey>('all');
  const quickAddRef = useRef<QuickAddRowHandle | null>(null);

  const filteredEntries = useMemo(() => {
    if (filter === 'all') return entries;
    return entries.filter((e) => (e.status ?? 'pending') === filter);
  }, [entries, filter]);

  const showEmptyState = entries.length === 0 && filter === 'all';

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
        {showEmptyState ? (
          <div className="px-6 py-12 flex flex-col items-center text-center bg-[#FAF8F2]">
            <div className="relative mb-3">
              <span className="w-10 h-10 rounded-full bg-white border border-[#E6E1D4] grid place-items-center text-[#6B6B6B]">
                <Clock className="h-5 w-5" />
              </span>
              <span className="absolute -right-1 -bottom-1 w-5 h-5 rounded-full bg-[#2F8F5C] border-2 border-white grid place-items-center text-white">
                <Plus className="h-3 w-3" />
              </span>
            </div>
            <h4 className="text-[18px] font-medium m-0 mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>
              No entries yet today
            </h4>
            <p className="text-[#6B6B6B] text-[13px] max-w-[420px] mb-4">
              Log a worker, drop a photo, or let Sparky draft today's recap.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => quickAddRef.current?.focus()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-[#2F8F5C] text-white text-[12.5px] font-semibold hover:bg-[#246F47]"
              >
                <Plus className="h-3.5 w-3.5" />
                Log entry
              </button>
              <button
                type="button"
                onClick={onNewEntry}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white border border-[#E6E1D4] text-[12.5px] font-semibold hover:bg-[#FAF8F2]"
              >
                New entry
              </button>
              <button
                type="button"
                onClick={onOpenSparky}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white border border-[#E6E1D4] text-[12.5px] font-semibold hover:bg-[#FAF8F2]"
              >
                <Sparkles className="h-3.5 w-3.5 text-[#C8841E]" />
                Ask Sparky
              </button>
            </div>
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-[#6B6B6B]">
            No entries match this filter.
          </div>
        ) : (
          filteredEntries.map((e) => (
            <TimelineEntry key={e.id} row={mapEntryToRow(e)} onClick={() => onEntryClick(e)} />
          ))
        )}
      </div>

      {/* Quick add */}
      <QuickAddRow
        ref={quickAddRef}
        initials={quickAddInitials}
        onSubmit={onQuickAdd}
        onPhotoClick={onQuickAddPhoto}
      />

      {/* Slot for CommonWorksSection */}
      {children}
    </div>
  );
}

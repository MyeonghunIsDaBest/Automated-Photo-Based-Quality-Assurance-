// frontend/src/pages/gantt/tabs/sitediary/CommonWorksSection.tsx
//
// Bottom section of the timeline card. Header (title + search) + category
// pills + frequent label + items grid + Sparky CTA card. Usage counts are
// derived from the last 7 days of real diary entries in the parent.

import { useMemo, useState } from 'react';
import { Search, Zap } from 'lucide-react';
import { COMMON_WORKS, type CommonWorkCategory, type CommonWorkTemplate } from './mockTimeline';
import { CommonWorkItem } from './CommonWorkItem';

interface CommonWorksSectionProps {
  usageByName: Record<string, number>;
  onPick: (name: string) => void;
}

type CatKey = 'all' | CommonWorkCategory;

const CAT_LABELS: Record<CatKey, string> = {
  all: 'All',
  civil: 'Civil',
  elec: 'Electrical',
  fin: 'Finishing',
  log: 'Logistics',
  safe: 'Safety / Admin',
};

const FREQUENT_THRESHOLD = 3;

export function CommonWorksSection({
  usageByName, onPick,
}: CommonWorksSectionProps) {
  const [cat, setCat] = useState<CatKey>('all');
  const [query, setQuery] = useState('');

  const items: CommonWorkTemplate[] = COMMON_WORKS;

  const countsByCat = useMemo(() => {
    const total = items.length;
    const civil = items.filter((i) => i.category === 'civil').length;
    const elec = items.filter((i) => i.category === 'elec').length;
    const fin = items.filter((i) => i.category === 'fin').length;
    const log = items.filter((i) => i.category === 'log').length;
    const safe = items.filter((i) => i.category === 'safe').length;
    return { all: total, civil, elec, fin, log, safe };
  }, [items]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      if (cat !== 'all' && i.category !== cat) return false;
      if (q && !i.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, cat, query]);

  const cats: CatKey[] = ['all', 'civil', 'elec', 'fin', 'log', 'safe'];

  return (
    <div className="px-6 py-5 bg-[#FAF8F2] border-t border-[#EFEBE0]">
      <div className="flex items-center justify-between mb-3.5 gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[13px] font-semibold text-[#1A1A1A]">
          <span className="w-[22px] h-[22px] bg-[#1A1A1A] text-white rounded-[6px] grid place-items-center">
            <Zap className="h-3 w-3" />
          </span>
          Common works
          <span className="font-normal text-[#6B6B6B] text-xs ml-1">
            tap to insert · {items.length} templates
          </span>
        </div>
        <div className="flex items-center gap-2 bg-white border border-[#E6E1D4] rounded-full px-3 py-1.5 min-w-[220px] flex-1 max-w-[320px]">
          <Search className="h-3 w-3 text-[#6B6B6B]" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search a task… 'pour', 'conduit', 'rebar'"
            className="border-none outline-none bg-transparent text-[12.5px] flex-1 text-[#1A1A1A] placeholder:text-[#A0A0A0]"
          />
        </div>
      </div>

      {/* Category pills */}
      <div className="flex gap-1 mb-3.5 flex-wrap">
        {cats.map((c) => {
          const on = cat === c;
          const count = countsByCat[c];
          return (
            <button
              key={c}
              type="button"
              onClick={() => setCat(c)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11.5px] font-medium ${
                on
                  ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]'
                  : 'bg-transparent text-[#3A3A3A] border-[#E6E1D4] hover:bg-white'
              }`}
            >
              {CAT_LABELS[c]}
              <span className={`text-[10px] px-1 rounded-full font-semibold ${on ? 'bg-white/15' : 'bg-black/5'}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Frequent label */}
      {cat === 'all' && !query ? (
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="inline-flex items-center gap-1 text-[10.5px] text-[#6B6B6B] font-semibold uppercase tracking-[0.08em]">
            <Zap className="h-3 w-3 text-[#C8841E]" />
            Most used this week
          </span>
        </div>
      ) : null}

      {/* Grid */}
      <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
        {visible.map((item) => {
          const count = usageByName[item.name] ?? 0;
          return (
            <CommonWorkItem
              key={item.id}
              item={item}
              usageCount={count}
              isFrequent={count >= FREQUENT_THRESHOLD}
              onPick={onPick}
            />
          );
        })}
        {visible.length === 0 ? (
          <div className="col-span-full py-6 text-center text-xs text-[#6B6B6B]">
            No templates match your filter.
          </div>
        ) : null}
      </div>
    </div>
  );
}

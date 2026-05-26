// frontend/src/pages/gantt/tabs/sitediary/CommonWorkItem.tsx
//
// Single tile inside the common-works grid. Click inserts the template
// name as a tag in the open diary drawer (or opens a new entry seeded
// with it). Frequency dot is driven by real usage counts from the parent.

import { Plus } from 'lucide-react';
import type { CommonWorkTemplate } from './mockTimeline';

interface CommonWorkItemProps {
  item: CommonWorkTemplate;
  usageCount: number;
  isFrequent: boolean;
  onPick: (name: string) => void;
}

const ICON_BG: Record<CommonWorkTemplate['category'], string> = {
  civil: 'bg-[#F0E4D2] text-[#8B5E3C]',
  elec:  'bg-[#E5EBF7] text-[#4A5DAD]',
  fin:   'bg-[#EDE5F2] text-[#7B5C9C]',
  log:   'bg-[#E0EBE3] text-[#246F47]',
  safe:  'bg-[#FCE4E4] text-[#C44545]',
};

export function CommonWorkItem({ item, usageCount, isFrequent, onPick }: CommonWorkItemProps) {
  return (
    <button
      type="button"
      onClick={() => onPick(item.name)}
      className={`flex items-center gap-2.5 px-3 py-2 rounded-[9px] border text-left w-full transition-all hover:-translate-y-px hover:shadow-[0_1px_2px_rgba(20,20,20,0.04)] ${
        isFrequent
          ? 'bg-[#FFFCF4] border-[#E8D8B5]'
          : 'bg-white border-[#E6E1D4]'
      }`}
    >
      <span className={`w-[26px] h-[26px] rounded-[7px] grid place-items-center flex-shrink-0 text-[13px] font-semibold ${ICON_BG[item.category]}`}>
        {item.name.slice(0, 1)}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[12.5px] font-medium text-[#1A1A1A] truncate">{item.name}</span>
        <span className="block text-[10.5px] text-[#A0A0A0] mt-0.5">
          {isFrequent ? (
            <><span className="text-[#C8841E]">●</span> Used {usageCount}× this week</>
          ) : (
            <>{usageCount}×</>
          )}
        </span>
      </span>
      <span className="w-[22px] h-[22px] rounded-[6px] bg-[#FAF8F2] text-[#6B6B6B] grid place-items-center flex-shrink-0">
        <Plus className="h-3 w-3" />
      </span>
    </button>
  );
}

// frontend/src/pages/gantt/tabs/sitediary/QuickAddRow.tsx
//
// Sits at the bottom of the timeline. Avatar + input prompt + Photo + Log
// entry buttons. v1 is decoration — none of the buttons do work yet.

import { Camera } from 'lucide-react';

interface QuickAddRowProps {
  initials: string;
}

export function QuickAddRow({ initials }: QuickAddRowProps) {
  return (
    <div className="flex items-center gap-3 px-6 py-4 bg-[#FAF8F2] border-t border-[#EFEBE0]">
      <div className="w-9 h-9 rounded-full grid place-items-center text-white font-semibold text-xs" style={{ background: '#C9A04A' }}>
        {initials}
      </div>
      <button
        type="button"
        className="flex-1 text-left bg-white border border-[#E6E1D4] rounded-[9px] px-3.5 py-2.5 text-[13.5px] text-[#6B6B6B] hover:bg-[#FAF8F2]"
      >
        e.g. Excavation continued at L14 south slab; conduit pull crew dressed back-boxes on L13 east…
      </button>
      <button type="button" className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white border border-[#E6E1D4] text-[13px] font-semibold hover:bg-[#FAF8F2]">
        <Camera className="h-3.5 w-3.5" />
        Photo
      </button>
      <button type="button" className="px-4 py-2 rounded-full bg-[#2F8F5C] text-white text-[13px] font-semibold hover:bg-[#246F47]">
        Log entry
      </button>
    </div>
  );
}

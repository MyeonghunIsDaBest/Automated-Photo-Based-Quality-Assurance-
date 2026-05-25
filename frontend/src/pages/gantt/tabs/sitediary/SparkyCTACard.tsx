// frontend/src/pages/gantt/tabs/sitediary/SparkyCTACard.tsx
//
// Green "Let Sparky draft today's entry" card at the bottom of the
// Common Works section. The only trigger that opens the SparkyDrawer.

import { Zap, ArrowRight } from 'lucide-react';

interface SparkyCTACardProps {
  onClick: () => void;
}

export function SparkyCTACard({ onClick }: SparkyCTACardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-3 flex items-center gap-3 px-3.5 py-3 rounded-[10px] border border-[#BFD9C7] w-full text-left relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #E5F2EA, #F0F8F3)' }}
    >
      <span className="w-8 h-8 rounded-[9px] bg-[#2F8F5C] text-white grid place-items-center flex-shrink-0 shadow-[0_0_0_3px_rgba(47,143,92,0.18)]">
        <Zap className="h-4 w-4" />
      </span>
      <span className="flex-1 leading-tight">
        <span className="flex items-center gap-1.5 text-[13px] font-semibold text-[#246F47]">
          Let Sparky draft today's entry
          <span className="bg-[#2F8F5C] text-white text-[9px] px-1.5 py-px rounded-full font-bold tracking-wider">AI</span>
        </span>
        <span className="block text-[11.5px] text-[#6B6B6B] mt-0.5">
          Pulls hours, weather, and active zones automatically. Edit before signing.
        </span>
      </span>
      <ArrowRight className="h-4 w-4 text-[#246F47] flex-shrink-0" />
    </button>
  );
}

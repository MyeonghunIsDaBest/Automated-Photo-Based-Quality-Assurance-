// frontend/src/pages/gantt/tabs/sitediary/ProgressBar.tsx
//
// Three stats on the left + cumulative track on the right.

export function ProgressBar() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4 items-center bg-white border border-[#E6E1D4] rounded-[14px] px-5 py-4 mb-4">
      <div className="flex gap-7">
        <Stat num="+14%" label="Day's progress" color="text-[#246F47]" />
        <Stat num="38.5h" label="Hours · 5 workers" />
        <Stat num="L13–L14" label="Active zones" />
      </div>
      <div className="flex flex-col items-end gap-1.5">
        <span className="text-[11px] text-[#6B6B6B] uppercase tracking-[0.06em] font-medium">Cumulative · 62%</span>
        <div className="h-2 rounded-full bg-[#FAF8F2] overflow-hidden min-w-[200px] w-full sm:w-[260px]">
          <div className="h-full rounded-full" style={{ width: '62%', background: 'linear-gradient(90deg, #246F47, #2F8F5C)' }} />
        </div>
      </div>
    </div>
  );
}

function Stat({ num, label, color }: { num: string; label: string; color?: string }) {
  return (
    <div>
      <div className={`text-[22px] font-medium leading-none ${color ?? ''}`} style={{ fontFamily: "'Fraunces', Georgia, serif" }}>
        {num}
      </div>
      <div className="text-[11px] text-[#6B6B6B] uppercase tracking-[0.1em] mt-1 font-medium">{label}</div>
    </div>
  );
}

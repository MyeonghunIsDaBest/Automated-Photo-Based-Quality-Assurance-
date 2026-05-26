// frontend/src/pages/gantt/tabs/sitediary/ProgressBar.tsx
//
// Three at-a-glance stats + cumulative track. Hours/headcount are real;
// day-progress %, active zones, and cumulative % are decorative until we
// derive them from the AI/progression slice.
// TODO: derive dayProgress and cumulativePct from real progression data.

interface ProgressBarProps {
  hoursLogged: number;
  headcount: number;
}

export function ProgressBar({ hoursLogged, headcount }: ProgressBarProps) {
  const hoursDisplay = Math.round(hoursLogged * 10) / 10;
  const workersLabel = headcount === 1 ? '1 worker' : `${headcount} workers`;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4 items-center bg-white border border-[#E6E1D4] rounded-[14px] px-5 py-4 mb-4">
      <div className="flex gap-7">
        <Stat num="—" label="Day's progress" />
        <Stat num={`${hoursDisplay}h`} label={`Hours · ${workersLabel}`} />
        <Stat num="—" label="Active zones" />
      </div>
      <div className="flex flex-col items-end gap-1.5">
        <span className="text-[11px] text-[#6B6B6B] uppercase tracking-[0.06em] font-medium">Cumulative · —</span>
        <div className="h-2 rounded-full bg-[#FAF8F2] overflow-hidden min-w-[200px] w-full sm:w-[260px]">
          <div className="h-full rounded-full" style={{ width: '0%', background: 'linear-gradient(90deg, #246F47, #2F8F5C)' }} />
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

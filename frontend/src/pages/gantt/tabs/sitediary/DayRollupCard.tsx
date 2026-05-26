// frontend/src/pages/gantt/tabs/sitediary/DayRollupCard.tsx
//
// Day-rollup card — 5 summary rows for the left column. Zero values render
// in muted grey so an empty day still surfaces the rollup labels.

export interface DayRollup {
  headcount: number;
  hoursLogged: number;
  entries: number;
  signedOffs: number;
  totalForSignOff: number;
  openPunchItems: number;
}

interface DayRollupCardProps {
  rollup: DayRollup;
}

export function DayRollupCard({ rollup }: DayRollupCardProps) {
  const mute = (n: number) => (n === 0 ? 'text-[#A0A0A0]' : '');
  const hoursDisplay = Math.round(rollup.hoursLogged * 10) / 10;
  const rows: Array<{ k: string; v: React.ReactNode }> = [
    {
      k: 'Headcount',
      v: (
        <span className={mute(rollup.headcount)}>
          {rollup.headcount}
          <span className="text-[#6B6B6B] font-normal ml-0.5 text-[10.5px]">workers</span>
        </span>
      ),
    },
    {
      k: 'Hours logged',
      v: (
        <span className={mute(rollup.hoursLogged)}>
          {hoursDisplay}
          <span className="text-[#6B6B6B] font-normal ml-0.5 text-[10.5px]">h</span>
        </span>
      ),
    },
    {
      k: 'Entries',
      v: (
        <span className={mute(rollup.entries)}>
          {rollup.entries}
          <span className="text-[#6B6B6B] font-normal ml-0.5 text-[10.5px]">submitted</span>
        </span>
      ),
    },
    {
      k: 'Sign-offs',
      v: (
        <span className={rollup.totalForSignOff === 0 ? 'text-[#A0A0A0]' : 'text-[#246F47]'}>
          {rollup.signedOffs} of {rollup.totalForSignOff}
        </span>
      ),
    },
    {
      k: 'Punch list',
      v: (
        <span className={rollup.openPunchItems === 0 ? 'text-[#A0A0A0]' : 'text-[#C8841E]'}>
          {rollup.openPunchItems} open
        </span>
      ),
    },
  ];

  return (
    <div className="bg-white border border-[#E6E1D4] rounded-[14px] p-4 shadow-[0_1px_2px_rgba(20,20,20,0.04)]">
      <div className="flex items-center gap-2 mb-3 text-[11px] uppercase tracking-[0.14em] text-[#6B6B6B] font-semibold">
        <span className="h-px w-4 bg-[#A0A0A0]" />
        Day rollup
      </div>
      <div>
        {rows.map((r, i) => (
          <div
            key={r.k}
            className={`flex items-center justify-between py-2 text-[12.5px] ${
              i < rows.length - 1 ? 'border-b border-dashed border-[#EFEBE0]' : ''
            }`}
          >
            <span className="text-[#6B6B6B]">{r.k}</span>
            <span className="font-semibold">{r.v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

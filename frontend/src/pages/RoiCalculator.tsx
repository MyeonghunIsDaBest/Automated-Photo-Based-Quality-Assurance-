// ROI calculator — small widget that turns the prospect's site volume into
// estimated hours / dollars saved per month. Lives inside /pricing but is
// its own component so we can also embed it on a future "Why SiteProof?"
// page without duplicating logic.
//
// Assumptions are intentionally conservative so a sceptical PM can argue up,
// not down:
//   • Each photo-driven task update saves ~4 minutes of paperwork.
//   • Each AI-polished diary entry saves ~6 minutes.
//   • Cost-of-time defaults to AUD $80/hour (a fair Aussie PM mid-rate).

import { useMemo, useState } from 'react';
import { TrendingUp } from 'lucide-react';

const MIN_PER_PHOTO_UPDATE = 4;
const MIN_PER_POLISH = 6;

export default function RoiCalculator() {
  const [sites, setSites] = useState(3);
  const [photosPerWeek, setPhotosPerWeek] = useState(120);
  const [diariesPerWeek, setDiariesPerWeek] = useState(15);
  const [hourlyRate, setHourlyRate] = useState(80);

  const result = useMemo(() => {
    const photosPerMonth = photosPerWeek * 4.33 * sites;
    const diariesPerMonth = diariesPerWeek * 4.33 * sites;
    const minutesSaved = photosPerMonth * MIN_PER_PHOTO_UPDATE + diariesPerMonth * MIN_PER_POLISH;
    const hoursSaved = Math.round(minutesSaved / 60);
    const dollarsSaved = Math.round(hoursSaved * hourlyRate);
    return { hoursSaved, dollarsSaved, photosPerMonth: Math.round(photosPerMonth), diariesPerMonth: Math.round(diariesPerMonth) };
  }, [sites, photosPerWeek, diariesPerWeek, hourlyRate]);

  return (
    <div className="rounded-2xl border border-[#E6E1D4] bg-white p-4 sm:p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <NumField
          label="Active sites"
          value={sites}
          onChange={setSites}
          min={1}
          max={50}
          caption="How many projects you're running concurrently."
        />
        <NumField
          label="Photos / week / site"
          value={photosPerWeek}
          onChange={setPhotosPerWeek}
          min={0}
          max={1000}
          caption="Field photos a crew takes for QA, not personal."
        />
        <NumField
          label="Diary entries / week / site"
          value={diariesPerWeek}
          onChange={setDiariesPerWeek}
          min={0}
          max={50}
          caption="Daily logs, supervisor reports, incident notes."
        />
        <NumField
          label="Cost of time (AUD / hr)"
          value={hourlyRate}
          onChange={setHourlyRate}
          min={20}
          max={300}
          caption="Use your PM's loaded rate, not the apprentice's."
        />
      </div>

      <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
        <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-emerald-800">
          <TrendingUp className="h-3.5 w-3.5" />
          Estimated monthly savings
        </div>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <p
            className="text-3xl font-medium text-emerald-900 sm:text-4xl"
            style={{ fontFamily: "'Fraunces', Georgia, serif", letterSpacing: '-0.02em' }}
          >
            ${result.dollarsSaved.toLocaleString()}
          </p>
          <p className="text-sm text-emerald-800">
            ≈ {result.hoursSaved.toLocaleString()} admin hours / month
          </p>
        </div>
        <p className="mt-2 text-[11px] text-[#6B6B6B]">
          Based on{' '}
          <strong className="font-medium text-[#3A3A3A]">{result.photosPerMonth.toLocaleString()}</strong> photo updates
          and{' '}
          <strong className="font-medium text-[#3A3A3A]">{result.diariesPerMonth.toLocaleString()}</strong> diary entries
          across {sites} site{sites === 1 ? '' : 's'} per month, at {MIN_PER_PHOTO_UPDATE} min saved per photo + {MIN_PER_POLISH} min per polished diary entry.
        </p>
      </div>

      <p className="mt-3 text-[10px] text-[#A0A0A0]">
        Rough estimate. Real savings vary by team workflow. Compare against your
        actual paperwork hours — the win usually comes from variance reduction
        (consistent QA records), not just absolute minute-counts.
      </p>
    </div>
  );
}

function NumField({
  label, value, onChange, min, max, caption,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  caption: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[#6B6B6B]">
        {label}
      </span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
        }}
        className="block w-full rounded-md border border-[#E6E1D4] px-3 py-2 text-sm tabular-nums shadow-sm focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]"
      />
      <p className="mt-1 text-[10px] text-[#A0A0A0]">{caption}</p>
    </label>
  );
}

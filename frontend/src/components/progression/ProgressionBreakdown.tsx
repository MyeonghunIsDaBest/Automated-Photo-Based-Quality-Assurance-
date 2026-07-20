// ProgressionBreakdown — visualises the three signals that derive a task's
// percent-complete in `human_assisted` / `full_auto` modes. Three stacked
// mini-bars labeled with their contributions, plus the rolled-up headline %.
//
// Pure presentational. Parent passes in the signals + weights + target; the
// component runs `deriveProgress` and renders. Reused by TaskDrawer and (in
// follow-ups) the Gantt row hover-card.

import {
  deriveProgress,
  type ProgressionSignals,
  type ProgressionWeights,
} from '../../lib/progression/deriveProgress';

interface ProgressionBreakdownProps {
  signals: ProgressionSignals;
  weights: ProgressionWeights;
  targetPhotos: number;
  /** Show numeric value on each row (default true). */
  showValues?: boolean;
}

interface BarRowProps {
  label: string;
  value: number;            // 0..100 (signal value)
  weight: number;           // 0..100 (weight pct)
  contribution: number;     // 0..100 (signal × weight / 100)
  showValues: boolean;
  color: string;
}

function BarRow({ label, value, weight, contribution, showValues, color }: BarRowProps) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-[11px]">
        <span className="font-medium text-[#3A3A3A]">
          {label}
          <span className="ml-1 text-[#A0A0A0]">· {weight}%</span>
        </span>
        {showValues && (
          <span className="tabular-nums text-[#6B6B6B]">
            {Math.round(value)}% → {contribution.toFixed(1)}
          </span>
        )}
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[#F0EDE4]">
        <div
          className="h-1.5 rounded-full transition-all"
          style={{ width: `${Math.min(100, Math.max(0, value))}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

export default function ProgressionBreakdown({
  signals,
  weights,
  targetPhotos,
  showValues = true,
}: ProgressionBreakdownProps) {
  const derived = deriveProgress(signals, weights, targetPhotos);

  return (
    <div className="rounded-lg border border-[#E6E1D4] bg-white p-3">
      <div className="mb-2 flex items-baseline justify-between">
        <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#6B6B6B]">
          Derived progress
        </p>
        <p className="tabular-nums text-base font-medium text-[#1A1A1A]">
          {derived.pct}<span className="text-xs text-[#A0A0A0]">%</span>
        </p>
      </div>
      <div className="space-y-2">
        <BarRow
          label="Checklist"
          value={signals.checklistPct}
          weight={weights.checklist}
          contribution={derived.breakdown.checklist}
          showValues={showValues}
          color="#10B981"
        />
        <BarRow
          label="Photos"
          value={derived.photosPct}
          weight={weights.photos}
          contribution={derived.breakdown.photos}
          showValues={showValues}
          color="#0EA5E9"
        />
        <BarRow
          label="AI confidence"
          value={signals.aiAvgPct}
          weight={weights.ai}
          contribution={derived.breakdown.ai}
          showValues={showValues}
          color="#8B5CF6"
        />
      </div>
    </div>
  );
}

// deriveProgress — pure function that turns a task's raw signals into a
// weighted percentage + a per-signal contribution breakdown.
//
// The three signals:
//   • checklistPct — how many checklist items are ticked, 0..100.
//   • photoCount   — absolute number of photos attached to the task. The
//                    contribution caps at `targetPhotos` (over-shooting doesn't
//                    keep adding to progress; once you've documented enough,
//                    extra photos are just nice-to-have).
//   • aiAvgPct     — average completion confidence from the latest AI
//                    analyses, 0..100. Today's analyse-photo stub returns 0,
//                    but Phase D fills this in.
//
// The weights sum to 100 (the migration's CHECK constraint enforces it). Each
// signal's contribution is `signalPct * weight / 100`, so the three pieces
// sum to the final pct. Bar visualisations can render the three breakdown
// numbers directly as widths.
//
// Edge cases:
//   • targetPhotos ≤ 0 → photo contribution clamped to 0 (avoids divide-by-zero).
//   • signal exceeds 100 → clamped to 100 before weighting.
//   • final pct rounded to integer for display; breakdown stays in fine
//     resolution so the mini-bar widths look smooth.

export interface ProgressionSignals {
  checklistPct: number; // 0..100
  photoCount: number;
  aiAvgPct: number;     // 0..100
}

export interface ProgressionWeights {
  checklist: number;    // 0..100
  photos: number;       // 0..100
  ai: number;           // 0..100
}

export interface ProgressionBreakdown {
  checklist: number;
  photos: number;
  ai: number;
}

export interface DerivedProgress {
  pct: number;                          // rounded final percentage 0..100
  breakdown: ProgressionBreakdown;      // raw signal contributions, summed = (pre-rounded) pct
  photosPct: number;                    // photo signal as a percentage (for UI tooltips)
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function deriveProgress(
  signals: ProgressionSignals,
  weights: ProgressionWeights,
  targetPhotos: number,
): DerivedProgress {
  const checklistPct = clamp(signals.checklistPct, 0, 100);
  const aiAvgPct = clamp(signals.aiAvgPct, 0, 100);
  const photosPct =
    targetPhotos <= 0 ? 0 : clamp((signals.photoCount / targetPhotos) * 100, 0, 100);

  const breakdown: ProgressionBreakdown = {
    checklist: (checklistPct * weights.checklist) / 100,
    photos:    (photosPct    * weights.photos)    / 100,
    ai:        (aiAvgPct     * weights.ai)        / 100,
  };

  const total = breakdown.checklist + breakdown.photos + breakdown.ai;
  return {
    pct: Math.round(clamp(total, 0, 100)),
    breakdown,
    photosPct,
  };
}

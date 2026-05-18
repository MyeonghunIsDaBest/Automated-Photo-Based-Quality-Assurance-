import type { AnalysisAction, AnalysisResult } from './contract.ts';

// Pure function. Given an analysis result and the project's threshold config,
// decide what the system should do next. Same rule from both the
// analyse-photo and confirm-analysis paths so retries / re-runs converge on
// the same answer.
//
//   any safety flag                       → 'pending'      (and log a safety_incidents row)
//   confidence ≥ thresholds.autoUpdate    → 'auto_updated' (and bump tasks.percent_complete)
//   confidence ≥ thresholds.reviewQueue   → 'pending'      (review queue)
//   otherwise                             → 'skipped'
//
// Thresholds are per-project. Callers load them via `loadProjectConfig` from
// `_shared/loadProjectConfig.ts`, which falls back to the constants in
// `_shared/thresholds.ts` when the project_config row is missing.
export function decideAction(
  result: AnalysisResult,
  thresholds: { autoUpdate: number; reviewQueue: number },
): AnalysisAction {
  if (result.safetyFlags.length > 0) return 'pending';
  if (result.confidence >= thresholds.autoUpdate) return 'auto_updated';
  if (result.confidence >= thresholds.reviewQueue) return 'pending';
  return 'skipped';
}

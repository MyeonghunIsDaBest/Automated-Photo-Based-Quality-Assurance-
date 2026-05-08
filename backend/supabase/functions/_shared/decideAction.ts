import type { AnalysisAction, AnalysisResult } from './contract.ts';
import { CONFIDENCE_AUTO_UPDATE, CONFIDENCE_REVIEW_QUEUE } from './thresholds.ts';

// Pure function. Given an analysis result, decide what the system should do
// next. Same rule from both the analyse-photo and confirm-analysis paths so
// retries / re-runs converge on the same answer.
//
//   any safety flag         → 'pending'      (and log a safety_incidents row)
//   confidence ≥ 0.85       → 'auto_updated' (and bump tasks.percent_complete)
//   confidence ≥ 0.50       → 'pending'      (review queue)
//   otherwise               → 'skipped'
export function decideAction(result: AnalysisResult): AnalysisAction {
  if (result.safetyFlags.length > 0) return 'pending';
  if (result.confidence >= CONFIDENCE_AUTO_UPDATE) return 'auto_updated';
  if (result.confidence >= CONFIDENCE_REVIEW_QUEUE) return 'pending';
  return 'skipped';
}

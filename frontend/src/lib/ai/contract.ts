// Photo-QA contract — single source of truth shared between frontend and the
// Supabase Edge Functions. The Deno-side copy at
// `supabase/functions/_shared/contract.ts` MUST stay byte-identical with this
// file (Deno can't reach into `frontend/src`). The `prebuild` hook runs
// `scripts/check-contract-parity.mjs` and fails the build on drift.
//
// Adjust both files together, never one in isolation.

export type ConstructionPhase =
  | 'excavation'
  | 'foundation'
  | 'framing'
  | 'roofing'
  | 'electrical'
  | 'plumbing'
  | 'drywall'
  | 'finishing';

export type SafetyFlag =
  | 'no_hard_hat'
  | 'exposed_wiring'
  | 'fall_hazard'
  | 'unsecured_load'
  | 'housekeeping'
  | 'signage_missing';

export type QualityFlag =
  | 'misalignment'
  | 'damage'
  | 'incomplete_seal'
  | 'wrong_material'
  | 'measurement_off'
  | 'finish_defect';

export type SafetySeverity = 'low' | 'medium' | 'high' | 'critical';

export type AnalysisStatus =
  | 'queued'
  | 'analysing'
  | 'analysed'
  | 'failed'
  | 'confirmed'
  | 'rejected';

export type AnalysisAction = 'auto_updated' | 'confirmed' | 'skipped' | 'pending';

export type InvocationSource = 'webhook' | 'manual_retry' | 'reanalyze';

export interface AnalysisRequest {
  photoId: string;
  storagePath: string;
  taskId: string | null;
  projectId: string;
  phaseHint: ConstructionPhase | null;
  perceptualHash: string | null;
  attempt: number;
  invokedBy: InvocationSource;
}

export interface AnalysisResult {
  modelUsed: string;
  phaseDetected: ConstructionPhase | null;
  completionPct: number;
  confidence: number;
  safetyFlags: SafetyFlag[];
  qualityFlags: QualityFlag[];
  materials: string[];
  suggestedTask: string | null;
  rationale: string;
  rawResponse: unknown;
}

// Closed lists for UI dropdowns + iteration.
export const CONSTRUCTION_PHASES: readonly ConstructionPhase[] = [
  'excavation', 'foundation', 'framing', 'roofing',
  'electrical', 'plumbing', 'drywall', 'finishing',
] as const;

export const SAFETY_FLAGS: readonly SafetyFlag[] = [
  'no_hard_hat', 'exposed_wiring', 'fall_hazard',
  'unsecured_load', 'housekeeping', 'signage_missing',
] as const;

export const QUALITY_FLAGS: readonly QualityFlag[] = [
  'misalignment', 'damage', 'incomplete_seal',
  'wrong_material', 'measurement_off', 'finish_defect',
] as const;

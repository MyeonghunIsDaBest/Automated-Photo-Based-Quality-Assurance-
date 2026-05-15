// Client-side mock-AI runtime.
//
// Phase D will eventually replace this with a real Anthropic Vision call wired
// through the `analyze-photo` Edge Function. Until then, the demo needs the
// stub to *do something visible* — uploading a photo today returns
// confidence=0 and the project bar doesn't move, which is the worst kind of
// demo (the pipeline silently works without any visible signal).
//
// This module powers the "Run AI analysis" button mounted in the Gantt
// Overview + Tasks tabs. It picks photos in the active project that haven't
// been (mock-)analysed yet, generates a fake AnalysisResult per photo
// (random 4-10% bump on the linked task, confidence 0.92, phaseDetected
// pulled from the task), and applies the bump via the existing store
// actions:
//
//   • `useAppStore.updateTaskProgress(taskId, newPct, 'ai_auto')`
//     — write-through to Supabase + audit-log entry + notification.
//   • `useAppStore.patchPhotoAnalysis(photoId, analysis)`
//     — attaches the fake analysis to the photo so the gallery shows it as
//       AI-analysed (local-only; refresh loses it unless the AI row is
//       persisted server-side).
//
// The module is intentionally Edge-function-free — it works without a
// `supabase functions deploy`, so the demo runs even when the backend isn't
// fully provisioned.

import type { AIAnalysis, AnalysisStatus, ConstructionPhase, Photo, SafetyFlag, SafetySeverity, Task } from '../../types';
import { useAppStore } from '../../store';
import { useFeatureStore } from '../../store/features';
import { useSafetyIncidentsStore } from '../../store/safetyIncidents';
import type { SafetyIncident } from './safetyIncidents';

// Stamped on every analysis row this module produces so the pending-photo
// filter knows what's already been mock-bumped. Distinct from the
// `'mvp-stub@v0'` marker that the Edge function writes — that one is "the
// trigger pre-inserted a queued row", this one is "the client-side mock
// finished it".
export const MOCK_AI_MODEL_TAG = 'mock-bump@v1';

export interface MockAnalysisResult {
  photoId: string;
  taskId: string | null;
  oldPct: number;
  newPct: number;
  increment: number;
  analysis: AIAnalysis;
}

export interface MockBatchSummary {
  processed: number;
  bumped: number;          // photos that resulted in a task bump
  skipped: number;         // photos without a task or with task at 100%
  totalDeltaPct: number;   // sum of (newPct - oldPct) across all tasks touched
  newOverallProgress: number;
}

// "Pending" = the mock hasn't touched this photo yet, AND no real analysis
// has confirmed it. We accept photos that are unanalysed, queued, or carry
// the placeholder stub model — anything that hasn't moved the bar yet.
function isPending(photo: Photo): boolean {
  if (!photo.aiAnalysis) return true;
  // Phase D analyses (real model names) are off-limits to the mock — they
  // already have meaningful results we shouldn't overwrite.
  const m = photo.aiAnalysis.modelUsed;
  if (m === MOCK_AI_MODEL_TAG) return false;
  // The Edge function's trigger pre-inserts a row with model='mvp-stub@v0';
  // those are fair game. Anything else (Phase D model strings) is real.
  if (m === 'mvp-stub@v0' || photo.aiAnalysis.completionPct === 0) return true;
  return false;
}

// Public helper for the button + count badge. Pure read over store state, no
// side effects. Re-run via `useAppStore` subscription in the hook below.
export function findPendingPhotosForProject(projectId: string): Photo[] {
  const photos = useAppStore.getState().photos;
  return photos.filter((p) => p.projectId === projectId && isPending(p));
}

function randomIncrement(): number {
  // Inclusive 4..10. The user's spec ("4-10% per picture").
  return 4 + Math.floor(Math.random() * 7);
}

// Low-tier safety flags ONLY. The mock never emits panic-level flags
// (`exposed_wiring` / `fall_hazard`) — those would imply a real on-site
// emergency and the demo can't ground them in evidence. `housekeeping` +
// `signage_missing` are believable, mid-impact, won't startle the audience.
const LOW_TIER_SAFETY_FLAGS: SafetyFlag[] = ['housekeeping', 'signage_missing'];
const SAFETY_FLAG_PROBABILITY = 1 / 6;

// Severity lookup, inlined so we don't depend on the Deno-only `safetyTaxonomy.ts`.
const SAFETY_FLAG_SEVERITY: Record<SafetyFlag, SafetySeverity> = {
  exposed_wiring:  'critical',
  fall_hazard:     'critical',
  no_hard_hat:     'high',
  unsecured_load:  'high',
  housekeeping:    'medium',
  signage_missing: 'low',
};

// Roll the safety dice for one photo. Returns null most of the time;
// occasionally picks one low-tier flag at random. Deterministic for tests
// when `Math.random` is mocked.
function rollSafetyFlag(): SafetyFlag | null {
  if (Math.random() >= SAFETY_FLAG_PROBABILITY) return null;
  const idx = Math.floor(Math.random() * LOW_TIER_SAFETY_FLAGS.length);
  return LOW_TIER_SAFETY_FLAGS[idx];
}

function rationaleFor(phase: ConstructionPhase | null, increment: number, oldPct: number, newPct: number): string {
  // Vary the rationale a touch so a demo with several photos doesn't feel
  // copy-pasted. Phase D will overwrite this with the real model's response.
  const lead = phase ? `${phase[0].toUpperCase() + phase.slice(1)} stage visible.` : 'Site progress visible.';
  const detail = oldPct === 0
    ? `Initial progress recorded.`
    : `Estimated +${increment}% completion (${oldPct}% → ${newPct}%).`;
  return `${lead} ${detail}`;
}

function buildAnalysis(
  photo: Photo,
  task: Task | undefined,
  oldPct: number,
  newPct: number,
  increment: number,
  safetyFlag: SafetyFlag | null,
): AIAnalysis {
  const phase = task?.phase ?? null;
  const safetyFlags: SafetyFlag[] = safetyFlag ? [safetyFlag] : [];
  // Action mirrors the real `decideAction` rule: any safety flag → 'pending'
  // (review queue), no task bump. Mock keeps the bar moving on the OTHER
  // photos in the batch so the demo still feels productive.
  const actionTaken: AIAnalysis['actionTaken'] = safetyFlag
    ? 'pending'
    : newPct > oldPct ? 'auto_updated' : 'skipped';
  return {
    id: `mock_${photo.id}_${Date.now().toString(36)}`,
    photoId: photo.id,
    modelUsed: MOCK_AI_MODEL_TAG,
    phaseDetected: phase,
    completionPct: newPct,
    confidence: 0.92,            // above the default 0.85 auto-update threshold
    safetyFlags,
    qualityFlags: [],
    materials: phase ? defaultMaterialsFor(phase) : [],
    suggestedTask: null,
    actionTaken,
    analysisStatus: 'analysed' as AnalysisStatus,
    rationale: rationaleFor(phase, increment, oldPct, newPct),
    rawResponse: { mock: true, increment, safetyFlag },
    analyzedAt: new Date().toISOString(),
  };
}

// Lightweight phase → material list. Pure cosmetic for the photo's AI panel.
function defaultMaterialsFor(phase: ConstructionPhase): string[] {
  switch (phase) {
    case 'excavation':  return ['soil', 'gravel'];
    case 'foundation':  return ['rebar', 'concrete'];
    case 'framing':     return ['steel studs', 'timber'];
    case 'roofing':     return ['shingles', 'underlay'];
    case 'electrical':  return ['conduit', 'cable tray'];
    case 'plumbing':    return ['PVC', 'copper'];
    case 'drywall':     return ['gypsum board', 'joint compound'];
    case 'finishing':   return ['paint', 'trim'];
  }
}

// Run the mock for a single photo. Always resolves; the caller drives the
// batch loop. Doesn't throw on benign failures (no task, task at 100%) —
// returns a result with `newPct === oldPct` so the UI can summarise.
export async function runMockAnalysisForPhoto(
  photoId: string,
  opts: { allowSafetyFlag?: boolean } = {},
): Promise<MockAnalysisResult> {
  const app = useAppStore.getState();
  const features = useFeatureStore.getState();

  const photo = app.photos.find((p) => p.id === photoId);
  if (!photo) {
    throw new Error(`Photo ${photoId} not found`);
  }

  const taskId = photo.taskId ?? null;
  const task = taskId ? features.tasks.find((t) => t.id === taskId) : undefined;
  const oldPct = task?.percentComplete ?? 0;

  // Safety dice: only roll when the caller hasn't already emitted a flag this
  // batch (one incident per batch keeps the demo from feeling like a crisis).
  const safetyFlag = opts.allowSafetyFlag === false ? null : rollSafetyFlag();

  const increment = randomIncrement();
  // Safety-flagged photos route to 'pending' instead of auto-updating —
  // mirrors the real decideAction rule and means the bar doesn't move on
  // those photos. Demo still feels productive because most photos in the
  // batch bump as normal.
  const newPct = task && !safetyFlag ? Math.min(100, oldPct + increment) : oldPct;

  const analysis = buildAnalysis(photo, task, oldPct, newPct, increment, safetyFlag);

  // 1. Attach the fake analysis to the photo locally so the gallery shows it
  //    as AI-analysed. patchPhotoAnalysis also flips `aiAnalyzed=true`.
  app.patchPhotoAnalysis(photoId, analysis);

  // 2. Bump the task (write-through to Supabase + audit log + notification).
  //    Only when there's a task AND the new pct actually moves the bar.
  if (task && newPct > oldPct) {
    app.updateTaskProgress(task.id, newPct, 'ai_auto');
  }

  return { photoId, taskId, oldPct, newPct, increment, analysis };
}

// Synthesize a SafetyIncident from a flagged analysis. Mirrors the shape the
// real `analyze-photo` Edge function would write to `safety_incidents`. Local
// only — the cache feeds the Dashboard tile + Safety page badge.
function safetyIncidentFor(projectId: string, result: MockAnalysisResult): SafetyIncident {
  const flag = result.analysis.safetyFlags[0];
  return {
    id:           `mock_incident_${result.analysis.id}`,
    projectId,
    photoId:      result.photoId,
    aiAnalysisId: result.analysis.id,
    flags:        result.analysis.safetyFlags,
    severity:     SAFETY_FLAG_SEVERITY[flag],
    status:       'open',
    reportedBy:   null,
    resolvedBy:   null,
    resolvedAt:   null,
    notes:        null,
    createdAt:    new Date().toISOString(),
  };
}

// Sequential batch runner — 600ms between photos for the "AI is thinking"
// demo cadence. The progress callback drives the inline button shimmer.
export interface RunBatchOptions {
  /** Milliseconds between photo bumps. Default 600ms. */
  perPhotoDelayMs?: number;
  /** Optional progress callback. Receives the current photo's result, the
   *  1-based index, and the total count. */
  onProgress?: (result: MockAnalysisResult, index: number, total: number) => void;
}

export async function runMockBatch(
  projectId: string,
  opts: RunBatchOptions = {},
): Promise<MockBatchSummary> {
  const delay = opts.perPhotoDelayMs ?? 600;
  const targets = findPendingPhotosForProject(projectId);
  const total = targets.length;

  let bumped = 0;
  let skipped = 0;
  let totalDelta = 0;
  // Cap one safety incident per batch — keeps the demo calm.
  let incidentEmitted = false;

  for (let i = 0; i < total; i++) {
    const photo = targets[i];
    const result = await runMockAnalysisForPhoto(photo.id, { allowSafetyFlag: !incidentEmitted });
    if (result.newPct > result.oldPct) {
      bumped += 1;
      totalDelta += result.newPct - result.oldPct;
    } else {
      skipped += 1;
    }
    // If a safety flag fired, mirror what the real Edge function does:
    // write a SafetyIncident row. We hit the local cache directly because
    // the mock is client-only.
    if (!incidentEmitted && result.analysis.safetyFlags.length > 0) {
      useSafetyIncidentsStore.getState().upsertIncident(safetyIncidentFor(projectId, result));
      incidentEmitted = true;
    }
    opts.onProgress?.(result, i + 1, total);
    if (i < total - 1) await sleep(delay);
  }

  // Re-read the feature store after all writes have settled so the summary
  // reflects the post-bump project overall progress.
  const overall = useFeatureStore.getState().calculateOverallProgress();

  return {
    processed: total,
    bumped,
    skipped,
    totalDeltaPct: totalDelta,
    newOverallProgress: overall,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

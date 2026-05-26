// Typed wrappers around the Phase C Edge Functions. All calls flow through
// `supabase.functions.invoke()` so the user's JWT travels in the
// Authorization header automatically. The Edge Function is the JWT verifier
// (see confirm-analysis/index.ts).

import { supabase, supabaseConfigured } from '../supabase';
import type { AIAnalysis, AnalysisAction, AnalysisStatus, ConstructionPhase, SafetyFlag, QualityFlag } from '../../types';

// Demo / generated projects use non-UUID IDs. Postgres rejects those before
// RLS runs, so the AI-Analysis tab + Dashboard "Pending review" tile would
// otherwise surface "Failed to load queue." every time a demo project is
// active. Short-circuit at the API boundary — same pattern as photos.ts.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (id: string): boolean => UUID_RE.test(id);

export interface AIAnalysisRow {
  id: string;
  photo_id: string;
  model_used: string;
  phase_detected: ConstructionPhase | null;
  completion_pct: number;
  confidence: number;
  safety_flags: SafetyFlag[];
  quality_flags: QualityFlag[];
  materials: string[];
  suggested_task: string | null;
  rationale: string | null;
  raw_response: unknown;
  action_taken: AnalysisAction;
  analysis_status: AnalysisStatus;
  analyzed_at: string;
}

const NOT_CONFIGURED = new Error('Supabase is not configured. Set VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY.');

export function rowToAnalysis(row: AIAnalysisRow): AIAnalysis {
  return {
    id:              row.id,
    photoId:         row.photo_id,
    modelUsed:       row.model_used,
    phaseDetected:   row.phase_detected,
    completionPct:   row.completion_pct,
    confidence:      row.confidence,
    safetyFlags:     row.safety_flags ?? [],
    qualityFlags:    row.quality_flags ?? [],
    materials:       row.materials ?? [],
    suggestedTask:   row.suggested_task,
    rationale:       row.rationale,
    rawResponse:     row.raw_response,
    actionTaken:     row.action_taken,
    analysisStatus:  row.analysis_status,
    analyzedAt:      row.analyzed_at,
  };
}

// Manual retry — invoked from the gallery's "Re-analyse" affordance.
//
// Phase D-4: optional `forceNew` flag asks the Edge Function to insert a
// fresh ai_analyses row instead of claiming a queued one (re-analysis with
// a confirmed/rejected previous result). `model` and `phaseHint` are
// pass-through hints for Phase D's real vision call; today's stub ignores
// them but the audit log records the requested model on the new row.
export interface RequestAnalysisOptions {
  forceNew?: boolean;
  model?: string;
  phaseHint?: import('../../types').ConstructionPhase;
}

export async function requestAnalysis(
  photoId: string,
  opts?: RequestAnalysisOptions,
): Promise<void> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { error } = await supabase.functions.invoke('analyze-photo', {
    body: {
      photoId,
      ...(opts?.forceNew  ? { forceNew:  true }            : {}),
      ...(opts?.model     ? { model:     opts.model }      : {}),
      ...(opts?.phaseHint ? { phaseHint: opts.phaseHint }  : {}),
    },
  });
  if (error) throw error;
}

export async function confirmAnalysis(
  photoId: string,
  options?: { overridePct?: number; notes?: string },
): Promise<{ ok: true; taskBumped?: boolean; newPct?: number }> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { data, error } = await supabase.functions.invoke('confirm-analysis', {
    body: {
      photoId,
      action: 'confirmed',
      overridePct: options?.overridePct,
      notes: options?.notes,
    },
  });
  if (error) throw error;
  return data as { ok: true; taskBumped?: boolean; newPct?: number };
}

export async function rejectAnalysis(photoId: string, notes?: string): Promise<void> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { error } = await supabase.functions.invoke('confirm-analysis', {
    body: { photoId, action: 'rejected', notes },
  });
  if (error) throw error;
}

// Cheap count-only query for the Dashboard tile. Uses Supabase's
// `count: 'exact', head: true` so no row data crosses the wire — just the
// integer. The implicit filter narrows to analyses awaiting review:
// `analysis_status='analysed'` AND `action_taken='pending'`.
//
// Note: filters by `photos.project_id` via an inner join so the count only
// covers the current project. The `head: true` flag means we ship no rows.
export async function countPendingAnalyses(projectId: string): Promise<number> {
  if (!supabaseConfigured()) return 0;
  if (!isUuid(projectId)) return 0;
  const { count, error } = await supabase
    .from('ai_analyses')
    .select('*, photos!inner(project_id)', { count: 'exact', head: true })
    .eq('analysis_status', 'analysed')
    .eq('action_taken', 'pending')
    .eq('photos.project_id', projectId);
  if (error) throw error;
  return count ?? 0;
}

// Lightweight projection of recent analyses for the AI Analysis tab's
// activity strip. Returns the four `action_taken` buckets so the user can
// see "12 auto-applied, 0 pending, 3 skipped, 0 failed" — closes the
// reporting gap where the review queue (pending-only) looks empty even
// when the AI is processing photos correctly.
//
// `since` is an ISO timestamp; defaults to 24h ago. Caller can pass a
// tighter window for the strip ("last 6h") or a wider one for diagnostics.
// Keeps the payload small — no rationale, no flags, no materials — because
// the strip only renders counts. Failed-row drilldown re-queries via
// `listFailedAnalyses` (TODO follow-up) or falls back to the audit log.
export interface RecentAnalysisRow {
  id: string;
  photo_id: string;
  action_taken: AnalysisAction;
  analysis_status: AnalysisStatus;
  confidence: number;
  analyzed_at: string;
  rationale: string | null;
}

export async function getRecentAnalyses(
  projectId: string,
  options?: { since?: string; limit?: number },
): Promise<RecentAnalysisRow[]> {
  if (!supabaseConfigured()) return [];
  if (!isUuid(projectId)) return [];
  const since = options?.since ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const limit = options?.limit ?? 50;
  const { data, error } = await supabase
    .from('ai_analyses')
    .select('id, photo_id, action_taken, analysis_status, confidence, analyzed_at, rationale, photos!inner(project_id)')
    .eq('photos.project_id', projectId)
    .gte('analyzed_at', since)
    .order('analyzed_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as RecentAnalysisRow[];
}

// Pulls the pending review queue for the manager+ tier. Joins the photo so the
// drawer can show thumbnail + filename + uploader without a second round-trip.
export async function listPendingAnalyses(projectId: string): Promise<Array<AIAnalysisRow & { photos: { id: string; project_id: string; storage_path: string; filename: string; uploaded_by: string | null; taken_at: string | null; gps_lat: number | null; gps_lng: number | null } }>> {
  if (!supabaseConfigured()) return [];
  if (!isUuid(projectId)) return [];
  const { data, error } = await supabase
    .from('ai_analyses')
    .select('*, photos!inner(id, project_id, storage_path, filename, uploaded_by, taken_at, gps_lat, gps_lng)')
    .eq('analysis_status', 'analysed')
    .eq('action_taken', 'pending')
    .eq('photos.project_id', projectId)
    .order('analyzed_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as never;
}

// Typed wrappers around the Phase C Edge Functions. All calls flow through
// `supabase.functions.invoke()` so the user's JWT travels in the
// Authorization header automatically. The Edge Function is the JWT verifier
// (see confirm-analysis/index.ts).

import { supabase, supabaseConfigured } from '../supabase';
import type { AIAnalysis, AnalysisAction, AnalysisStatus, ConstructionPhase, SafetyFlag, QualityFlag } from '../../types';

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
export async function requestAnalysis(photoId: string): Promise<void> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { error } = await supabase.functions.invoke('analyze-photo', {
    body: { photoId },
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

// Pulls the pending review queue for the manager+ tier. Joins the photo so the
// drawer can show thumbnail + filename + uploader without a second round-trip.
export async function listPendingAnalyses(projectId: string): Promise<Array<AIAnalysisRow & { photos: { id: string; project_id: string; storage_path: string; filename: string; uploaded_by: string | null; taken_at: string | null; gps_lat: number | null; gps_lng: number | null } }>> {
  if (!supabaseConfigured()) return [];
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

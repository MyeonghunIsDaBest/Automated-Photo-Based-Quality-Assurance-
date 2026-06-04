// Typed wrappers around the complete-phase Edge Function + the
// project_phase_status read. Mirrors the aiAnalyses.ts pattern: invoke carries
// the user's JWT automatically, and mock mode (no Supabase) short-circuits so
// the UI renders its empty state instead of throwing.

import { supabase, supabaseConfigured } from '../supabase';
import type { ConstructionPhase } from '../../types';

export interface PhaseStatusRow {
  project_id: string;
  phase: string;
  status: 'complete' | 'incomplete';
  verdict_text: string | null;
  blockers: string[];
  ready_for_next: boolean;
  model_used: string | null;
  completed_at: string | null;
  updated_at: string;
}

export interface PhaseVerdictResult {
  status: 'complete' | 'incomplete';
  verdict: string;
  blockers: string[];
  readyForNext: boolean;
  modelUsed: string;
}

/** Read the latest stored verdict for a phase, or null when none exists yet
 *  (or Supabase isn't configured). */
export async function getPhaseStatus(
  projectId: string,
  phase: ConstructionPhase,
): Promise<PhaseStatusRow | null> {
  if (!supabaseConfigured()) return null;
  const { data, error } = await supabase
    .from('project_phase_status')
    .select('*')
    .eq('project_id', projectId)
    .eq('phase', phase)
    .maybeSingle();
  if (error) throw error;
  return (data as PhaseStatusRow) ?? null;
}

/** Read every stored phase verdict for a project in a single query. Returns an
 *  empty array when none exist yet (or Supabase isn't configured). Order is
 *  unspecified — callers key the result by `phase`. Powers the all-phases
 *  completion board so it never fixates on one phase. */
export async function listPhaseStatuses(projectId: string): Promise<PhaseStatusRow[]> {
  if (!supabaseConfigured()) return [];
  const { data, error } = await supabase
    .from('project_phase_status')
    .select('*')
    .eq('project_id', projectId);
  if (error) throw error;
  return (data as PhaseStatusRow[]) ?? [];
}

/** Ask Claude (server-side) to judge phase completion. Upserts the verdict
 *  row server-side and returns the fresh verdict. */
export async function completePhase(
  projectId: string,
  phase: ConstructionPhase,
): Promise<PhaseVerdictResult> {
  if (!supabaseConfigured()) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.functions.invoke('complete-phase', {
    body: { projectId, phase },
  });
  if (error) throw error;
  return data as PhaseVerdictResult;
}

/** Custom-phase verdict (Tier-3 #13). Identifies the phase by its task-anchor
 *  uuid instead of the 8-value enum; the server gathers evidence from confirmed
 *  analyses on photos tagged to tasks under that anchor. Requires the matching
 *  complete-phase deploy. */
export async function completeCustomPhase(
  projectId: string,
  customPhaseId: string,
): Promise<PhaseVerdictResult> {
  if (!supabaseConfigured()) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.functions.invoke('complete-phase', {
    body: { projectId, customPhaseId },
  });
  if (error) throw error;
  return data as PhaseVerdictResult;
}

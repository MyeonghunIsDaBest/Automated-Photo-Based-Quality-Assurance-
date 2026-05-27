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

// Typed wrapper for the synthesize-project-status Edge Function. Mirrors the
// aiAnalyses.ts / phaseStatus.ts pattern: invoke carries the user's JWT
// automatically; mock mode (no Supabase) throws so the card can show its
// error banner instead of silently succeeding with fake data.

import { supabase, supabaseConfigured } from '../supabase';

export interface PhaseBreakdownRow {
  phase: string;
  pct: number;
}

export interface ProjectStatusResult {
  overallPct: number;
  activePhase: string;
  phaseBreakdown: PhaseBreakdownRow[];
  blockers: string[];
  nextMilestone: string;
  modelUsed: string;
  cached: boolean;
}

export async function synthesizeProjectStatus(projectId: string): Promise<ProjectStatusResult> {
  if (!supabaseConfigured()) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.functions.invoke('synthesize-project-status', {
    body: { projectId },
  });
  if (error) throw error;
  return data as ProjectStatusResult;
}

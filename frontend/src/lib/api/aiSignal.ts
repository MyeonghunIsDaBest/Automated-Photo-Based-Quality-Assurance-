// AI signal per task — the *real* source for the progression breakdown's
// "AI confidence" column.
//
// Until now, `ProgressionBreakdown` used `task.percentComplete` as a proxy
// for AI signal — which meant force-progressing a task moved the AI column
// too, conflating two separate measurements. This module fixes that bug by
// pulling the actual confidence from `ai_analyses` rows linked to the task.
//
// What counts as signal: photos attached to the task → analyses with
// `analysis_status='analysed'` and `action_taken in ('auto_updated','confirmed')`
// → average their `confidence` field. Pending / skipped / failed analyses
// don't contribute because they didn't drive any progress decision.

import { supabase, supabaseConfigured } from '../supabase';

export interface TaskAiSignal {
  /** 0-100 — average AI confidence across analyses that influenced this
   *  task's progress. Returns 0 when no qualifying analyses exist. */
  signalPct: number;
  /** Number of analyses that contributed to the average. Useful for tooltips
   *  ("AI: 78% confidence across 4 analyses"). */
  sampleSize: number;
  /** ISO timestamp of the most recent contributing analysis, or null. */
  lastAnalysedAt: string | null;
}

const EMPTY: TaskAiSignal = { signalPct: 0, sampleSize: 0, lastAnalysedAt: null };

export async function getTaskAiSignal(taskId: string): Promise<TaskAiSignal> {
  if (!supabaseConfigured()) return EMPTY;

  // Join: ai_analyses ← photos. Both real-AI (Phase D) and Mock-AI rows
  // surface because the mock writes mvp-stub@v0 / mock-bump@v1 model tags
  // with confidence values that satisfy the same filter.
  const { data, error } = await supabase
    .from('ai_analyses')
    .select('confidence, action_taken, analyzed_at, photos!inner(task_id)')
    .eq('analysis_status', 'analysed')
    .in('action_taken', ['auto_updated', 'confirmed'])
    .eq('photos.task_id', taskId);

  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[aiSignal]', error.message);
    return EMPTY;
  }

  const rows = (data ?? []) as Array<{ confidence: number; analyzed_at: string }>;
  if (rows.length === 0) return EMPTY;

  const avg = rows.reduce((sum, r) => sum + (r.confidence ?? 0), 0) / rows.length;
  // confidence is stored as 0-1; surface as a percentage so the breakdown's
  // axis matches `percentComplete` (0-100).
  return {
    signalPct: Math.round(avg * 100),
    sampleSize: rows.length,
    lastAnalysedAt: rows
      .map((r) => r.analyzed_at)
      .sort()
      .reverse()[0] ?? null,
  };
}

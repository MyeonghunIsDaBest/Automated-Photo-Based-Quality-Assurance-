// ─────────────────────────────────────────────────────────────────────────────
// analyze-photo — Supabase Edge Function (Deno).
//
// Phase C lifecycle: trigger pre-inserts an `ai_analyses` row with
// analysis_status='queued'. This function CLAIMS that row (UPDATE → 'analysing'
// guarded by analysis_status='queued'), runs the analyser, UPDATEs the row
// with results, fans out side-effects (safety_incidents row, tasks
// percent_complete bump), and writes audit_log. Two concurrent webhook
// invocations cannot double-credit the same photo: the claim returns 0 rows
// for the loser.
//
// MVP STUB. `mockAnalyze()` returns deterministic zero values. Phase D swaps
// it for a real Anthropic Claude Vision call; nothing else in this file
// changes.
//
// DEPLOY:
//   supabase functions deploy analyze-photo --no-verify-jwt
//
// INVOKE (manual):
//   curl -X POST "$SUPABASE_URL/functions/v1/analyze-photo" \
//     -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
//     -H "Content-Type: application/json" \
//     -d '{"photoId":"<uuid>"}'
//
// AUTOMATED TRIGGER (recommended):
//   Postgres webhook on photos INSERT → POST here. See supabase/README.md.
// ─────────────────────────────────────────────────────────────────────────────

// @ts-expect-error Deno-only import.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
// @ts-expect-error Deno-only import.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

import type { AnalysisResult, SafetyFlag } from '../_shared/contract.ts';
import { decideAction } from '../_shared/decideAction.ts';
import { loadProjectConfig } from '../_shared/loadProjectConfig.ts';
import { maxSeverity } from '../_shared/safetyTaxonomy.ts';
import { logAction } from '../_shared/auditLog.ts';

// @ts-expect-error Deno globals.
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
// @ts-expect-error Deno globals.
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Deterministic placeholder. Phase D replaces this with a real vision call.
// The `modelUsed` field is overwritten by the caller below — keep this value
// as a clearly-fake marker so anything that bypasses the override surfaces.
function mockAnalyze(): AnalysisResult {
  return {
    modelUsed: 'mvp-stub@v0',
    phaseDetected: null,
    completionPct: 0,
    confidence: 0,
    safetyFlags: [],
    qualityFlags: [],
    materials: [],
    suggestedTask: null,
    rationale: 'Stub analyser — no vision model wired yet.',
    rawResponse: { stub: true },
  };
}

interface InvokePayload {
  photoId?: string;
  // Postgres database-webhook envelope.
  record?: { id?: string; project_id?: string; task_id?: string | null };
  // Phase D-4 — re-analyse a photo even though there's no queued row. The
  // Edge Function INSERTs a fresh ai_analyses row in `analysing` status
  // and proceeds. The frontend's "Re-analyse" button passes this.
  forceNew?: boolean;
  // Optional override; passed through to the analyser. The stub ignores it
  // and keeps writing whatever modelUsed it was given. Phase D's real vision
  // call reads it to switch model versions for replay / A-B testing.
  model?: string;
  // Optional phase hint to bias the analyser toward a known phase. Today's
  // stub ignores it; Phase D plumbs it into the prompt.
  phaseHint?: string;
}

serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  let body: InvokePayload = {};
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const photoId = body.photoId ?? body.record?.id;
  if (!photoId) {
    return jsonError(400, 'photoId is required');
  }

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // ── 1. Fetch the photo (project_id / task_id / storage_path) ────────────
  // Done before the ai_analyses claim so we can load the per-project config
  // and stamp the right default model on the row from the very first write.
  const { data: photoRow, error: photoErr } = await sb
    .from('photos')
    .select('project_id, task_id, storage_path')
    .eq('id', photoId)
    .single();

  if (photoErr || !photoRow) {
    return jsonError(404, photoErr?.message ?? 'photo missing');
  }

  // ── 2. Load per-project config (thresholds + default model + dedup) ─────
  const cfg = await loadProjectConfig(sb, photoRow.project_id);

  // ── 3. Build the analyser result. The body.model override wins;
  //      otherwise the project's configured default model is recorded so
  //      replays + audit trails reflect "what would have been used".
  const result = mockAnalyze();
  result.modelUsed = body.model ?? cfg.defaultModel;

  // ── 4. Acquire an ai_analyses row to write into ────────────────────────
  // Two paths:
  //   - Webhook flow (default): claim the queued row pre-inserted by the
  //     Postgres trigger. Atomic state transition `queued → analysing`
  //     guards against double-credit.
  //   - Re-analyse flow (forceNew=true): no queued row exists, so INSERT a
  //     fresh row directly in `analysing`. Phase D-4 dropped the
  //     UNIQUE(photo_id) constraint so this is allowed (multiple analyses
  //     per photo, ordered by analyzed_at).
  let aiAnalysisId: string;
  if (body.forceNew) {
    const { data: inserted, error: insertErr } = await sb
      .from('ai_analyses')
      .insert({
        photo_id:        photoId,
        model_used:      result.modelUsed,
        analysis_status: 'analysing',
        completion_pct:  0,
        confidence:      0,
      })
      .select('id')
      .single();
    if (insertErr || !inserted) {
      return jsonError(500, insertErr?.message ?? 'failed to insert re-analysis row');
    }
    aiAnalysisId = inserted.id as string;
  } else {
    const { data: claimed, error: claimError } = await sb
      .from('ai_analyses')
      .update({ model_used: result.modelUsed, analysis_status: 'analysing' })
      .eq('photo_id', photoId)
      .eq('analysis_status', 'queued')
      .select('id')
      .maybeSingle();

    if (claimError) return jsonError(500, claimError.message);
    if (!claimed) {
      // Another invocation already claimed it (or the photo has no pending
      // row). Idempotent no-op for the webhook path.
      return jsonOk({ ok: true, photoId, claimed: false });
    }
    aiAnalysisId = claimed.id as string;
  }

  // ── 5. UPDATE the ai_analyses row with results + decideAction ───────────
  const action = decideAction(result, {
    autoUpdate: cfg.autoUpdate,
    reviewQueue: cfg.reviewQueue,
  });
  const { error: writeErr } = await sb
    .from('ai_analyses')
    .update({
      phase_detected:  result.phaseDetected,
      completion_pct:  result.completionPct,
      confidence:      result.confidence,
      safety_flags:    result.safetyFlags,
      quality_flags:   result.qualityFlags,
      materials:       result.materials,
      suggested_task:  result.suggestedTask,
      rationale:       result.rationale,
      raw_response:    result.rawResponse,
      action_taken:    action,
      analysis_status: 'analysed',
      analyzed_at:     new Date().toISOString(),
    })
    .eq('id', aiAnalysisId);

  if (writeErr) {
    await markFailed(sb, aiAnalysisId, writeErr.message);
    return jsonError(500, writeErr.message);
  }

  // ── 6. Side-effects ─────────────────────────────────────────────────────

  // 6a. Safety flags → safety_incidents row (service role bypasses RLS).
  if (result.safetyFlags.length > 0) {
    const severity = maxSeverity(result.safetyFlags);
    const { data: incident, error: incidentErr } = await sb
      .from('safety_incidents')
      .insert({
        project_id:     photoRow.project_id,
        photo_id:       photoId,
        ai_analysis_id: aiAnalysisId,
        flags:          result.safetyFlags,
        severity,
      })
      .select('id')
      .single();

    if (incidentErr) {
      console.error(`[analyze-photo] safety_incidents insert failed: ${incidentErr.message}`);
    } else if (incident) {
      await logAction({
        supabase:   sb,
        projectId:  photoRow.project_id,
        userId:     null,
        action:     'safety_incident_detected',
        entityType: 'safety_incident',
        entityId:   incident.id,
        newValue:   { flags: result.safetyFlags, severity },
      });
    }
  }

  // 6b. Auto-updated path → bump tasks.percent_complete (guarded so retries
  //     can't roll progress backward).
  if (action === 'auto_updated' && photoRow.task_id) {
    const { data: oldTask } = await sb
      .from('tasks')
      .select('percent_complete')
      .eq('id', photoRow.task_id)
      .single();

    const oldPct = (oldTask?.percent_complete ?? 0) as number;
    if (result.completionPct > oldPct) {
      const { error: taskErr } = await sb
        .from('tasks')
        .update({
          percent_complete: result.completionPct,
          update_source:    'ai_auto',
          last_updated:     new Date().toISOString(),
        })
        .eq('id', photoRow.task_id)
        .lt('percent_complete', result.completionPct);

      if (!taskErr) {
        await logAction({
          supabase:   sb,
          projectId:  photoRow.project_id,
          userId:     null,
          action:     'task_progress_auto_updated',
          entityType: 'task',
          entityId:   photoRow.task_id,
          oldValue:   { percent_complete: oldPct },
          newValue:   { percent_complete: result.completionPct, source: 'ai_analysis', ai_analysis_id: aiAnalysisId },
        });
      }
    }
  }

  // 6c. Mark the photo so the gallery's "Pending AI" badge clears.
  await sb.from('photos').update({ ai_analyzed: true }).eq('id', photoId);

  // 6d. Audit the analysis itself.
  await logAction({
    supabase:   sb,
    projectId:  photoRow.project_id,
    userId:     null,
    action:     'photo_analysed',
    entityType: 'ai_analysis',
    entityId:   aiAnalysisId,
    newValue: {
      model_used:     result.modelUsed,
      confidence:     result.confidence,
      completion_pct: result.completionPct,
      action_taken:   action,
      safety_flag_count:  result.safetyFlags.length,
      quality_flag_count: result.qualityFlags.length,
    },
  });

  return jsonOk({
    ok: true,
    photoId,
    aiAnalysisId,
    modelUsed: result.modelUsed,
    actionTaken: action,
  });
});

async function markFailed(sb: any, aiAnalysisId: string, reason: string): Promise<void> {
  await sb
    .from('ai_analyses')
    .update({ analysis_status: 'failed', rationale: `failure: ${reason}` })
    .eq('id', aiAnalysisId);
}

function jsonOk(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Suppress unused-import lint when SafetyFlag is only consumed transitively
// through AnalysisResult's typed array.
type _SafetyFlagAlias = SafetyFlag;

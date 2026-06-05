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

import type { AnalysisResult, ConstructionPhase, SafetyFlag } from '../_shared/contract.ts';
import { decideAction } from '../_shared/decideAction.ts';
import { loadProjectConfig } from '../_shared/loadProjectConfig.ts';
import { maxSeverity } from '../_shared/safetyTaxonomy.ts';
import { logAction } from '../_shared/auditLog.ts';
import { CORS_HEADERS, handleCorsPreflight } from '../_shared/cors.ts';
// Phase D vision call dependencies. Wired into the runtime path at line
// ~237 as of the May 22 cutover — `callClaudeVision()` replaces the
// previous `mockAnalyze()` stub.
import { callAnthropicVision } from '../_shared/anthropic.ts';
import { failureResult, parseVisionResponse } from '../_shared/parseVisionResponse.ts';
import { buildUserPrompt, VISION_SYSTEM_PROMPT } from '../_shared/visionPrompt.ts';
import { resizeForVision } from '../_shared/resizeImage.ts';
// @ts-expect-error Deno-only import.
import { encodeBase64 } from 'https://deno.land/std@0.224.0/encoding/base64.ts';

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

// ─── Phase D vision call (idle until May 26 cutover) ────────────────────────
// callClaudeVision is the eventual replacement for mockAnalyze(). Wired here
// so the May 26 flip is a 4-line swap at the call site (~line 130), not a
// scramble through Storage code + imports under deploy pressure.
//
// Steps:
//   1. Resolve the photo's media type from its storage path. Claude Vision
//      accepts jpeg/png/webp/gif only — HEIC (iOS default) and video
//      formats return failureResult with a specific rationale.
//   2. Download the photo bytes from the `photos` Storage bucket via the
//      service-role client (storage RLS allows authed read; service role
//      bypasses it).
//   3. Base64-encode the bytes. std/encoding/base64 handles large buffers
//      without spreading them through String.fromCharCode (which blows the
//      call stack at ~100k bytes).
//   4. Call Anthropic via the shared wrapper. Kill switch + daily call/
//      token caps + rate-limit detection + usage recording all live there.
//   5. Parse the model's JSON response into AnalysisResult. parseVision-
//      Response is defensive: markdown fence stripping, clamping, enum
//      filtering, length caps. It never throws — malformed output collapses
//      into a failureResult shape with modelUsed='failed'.
//
// Returns AnalysisResult on every code path. Failures get the marker shape
// so the audit log + UI can detect them without exception handling.

async function callClaudeVision(
  sb: any,
  args: {
    storagePath: string;
    phaseHint?: ConstructionPhase | null;
    model: string;
    /** Photo uploader — attributes the vision call's cost to the user whose
     *  upload triggered it, for the per-user daily cap (migration 35). */
    userId?: string | null;
  },
): Promise<AnalysisResult> {
  // 1. Media type from extension.
  const media = guessMediaType(args.storagePath);
  if (!media.ok) {
    return failureResult(args.model, media.reason);
  }

  // 2. Storage download.
  const { data: blob, error: dlErr } = await sb
    .storage
    .from('photos')
    .download(args.storagePath);
  if (dlErr || !blob) {
    return failureResult(args.model, `storage_download_failed: ${dlErr?.message ?? 'unknown'}`);
  }

  // 3. Resize-if-large + base64. The resize step caps the long edge at
  // 1568px (Anthropic's billed-resolution ceiling for Haiku/Sonnet) so a
  // 4032×3024 phone photo doesn't pay the worst-case image-token charge.
  // Pass-through for sub-cap images and for media types the WASM
  // decoder doesn't handle (GIF, anything imagescript can't read).
  const raw = new Uint8Array(await blob.arrayBuffer());
  const resized = await resizeForVision(raw, media.mediaType);
  const base64 = encodeBase64(resized);

  // 4. Vision call.
  const call = await callAnthropicVision(sb, {
    system:      VISION_SYSTEM_PROMPT,
    userText:    buildUserPrompt(args.phaseHint ?? null),
    imageBase64: base64,
    mediaType:   media.mediaType,
    model:       args.model,
    userId:      args.userId,
  });
  if (!call.ok) {
    return failureResult(args.model, `${call.reason}${call.detail ? `: ${call.detail}` : ''}`);
  }

  // 5. Parse.
  return parseVisionResponse(call.text, call.model);
}

// Resolve a photo's Anthropic-compatible media type from its storage path
// extension. Phase D rejects HEIC (iOS native default) and video formats —
// Claude Vision doesn't accept them. Uploaders should convert / extract
// frames upstream. The tagged-union result lets the caller surface a
// specific rationale to the audit log.

type GuessMediaResult =
  | { ok: true; mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' }
  | { ok: false; reason: string };

function guessMediaType(storagePath: string): GuessMediaResult {
  const ext = storagePath.toLowerCase().split('.').pop() ?? '';
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return { ok: true, mediaType: 'image/jpeg' };
    case 'png':
      return { ok: true, mediaType: 'image/png' };
    case 'webp':
      return { ok: true, mediaType: 'image/webp' };
    case 'gif':
      return { ok: true, mediaType: 'image/gif' };
    case 'heic':
    case 'heif':
      return {
        ok: false,
        reason: 'unsupported_media_type: HEIC not accepted by Claude Vision — convert to JPEG upstream',
      };
    case 'mov':
    case 'mp4':
    case 'm4v':
    case 'webm':
      return {
        ok: false,
        reason: 'unsupported_media_type: video formats not supported in Phase D (photos only)',
      };
    default:
      return { ok: false, reason: `unsupported_media_type: .${ext || '<no extension>'}` };
  }
}

interface InvokePayload {
  photoId?: string;
  // Postgres database-webhook envelope. `phase_hint` is the column added by
  // migration 17_photos_phase_hint.sql; it rides along when the operator
  // tagged the upload batch with a construction phase in the AI Analysis
  // tab's chip selector. Add `phase_hint` to the webhook's column allowlist
  // in the Supabase dashboard or it stays undefined here even when the
  // column is populated.
  record?: {
    id?: string;
    project_id?: string;
    task_id?: string | null;
    phase_hint?: string | null;
  };
  // Phase D-4 — re-analyse a photo even though there's no queued row. The
  // Edge Function INSERTs a fresh ai_analyses row in `analysing` status
  // and proceeds. The frontend's "Re-analyse" button passes this.
  forceNew?: boolean;
  // Optional override; passed through to the analyser. The stub ignores it
  // and keeps writing whatever modelUsed it was given. Phase D's real vision
  // call reads it to switch model versions for replay / A-B testing.
  model?: string;
  // Optional phase hint to bias the analyser toward a known phase. Falls
  // back to `record.phase_hint` from the webhook envelope when the
  // top-level field is absent (webhook-driven flow).
  phaseHint?: string;
}

serve(async (req: Request) => {
  // CORS preflight — primarily for future frontend "Re-analyse" affordances;
  // the Postgres webhook path doesn't need this but it's harmless and keeps
  // both Edge Functions on the same CORS template.
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: CORS_HEADERS });
  }

  let body: InvokePayload = {};
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400, headers: CORS_HEADERS });
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
    .select('project_id, task_id, storage_path, uploaded_by')
    .eq('id', photoId)
    .single();

  if (photoErr || !photoRow) {
    return jsonError(404, photoErr?.message ?? 'photo missing');
  }

  // ── 2. Load per-project config (thresholds + default model + dedup) ─────
  const cfg = await loadProjectConfig(sb, photoRow.project_id);

  // ── 3. Run the analyser. Two branches:
  //      • Project's configured model is the stub marker
  //        ('mvp-stub@v0' — the per-project default for demo projects,
  //        see Plan §1 lever E) → run mockAnalyze locally. The real
  //        Anthropic API would 400 on 'mvp-stub@v0' as an unknown model,
  //        and demo projects must never burn the API credit.
  //      • Anything else (e.g. 'claude-haiku-4-5' on the pilot project)
  //        → real vision. callClaudeVision stamps modelUsed itself
  //        (real model on success, 'failed' marker on any failure path).
  const resolvedModel = body.model ?? cfg.defaultModel;
  // Top-level body.phaseHint (manual re-analyse / direct invocation) wins
  // over record.phase_hint (webhook-driven flow); both fall back to null
  // for Auto-detect.
  const resolvedPhaseHint =
    (body.phaseHint as ConstructionPhase | null | undefined)
    ?? (body.record?.phase_hint as ConstructionPhase | null | undefined)
    ?? null;
  let result: AnalysisResult;
  if (resolvedModel.startsWith('mvp-stub')) {
    result = mockAnalyze();
    result.modelUsed = resolvedModel;
  } else {
    result = await callClaudeVision(sb, {
      storagePath: photoRow.storage_path,
      phaseHint:   resolvedPhaseHint,
      model:       resolvedModel,
      userId:      photoRow.uploaded_by ?? null,
    });
  }

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
      // The phase the operator pre-tagged (if any) vs. what the model
      // detected — useful for accuracy retros and prompt tuning.
      phase_hint_provided: resolvedPhaseHint,
      phase_detected:      result.phaseDetected,
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
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

// Suppress unused-import lint when SafetyFlag is only consumed transitively
// through AnalysisResult's typed array.
type _SafetyFlagAlias = SafetyFlag;

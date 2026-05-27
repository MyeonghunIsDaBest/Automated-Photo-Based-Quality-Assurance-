// ─────────────────────────────────────────────────────────────────────────────
// complete-phase — Supabase Edge Function (Deno).
//
//   POST /functions/v1/complete-phase
//   { projectId: uuid, phase: ConstructionPhase }
//
// Gathers the confirmed ai_analyses for that phase, asks Claude (via the shared
// callAnthropic helper — kill-switch / caps / usage all live there) for a
// completion verdict, upserts it into project_phase_status, and returns
//   { status, verdict, blockers, readyForNext, modelUsed }.
//
// JWT-gated (deployed without --no-verify-jwt). It only writes a verdict cache,
// so no manager-group gate beyond the platform's JWT presence check.
//
// DEPLOY:
//   supabase functions deploy complete-phase
// ─────────────────────────────────────────────────────────────────────────────

// @ts-expect-error Deno-only import.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
// @ts-expect-error Deno-only import.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

import { callAnthropic } from '../_shared/anthropic.ts';
import { logAction } from '../_shared/auditLog.ts';
import { CORS_HEADERS, handleCorsPreflight } from '../_shared/cors.ts';
import { PHASE_VERDICT_SYSTEM, parsePhaseVerdict } from '../_shared/phaseVerdictPrompt.ts';

// @ts-expect-error Deno globals.
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
// @ts-expect-error Deno globals.
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Mirrors CONSTRUCTION_PHASES in _shared/contract.ts.
const PHASES = [
  'excavation', 'foundation', 'framing', 'roofing',
  'electrical', 'plumbing', 'drywall', 'finishing',
];

// Cap the rationale corpus so a phase with hundreds of confirmed photos can't
// blow the token budget — most-recent 20 is plenty of signal for a verdict.
const MAX_ANALYSES = 20;

interface RequestBody {
  projectId: string;
  phase: string;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...CORS_HEADERS },
  });
}

serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  let body: Partial<RequestBody>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  if (!body.projectId || !UUID_RE.test(body.projectId)) return json({ error: 'projectId_invalid' }, 400);
  if (!body.phase || !PHASES.includes(body.phase)) return json({ error: 'phase_invalid' }, 400);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Gather confirmed analyses for this phase (scoped to the project via the
  // photos join — same pattern as confirm-analysis / listPendingAnalyses).
  const { data: rows } = await supabase
    .from('ai_analyses')
    .select('completion_pct, rationale, photos!inner(project_id)')
    .eq('photos.project_id', body.projectId)
    .eq('phase_detected', body.phase)
    .eq('analysis_status', 'confirmed')
    .order('analyzed_at', { ascending: false })
    .limit(MAX_ANALYSES);

  if (!rows || rows.length === 0) {
    return json({
      status: 'incomplete',
      verdict: 'No confirmed analyses for this phase yet.',
      blockers: ['No confirmed photo evidence'],
      readyForNext: false,
      modelUsed: 'none',
    }, 200);
  }

  const corpus = rows
    .map((r, i) => `(${i + 1}) [${r.completion_pct}%] ${r.rationale ?? 'no rationale'}`)
    .join('\n');

  const result = await callAnthropic(supabase, {
    system: PHASE_VERDICT_SYSTEM,
    messages: [{ role: 'user', content: `Phase: ${body.phase}\nConfirmed analyses:\n${corpus}` }],
    maxTokens: 512,
  });

  if (!result.ok) {
    const status =
      result.reason === 'rate_limited' ? 429 :
      (result.reason === 'disabled' || result.reason === 'missing_key') ? 503 :
      502;
    return json({ error: result.reason, detail: result.detail, retryable: result.retryable }, status);
  }

  const verdict = parsePhaseVerdict(result.text);
  if (!verdict) return json({ error: 'parse_failed', detail: result.text.slice(0, 200) }, 502);

  await supabase.from('project_phase_status').upsert({
    project_id: body.projectId,
    phase: body.phase,
    status: verdict.status,
    verdict_text: verdict.verdict,
    blockers: verdict.blockers,
    ready_for_next: verdict.readyForNext,
    model_used: result.model,
    completed_at: verdict.status === 'complete' ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'project_id,phase' });

  await logAction({
    supabase,
    projectId: body.projectId,
    userId: null,
    action: 'phase_completion_checked',
    entityType: 'project_config',
    entityId: body.projectId,
    notes: `phase=${body.phase}; status=${verdict.status}; analyses=${rows.length}; model=${result.model}`,
  });

  return json({ ...verdict, modelUsed: result.model }, 200);
});

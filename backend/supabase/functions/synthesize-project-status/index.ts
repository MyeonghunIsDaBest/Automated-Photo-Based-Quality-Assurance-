// ─────────────────────────────────────────────────────────────────────────────
// synthesize-project-status — Supabase Edge Function (Deno).
//
//   POST /functions/v1/synthesize-project-status
//   { projectId: uuid }
//
// Daily-cached project status synthesis. First call of the day gathers the
// 5 most-recent confirmed ai_analyses per phase, asks Claude (via the shared
// callAnthropic helper — kill-switch / caps / usage live there) for a
// structured status, upserts the result into project_status_snapshots, and
// returns it. Subsequent same-day calls for the same project return the
// cached payload — no Claude burn.
//
// JWT-gated (deployed without --no-verify-jwt). No manager gate beyond
// JWT presence — it only writes a daily cache row.
//
// DEPLOY:
//   supabase functions deploy synthesize-project-status
// ─────────────────────────────────────────────────────────────────────────────

// @ts-expect-error Deno-only import.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
// @ts-expect-error Deno-only import.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

import { callAnthropic } from '../_shared/anthropic.ts';
import { getUserId } from '../_shared/auth.ts';
import { logAction } from '../_shared/auditLog.ts';
import { CORS_HEADERS, handleCorsPreflight } from '../_shared/cors.ts';
import { SYNTHESIS_SYSTEM, parseProjectStatus } from '../_shared/synthesisPrompt.ts';

// @ts-expect-error Deno globals.
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
// @ts-expect-error Deno globals.
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PHASES = [
  'excavation', 'foundation', 'framing', 'roofing',
  'electrical', 'plumbing', 'drywall', 'finishing',
];

// Most-recent N confirmed analyses per phase. Token cap discipline — a
// project with hundreds of confirmed photos would otherwise blow the
// budget on one synthesis call. 5 per phase × 8 phases × ~100 tokens of
// rationale ≈ 4k tokens of corpus, well within ANTHROPIC_MAX_TOKENS.
const ANALYSES_PER_PHASE = 5;

interface RequestBody {
  projectId: string;
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

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const today = new Date().toISOString().slice(0, 10);

  // 1. Cache-first lookup. A repeat call on the same day returns the cached
  // payload with no Claude call — boss demos / refreshes don't re-burn.
  const { data: cached } = await supabase
    .from('project_status_snapshots')
    .select('payload_jsonb, model_used, narrative_text')
    .eq('project_id', body.projectId)
    .eq('snapshot_date', today)
    .maybeSingle();

  if (cached && cached.payload_jsonb) {
    return json({
      ...cached.payload_jsonb,
      // narrative_text is the canonical column; fall back to a narrative that
      // may have been embedded in the payload jsonb on older rows.
      narrative: cached.narrative_text ?? cached.payload_jsonb.narrative ?? '',
      modelUsed: cached.model_used,
      cached: true,
    }, 200);
  }

  // 2. Gather: most-recent N confirmed analyses per phase, in parallel so one
  // slow phase doesn't dominate the request budget.
  const perPhase = await Promise.all(
    PHASES.map(async (phase) => {
      const { data } = await supabase
        .from('ai_analyses')
        .select('completion_pct, rationale, photos!inner(project_id)')
        .eq('photos.project_id', body.projectId)
        .eq('phase_detected', phase)
        .eq('analysis_status', 'confirmed')
        .order('analyzed_at', { ascending: false })
        .limit(ANALYSES_PER_PHASE);
      return { phase, rows: data ?? [] };
    }),
  );

  // Phases with no evidence are dropped so the prompt isn't padded with
  // "phase=foundation: (none)" noise that Claude would still pay attention to.
  const phasesWithEvidence = perPhase.filter((g) => g.rows.length > 0);
  if (phasesWithEvidence.length === 0) {
    return json({
      overallPct: 0,
      activePhase: 'excavation',
      phaseBreakdown: [],
      blockers: ['No confirmed photo evidence yet'],
      nextMilestone: 'Capture and confirm site photos to bootstrap the project status.',
      narrative: '',
      modelUsed: 'none',
      cached: false,
    }, 200);
  }

  const corpus = phasesWithEvidence
    .map((g) => {
      const lines = g.rows
        .map((r, i) => `  (${i + 1}) [${r.completion_pct}%] ${r.rationale ?? 'no rationale'}`)
        .join('\n');
      return `Phase: ${g.phase}\n${lines}`;
    })
    .join('\n\n');

  const userId = await getUserId(supabase, req);
  const result = await callAnthropic(supabase, {
    system: SYNTHESIS_SYSTEM,
    messages: [{ role: 'user', content: `Confirmed analyses by phase:\n\n${corpus}` }],
    maxTokens: 800,
    userId,
  });

  if (!result.ok) {
    const status =
      result.reason === 'rate_limited' ? 429 :
      (result.reason === 'disabled' || result.reason === 'missing_key') ? 503 :
      502;
    return json({ error: result.reason, detail: result.detail, retryable: result.retryable }, status);
  }

  const payload = parseProjectStatus(result.text);
  if (!payload) return json({ error: 'parse_failed', detail: result.text.slice(0, 200) }, 502);

  // 3. Cache the snapshot. PK is (project_id, snapshot_date) so a parallel
  // call that landed first is a no-op on conflict.
  await supabase.from('project_status_snapshots').upsert({
    project_id: body.projectId,
    snapshot_date: today,
    payload_jsonb: payload,
    narrative_text: payload.narrative,
    model_used: result.model,
  }, { onConflict: 'project_id,snapshot_date' });

  await logAction({
    supabase,
    projectId: body.projectId,
    userId: null,
    action: 'project_status_synthesized',
    entityType: 'project_config',
    entityId: body.projectId,
    notes: `phases_with_evidence=${phasesWithEvidence.length}; overall=${payload.overallPct}%; model=${result.model}`,
  });

  return json({ ...payload, modelUsed: result.model, cached: false }, 200);
});

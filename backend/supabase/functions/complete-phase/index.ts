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
import { getUserId, isProjectMember } from '../_shared/auth.ts';
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
  phase?: string;          // built-in phase (one of the 8 enum values)
  customPhaseId?: string;  // OR a custom phase by its anchor uuid (migration 44)
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

  // Accept EITHER a built-in phase (one of the 8 enum values) OR a custom phase
  // by its anchor uuid (migration 44). Custom phases carry a placeholder `phase`
  // enum and are identified by their task-anchor id instead.
  // A request is "custom" only when it carries a customPhaseId that LOOKS like a
  // uuid — a stray/empty/malformed customPhaseId no longer shadows a valid
  // built-in `phase` (built-in takes precedence if both are somehow present; the
  // frontend only ever sends one).
  const hasBuiltin = typeof body.phase === 'string' && PHASES.includes(body.phase);
  const hasCustom = typeof body.customPhaseId === 'string' && UUID_RE.test(body.customPhaseId);
  const isCustom = hasCustom && !hasBuiltin;
  if (!hasBuiltin && !hasCustom) {
    // Distinguish "sent a malformed customPhaseId" from "missing/invalid phase".
    const sentBadCustom = typeof body.customPhaseId === 'string' && body.customPhaseId.length > 0;
    return json({ error: sentBadCustom ? 'customPhaseId_invalid' : 'phase_invalid' }, 400);
  }

  // AuthZ: caller must be a member of (or manager over) this project. The
  // service-role client below is RLS-exempt, so without this gate any
  // authenticated user could read another project's confirmed analyses and
  // burn AI budget against it. Same predicate the RLS policies use.
  if (!(await isProjectMember(req, body.projectId))) {
    return json({ error: 'forbidden' }, 403);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Resolve the phase label + gather its confirmed-analysis evidence.
  //  • Built-in: evidence = confirmed analyses whose AI-detected phase matches.
  //  • Custom:   evidence = confirmed analyses for photos tagged to tasks living
  //              UNDER the custom anchor (children attach via parent_task_id —
  //              migration 44), since the vision model only emits the 8 built-in
  //              phases and can't auto-detect a custom one.
  let phaseLabel: string;
  let statusKey: string; // value written to project_phase_status.phase
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let rows: any[] | null = null;

  if (isCustom) {
    const anchorId = body.customPhaseId as string;
    const { data: anchor } = await supabase
      .from('tasks')
      .select('name')
      .eq('id', anchorId)
      .eq('project_id', body.projectId)
      .eq('is_phase_anchor', true)
      .eq('is_custom', true)
      .maybeSingle();
    if (!anchor) return json({ error: 'custom_phase_not_found' }, 404);
    phaseLabel = anchor.name;
    statusKey = anchorId;

    const { data: children } = await supabase
      .from('tasks')
      .select('id')
      .eq('parent_task_id', anchorId);
    const childIds = (children ?? []).map((c: { id: string }) => c.id);

    if (childIds.length > 0) {
      const res = await supabase
        .from('ai_analyses')
        .select('completion_pct, rationale, photos!inner(project_id, task_id)')
        .eq('photos.project_id', body.projectId)
        .in('photos.task_id', childIds)
        .eq('analysis_status', 'confirmed')
        .order('analyzed_at', { ascending: false })
        .limit(MAX_ANALYSES);
      rows = res.data ?? [];
    } else {
      rows = [];
    }
  } else {
    phaseLabel = body.phase as string;
    statusKey = body.phase as string;
    const res = await supabase
      .from('ai_analyses')
      .select('completion_pct, rationale, photos!inner(project_id)')
      .eq('photos.project_id', body.projectId)
      .eq('phase_detected', body.phase)
      .eq('analysis_status', 'confirmed')
      .order('analyzed_at', { ascending: false })
      .limit(MAX_ANALYSES);
    rows = res.data ?? [];
  }

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

  const userId = await getUserId(supabase, req);
  // Custom phase labels are user-controlled (anchor.name); collapse newlines +
  // cap length so a crafted name can't break out of the "Phase:" line and inject
  // instructions into the verdict prompt. Built-in labels are already safe enums.
  const safePhaseLabel = phaseLabel.replace(/[\r\n]+/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, 120);
  const result = await callAnthropic(supabase, {
    system: PHASE_VERDICT_SYSTEM,
    messages: [{ role: 'user', content: `Phase: ${safePhaseLabel}\nConfirmed analyses:\n${corpus}` }],
    maxTokens: 512,
    userId,
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

  // Cache the verdict (best-effort — never fatal; the verdict is returned to the
  // client regardless). `phase` is a TEXT column (migration 18), so for built-ins
  // statusKey is the enum value and for custom phases it's the anchor uuid —
  // both persist fine and are read back via listPhaseStatuses keyed by `phase`.
  const { error: cacheErr } = await supabase.from('project_phase_status').upsert({
    project_id: body.projectId,
    phase: statusKey,
    status: verdict.status,
    verdict_text: verdict.verdict,
    blockers: verdict.blockers,
    ready_for_next: verdict.readyForNext,
    model_used: result.model,
    completed_at: verdict.status === 'complete' ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'project_id,phase' });
  if (cacheErr) {
    // eslint-disable-next-line no-console
    console.warn(`[complete-phase] verdict not cached (${isCustom ? 'custom' : 'built-in'}):`, cacheErr.message);
  }

  await logAction({
    supabase,
    projectId: body.projectId,
    userId: null,
    action: 'phase_completion_checked',
    entityType: 'project_config',
    entityId: body.projectId,
    notes: `phase=${phaseLabel}${isCustom ? ' (custom)' : ''}; status=${verdict.status}; analyses=${rows.length}; model=${result.model}`,
  });

  return json({ ...verdict, modelUsed: result.model }, 200);
});

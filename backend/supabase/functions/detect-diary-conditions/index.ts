// ─────────────────────────────────────────────────────────────────────────────
// detect-diary-conditions — Supabase Edge Function (Deno).
//
//   POST /functions/v1/detect-diary-conditions
//   { projectId: uuid, imageBase64: string, mediaType: 'image/jpeg'|'image/png'|'image/webp' }
//
// Looks at one site photo and infers { weather, temperatureC, crewCount,
// confidence } via the shared callAnthropicVision helper (kill-switch / caps /
// usage live there). GATED behind project_config.ai_auto_detect_enabled — when
// off, returns { skipped: true } and burns NO Claude vision call. Accepts
// base64 so it works on a buffered create-mode photo with no storage round-trip.
//
// JWT-gated (deployed without --no-verify-jwt).
//
// DEPLOY:
//   supabase functions deploy detect-diary-conditions
// ─────────────────────────────────────────────────────────────────────────────

// @ts-expect-error Deno-only import.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
// @ts-expect-error Deno-only import.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

import { callAnthropicVision } from '../_shared/anthropic.ts';
import { getUserId, isProjectMember } from '../_shared/auth.ts';
import { logAction } from '../_shared/auditLog.ts';
import { CORS_HEADERS, handleCorsPreflight } from '../_shared/cors.ts';
import { CONDITIONS_SYSTEM, CONDITIONS_USER_TEXT, parseConditions } from '../_shared/conditionsPrompt.ts';

// @ts-expect-error Deno globals.
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
// @ts-expect-error Deno globals.
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
// Guard against an oversized base64 blob blowing the request. ~8MB of base64
// (~6MB binary) is plenty for a downsized site photo.
const MAX_BASE64_LEN = 8_000_000;

interface RequestBody {
  projectId: string;
  imageBase64: string;
  mediaType: string;
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
  if (!body.imageBase64 || typeof body.imageBase64 !== 'string' || body.imageBase64.length > MAX_BASE64_LEN) {
    return json({ error: 'imageBase64_invalid' }, 400);
  }
  if (!body.mediaType || !MEDIA_TYPES.includes(body.mediaType)) {
    return json({ error: 'mediaType_invalid' }, 400);
  }

  // AuthZ: caller must belong to (or manage) this project before we read its
  // config or burn a vision call against it. The service-role client below is
  // RLS-exempt; the ai_auto_detect_enabled flag alone only limits opted-in
  // projects, not who may invoke. Mirrors complete-phase.
  if (!(await isProjectMember(req, body.projectId))) {
    return json({ error: 'forbidden' }, 403);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Gate: only projects that opted in incur a vision call. A missing config
  // row or a false flag → skip (no Claude burn).
  const { data: cfg } = await supabase
    .from('project_config')
    .select('ai_auto_detect_enabled')
    .eq('project_id', body.projectId)
    .maybeSingle();

  if (!cfg || cfg.ai_auto_detect_enabled !== true) {
    return json({ skipped: true }, 200);
  }

  const userId = await getUserId(supabase, req);
  const result = await callAnthropicVision(supabase, {
    system: CONDITIONS_SYSTEM,
    userText: CONDITIONS_USER_TEXT,
    imageBase64: body.imageBase64,
    mediaType: body.mediaType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
    maxTokens: 200,
    userId,
  });

  if (!result.ok) {
    const status =
      result.reason === 'rate_limited' ? 429 :
      (result.reason === 'disabled' || result.reason === 'missing_key') ? 503 :
      502;
    return json({ error: result.reason, detail: result.detail, retryable: result.retryable }, status);
  }

  const conditions = parseConditions(result.text);
  if (!conditions) return json({ error: 'parse_failed', detail: result.text.slice(0, 200) }, 502);

  await logAction({
    supabase,
    projectId: body.projectId,
    userId: null,
    action: 'diary_conditions_detected',
    entityType: 'project_config',
    entityId: body.projectId,
    notes: `weather=${conditions.weather}; tempC=${conditions.temperatureC}; crew=${conditions.crewCount}; conf=${conditions.confidence}; model=${result.model}`,
  });

  return json({ ...conditions, skipped: false, modelUsed: result.model }, 200);
});

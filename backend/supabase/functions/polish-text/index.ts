// polish-text — Supabase Edge Function (Deno).
//
// JWT-gated. Receives raw user text + a `surface` enum (site_diary,
// incident_report, etc.) → returns a faithful polished version via the
// shared anthropic helper. The system prompt is tuned to:
//   • never invent details
//   • keep length within a reasonable bounded multiplier
//   • use professional construction-domain English
//
// Rate limiting + token caps + kill switch live inside the shared
// `_shared/anthropic.ts` helper so this function stays small. Audit logs
// every successful call and every rate-limited rejection so a Polish-
// happy user surfaces in the audit trail with token + cost totals.
//
// DEPLOY:
//   supabase functions deploy polish-text
//
// INVOKE (manual):
//   curl -X POST "$SUPABASE_URL/functions/v1/polish-text" \
//     -H "Authorization: Bearer $USER_JWT" \
//     -H "Content-Type: application/json" \
//     -d '{"text":"poured slab a today","surface":"site_diary","projectId":"<uuid>"}'

// @ts-expect-error Deno-only import.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
// @ts-expect-error Deno-only import.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

import { callAnthropic } from '../_shared/anthropic.ts';
import { logAction } from '../_shared/auditLog.ts';
import { CORS_HEADERS, handleCorsPreflight } from '../_shared/cors.ts';

// @ts-expect-error Deno globals.
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
// @ts-expect-error Deno globals.
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const MIN_INPUT_LENGTH = 8;
const MAX_INPUT_LENGTH = 4000;     // ~1k tokens worst case; well inside cap

type Surface =
  | 'site_diary'
  | 'incident_report'
  | 'punch_item'
  | 'order_note'
  | 'task_note';

const SURFACE_GUIDANCE: Record<Surface, string> = {
  site_diary:      'A daily site diary entry. Be specific about work done, conditions, and any blockers. Past tense.',
  incident_report: 'A safety incident report. More formal. Lead with what happened, then who was involved, then the corrective action.',
  punch_item:      'A punch-list item. Single sentence. Imperative form ("Touch up paint on…"). Specific location if mentioned.',
  order_note:      'A supplier-order note. Neutral, precise. Quantities and specs first; rationale second.',
  task_note:       'A Gantt task note. Brief — one or two sentences. Past or present tense to match what the user wrote.',
};

interface PolishRequest {
  text: string;
  surface: Surface;
  projectId?: string;
}

interface PolishResponse {
  polishedText: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
}

const SYSTEM_PROMPT = `You are a site engineer turning a contractor's rough field notes into report-grade construction language. Rules:

1. NEVER invent facts. If the input mentions only one slab, your output mentions only one slab. No phantom personnel, materials, or quantities.
2. Stay faithful to the meaning. Polish grammar, punctuation, and clarity — don't add commentary.
3. Match the surface. The user supplies a "surface" hint; respect its tone (formal for incidents, terse for punch items, etc.).
4. Keep length proportional. The polished output should be within ±50% of the input length unless the input is a fragment that needs expansion to one full sentence.
5. Use Australian construction English (slab, framing, sparkie, etc.). Don't anglicise or americanise.
6. Output ONLY the polished text. No explanations, no "Here's the revised version:", nothing else.`;

serve(async (req: Request) => {
  // CORS preflight — browsers OPTIONS-probe before any cross-origin POST.
  // Without this the polish-text invoke from the frontend fails with
  // "Access-Control-Allow-Origin missing" before the real handler ever runs.
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405, headers: { 'content-type': 'application/json', ...CORS_HEADERS },
    });
  }

  // JWT — Edge function deployed without --no-verify-jwt, so the auth
  // header is enforced at the platform level. We still read the bearer
  // token to attribute the audit log entry to a user.
  const authHeader = req.headers.get('Authorization') ?? '';
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  let body: PolishRequest;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_json' }), {
      status: 400, headers: { 'content-type': 'application/json', ...CORS_HEADERS },
    });
  }

  // ─── Input validation ─────────────────────────────────────────────────
  const text = (body.text ?? '').trim();
  if (text.length < MIN_INPUT_LENGTH) {
    return new Response(JSON.stringify({ error: 'input_too_short', minLength: MIN_INPUT_LENGTH }), {
      status: 400, headers: { 'content-type': 'application/json', ...CORS_HEADERS },
    });
  }
  if (text.length > MAX_INPUT_LENGTH) {
    return new Response(JSON.stringify({ error: 'input_too_long', maxLength: MAX_INPUT_LENGTH }), {
      status: 400, headers: { 'content-type': 'application/json', ...CORS_HEADERS },
    });
  }
  const surfaceGuidance = SURFACE_GUIDANCE[body.surface];
  if (!surfaceGuidance) {
    return new Response(JSON.stringify({ error: 'invalid_surface', validSurfaces: Object.keys(SURFACE_GUIDANCE) }), {
      status: 400, headers: { 'content-type': 'application/json', ...CORS_HEADERS },
    });
  }

  // ─── Anthropic call ───────────────────────────────────────────────────
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Split shape: stable rules block is cached across all surfaces; the
  // per-surface tail is appended without a cache_control breakpoint so
  // every surface (site_diary, incident_report, …) reads the same cached
  // prefix instead of writing 5 separate cache entries.
  const result = await callAnthropic(supabase, {
    system: {
      stable: SYSTEM_PROMPT,
      variable: `\n\nSurface: ${body.surface} — ${surfaceGuidance}`,
    },
    messages: [{ role: 'user', content: text }],
  });

  if (!result.ok) {
    // Audit rate-limited rejections so we can see them in /admin → Audit.
    if (result.reason === 'rate_limited' || result.reason === 'disabled') {
      await logAction({
        supabase,
        projectId: body.projectId ?? null,
        userId: null,   // can't safely decode JWT here; service-role insert
        action: 'ai_polish_rejected',
        entityType: 'project_config',
        entityId: body.projectId ?? 'global',
        notes: `${result.reason}${result.detail ? ': ' + result.detail : ''}`,
      });
    }
    const status =
      result.reason === 'rate_limited' ? 429 :
      result.reason === 'disabled' || result.reason === 'missing_key' ? 503 :
      502;
    return new Response(
      JSON.stringify({
        error: result.reason,
        detail: result.detail,
        retryable: result.retryable,
      }),
      { status, headers: { 'content-type': 'application/json', ...CORS_HEADERS } },
    );
  }

  // ─── Success path ─────────────────────────────────────────────────────
  // `cache_read` and `cache_write` in the audit notes are the cheap
  // verification path that prompt caching is working — querying the audit
  // log for these fields beats spelunking the Anthropic dashboard.
  await logAction({
    supabase,
    projectId: body.projectId ?? null,
    userId: null,
    action: 'ai_polish_succeeded',
    entityType: 'project_config',
    entityId: body.projectId ?? 'global',
    notes:
      `surface=${body.surface}; ` +
      `tokens_in=${result.inputTokens}; tokens_out=${result.outputTokens}; ` +
      `cache_read=${result.cacheReadInputTokens}; ` +
      `cache_write=${result.cacheCreationInputTokens}; ` +
      `model=${result.model}`,
  });

  const response: PolishResponse = {
    polishedText: result.text,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    model: result.model,
  };
  return new Response(JSON.stringify(response), {
    status: 200,
    headers: { 'content-type': 'application/json', ...CORS_HEADERS },
  });
});

// jwt is referenced to silence the unused-variable warning while making the
// shape of audit attribution explicit for future caller-id work.
void '__jwt_placeholder__';

// backend/supabase/functions/site-diary-assistant/index.ts
//
// Site Diary "Sparky" assistant — multi-turn chat Edge Function.
//
// Accepts { messages, targetDate, projectId }. Fetches the last 30 days
// of diary entries for the project, builds a system prompt (cached
// stable prefix + variable session context), forwards to Claude via the
// shared callAnthropic helper, extracts any <<<DRAFT block, and returns
// { reply, draftText, model, inputTokens, outputTokens }.
//
// JWT-gated (deployed without --no-verify-jwt). Rate-limit + token-cap +
// kill-switch live inside _shared/anthropic.ts; this function just
// validates input shape and assembles the call.
//
// DEPLOY:
//   supabase functions deploy site-diary-assistant

// @ts-expect-error Deno-only import.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
// @ts-expect-error Deno-only import.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

import { callAnthropic } from '../_shared/anthropic.ts';
import { logAction } from '../_shared/auditLog.ts';
import { CORS_HEADERS, handleCorsPreflight } from '../_shared/cors.ts';
import { renderDiarySnapshot, type SnapshotEntry } from '../_shared/renderDiarySnapshot.ts';
import { STABLE_PROMPT, buildVariableTail } from '../_shared/sparkyPrompt.ts';
import { extractDraftBlock } from '../_shared/extractDraftBlock.ts';

// @ts-expect-error Deno globals.
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
// @ts-expect-error Deno globals.
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const MAX_MESSAGES = 30;
const MAX_PER_MESSAGE_CHARS = 4000;
const MAX_TOTAL_CHARS = 16000;
const SNAPSHOT_DAYS = 30;

interface IncomingMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface RequestBody {
  messages: IncomingMessage[];
  targetDate: string;            // YYYY-MM-DD
  projectId: string;             // UUID
}

interface ResponseBody {
  reply: string;
  draftText: string | null;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function bad(json: unknown, status: number): Response {
  return new Response(JSON.stringify(json), {
    status,
    headers: { 'content-type': 'application/json', ...CORS_HEADERS },
  });
}

function validateBody(body: unknown): RequestBody | { error: string } {
  if (!body || typeof body !== 'object') return { error: 'invalid_body' };
  const b = body as Partial<RequestBody>;
  if (!Array.isArray(b.messages)) return { error: 'messages_required' };
  if (b.messages.length < 1 || b.messages.length > MAX_MESSAGES) {
    return { error: 'messages_length_out_of_range' };
  }
  let total = 0;
  for (const m of b.messages) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) {
      return { error: 'message_role_invalid' };
    }
    if (typeof m.content !== 'string' || m.content.length < 1 || m.content.length > MAX_PER_MESSAGE_CHARS) {
      return { error: 'message_content_invalid' };
    }
    total += m.content.length;
  }
  if (total > MAX_TOTAL_CHARS) return { error: 'messages_total_too_large' };
  if (b.messages[b.messages.length - 1].role !== 'user') {
    return { error: 'last_message_must_be_user' };
  }
  if (typeof b.targetDate !== 'string' || !DATE_RE.test(b.targetDate)) {
    return { error: 'targetDate_invalid' };
  }
  if (typeof b.projectId !== 'string' || !UUID_RE.test(b.projectId)) {
    return { error: 'projectId_invalid' };
  }
  return b as RequestBody;
}

serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') return bad({ error: 'method_not_allowed' }, 405);

  // JWT — platform enforces presence; we read it to attribute the audit log.
  const authHeader = req.headers.get('Authorization') ?? '';
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  let parsed: unknown;
  try { parsed = await req.json(); } catch { return bad({ error: 'invalid_json' }, 400); }

  const v = validateBody(parsed);
  if ('error' in v) return bad(v, 400);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Fetch user first name + project name for the variable tail. Both calls
  // are cheap and parallelizable. If either fails we proceed with fallbacks
  // — the audit log still records the projectId, so finance can resolve.
  let userFirstName: string | null = null;
  let projectName = 'Unknown project';
  if (jwt) {
    try {
      const { data: userData } = await supabase.auth.getUser(jwt);
      userFirstName = (userData.user?.user_metadata?.full_name ?? userData.user?.email ?? null);
      if (userFirstName && userFirstName.includes(' ')) {
        userFirstName = userFirstName.split(' ')[0];
      }
    } catch { /* fallback used */ }
  }
  try {
    const { data: proj } = await supabase
      .from('projects')
      .select('name')
      .eq('id', v.projectId)
      .single();
    if (proj?.name) projectName = proj.name;
  } catch { /* fallback used */ }

  // Fetch last 30 days of diary entries for the project. Service-role
  // client; this is the same trust model as polish-text. The user
  // authenticated via JWT; a malicious caller would need to guess project
  // UUIDs. RLS hardening tracked as follow-up.
  const sinceIso = new Date(Date.now() - SNAPSHOT_DAYS * 86_400_000)
    .toISOString().slice(0, 10);

  const { data: rows } = await supabase
    .from('diary_entries')
    .select('date, description, weather, temperature_f, personnel')
    .eq('project_id', v.projectId)
    .gte('date', sinceIso)
    .order('date', { ascending: false })
    .limit(SNAPSHOT_DAYS);

  const entries: SnapshotEntry[] = (rows ?? []).map((r) => ({
    date: r.date,
    description: r.description ?? '',
    weather: r.weather ?? undefined,
    temperatureF: r.temperature_f ?? undefined,
    personnel: Array.isArray(r.personnel) ? r.personnel : [],
  }));

  const snapshotText = renderDiarySnapshot(entries, SNAPSHOT_DAYS);
  const today = new Date().toISOString().slice(0, 10);
  const variableTail = buildVariableTail({
    projectName,
    userFirstName,
    targetDate: v.targetDate,
    today,
    snapshotText,
  });

  const result = await callAnthropic(supabase, {
    system: { stable: STABLE_PROMPT, variable: variableTail },
    messages: v.messages.map((m) => ({ role: m.role, content: m.content })),
  });

  if (!result.ok) {
    if (result.reason === 'rate_limited' || result.reason === 'disabled') {
      await logAction({
        supabase,
        projectId: v.projectId,
        userId: null,
        action: 'ai_assistant_rejected',
        entityType: 'project_config',
        entityId: v.projectId,
        notes: `${result.reason}${result.detail ? ': ' + result.detail : ''}`,
      });
    }
    const status =
      result.reason === 'rate_limited' ? 429 :
      result.reason === 'disabled' || result.reason === 'missing_key' ? 503 :
      502;
    return bad({ error: result.reason, detail: result.detail, retryable: result.retryable }, status);
  }

  const draftText = extractDraftBlock(result.text);

  await logAction({
    supabase,
    projectId: v.projectId,
    userId: null,
    action: 'ai_assistant_turn',
    entityType: 'project_config',
    entityId: v.projectId,
    notes:
      `turns=${v.messages.length}; ` +
      `had_draft=${draftText !== null}; ` +
      `tokens_in=${result.inputTokens}; tokens_out=${result.outputTokens}; ` +
      `cache_read=${result.cacheReadInputTokens}; ` +
      `cache_write=${result.cacheCreationInputTokens}; ` +
      `model=${result.model}`,
  });

  const response: ResponseBody = {
    reply: result.text,
    draftText,
    model: result.model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  };

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: { 'content-type': 'application/json', ...CORS_HEADERS },
  });
});

// jwt referenced to silence unused-var lint; audit attribution work tracked
// alongside the matching polish-text comment.
void '__jwt_placeholder__';

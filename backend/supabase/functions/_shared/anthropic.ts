// Shared Anthropic wrapper for Edge Functions.
//
// All Anthropic calls in this codebase route through here so we get:
//   • Single place to enforce token + request caps (testing-safe defaults).
//   • Kill switch via ANTHROPIC_DISABLED env var (incident response).
//   • Per-day usage tracking via the ai_usage_daily table (migration 13).
//   • Consistent error shape so call sites can branch on rate_limited vs
//     api_error vs disabled without parsing strings.
//
// Why route everything through one helper:
//   The Edge runtime cold-starts; per-instance counters reset, which would
//   leak callers past the cap. Persisting counts in Postgres + checking
//   before each call is the only honest enforcement.

// @ts-expect-error Deno-only import.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

// ─── Env reads (with safe defaults) ────────────────────────────────────────
// `Deno.env.get()` returns `undefined` on missing vars; we coerce to the
// numeric / boolean shape each call site expects.

// @ts-expect-error Deno globals.
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
// @ts-expect-error Deno globals.
const DEFAULT_MODEL = Deno.env.get('ANTHROPIC_DEFAULT_MODEL') ?? 'claude-sonnet-4-6';
// @ts-expect-error Deno globals.
const DAILY_CALL_CAP = Number(Deno.env.get('ANTHROPIC_DAILY_CALL_CAP') ?? 50);
// @ts-expect-error Deno globals.
const DAILY_TOKEN_CAP = Number(Deno.env.get('ANTHROPIC_DAILY_TOKEN_CAP') ?? 200_000);
// @ts-expect-error Deno globals.
const MAX_TOKENS_CEILING = Number(Deno.env.get('ANTHROPIC_MAX_TOKENS') ?? 1024);
// @ts-expect-error Deno globals.
const DISABLED = (Deno.env.get('ANTHROPIC_DISABLED') ?? 'false').toLowerCase() === 'true';

const ANTHROPIC_BASE_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION  = '2023-06-01';

// Sonnet pricing (USD per million tokens) — rough estimates for tracking
// daily spend in the usage table. Update when Anthropic changes its sheet.
// Input $3 / 1M, output $15 / 1M → average input+output cost per token in cents.
const APPROX_CENTS_PER_TOKEN = 0.0009; // ≈$9 per million tokens blended

export interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AnthropicCallInput {
  /** Required system prompt; constrains tone + format. */
  system: string;
  /** Conversation messages, oldest first. */
  messages: AnthropicMessage[];
  /** Override the env-level max_tokens. Always clamped to MAX_TOKENS_CEILING. */
  maxTokens?: number;
  /** Override the default model. */
  model?: string;
}

export interface AnthropicCallSuccess {
  ok: true;
  text: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
}

export interface AnthropicCallFailure {
  ok: false;
  reason:
    | 'disabled'         // ANTHROPIC_DISABLED kill-switch on
    | 'missing_key'      // ANTHROPIC_API_KEY not configured
    | 'rate_limited'     // daily cap hit (calls or tokens)
    | 'api_error';       // Anthropic returned non-2xx
  detail?: string;
  retryable: boolean;
}

export type AnthropicCallResult = AnthropicCallSuccess | AnthropicCallFailure;

interface UsageRow {
  call_count: number;
  tokens_used: number;
}

// ─── Public API ────────────────────────────────────────────────────────────

export async function callAnthropic(
  supabase: SupabaseClient,
  input: AnthropicCallInput,
): Promise<AnthropicCallResult> {
  // 1. Kill switch.
  if (DISABLED) {
    return { ok: false, reason: 'disabled', retryable: false };
  }
  if (!ANTHROPIC_API_KEY) {
    return { ok: false, reason: 'missing_key', retryable: false };
  }

  // 2. Daily cap check. RPC handles "no row yet" by returning zeros, so the
  // first call of the day passes through cleanly.
  const { data: usageRows, error: usageErr } = await supabase
    .rpc('current_ai_usage_today');
  if (usageErr) {
    // Don't fail the call on a counter read miss — log and proceed. Better
    // to occasionally exceed the cap than to block legitimate work because
    // the metering layer is broken.
    // deno-lint-ignore no-console
    console.warn('[anthropic] usage read failed:', usageErr.message);
  } else {
    const usage = (Array.isArray(usageRows) ? usageRows[0] : usageRows) as UsageRow | undefined;
    if (usage) {
      if (usage.call_count >= DAILY_CALL_CAP) {
        return {
          ok: false,
          reason: 'rate_limited',
          detail: `Daily call cap reached (${usage.call_count}/${DAILY_CALL_CAP})`,
          retryable: true,
        };
      }
      if (usage.tokens_used >= DAILY_TOKEN_CAP) {
        return {
          ok: false,
          reason: 'rate_limited',
          detail: `Daily token cap reached (${usage.tokens_used}/${DAILY_TOKEN_CAP})`,
          retryable: true,
        };
      }
    }
  }

  // 3. Build the request. Always clamp max_tokens to the env ceiling so a
  // bug in a caller can't drain the budget.
  const requestedMax = input.maxTokens ?? MAX_TOKENS_CEILING;
  const maxTokens = Math.min(Math.max(64, requestedMax), MAX_TOKENS_CEILING);

  const body = {
    model: input.model ?? DEFAULT_MODEL,
    max_tokens: maxTokens,
    system: input.system,
    messages: input.messages,
  };

  let response: Response;
  try {
    response = await fetch(ANTHROPIC_BASE_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return {
      ok: false,
      reason: 'api_error',
      detail: e instanceof Error ? e.message : String(e),
      retryable: true,
    };
  }

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const errBody = await response.json();
      detail = errBody?.error?.message ?? detail;
    } catch { /* keep status-only detail */ }

    // 429 from Anthropic itself maps cleanly to rate_limited; everything
    // else is api_error so the caller can decide whether to surface raw.
    return {
      ok: false,
      reason: response.status === 429 ? 'rate_limited' : 'api_error',
      detail,
      retryable: response.status >= 500 || response.status === 429,
    };
  }

  // 4. Parse + extract text. Anthropic returns a `content` array; the
  // first text block is the answer for chat-style calls.
  let payload: AnthropicResponse;
  try {
    payload = await response.json();
  } catch (e) {
    return {
      ok: false,
      reason: 'api_error',
      detail: 'invalid JSON from Anthropic',
      retryable: false,
    };
  }

  const text = (payload.content ?? [])
    .filter((c) => c.type === 'text')
    .map((c) => c.text)
    .join('\n')
    .trim();

  const inputTokens = payload.usage?.input_tokens ?? 0;
  const outputTokens = payload.usage?.output_tokens ?? 0;
  const totalTokens = inputTokens + outputTokens;
  const costCents = Math.ceil(totalTokens * APPROX_CENTS_PER_TOKEN);

  // 5. Record usage. Fire-and-forget — if the RPC fails the call still
  // succeeded for the user; we'll just under-count for the day.
  await supabase
    .rpc('record_ai_call', { p_tokens: totalTokens, p_cost_cents: costCents })
    .then(() => void 0, () => void 0);

  return {
    ok: true,
    text,
    inputTokens,
    outputTokens,
    model: payload.model ?? body.model,
  };
}

// ─── Anthropic response shape (subset we use) ──────────────────────────────
interface AnthropicResponse {
  id?: string;
  model?: string;
  content?: Array<{ type: string; text?: string }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}

// ─── Vision call ───────────────────────────────────────────────────────────
// Mirrors `callAnthropic()` but takes a single image content block alongside
// the user text. Used by the analyze-photo Edge Function (Phase D). Kept as a
// sibling rather than merged into `callAnthropic()` because:
//   • the text path is already live in production for polish-text — minimal
//     blast-radius rule says don't widen its signature when a vision sibling
//     is cleaner.
//   • the image block is order-sensitive (image first, text second; Anthropic
//     recommends this for QA tasks where the model "sees" before being told
//     what to look for) and that's clearer when isolated.
// If a third caller emerges, refactor the shared cap-check + record-call
// glue into a private helper.

export interface AnthropicVisionInput {
  /** System prompt — see _shared/visionPrompt.ts for the canonical one. */
  system: string;
  /** User-message text accompanying the image. */
  userText: string;
  /** Base64-encoded image bytes (no data: prefix). */
  imageBase64: string;
  /** Media type Anthropic accepts. Reject heic/mov before reaching here. */
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
  /** Override the env-level max_tokens. Always clamped to MAX_TOKENS_CEILING. */
  maxTokens?: number;
  /** Override the default model. */
  model?: string;
}

export async function callAnthropicVision(
  supabase: SupabaseClient,
  input: AnthropicVisionInput,
): Promise<AnthropicCallResult> {
  // 1. Same kill-switch + missing-key gate as callAnthropic.
  if (DISABLED) {
    return { ok: false, reason: 'disabled', retryable: false };
  }
  if (!ANTHROPIC_API_KEY) {
    return { ok: false, reason: 'missing_key', retryable: false };
  }

  // 2. Daily cap check via the shared RPC. Same logic as the text path —
  // a usage-read miss is logged but not fatal; better to occasionally exceed
  // the cap than to block legitimate work because the counter layer broke.
  const { data: usageRows, error: usageErr } = await supabase
    .rpc('current_ai_usage_today');
  if (usageErr) {
    // deno-lint-ignore no-console
    console.warn('[anthropic.vision] usage read failed:', usageErr.message);
  } else {
    const usage = (Array.isArray(usageRows) ? usageRows[0] : usageRows) as UsageRow | undefined;
    if (usage) {
      if (usage.call_count >= DAILY_CALL_CAP) {
        return {
          ok: false,
          reason: 'rate_limited',
          detail: `Daily call cap reached (${usage.call_count}/${DAILY_CALL_CAP})`,
          retryable: true,
        };
      }
      if (usage.tokens_used >= DAILY_TOKEN_CAP) {
        return {
          ok: false,
          reason: 'rate_limited',
          detail: `Daily token cap reached (${usage.tokens_used}/${DAILY_TOKEN_CAP})`,
          retryable: true,
        };
      }
    }
  }

  // 3. Build the request. Image content block first, then text. Anthropic
  // recommends this ordering for QA-style prompts so the model parses the
  // visual context before the question framing.
  const requestedMax = input.maxTokens ?? MAX_TOKENS_CEILING;
  const maxTokens = Math.min(Math.max(64, requestedMax), MAX_TOKENS_CEILING);

  const body = {
    model: input.model ?? DEFAULT_MODEL,
    max_tokens: maxTokens,
    system: input.system,
    messages: [{
      role: 'user' as const,
      content: [
        {
          type: 'image' as const,
          source: {
            type: 'base64' as const,
            media_type: input.mediaType,
            data: input.imageBase64,
          },
        },
        { type: 'text' as const, text: input.userText },
      ],
    }],
  };

  let response: Response;
  try {
    response = await fetch(ANTHROPIC_BASE_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return {
      ok: false,
      reason: 'api_error',
      detail: e instanceof Error ? e.message : String(e),
      retryable: true,
    };
  }

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const errBody = await response.json();
      detail = errBody?.error?.message ?? detail;
    } catch { /* keep status-only detail */ }
    return {
      ok: false,
      reason: response.status === 429 ? 'rate_limited' : 'api_error',
      detail,
      retryable: response.status >= 500 || response.status === 429,
    };
  }

  // 4. Parse + extract text from the model's content array.
  let payload: AnthropicResponse;
  try {
    payload = await response.json();
  } catch (e) {
    return {
      ok: false,
      reason: 'api_error',
      detail: 'invalid JSON from Anthropic',
      retryable: false,
    };
  }

  const text = (payload.content ?? [])
    .filter((c) => c.type === 'text')
    .map((c) => c.text ?? '')
    .join('\n')
    .trim();

  const inputTokens = payload.usage?.input_tokens ?? 0;
  const outputTokens = payload.usage?.output_tokens ?? 0;
  const totalTokens = inputTokens + outputTokens;
  const costCents = Math.ceil(totalTokens * APPROX_CENTS_PER_TOKEN);

  // 5. Fire-and-forget usage record. Vision calls cost more than text calls
  // (images burn ~1500-3000 tokens of input each) so accurate accounting is
  // important — but a miss here doesn't justify failing the user-visible
  // analysis. Same pattern as callAnthropic.
  await supabase
    .rpc('record_ai_call', { p_tokens: totalTokens, p_cost_cents: costCents })
    .then(() => void 0, () => void 0);

  return {
    ok: true,
    text,
    inputTokens,
    outputTokens,
    model: payload.model ?? body.model,
  };
}

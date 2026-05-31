// frontend/src/lib/api/siteDiaryAssistant.ts
//
// Frontend client for the site-diary-assistant Edge Function.
//
// Behaviour:
//   • VITE_ENABLE_REAL_AI !== 'true' OR supabaseConfigured() === false
//       → returns { ok: false, reason: 'disabled' } — UI shows a banner.
//   • Otherwise → invokes the Edge Function. On any error, returns
//       { ok: false, reason: 'error', detail } so the UI can surface a
//       toast without crashing.

import { supabase, supabaseConfigured } from '../supabase';

export interface AssistantMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AssistantTurnInput {
  messages: AssistantMessage[];
  targetDate: string;          // YYYY-MM-DD
  projectId: string;           // UUID
}

export type AssistantTurnResult =
  | {
      ok: true;
      reply: string;
      draftText: string | null;
      model: string;
      inputTokens: number;
      outputTokens: number;
    }
  | { ok: false; reason: 'disabled' }
  | { ok: false; reason: 'error'; detail: string };

const FUNCTION_NAME = 'site-diary-assistant';

export function isRealAiEnabled(): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = (import.meta as any).env?.VITE_ENABLE_REAL_AI;
  const flag = typeof raw === 'string' && raw.toLowerCase() === 'true';
  return flag && supabaseConfigured();
}

export async function sendAssistantTurn(input: AssistantTurnInput): Promise<AssistantTurnResult> {
  if (!isRealAiEnabled()) {
    return { ok: false, reason: 'disabled' };
  }
  try {
    const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, { body: input });
    if (error) return { ok: false, reason: 'error', detail: error.message };
    if (!data || typeof data.reply !== 'string') {
      return { ok: false, reason: 'error', detail: 'unexpected_response_shape' };
    }
    return {
      ok: true,
      reply: data.reply,
      draftText: typeof data.draftText === 'string' ? data.draftText : null,
      model: data.model ?? 'claude',
      inputTokens: data.inputTokens ?? 0,
      outputTokens: data.outputTokens ?? 0,
    };
  } catch (e) {
    return {
      ok: false,
      reason: 'error',
      detail: e instanceof Error ? e.message : String(e),
    };
  }
}

export interface AssistantStreamCallbacks {
  onDelta: (t: string) => void;
  onDone: (d: { draftText: string | null; model: string }) => void;
  onError: (msg: string) => void;
}

/**
 * Token-by-token streaming turn. Uses raw `fetch` (not
 * `supabase.functions.invoke`, which buffers the whole body and so can't
 * stream) to hit the Edge Function with `{ ...input, stream: true }` and reads
 * the SSE response frame-by-frame.
 *
 * Robustness for the demo: if real AI is enabled but the streaming fetch
 * throws BEFORE any delta has arrived, we fall back to the buffered
 * `sendAssistantTurn` and replay its reply as a client-side fake stream so the
 * UX looks identical even when Edge SSE misbehaves. Once a delta HAS arrived
 * we never silently fall back — a mid-stream failure surfaces via onError.
 */
export async function streamAssistantTurn(
  input: AssistantTurnInput,
  cb: AssistantStreamCallbacks,
): Promise<void> {
  if (!isRealAiEnabled()) {
    cb.onError('disabled');
    return;
  }

  let sawDelta = false;

  // Client-side fake stream used by the fallback path: replays `reply` in
  // ~24-char chunks so the typing animation matches the real SSE path.
  const fakeStream = (
    reply: string,
    done: { draftText: string | null; model: string },
  ): Promise<void> =>
    new Promise((resolve) => {
      const CHUNK = 24;
      let i = 0;
      const timer = setInterval(() => {
        if (i >= reply.length) {
          clearInterval(timer);
          cb.onDone(done);
          resolve();
          return;
        }
        cb.onDelta(reply.slice(i, i + CHUNK));
        i += CHUNK;
      }, 28);
    });

  const fallback = async (): Promise<void> => {
    const result = await sendAssistantTurn(input);
    if (!result.ok) {
      cb.onError(result.reason === 'disabled' ? 'disabled' : result.detail || 'error');
      return;
    }
    await fakeStream(result.reply, { draftText: result.draftText, model: result.model });
  };

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const env = (import.meta as any).env ?? {};
    const baseUrl = env.VITE_SUPABASE_URL;
    const anonKey = env.VITE_SUPABASE_ANON_KEY;
    const session = (await supabase.auth.getSession()).data.session;

    const res = await fetch(`${baseUrl}/functions/v1/${FUNCTION_NAME}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${session?.access_token ?? anonKey ?? ''}`,
        apikey: anonKey ?? '',
      },
      body: JSON.stringify({ ...input, stream: true }),
    });

    if (!res.ok || !res.body) {
      // Non-2xx or no body before any delta → safe to fall back.
      await fallback();
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finished = false;

    while (!finished) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // SSE frames are separated by a blank line (\n\n).
      const frames = buffer.split('\n\n');
      buffer = frames.pop() ?? '';
      for (const frame of frames) {
        // A frame may contain multiple lines; we only read `data:` lines.
        for (const line of frame.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const payloadStr = trimmed.slice(5).trim();
          if (!payloadStr) continue;
          if (payloadStr === '[DONE]') {
            finished = true;
            break;
          }
          let evt: { type?: string; text?: string; draftText?: string | null; model?: string; detail?: string };
          try {
            evt = JSON.parse(payloadStr);
          } catch {
            continue;
          }
          if (evt.type === 'delta' && typeof evt.text === 'string') {
            sawDelta = true;
            cb.onDelta(evt.text);
          } else if (evt.type === 'done') {
            cb.onDone({
              draftText: typeof evt.draftText === 'string' ? evt.draftText : null,
              model: evt.model ?? 'claude',
            });
          } else if (evt.type === 'error') {
            cb.onError(evt.detail || 'Sparky could not respond. Try again in a moment.');
          }
        }
        if (finished) break;
      }
    }

    // If the stream ended without ever yielding a delta (e.g. the Edge SSE
    // misbehaved and closed early), treat it like a pre-delta failure.
    if (!sawDelta) {
      await fallback();
    }
  } catch (e) {
    if (!sawDelta) {
      // Streaming fetch threw before any token arrived — fall back so the
      // demo never shows a dead modal.
      await fallback();
      return;
    }
    // Mid-stream failure: surface it rather than double-replaying.
    cb.onError(e instanceof Error ? e.message : String(e));
  }
}

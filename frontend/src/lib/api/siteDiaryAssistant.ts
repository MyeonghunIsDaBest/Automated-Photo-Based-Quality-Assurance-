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

function isRealAiEnabled(): boolean {
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

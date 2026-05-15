// polishText — frontend client that routes to the polish-text Edge Function
// when real-AI is enabled, and falls back to the deterministic local mock
// otherwise. Keeps the existing `mockWritingAssist` contract intact for
// every caller so the Polish button works whether or not an API key is
// configured.
//
// Resolution order:
//   1. If `import.meta.env.VITE_ENABLE_REAL_AI !== 'true'` → use mock.
//   2. If `supabaseConfigured()` is false → use mock (no Edge Function to call).
//   3. Otherwise → call the Edge Function. On any error (429, 503, 502,
//      network) → log to console + fall back to mock so the demo never
//      goes dead.
//
// Rate-limit + token-cap enforcement happens server-side inside the Edge
// Function (see `backend/supabase/functions/_shared/anthropic.ts`). The
// frontend's job is just to call it and gracefully degrade.

import { supabase, supabaseConfigured } from '../supabase';
import {
  mockWritingAssist,
  type WritingAssistResult,
  type WritingContext,
  type WritingTransform,
} from './mockWritingAssist';

const POLISH_FUNCTION_NAME = 'polish-text';

// Maps the writing-assist transform to the polish-text Edge Function's
// `surface` enum. Today every Polish call is on site_diary; future
// transforms (incident report, punch item) get their own enum members
// without changing this mapper.
const SURFACE_FOR_TRANSFORM: Record<WritingTransform, string> = {
  improve: 'site_diary',
  expand_with_context: 'site_diary',
  tighten: 'site_diary',
};

// Same shape as mockWritingAssist's return so callers don't branch.
export type PolishTextResult = WritingAssistResult;

// Set this once at module-load time. Vite injects boolean-ish strings; the
// helper coerces.
const REAL_AI_ENABLED = (() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = (import.meta as any).env?.VITE_ENABLE_REAL_AI;
  return typeof raw === 'string' && raw.toLowerCase() === 'true';
})();

export function isRealAiEnabled(): boolean {
  return REAL_AI_ENABLED && supabaseConfigured();
}

export async function polishText(
  transform: WritingTransform,
  text: string,
  context: WritingContext,
  projectId?: string,
): Promise<PolishTextResult> {
  if (!isRealAiEnabled()) {
    return mockWritingAssist(transform, text, context);
  }

  try {
    const start = Date.now();
    const { data, error } = await supabase.functions.invoke(POLISH_FUNCTION_NAME, {
      body: {
        text,
        surface: SURFACE_FOR_TRANSFORM[transform],
        projectId,
      },
    });
    if (error) throw new Error(error.message);
    if (!data || typeof data.polishedText !== 'string') {
      throw new Error('Edge Function returned an unexpected shape.');
    }

    return {
      improved: data.polishedText,
      rationale: `Real-AI · ${data.model ?? 'claude'} · ${data.outputTokens ?? '?'} output tokens`,
      latencyMs: Date.now() - start,
      model: data.model ?? 'claude',
    };
  } catch (e) {
    // Graceful degrade — the local mock is the safety net. Log to console
    // so the operator running the demo can see real-AI is offline.
    // eslint-disable-next-line no-console
    console.warn('[polishText] real AI failed, falling back to mock:', e);
    return mockWritingAssist(transform, text, context);
  }
}

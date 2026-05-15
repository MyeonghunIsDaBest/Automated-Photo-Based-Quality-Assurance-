// useWritingAssist — React state wrapper around the writing-assist runtime.
//
// Now routes through `lib/api/polishText.ts` instead of calling the local
// mock directly. That helper transparently routes to the polish-text Edge
// Function when `VITE_ENABLE_REAL_AI=true` AND Supabase is configured,
// falling back to the deterministic mock otherwise. Either way the
// public hook contract stays identical — every existing caller works
// without modification.
//
// Mirrors `useMockAnalysis`'s shape so the writing assistant feels like a
// sibling feature. Does NOT mutate the caller's textarea — `run()` produces
// a draft and stores it; the caller decides whether to accept (via the
// component's modal) or discard. Reset clears the draft and returns to idle.

import { useCallback, useState } from 'react';
import { polishText } from '../api/polishText';
import type {
  WritingContext,
  WritingTransform,
} from '../api/mockWritingAssist';

export type WritingAssistState = 'idle' | 'running' | 'success' | 'error';

export interface UseWritingAssistResult {
  state: WritingAssistState;
  draft: string | null;
  rationale: string | null;
  /** Model identifier when the real-AI path produced the draft, `null`
   *  otherwise (mock fallback or idle). Surfaced as the "Real · {model}" /
   *  "Mock" badge in WritingAssistButton's modal footer. */
  model: string | null;
  error: string | null;
  run: (transform: WritingTransform, text: string, context: WritingContext) => Promise<void>;
  reset: () => void;
}

export function useWritingAssist(): UseWritingAssistResult {
  const [state, setState] = useState<WritingAssistState>('idle');
  const [draft, setDraft] = useState<string | null>(null);
  const [rationale, setRationale] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (transform: WritingTransform, text: string, context: WritingContext) => {
      if (state === 'running') return; // ignore double-clicks while pending
      setState('running');
      setError(null);
      try {
        const result = await polishText(transform, text, context);
        setDraft(result.improved);
        setRationale(result.rationale);
        setModel(result.model ?? null);
        setState('success');
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setState('error');
      }
    },
    [state],
  );

  const reset = useCallback(() => {
    setState('idle');
    setDraft(null);
    setRationale(null);
    setModel(null);
    setError(null);
  }, []);

  return { state, draft, rationale, model, error, run, reset };
}

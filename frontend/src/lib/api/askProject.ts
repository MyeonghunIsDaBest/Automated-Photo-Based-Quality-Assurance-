// Client wrapper for the `ask-project` Edge Function (Tier-3 #14) — the
// Dashboard "Ask anything" widget's brain. Single-turn project Q&A: the
// function reads a compact snapshot of the project (tasks by phase + recent
// confirmed analyses + recent diary) and answers in plain site English.
//
// JWT travels automatically via supabase.functions.invoke. The function is a
// DEPLOY-GATED artifact (backend/supabase/functions/ask-project) — until it's
// deployed, callers get a friendly "not enabled yet" error which the widget
// surfaces gracefully rather than crashing.

import { supabase, supabaseConfigured } from '../supabase';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AskProjectResult {
  answer: string;
  model?: string;
}

/** Thrown when the feature can't run (not configured / demo project / fn not deployed). */
export class AskProjectUnavailable extends Error {}

export async function askProject(projectId: string, question: string): Promise<AskProjectResult> {
  if (!supabaseConfigured()) {
    throw new AskProjectUnavailable('AI Q&A needs Supabase configured.');
  }
  if (!UUID_RE.test(projectId)) {
    throw new AskProjectUnavailable('Open a real (non-demo) project to ask about it.');
  }
  const q = question.trim();
  if (q.length < 2) throw new AskProjectUnavailable('Type a question first.');

  const { data, error } = await supabase.functions.invoke('ask-project', {
    body: { projectId, question: q.slice(0, 2000) },
  });
  if (error) {
    // A missing/undeployed function or a gate rejection both land here. Map to
    // the friendly unavailable error so the widget can degrade instead of
    // showing a raw stack.
    throw new AskProjectUnavailable(
      'Project Q&A isn’t switched on yet. Once the ask-project function is deployed, this lights up.',
    );
  }
  return data as AskProjectResult;
}

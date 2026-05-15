// useTaskAiSignal — read the *real* AI signal for a task from
// `ai_analyses` aggregates. Replaces the `task.percentComplete` proxy that
// used to power ProgressionBreakdown's AI column (the proxy moved with
// manual progress changes, conflating two separate measurements).
//
// Re-fetches when:
//   • the task ID changes (different task on the drawer)
//   • photos on the task change (a fresh upload → new analysis row →
//     signal should update)
//
// Falls back to a fast path when supabase isn't configured (returns the
// store-side aiAnalysis on photos linked to this task — the same math the
// server-side query does, just in memory).

import { useEffect, useState } from 'react';
import { useAppStore } from '../../store';
import { supabaseConfigured } from '../supabase';
import { getTaskAiSignal, type TaskAiSignal } from '../api/aiSignal';

const EMPTY: TaskAiSignal = { signalPct: 0, sampleSize: 0, lastAnalysedAt: null };

export function useTaskAiSignal(taskId: string | null | undefined): TaskAiSignal {
  const photos = useAppStore((s) => s.photos);
  const [signal, setSignal] = useState<TaskAiSignal>(EMPTY);

  useEffect(() => {
    if (!taskId) {
      setSignal(EMPTY);
      return;
    }

    // Demo / mock-mode fast path: derive from local store. Mock-AI writes
    // `aiAnalysis` to each photo via `patchPhotoAnalysis` so the local
    // photos slice carries everything we need without a network call.
    if (!supabaseConfigured()) {
      const linked = photos.filter((p) => p.taskId === taskId && p.aiAnalysis);
      const eligible = linked.filter((p) => {
        const a = p.aiAnalysis!;
        return a.actionTaken === 'auto_updated' || a.actionTaken === 'confirmed';
      });
      if (eligible.length === 0) {
        setSignal(EMPTY);
        return;
      }
      const avg = eligible.reduce((s, p) => s + (p.aiAnalysis!.confidence ?? 0), 0) / eligible.length;
      const lastAnalysed = eligible
        .map((p) => p.aiAnalysis!.analyzedAt)
        .sort()
        .reverse()[0] ?? null;
      setSignal({
        signalPct: Math.round(avg * 100),
        sampleSize: eligible.length,
        lastAnalysedAt: lastAnalysed,
      });
      return;
    }

    // Live path — query the joined view.
    let cancelled = false;
    getTaskAiSignal(taskId)
      .then((s) => {
        if (!cancelled) setSignal(s);
      })
      .catch(() => {
        if (!cancelled) setSignal(EMPTY);
      });
    return () => {
      cancelled = true;
    };
    // Re-run when photos change — a fresh upload + analysis on this task
    // should refresh the signal.
  }, [taskId, photos]);

  return signal;
}

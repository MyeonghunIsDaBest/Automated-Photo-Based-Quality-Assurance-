// useMockAnalysis — React state wrapper around `lib/api/mockAi.ts`.
//
// The mock runtime is otherwise framework-agnostic (pure store reads/writes);
// this hook gives the button component the run state it needs to render a
// progress shimmer + summary toast without leaking React-y concerns into the
// runtime module.

import { useCallback, useEffect, useState } from 'react';
import { useAppStore } from '../../store';
import { useMockAiUiStore } from '../../store/mockAiUi';
import { useNotificationStore } from '../../store/notifications';
import {
  findPendingPhotosForProject,
  runMockBatch,
  type MockAnalysisResult,
  type MockBatchSummary,
} from '../api/mockAi';

export interface MockAnalysisState {
  pendingCount: number;
  isRunning: boolean;
  progress: { current: number; total: number; latest: MockAnalysisResult | null };
  lastSummary: MockBatchSummary | null;
  error: string | null;
  /** Task id whose photo is being analysed *right now* — drives the Gantt
   *  bar pulse in `ReviewQueueTab`. Null when idle. Clears 600 ms after the
   *  batch completes so the final flash trails the toast. */
  currentlyAnalysingTaskId: string | null;
  run: () => Promise<void>;
  /** Re-run for any photos still pending (the `isPending` filter naturally
   *  skips already-processed photos, so this is just `run()` again — exposed
   *  separately so the failure UI can offer an unambiguous retry button). */
  retry: () => Promise<void>;
}

export function useMockAnalysis(projectId: string | null): MockAnalysisState {
  // Re-read the store on every photos / aiAnalysis change so the pending
  // count stays current even when other surfaces (Upload, gallery) mutate
  // the photos slice.
  const photos = useAppStore((s) => s.photos);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (!projectId) {
      setPendingCount(0);
      return;
    }
    setPendingCount(findPendingPhotosForProject(projectId).length);
    // The dep on `photos` triggers a recount whenever the store mutates —
    // a fresh upload bumps the count, a successful run drops it to 0.
  }, [photos, projectId]);

  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<MockAnalysisState['progress']>({
    current: 0,
    total: 0,
    latest: null,
  });
  const [lastSummary, setLastSummary] = useState<MockBatchSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Read the analysing-task id from the shared store so sibling components
  // (`ReviewQueueTab` → `GanttChart`) see the pulse from whichever instance
  // of the button drove the batch.
  const currentlyAnalysingTaskId = useMockAiUiStore((s) => s.currentlyAnalysingTaskId);

  const run = useCallback(async () => {
    if (!projectId || isRunning) return;
    const { setCurrentlyAnalysingTaskId } = useMockAiUiStore.getState();
    setError(null);
    setLastSummary(null);
    setIsRunning(true);
    const total = findPendingPhotosForProject(projectId).length;
    setProgress({ current: 0, total, latest: null });
    setCurrentlyAnalysingTaskId(null);
    try {
      const summary = await runMockBatch(projectId, {
        onProgress: (result, index, total) => {
          setProgress({ current: index, total, latest: result });
          // Pulse whichever task this photo belongs to. The shared store means
          // GanttChart sees this even though it's not the React instance that
          // called run().
          setCurrentlyAnalysingTaskId(result.taskId ?? null);
        },
      });
      setLastSummary(summary);
      // Trail the highlight for a half-second after the batch finishes so the
      // visual lands after the last `onProgress` callback returns.
      setTimeout(() => setCurrentlyAnalysingTaskId(null), 600);

      // Surface a single completion toast so the user gets one notification
      // per batch (the per-photo updates already live in the inline shimmer).
      // Reuses the existing `ai_analysis` notification kind rather than
      // introducing a new one — the message text carries the summary.
      if (summary.processed > 0) {
        useNotificationStore.getState().addNotification({
          type: 'ai_analysis',
          priority: 'medium',
          title: 'AI analysis complete',
          message: summary.bumped > 0
            ? `Analysed ${summary.processed} photo${summary.processed === 1 ? '' : 's'} · project at ${summary.newOverallProgress}%`
            : `Analysed ${summary.processed} photo${summary.processed === 1 ? '' : 's'} · no progress changes`,
          projectId,
          metadata: { batchSummary: summary },
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setCurrentlyAnalysingTaskId(null);
    } finally {
      setIsRunning(false);
    }
  }, [projectId, isRunning]);

  // Retry resumes from where the batch failed — the `isPending` filter inside
  // `runMockBatch` naturally skips already-processed photos, so this is just
  // `run()` again. Exposed as its own name so the failure UI reads cleanly.
  const retry = useCallback(() => run(), [run]);

  return { pendingCount, isRunning, progress, lastSummary, error, currentlyAnalysingTaskId, run, retry };
}

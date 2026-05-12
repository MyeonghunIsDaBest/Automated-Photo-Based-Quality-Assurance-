// useMockAnalysis — React state wrapper around `lib/api/mockAi.ts`.
//
// The mock runtime is otherwise framework-agnostic (pure store reads/writes);
// this hook gives the button component the run state it needs to render a
// progress shimmer + summary toast without leaking React-y concerns into the
// runtime module.

import { useCallback, useEffect, useState } from 'react';
import { useAppStore } from '../../store';
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
  run: () => Promise<void>;
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

  const run = useCallback(async () => {
    if (!projectId || isRunning) return;
    setError(null);
    setLastSummary(null);
    setIsRunning(true);
    const total = findPendingPhotosForProject(projectId).length;
    setProgress({ current: 0, total, latest: null });
    try {
      const summary = await runMockBatch(projectId, {
        onProgress: (result, index, total) => {
          setProgress({ current: index, total, latest: result });
        },
      });
      setLastSummary(summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsRunning(false);
    }
  }, [projectId, isRunning]);

  return { pendingCount, isRunning, progress, lastSummary, error, run };
}

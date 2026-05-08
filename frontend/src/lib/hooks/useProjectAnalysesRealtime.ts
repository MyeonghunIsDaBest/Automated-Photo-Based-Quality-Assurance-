import { useEffect } from 'react';
import { useAppStore } from '../../store';
import { subscribeToAllAnalyses } from '../api/realtime';
import { supabaseConfigured } from '../supabase';
import { rowToAnalysis, type AIAnalysisRow } from '../api/aiAnalyses';

// Layout-level AI analysis realtime — when an analysis row INSERTs (queued)
// or UPDATEs (status flips from analysing → analysed → confirmed), patch
// the matching photo in useAppStore.photos so the activity feed's
// `ai_analysed` derivation re-runs and the Dashboard "Pending review" tile
// stays in sync.
//
// Subscription is unscoped (ai_analyses doesn't carry project_id directly —
// it joins via photos.project_id). The handler filters on the client by
// looking up the photo in useAppStore.photos; if the photo isn't in the
// active project's slice, the patch is a no-op.
export function useProjectAnalysesRealtime(projectId: string | null | undefined): void {
  useEffect(() => {
    if (!supabaseConfigured() || !projectId) return;

    const unsubscribe = subscribeToAllAnalyses((payload) => {
      const row = (payload.new ?? payload.old) as AIAnalysisRow | undefined;
      if (!row || !row.photo_id) return;
      const a = rowToAnalysis(row);

      // Filter by current project on the client before patching — sibling
      // projects' analyses fire on the same channel and would otherwise
      // trigger a no-op re-render.
      const target = useAppStore.getState().photos.find((p) => p.id === a.photoId);
      if (!target || target.projectId !== projectId) return;
      useAppStore.getState().patchPhotoAnalysis(a.photoId, a);
    });

    return unsubscribe;
  }, [projectId]);
}

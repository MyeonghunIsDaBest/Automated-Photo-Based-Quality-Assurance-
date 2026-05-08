import { useEffect } from 'react';
import { useFeatureStore } from '../../store/features';
import { listTasks, mapTaskRow, type TaskRow } from '../api/tasks';
import { subscribeToProjectTasks } from '../api/realtime';
import { supabaseConfigured } from '../supabase';

// Layout-level task realtime — replaces the per-page subscription that
// used to live in `pages/Gantt.tsx`. Mounted once at Layout so the
// Dashboard activity feed + Active Jobs widget sees task INSERT/UPDATE/
// DELETE while the user is on any page, not just Gantt.
//
// Hydration: on mount + every project switch, fetches the full task list
// for the project so the cache is warm before any subscription fires.
// Subscription: every change is pushed into useFeatureStore.tasks.
export function useProjectTasksRealtime(projectId: string | null | undefined): void {
  useEffect(() => {
    if (!supabaseConfigured() || !projectId) return;
    let cancelled = false;
    const id = projectId;

    void (async () => {
      try {
        const rows = await listTasks(id);
        if (cancelled) return;
        useFeatureStore.getState().setTasksForProject(id, rows.map(mapTaskRow));
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('[useProjectTasksRealtime] hydration failed:', e);
      }
    })();

    const unsubscribe = subscribeToProjectTasks(id, (payload) => {
      const store = useFeatureStore.getState();
      if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
        store.upsertTask(mapTaskRow(payload.new as TaskRow));
        return;
      }
      if (payload.eventType === 'DELETE') {
        const oldId = (payload.old as { id?: string }).id;
        if (oldId) store.deleteTask(oldId);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [projectId]);
}

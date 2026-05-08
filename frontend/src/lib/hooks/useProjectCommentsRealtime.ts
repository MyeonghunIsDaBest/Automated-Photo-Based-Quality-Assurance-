import { useEffect } from 'react';
import { subscribeToAllComments } from '../api/realtime';
import { supabaseConfigured } from '../supabase';

// Layout-level comments realtime — placeholder subscription. Comments are
// currently a client-only Zustand slice (`useFeatureStore.comments` seeded
// from mockComments + addComment writes). When the Supabase `comments`
// table lands, this hook will mirror inserts into the slice the same way
// `useProjectTasksRealtime` does for tasks.
//
// Subscribing now is harmless: if the table doesn't exist or carries no
// rows for this user, no events fire. The hook is mounted at Layout so
// when the table goes live, the Dashboard activity feed starts surfacing
// `comment_added` events from other browsers without any code change here.
export function useProjectCommentsRealtime(projectId: string | null | undefined): void {
  useEffect(() => {
    if (!supabaseConfigured() || !projectId) return;

    const unsubscribe = subscribeToAllComments(() => {
      // Stub — comments backend not wired yet. See note above.
    });

    return unsubscribe;
  }, [projectId]);
}

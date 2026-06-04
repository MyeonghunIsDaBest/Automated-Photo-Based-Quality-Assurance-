import { useEffect } from 'react';
import { supabase, supabaseConfigured } from '../supabase';
import { useNotificationStore, createProjectAdded } from '../../store/notifications';
import { useProjectsListStore } from '../../pages/projects/store';

// Per-user realtime: when an Admin/PM assigns this user to a project (an INSERT
// on `project_members` for their user_id), fire a bell notification. Mounted at
// the layout level, scoped to the signed-in user — memberships span projects,
// so the channel is keyed by user, not project (mirrors useMessagingRealtime).
//
// Requires `project_members` to be in the `supabase_realtime` publication
// (migration 45). Without it the subscription is silently inert — the welcome
// DM + the project appearing on /home still work, just no live bell.
export function useProjectMembersRealtime(userId: string | null | undefined): void {
  const addNotification = useNotificationStore((s) => s.addNotification);

  useEffect(() => {
    if (!userId || !supabaseConfigured()) return;

    const channel = supabase
      .channel(`project-members:${userId}`)
      .on(
        'postgres_changes',
        {
          event:  'INSERT',
          schema: 'public',
          table:  'project_members',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as { project_id?: string; removed_at?: string | null };
          if (!row.project_id || row.removed_at) return;
          const name =
            useProjectsListStore.getState().projects.find((p) => p.id === row.project_id)?.name
            ?? 'a project';
          addNotification(createProjectAdded(row.project_id, name));
          // Pull the new membership so the project shows on /home without a
          // manual refresh.
          void useProjectsListStore.getState().loadProjects();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, addNotification]);
}

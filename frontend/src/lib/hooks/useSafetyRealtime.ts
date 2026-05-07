import { useEffect } from 'react';
import { supabase, supabaseConfigured } from '../supabase';
import { useNotificationStore, createSafetyAlert } from '../../store/notifications';
import type { SafetyIncidentRow } from '../api/safetyIncidents';

// Subscribes to INSERTs on `safety_incidents` for a project and fires a
// toast through the existing notification store. Mounted at the layout level
// so the toast pipeline is live regardless of which page the user is on.
//
// Gated by the caller — Safety.tsx and the layout host should only invoke
// this hook when `canViewSafetyIncident(currentProfile)` is true.
export function useSafetyRealtime(projectId: string | null | undefined): void {
  const addNotification = useNotificationStore((s) => s.addNotification);

  useEffect(() => {
    if (!projectId || !supabaseConfigured()) return;

    const channel = supabase
      .channel(`safety:${projectId}`)
      .on(
        'postgres_changes',
        {
          event:  'INSERT',
          schema: 'public',
          table:  'safety_incidents',
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          const row = payload.new as SafetyIncidentRow;
          // The notification helper currently expects a (taskId, taskName,
          // flags) tuple — we don't have a task here, so reuse the photo_id
          // as the entity id and a synthesised label so the toast is
          // self-explanatory.
          const label =
            row.severity === 'critical' ? 'Critical safety issue'
            : row.severity === 'high'   ? 'High-severity safety issue'
            : 'Safety issue';
          addNotification(
            createSafetyAlert(row.photo_id ?? row.id, label, row.flags ?? []),
          );
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [projectId, addNotification]);
}

import { useEffect } from 'react';
import { supabase, supabaseConfigured } from '../supabase';
import { listSafetyIncidents, type SafetyIncidentRow } from '../api/safetyIncidents';
import { useSafetyIncidentsStore } from '../../store/safetyIncidents';
import type { SafetyFlag, SafetySeverity } from '../../types';
import type { SafetyIncident } from '../api/safetyIncidents';

// Layout-level cache so non-Safety pages (Dashboard activity feed, future
// review surfaces) can render safety-incident state without each subscribing
// independently. Co-exists with the toast-firing `useSafetyRealtime` —
// supabase allows multiple channels per table+project; both write to their
// own concerns.
//
// Lifecycle per project change:
//   1. Initial fetch via listSafetyIncidents() → seeds the cache.
//   2. Subscribe to INSERT/UPDATE on safety_incidents filtered by project.
//   3. Each event upserts the matching cache row.
//   4. On unmount or projectId change, channel is removed; cache is NOT cleared
//      (the next mount overwrites via setIncidents).
export function useSafetyIncidentsCache(projectId: string | null | undefined): void {
  const setIncidents = useSafetyIncidentsStore((s) => s.setIncidents);
  const upsertIncident = useSafetyIncidentsStore((s) => s.upsertIncident);

  useEffect(() => {
    if (!projectId || !supabaseConfigured()) {
      setIncidents([]);
      return;
    }

    let cancelled = false;
    void listSafetyIncidents(projectId)
      .then((list) => { if (!cancelled) setIncidents(list); })
      .catch(() => { /* silent — non-critical UI cache */ });

    const channel = supabase
      .channel(`safety-cache:${projectId}`)
      .on(
        'postgres_changes',
        {
          event:  '*',
          schema: 'public',
          table:  'safety_incidents',
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          if (!payload.new) return;
          upsertIncident(rowToIncident(payload.new as SafetyIncidentRow));
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [projectId, setIncidents, upsertIncident]);
}

// Mirror of the row→incident mapper in lib/api/safetyIncidents.ts. Inlined
// here because that file's mapper isn't exported. Keep in sync.
function rowToIncident(row: SafetyIncidentRow): SafetyIncident {
  return {
    id:           row.id,
    projectId:    row.project_id,
    photoId:      row.photo_id,
    aiAnalysisId: row.ai_analysis_id,
    flags:        (row.flags ?? []) as SafetyFlag[],
    severity:     row.severity as SafetySeverity,
    status:       row.status,
    reportedBy:   row.reported_by,
    resolvedBy:   row.resolved_by,
    resolvedAt:   row.resolved_at,
    notes:        row.notes,
    createdAt:    row.created_at,
  };
}

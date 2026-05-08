import { useEffect, useState } from 'react';
import { supabase, supabaseConfigured } from '../supabase';
import { countSafetyIncidents } from '../api/safetyIncidents';
import { countPendingAnalyses } from '../api/aiAnalyses';

export interface DashboardCounts {
  openHazards: number;
  pendingReview: number;
  loading: boolean;
}

// Phase B/C glance tiles — read the active project's two most-actionable
// counts (open AI hazards, AI analyses awaiting review) and re-fetch on any
// realtime mutation that could move the number.
//
// Supabase's `count: 'exact', head: true` ships only the integer, so this
// stays cheap even on huge projects. Errors hold the last known count
// rather than poisoning the Dashboard.
export function useDashboardCounts(projectId: string | null | undefined): DashboardCounts {
  const [counts, setCounts] = useState<DashboardCounts>({
    openHazards: 0,
    pendingReview: 0,
    loading: true,
  });

  useEffect(() => {
    if (!projectId || !supabaseConfigured()) {
      setCounts({ openHazards: 0, pendingReview: 0, loading: false });
      return;
    }

    let alive = true;
    let inFlight = false;

    const refetch = () => {
      if (inFlight) return;
      inFlight = true;
      Promise.all([
        countSafetyIncidents(projectId, { status: 'open' }),
        countPendingAnalyses(projectId),
      ])
        .then(([openHazards, pendingReview]) => {
          if (!alive) return;
          setCounts({ openHazards, pendingReview, loading: false });
        })
        .catch(() => {
          // Hold last-known value; just clear loading.
          if (!alive) return;
          setCounts((prev) => ({ ...prev, loading: false }));
        })
        .finally(() => {
          inFlight = false;
        });
    };

    refetch();

    // Realtime: refetch whenever something that could move the numbers fires.
    // Two channels (one per table) so server-side filters apply.
    const safetyChannel = supabase
      .channel(`dashboard-counts-safety:${projectId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'safety_incidents', filter: `project_id=eq.${projectId}` },
        refetch,
      )
      .subscribe();

    // ai_analyses doesn't have a project_id column directly — it joins via
    // photos.project_id — so the filter is the table-level wildcard. The
    // refetch query itself filters by project so the counts stay accurate;
    // worst case is one extra refetch when a sibling project's analysis
    // moves, which is cheap (head:true integer).
    const analysesChannel = supabase
      .channel(`dashboard-counts-analyses:${projectId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ai_analyses' },
        refetch,
      )
      .subscribe();

    return () => {
      alive = false;
      void supabase.removeChannel(safetyChannel);
      void supabase.removeChannel(analysesChannel);
    };
  }, [projectId]);

  return counts;
}

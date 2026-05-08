import { Outlet, Navigate } from 'react-router-dom';
import TopNav from './TopNav';
import { useAppStore } from '../../store';
import { canViewSafetyIncident } from '../../lib/permissions';
import { useSafetyIncidentsCache } from '../../lib/hooks/useSafetyIncidentsCache';
import { useProjectTasksRealtime } from '../../lib/hooks/useProjectTasksRealtime';
import { useProjectPhotosRealtime } from '../../lib/hooks/useProjectPhotosRealtime';
import { useProjectCommentsRealtime } from '../../lib/hooks/useProjectCommentsRealtime';
import { useProjectAnalysesRealtime } from '../../lib/hooks/useProjectAnalysesRealtime';
import { useMessagingRealtime } from '../../lib/hooks/useMessagingRealtime';

export default function Layout() {
  const { isAuthenticated, project, currentProfile, currentUser } = useAppStore();

  // Layout-level realtime mounts. Lifting these out of per-page subscriptions
  // means the Dashboard activity feed + tiles refresh from teammate updates
  // even when nothing else has the relevant page open.
  //
  // Each hook is gated on isAuthenticated && project.id; the safety
  // incidents cache also requires the manager-tier permission since workers
  // don't see hazards.
  const canSeeHazards = canViewSafetyIncident(currentProfile);
  const activeProjectId = isAuthenticated ? project.id : null;
  useSafetyIncidentsCache(isAuthenticated && canSeeHazards ? project.id : null);
  useProjectTasksRealtime(activeProjectId);
  useProjectPhotosRealtime(activeProjectId);
  useProjectCommentsRealtime(activeProjectId);
  useProjectAnalysesRealtime(activeProjectId);
  // Messaging realtime is per-user (not per-project) — conversations span
  // projects, so the channel is scoped to the signed-in user's id.
  useMessagingRealtime(isAuthenticated ? currentUser?.id ?? null : null);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <TopNav />
      <main className="">
        <Outlet />
      </main>
    </div>
  );
}

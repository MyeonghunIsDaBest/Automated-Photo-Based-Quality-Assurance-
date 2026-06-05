import type { CSSProperties } from 'react';
import { Outlet, Navigate, useLocation } from 'react-router-dom';
import TopNav from './TopNav';
import MissingEnvBanner from './MissingEnvBanner';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import { useAppStore } from '../../store';
import { canViewSafetyIncident } from '../../lib/permissions';
import { useSafetyIncidentsCache } from '../../lib/hooks/useSafetyIncidentsCache';
import { useProjectTasksRealtime } from '../../lib/hooks/useProjectTasksRealtime';
import { useProjectPhotosRealtime } from '../../lib/hooks/useProjectPhotosRealtime';
import { useProjectCommentsRealtime } from '../../lib/hooks/useProjectCommentsRealtime';
import { useProjectAnalysesRealtime } from '../../lib/hooks/useProjectAnalysesRealtime';
import { useMessagingRealtime } from '../../lib/hooks/useMessagingRealtime';
import { useProjectMembersRealtime } from '../../lib/hooks/useProjectMembersRealtime';
import { useNotificationsRealtime } from '../../lib/hooks/useNotificationsRealtime';
import { useProjectConfig } from '../../lib/hooks/useProjectConfig';
import FirstRunOnboarding from '../onboarding/FirstRunOnboarding';

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
  // Defensive: `project` is typed Project but in practice resolves through
  // `toLegacyProject(selectActiveProject(...))` which can yield a placeholder
  // with no id (brand-new user, pre-first-project, store mid-hydration). A
  // raw `project.id` access there would crash Layout and unmount the entire
  // authenticated shell, which reads as a white page in both dev and prod.
  const activeProjectId = isAuthenticated ? (project?.id ?? null) : null;
  useSafetyIncidentsCache(isAuthenticated && canSeeHazards ? activeProjectId : null);
  useProjectTasksRealtime(activeProjectId);
  useProjectPhotosRealtime(activeProjectId);
  useProjectCommentsRealtime(activeProjectId);
  useProjectAnalysesRealtime(activeProjectId);
  // Messaging realtime is per-user (not per-project) — conversations span
  // projects, so the channel is scoped to the signed-in user's id.
  useMessagingRealtime(isAuthenticated ? currentUser?.id ?? null : null);
  // Per-user: bell when an Admin/PM assigns this user to a project (migration 45).
  useProjectMembersRealtime(isAuthenticated ? currentUser?.id ?? null : null);
  // Per-user: hydrate + live durable notifications inbox (migration 46). No-ops
  // gracefully until that migration is applied.
  useNotificationsRealtime(isAuthenticated ? currentUser?.id ?? null : null);

  // Per-project accent colour. The CSS variable is read by AccentBar +
  // everywhere `text-[var(--accent-color)]` is used. Falls back to the
  // editorial emerald default so unconfigured projects look identical.
  const { config: projectConfig } = useProjectConfig(activeProjectId ?? undefined);
  const accentStyle = {
    '--accent-color': projectConfig?.accentColor ?? '#10B981',
  } as CSSProperties;

  // Path keys the route-level ErrorBoundary so a crash on one page doesn't
  // sticky into the next. When the user navigates away from a broken route,
  // the new pathname resets the boundary's internal error state.
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen bg-[#FAF8F2]" style={accentStyle}>
      <MissingEnvBanner />
      <TopNav />
      <main className="">
        <ErrorBoundary key={location.pathname} label={`Page · ${location.pathname}`}>
          <Outlet />
        </ErrorBoundary>
      </main>
      <FirstRunOnboarding />
    </div>
  );
}

import type { CSSProperties } from 'react';
import { Outlet, Navigate, useLocation } from 'react-router-dom';
import AppSidebar from './AppSidebar';
import TopBar from './TopBar';
import BottomTabBar from './BottomTabBar';
import ReconnectionPill from './ReconnectionPill';
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

  // The customer portal is a standalone, full-screen experience with its OWN
  // sidebar nav — so it suppresses the global app shell (rail + bars) to
  // avoid a double navigation.
  const standaloneShell = location.pathname === '/customer';
  const isCustomer = (currentProfile ?? currentUser)?.securityGroup === 'customer';

  // The P9.B shell: ink rail (md+) beside a column of TopBar + content, and a
  // phone bottom tab bar. --bottom-nav-h is owned HERE — main content, the
  // Toaster, and FABs all pad by it so nothing hides behind the phone bar.
  // Customers never get the phone bar (their portal owns its shell).
  const shellStyle = {
    ...accentStyle,
    '--bottom-nav-h': isCustomer ? '0px' : 'var(--bottom-nav-h-mq)',
  } as CSSProperties;

  return (
    <div className="min-h-screen bg-[#FAF8F2]" style={shellStyle}>
      <MissingEnvBanner />
      {standaloneShell ? (
        <main>
          <ErrorBoundary key={location.pathname} label={`Page · ${location.pathname}`}>
            <Outlet />
          </ErrorBoundary>
        </main>
      ) : (
        <div className="flex min-h-screen">
          <AppSidebar />
          {/* overflow-x-clip: a regression guard — one too-wide element inside
              a page must clip at the viewport, never drag the whole app
              sideways (which also slides the sticky phone TopBar off-screen).
              `clip` (not `hidden`) so no scroll container is created and
              position:sticky keeps working against the window. */}
          <div className="flex min-h-screen min-w-0 flex-1 flex-col overflow-x-clip">
            <TopBar />
            {/* Desktop connection status — the top bar is phone-only now. */}
            <div className="pointer-events-none fixed right-4 top-4 z-40 hidden md:block print:hidden [&>*]:pointer-events-auto">
              <ReconnectionPill />
            </div>
            <main className="min-w-0 flex-1 pb-[calc(var(--bottom-nav-h,0px)+env(safe-area-inset-bottom))] md:pb-0">
              <ErrorBoundary key={location.pathname} label={`Page · ${location.pathname}`}>
                <Outlet />
              </ErrorBoundary>
            </main>
          </div>
          {!isCustomer && <BottomTabBar />}
        </div>
      )}
      <FirstRunOnboarding />
    </div>
  );
}

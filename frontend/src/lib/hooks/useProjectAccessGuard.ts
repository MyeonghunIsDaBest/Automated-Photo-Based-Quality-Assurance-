// useProjectAccessGuard — UX wrapper on top of the server-side RLS check.
//
// Field-role users (worker / stakeholder / supplier) shouldn't be able to
// deep-link into a project they were never invited to. RLS already filters
// the data so any page they reach would just render empty, but a deliberate
// redirect + toast is friendlier than a ghost page. Admin / PM / manager
// roles bypass entirely (they can read every project).
//
// Mount this once near where each project-scoped page first resolves
// `project.id` — Gantt.tsx, Reports.tsx, Safety.tsx. Calling it with an
// undefined projectId is a no-op so it's safe to invoke before the project
// store has hydrated.

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../../store';
import { useMyMemberships } from './useMyMemberships';

export function useProjectAccessGuard(projectId: string | undefined): void {
  const navigate = useNavigate();
  const currentUser     = useAppStore((s) => s.currentUser);
  const currentProfile  = useAppStore((s) => s.currentProfile);
  const setNotification = useAppStore((s) => s.setNotification);
  const { memberships, isLoading } = useMyMemberships(currentUser?.id);

  useEffect(() => {
    if (!projectId) return;                  // not resolved yet
    if (isLoading) return;                   // wait for the first cache fill
    if (!currentProfile) return;             // profile still loading — don't
                                             // act on a null role (isFieldRole
                                             // would read it as admin bypass
                                             // and let the page render one
                                             // frame before the redirect).
    // Only org-wide admins (company_admin / administrator / dev) bypass the
    // membership check. Project Manager + Construction Manager are now scoped to
    // projects they created or were invited to — same as field roles — so they
    // get redirected off a project they're not a member of.
    const sg = currentProfile.securityGroup;
    if (sg === 'company_admin' || sg === 'administrator' || sg === 'dev') return;

    const hasAccess = memberships.some(
      (m) => m.projectId === projectId && !m.removedAt,
    );
    if (hasAccess) return;

    setNotification({
      type: 'info',
      message: "You're not on this project's team.",
    });
    navigate('/home', { replace: true });
  }, [projectId, isLoading, memberships, currentProfile, navigate, setNotification]);
}

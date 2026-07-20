// Index-route redirect — every role lands on its REAL workspace (P9.B).
//
// The Welcome deck era is over: a production SaaS opens on your work, not a
// slideshow. The deck (RoleHome) stays on disk for reference but is no longer
// routed; first-run guidance is FirstRunOnboarding's job.
//
// Mounted at `<Route index />` (and `/home`) inside the protected Layout.
// `RequireAuth` gates everything inside `Layout`, so by the time this renders
// the session is non-loading and `currentProfile` is normally populated. The
// early return covers a logout-in-another-tab race where `currentProfile`
// briefly nulls out before `isAuthenticated` flips false — returning null
// keeps the current frame instead of bouncing on a stale profile.

import { Navigate } from 'react-router-dom';
import { useAppStore } from '../../store';

export default function RoleHomeRedirect() {
  const isAuthLoading  = useAppStore((s) => s.isAuthLoading);
  const currentProfile = useAppStore((s) => s.currentProfile);

  if (isAuthLoading || !currentProfile) return null;

  // Per-role workspaces (mirrors the old deck's "Skip to my work" targets,
  // except internal field staff also get the role-lensed Dashboard).
  const to = (() => {
    switch (currentProfile.securityGroup) {
      case 'customer':    return '/customer';
      case 'supplier':    return '/supplier';
      case 'stakeholder': return '/sponsor';
      default:            return '/dashboard'; // admins, managers, PMs, workers, dev
    }
  })();

  return <Navigate to={to} replace />;
}

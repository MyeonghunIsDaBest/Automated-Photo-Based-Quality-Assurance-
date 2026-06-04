// Index-route redirect. Field roles land on /home (their editorial,
// orientation-style landing); admins / PMs / managers land on /dashboard
// (the data-dense panel they're used to).
//
// Mounted at `<Route index />` inside the protected Layout in App.tsx.
// `RequireAuth` gates everything inside `Layout`, so by the time this
// renders the session is non-loading and `currentProfile` is normally
// populated. The two early-return cases below are belt-and-suspenders:
// they cover a logout-in-another-tab race where `currentProfile` briefly
// nulls out before `isAuthenticated` flips false, and a future refactor
// that splits the atomic `refreshProfile` set() into separate writes.
//
// Returning `null` in those windows means the user keeps seeing
// RequireAuth's "Checking session…" frame (or the page they came from)
// instead of getting bounced to /dashboard on a stale null profile.

import { Navigate } from 'react-router-dom';
import { useAppStore } from '../../store';
import { isFieldRole } from '../../lib/permissions';

export default function RoleHomeRedirect() {
  const isAuthLoading  = useAppStore((s) => s.isAuthLoading);
  const currentProfile = useAppStore((s) => s.currentProfile);

  if (isAuthLoading || !currentProfile) return null;

  // Per-role landing (role-experiences): suppliers get their own cockpit;
  // worker/stakeholder keep the editorial /home (stakeholder → /sponsor lands
  // in Phase 4); admins/PMs/managers get the data-dense /dashboard.
  const sg = currentProfile.securityGroup;
  const to =
    sg === 'supplier' ? '/supplier' :
    sg === 'stakeholder' ? '/sponsor' :
    isFieldRole(currentProfile) ? '/home' :
    '/dashboard';

  return <Navigate to={to} replace />;
}

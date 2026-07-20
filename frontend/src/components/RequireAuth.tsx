import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAppStore } from '../store';
import { canSeeAdminDashboard } from '../lib/permissions';

interface Props {
  requireAdmin?: boolean;
}

export default function RequireAuth({ requireAdmin = false }: Props) {
  const { isAuthenticated, isAuthLoading, currentProfile } = useAppStore();
  const location = useLocation();

  // Hold the spinner while either:
  //   - the initial session check is still in flight (`isAuthLoading`), or
  //   - we're claiming to be authenticated but the profile hasn't landed
  //     yet. In the normal `refreshProfile` flow these flip together, but a
  //     cross-tab logout or partial profile update can null `currentProfile`
  //     while `isAuthenticated` is still true. Without this branch the
  //     downstream gates (admin redirect, RoleHomeRedirect, etc.) evaluate
  //     against a null profile and silently send people to /dashboard.
  if (isAuthLoading || (isAuthenticated && !currentProfile)) {
    return <SessionSpinner />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (requireAdmin && !canSeeAdminDashboard(currentProfile)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}

function SessionSpinner() {
  return (
    <div className="flex h-screen items-center justify-center bg-[#FAF8F2]">
      <div className="flex items-center gap-3 text-sm text-[#6B6B6B]">
        <svg className="h-4 w-4 animate-spin text-[#A0A0A0]" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Checking session…
      </div>
    </div>
  );
}

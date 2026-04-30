import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAppStore } from '../store';
import { canSeeAdminDashboard } from '../lib/permissions';

interface Props {
  requireAdmin?: boolean;
}

export default function RequireAuth({ requireAdmin = false }: Props) {
  const { isAuthenticated, isAuthLoading, currentProfile } = useAppStore();
  const location = useLocation();

  if (isAuthLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <svg className="h-4 w-4 animate-spin text-slate-400" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Checking session…
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (requireAdmin && !canSeeAdminDashboard(currentProfile)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}

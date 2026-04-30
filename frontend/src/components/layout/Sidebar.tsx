import { Link, useLocation } from 'react-router-dom';
import { useAppStore } from '../../store';
import { useProjectsListStore } from '../../pages/projects/store';
import {
  LayoutDashboard,
  Upload,
  Image,
  Calendar,
  FileText,
  HardHat,
  Settings,
  LogOut,
  Building2,
  ShieldCheck,
} from 'lucide-react';
import { clsx } from 'clsx';
import { canSeeAdminDashboard } from '../../lib/permissions';
import type { UserRole, User } from '../../types';
import { SupabaseStatus } from './SupabaseStatus';

type NavItem = {
  label: string;
  icon: typeof LayoutDashboard;
  path: string;
  roles?: readonly UserRole[];
};

const navItems: NavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard', roles: ['admin', 'supervisor', 'stakeholder', 'inspector'] },
  { label: 'Upload Photos', icon: Upload, path: '/upload', roles: ['admin', 'supervisor'] },
  { label: 'Photo Gallery', icon: Image, path: '/gallery', roles: ['admin', 'supervisor', 'stakeholder', 'inspector'] },
  { label: 'Gantt Chart', icon: Calendar, path: '/gantt', roles: ['admin', 'supervisor', 'stakeholder', 'inspector'] },
  { label: 'Reports & Audit', icon: FileText, path: '/reports', roles: ['admin', 'supervisor', 'stakeholder', 'inspector'] },
  { label: 'Safety & Compliance', icon: HardHat, path: '/safety', roles: ['admin', 'supervisor', 'stakeholder', 'inspector'] },
  { label: 'Admin', icon: ShieldCheck, path: '/admin', roles: ['admin'] },
  { label: 'Settings', icon: Settings, path: '/settings', roles: ['admin'] },
];

function isVisible(item: NavItem, user: User): boolean {
  return !item.roles || item.roles.includes(user.role);
}

export default function Sidebar() {
  const location = useLocation();
  const { currentUser, currentProfile, logout } = useAppStore();
  const { projects, activeProjectId, setActiveProject } = useProjectsListStore();

  if (!currentUser) return null;

  const isAdmin = canSeeAdminDashboard(currentProfile);
  const filteredNavItems = navItems.filter((item) => {
    if (item.path === '/admin') return isAdmin;
    return isVisible(item, currentUser);
  });

  return (
    <div className="flex h-screen w-64 flex-col bg-slate-900 text-white">
      {/* Logo */}
      <div className="flex items-center gap-3 border-b border-slate-700 p-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600">
          <Building2 className="h-6 w-6 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold">SiteProof</h1>
          <p className="text-xs text-slate-400">QA Automation</p>
        </div>
      </div>
      
      {/* Project Switcher */}
      <div className="border-b border-slate-700 p-4">
        <label className="text-xs text-slate-400">Active Project</label>
        {projects.length > 0 ? (
          <select
            value={activeProjectId ?? ''}
            onChange={(e) => setActiveProject(e.target.value)}
            className="mt-1 w-full truncate rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm font-medium text-white focus:border-blue-500 focus:outline-none"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        ) : (
          <p className="mt-1 truncate text-sm italic text-slate-500">
            No projects yet — create one
          </p>
        )}
      </div>
      
      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-4">
        {filteredNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          
          return (
            <Link
              key={item.path}
              to={item.path}
              className={clsx(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              )}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      
      {/* Supabase health indicator (dev-only — the component renders null in
          production builds). Sits above the user profile so it reads as a
          system-state pill, not a navigation item. */}
      <div className="border-t border-slate-700 px-4 py-3">
        <SupabaseStatus />
      </div>

      {/* User Profile */}
      <div className="border-t border-slate-700 p-4">
        <div className="flex items-center gap-3">
          <img
            src={currentUser.avatar}
            alt={currentUser.fullName}
            className="h-9 w-9 rounded-full bg-slate-700"
          />
          <div className="flex-1 overflow-hidden">
            <p className="truncate text-sm font-medium">{currentUser.fullName}</p>
            <p className="truncate text-xs text-slate-400 capitalize">{currentUser.role}</p>
          </div>
          <button
            onClick={logout}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
            title="Logout"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

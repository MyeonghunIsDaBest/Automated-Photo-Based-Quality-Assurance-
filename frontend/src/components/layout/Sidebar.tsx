import { Link, useLocation } from 'react-router-dom';
import { useAppStore } from '../../store';
import {
  LayoutDashboard,
  Upload,
  Image,
  Calendar,
  FileText,
  ClipboardList,
  Settings,
  LogOut,
  Building2,
} from 'lucide-react';
import { clsx } from 'clsx';

const navItems = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard', roles: ['admin', 'supervisor', 'stakeholder', 'inspector'] as const },
  { label: 'Upload Photos', icon: Upload, path: '/upload', roles: ['admin', 'supervisor'] as const },
  { label: 'Photo Gallery', icon: Image, path: '/gallery', roles: ['admin', 'supervisor', 'stakeholder', 'inspector'] as const },
  { label: 'Gantt Chart', icon: Calendar, path: '/gantt', roles: ['admin', 'supervisor', 'stakeholder', 'inspector'] as const },
  { label: 'Reports', icon: FileText, path: '/reports', roles: ['admin', 'supervisor', 'stakeholder'] as const },
  { label: 'Audit Trail', icon: ClipboardList, path: '/audit', roles: ['admin', 'inspector'] as const },
  { label: 'Settings', icon: Settings, path: '/settings', roles: ['admin'] as const },
];

export default function Sidebar() {
  const location = useLocation();
  const { currentUser, logout, project } = useAppStore();
  
  if (!currentUser) return null;
  
      const filteredNavItems = navItems.filter(item => 
    item.roles.includes(currentUser.role as any)
  );

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
      
      {/* Project Info */}
      <div className="border-b border-slate-700 p-4">
        <p className="text-xs text-slate-400">Current Project</p>
        <p className="truncate text-sm font-medium">{project.name}</p>
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

import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAppStore } from '../../store';
import { useNotificationStore } from '../../store/notifications';
import {
  LayoutDashboard, FolderOpen, MessageSquare,
  DollarSign, Bell, Settings, LogOut, Building2,
  Menu, X, Shield, MessageCircle, TrendingUp, FileCheck, HardHat,
  ShieldCheck, ChevronDown,
} from 'lucide-react';
import { canSeeAdminDashboard, SECURITY_GROUP_LABELS } from '../../lib/permissions';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { ScrollArea } from '../ui/scroll-area';
import { format } from 'date-fns';

type NavItem = {
  label: string;
  icon: typeof LayoutDashboard;
  path: string;
  adminOnly?: boolean;
};

// Files moved into each project's Gantt overview as a sub-tab; no longer a
// top-level route. Same for project messages — the /messages page remains for
// general/cross-project chat, but project-scoped chat lives in Gantt.
const navItems: NavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
  { label: 'Projects',  icon: FolderOpen,      path: '/projects' },
  { label: 'Messages',  icon: MessageSquare,   path: '/messages' },
  { label: 'Reports',   icon: DollarSign,      path: '/reports' },
  { label: 'Safety',    icon: HardHat,         path: '/safety' },
  { label: 'Admin',     icon: ShieldCheck,     path: '/admin', adminOnly: true },
];

const getNotificationIcon = (type: string) => {
  switch (type) {
    case 'safety_alert':  return Shield;
    case 'task_update':   return TrendingUp;
    case 'chat_message':  return MessageCircle;
    case 'ai_analysis':   return Building2;
    case 'weekly_report': return FileCheck;
    default:              return Bell;
  }
};

const getNotificationColor = (type: string) => {
  switch (type) {
    case 'safety_alert':  return 'bg-red-100 text-red-600';
    case 'task_update':   return 'bg-blue-100 text-blue-600';
    case 'chat_message':  return 'bg-purple-100 text-purple-600';
    case 'ai_analysis':   return 'bg-amber-100 text-amber-600';
    case 'weekly_report': return 'bg-green-100 text-green-600';
    default:              return 'bg-slate-100 text-slate-600';
  }
};

export default function TopNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser, currentProfile, logout } = useAppStore();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotificationStore();

  const isAdmin = canSeeAdminDashboard(currentProfile);
  const visibleNav = navItems.filter((item) => !item.adminOnly || isAdmin);

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  if (!currentUser) return null;

  // Prefer the proper SECURITY_GROUP_LABELS over the legacy role string so
  // every account sees the correct, consistent label (e.g. "Worker",
  // "Company Admin") instead of "subcontractor".
  const roleLabel = currentProfile
    ? SECURITY_GROUP_LABELS[currentProfile.securityGroup]
    : currentUser.role.charAt(0).toUpperCase() + currentUser.role.slice(1);

  const initials = currentUser.fullName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    // Solid white background — `bg-white/85 backdrop-blur` ghosted content
    // through on mobile WebKit (visible in screenshots as "EMAIL" / "URITY"
    // peeking behind the logo), and the editorial design reads cleaner with
    // a hard edge anyway. Desktop loses the frosted-glass effect, which the
    // sticky border already implies visually.
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white">
      <div className="flex h-16 items-center justify-between gap-6 px-6">
        {/* ─── Left: brand + primary nav ─── */}
        <div className="flex min-w-0 items-center gap-6">
          <Link to="/dashboard" className="flex flex-shrink-0 items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600">
              <Building2 className="h-5 w-5 text-white" />
            </div>
            <span className="text-lg font-semibold tracking-tight text-slate-900">SiteProof</span>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {visibleNav.map((item) => {
              const Icon = item.icon;
              const isActive =
                location.pathname === item.path ||
                location.pathname.startsWith(`${item.path}/`);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 active:bg-slate-200'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* ─── Right: notifications · user menu ─── */}
        <div className="flex items-center gap-2">
          {/* Notifications */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setNotificationsOpen((o) => !o);
                setUserMenuOpen(false);
              }}
              className="relative flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 active:bg-slate-200"
              aria-label="Notifications"
            >
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {notificationsOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setNotificationsOpen(false)}
                />
                <div className="absolute right-0 z-50 mt-2 w-[calc(100vw-1rem)] max-w-96 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg sm:w-96">
                  <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                    <h3 className="text-sm font-semibold text-slate-900">Notifications</h3>
                    {unreadCount > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          markAllAsRead();
                          setNotificationsOpen(false);
                        }}
                        className="text-xs font-medium text-emerald-600 hover:text-emerald-700"
                      >
                        Mark all read
                      </button>
                    )}
                  </div>

                  <ScrollArea className="max-h-96">
                    {notifications.length === 0 ? (
                      <div className="p-8 text-center">
                        <Bell className="mx-auto h-10 w-10 text-slate-300" />
                        <p className="mt-3 text-sm text-slate-500">No notifications yet</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-100">
                        {notifications.map((notification) => {
                          const Icon = getNotificationIcon(notification.type);
                          const colorClass = getNotificationColor(notification.type);
                          return (
                            <button
                              key={notification.id}
                              type="button"
                              onClick={() => {
                                markAsRead(notification.id);
                                setNotificationsOpen(false);
                              }}
                              className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 ${
                                !notification.read ? 'bg-emerald-50/40' : ''
                              }`}
                            >
                              <div className={`flex-shrink-0 rounded-lg p-2 ${colorClass}`}>
                                <Icon className="h-4 w-4" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium text-slate-900">
                                  {notification.title}
                                </p>
                                <p className="mt-0.5 line-clamp-2 text-xs text-slate-600">
                                  {notification.message}
                                </p>
                                <p className="mt-1 text-[10px] text-slate-400">
                                  {format(new Date(notification.createdAt), 'MMM d, h:mm a')}
                                </p>
                              </div>
                              {!notification.read && (
                                <span className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-emerald-500" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </ScrollArea>
                </div>
              </>
            )}
          </div>

          {/* User menu — collapses Settings + Logout + role chip into one
              dropdown so the right side is visually consistent across roles. */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setUserMenuOpen((o) => !o);
                setNotificationsOpen(false);
              }}
              className={`flex min-h-11 items-center gap-2 rounded-full border border-slate-200 py-1 pl-1 pr-2.5 text-sm transition-colors hover:border-slate-300 hover:bg-slate-50 active:bg-slate-100 ${
                userMenuOpen ? 'border-slate-300 bg-slate-50' : ''
              }`}
              aria-haspopup="menu"
              aria-expanded={userMenuOpen}
            >
              <Avatar className="h-7 w-7">
                <AvatarImage src={currentUser.avatar} />
                <AvatarFallback className="text-[10px] font-semibold">{initials}</AvatarFallback>
              </Avatar>
              <span className="hidden text-xs font-medium text-slate-700 lg:inline">
                {currentUser.fullName.split(' ')[0]}
              </span>
              <ChevronDown
                className={`h-3.5 w-3.5 text-slate-400 transition-transform ${
                  userMenuOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {userMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setUserMenuOpen(false)}
                />
                <div
                  className="absolute right-0 z-50 mt-2 w-[calc(100vw-1rem)] max-w-xs overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg sm:w-64"
                  role="menu"
                >
                  <div className="border-b border-slate-100 px-4 py-3">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {currentUser.fullName}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">{currentUser.email}</p>
                    <span className="mt-2 inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-emerald-700">
                      {roleLabel}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setUserMenuOpen(false);
                      navigate('/settings');
                    }}
                    className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-slate-700 transition-colors hover:bg-slate-50"
                    role="menuitem"
                  >
                    <Settings className="h-4 w-4 text-slate-400" />
                    Settings
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setUserMenuOpen(false);
                      void logout();
                    }}
                    className="flex w-full items-center gap-2.5 border-t border-slate-100 px-4 py-2.5 text-left text-sm text-slate-700 transition-colors hover:bg-red-50 hover:text-red-700"
                    role="menuitem"
                  >
                    <LogOut className="h-4 w-4 text-slate-400" />
                    Sign out
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Mobile hamburger */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen((o) => !o)}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 active:bg-slate-200 md:hidden"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile nav drawer */}
      {mobileMenuOpen && (
        <div className="border-t border-slate-200 bg-white md:hidden">
          <nav className="space-y-1 p-4">
            {visibleNav.map((item) => {
              const Icon = item.icon;
              const isActive =
                location.pathname === item.path ||
                location.pathname.startsWith(`${item.path}/`);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${
                    isActive
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:bg-slate-50 active:bg-slate-100'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      )}
    </header>
  );
}

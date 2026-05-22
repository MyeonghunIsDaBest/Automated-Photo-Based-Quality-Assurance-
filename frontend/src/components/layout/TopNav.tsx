import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useAppStore } from '../../store';
import { useProjectsListStore } from '../../pages/projects/store';
import { useNotificationStore } from '../../store/notifications';
import { fadeIn, popover } from '../../lib/motion/variants';
import {
  LayoutDashboard, FolderOpen, MessageSquare,
  DollarSign, Bell, Settings, LogOut, Building2,
  Menu, X, Shield, MessageCircle, TrendingUp, FileCheck, HardHat,
  ShieldCheck, ChevronDown, Check, Crown,
} from 'lucide-react';
import {
  canSeeAdminDashboard,
  isFieldRole,
  SECURITY_GROUP_LABELS,
} from '../../lib/permissions';
import type { User, Profile } from '../../types';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { ScrollArea } from '../ui/scroll-area';
import ReconnectionPill from './ReconnectionPill';
import { useProjectConfig } from '../../lib/hooks/useProjectConfig';
import { format } from 'date-fns';

// Every gate accepts at least `User | null` (canUploadPhotos is the narrowest);
// the wider AdminPrincipal-based gates accept it too. Pass currentUser, which
// has `securityGroup` mirrored from the Profile, so capability checks work
// across all gates without per-helper casting.
type GatePrincipal = User | null;

type NavItem = {
  label: string;
  icon: typeof LayoutDashboard;
  path: string;
  /** Optional visibility gate. Omitted → always visible. */
  gate?: (p: GatePrincipal) => boolean;
};

// Gantt / Gallery / Upload / Review / Audit moved off the primary nav —
// Gallery/Upload/Files are reachable as tabs inside a project's Gantt view,
// Review and Audit are reachable from links in the Dashboard and Admin
// surfaces, and Settings stays in the user-menu dropdown below. Routes for
// the removed pages remain in App.tsx so existing bookmarks still resolve.
//
// The first item is role-aware: field roles (worker / stakeholder /
// supplier) see "Home → /home" (their editorial landing); admins/PMs see
// "Dashboard → /dashboard" (the data-dense panel). The rest of the strip
// is shared.
const SHARED_NAV_TAIL: NavItem[] = [
  { label: 'Projects', icon: FolderOpen,    path: '/projects' },
  { label: 'Messages', icon: MessageSquare, path: '/messages' },
  { label: 'Reports',  icon: DollarSign,    path: '/reports' },
  { label: 'Safety',   icon: HardHat,       path: '/safety' },
  { label: 'Admin',    icon: ShieldCheck,   path: '/admin',  gate: canSeeAdminDashboard },
];

function homeNavItemFor(principal: User | Profile | null): NavItem {
  return isFieldRole(principal)
    ? { label: 'Home',      icon: LayoutDashboard, path: '/home' }
    : { label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' };
}

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
  const projects        = useProjectsListStore((s) => s.projects);
  const activeProjectId = useProjectsListStore((s) => s.activeProjectId);
  const setActiveProject = useProjectsListStore((s) => s.setActiveProject);

  // currentUser carries `securityGroup` mirrored from the Profile, so every
  // gate (User-only or AdminPrincipal-based) can read it without ceremony.
  // First nav item swaps Home/Dashboard based on role; the tail is shared.
  // `currentProfile` carries the canonical securityGroup; `currentUser`
  // covers the legacy mock-data path that doesn't have a profile yet.
  const navItems: NavItem[] = [
    homeNavItemFor(currentProfile ?? currentUser ?? null),
    ...SHARED_NAV_TAIL,
  ];
  const visibleNav = navItems.filter((item) => (item.gate ? item.gate(currentUser) : true));

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);

  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null;
  const projectPillRef = useRef<HTMLButtonElement | null>(null);
  // Accent colour for the active project — surfaced as a tiny dot on the
  // pill so the switcher reads at a glance which project is live.
  const { config: activeConfig } = useProjectConfig(activeProjectId ?? undefined);
  const activeAccent = activeConfig?.accentColor ?? '#10B981';

  // Close the project switcher on Escape; return focus to the trigger so
  // keyboard users land back on the same control.
  useEffect(() => {
    if (!projectMenuOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setProjectMenuOpen(false);
        projectPillRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [projectMenuOpen]);

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
    // through on mobile WebKit, and the editorial design reads cleaner with
    // a hard edge anyway.
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white">
      <div className="flex h-16 items-center justify-between gap-6 px-6">
        {/* ─── Left: brand + primary nav ─── */}
        <div className="flex min-w-0 items-center gap-6">
          <Link to="/dashboard" className="flex flex-shrink-0 items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600">
              <Building2 className="h-5 w-5 text-white" />
            </div>
            <span className="hidden text-lg font-semibold tracking-tight text-slate-900 sm:inline">SiteProof</span>
          </Link>

          {/* Project switcher pill */}
          {activeProject && (
            <div className="relative min-w-0">
              <button
                ref={projectPillRef}
                type="button"
                onClick={() => {
                  setProjectMenuOpen((o) => !o);
                  setNotificationsOpen(false);
                  setUserMenuOpen(false);
                }}
                aria-label={`Switch project, currently ${activeProject.name}`}
                aria-haspopup="menu"
                aria-expanded={projectMenuOpen}
                title={activeProject.name}
                className="group flex h-9 min-w-0 max-w-[60vw] items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition-all hover:border-slate-300 hover:bg-slate-50 hover:ring-1 hover:ring-[color-mix(in_srgb,var(--accent-color,#10b981)_40%,transparent)] active:bg-slate-100 sm:max-w-[260px]"
              >
                <span
                  className="h-2 w-2 flex-shrink-0 rounded-full"
                  style={{ backgroundColor: activeAccent }}
                  aria-hidden
                />
                <span className="hidden truncate min-[480px]:inline">{activeProject.name}</span>
                <ChevronDown className={`h-3.5 w-3.5 flex-shrink-0 text-slate-400 transition-transform ${projectMenuOpen ? 'rotate-180' : ''}`} aria-hidden />
              </button>

              <AnimatePresence>
                {projectMenuOpen && (
                  <>
                    <motion.div
                      variants={fadeIn}
                      initial="hidden"
                      animate="visible"
                      exit="exit"
                      className="fixed inset-0 z-40"
                      onClick={() => setProjectMenuOpen(false)}
                    />
                    <motion.div
                      variants={popover}
                      initial="hidden"
                      animate="visible"
                      exit="exit"
                      role="menu"
                      aria-label="Switch project"
                      className="absolute left-0 z-50 mt-2 w-72 max-w-[calc(100vw-1rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg"
                    >
                    <div className="border-b border-slate-100 px-4 py-2.5">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Active project</p>
                      <p className="mt-0.5 truncate text-sm font-medium text-slate-900">{activeProject.name}</p>
                    </div>
                    {projects.length <= 1 ? (
                      <div className="px-4 py-6 text-center">
                        <p className="text-xs text-slate-500">Only one project on this account.</p>
                        <Link
                          to="/projects"
                          onClick={() => setProjectMenuOpen(false)}
                          className="mt-2 inline-block text-xs font-medium text-emerald-700 hover:text-emerald-800"
                        >
                          Manage projects →
                        </Link>
                      </div>
                    ) : (
                      <ul className="max-h-72 overflow-y-auto py-1">
                        {projects.map((p) => {
                          const isActive = p.id === activeProjectId;
                          return (
                            <li key={p.id}>
                              <button
                                role="menuitemradio"
                                aria-checked={isActive}
                                type="button"
                                onClick={() => {
                                  setActiveProject(p.id);
                                  setProjectMenuOpen(false);
                                  projectPillRef.current?.focus();
                                }}
                                className={`flex w-full items-center gap-2 px-4 py-2 text-left text-sm transition-colors ${
                                  isActive
                                    ? 'bg-emerald-50 text-emerald-800'
                                    : 'text-slate-700 hover:bg-slate-50'
                                }`}
                              >
                                <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center">
                                  {isActive && <Check className="h-3.5 w-3.5" aria-hidden />}
                                </span>
                                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                                {p.client && (
                                  <span className="ml-2 truncate text-[11px] text-slate-400">{p.client}</span>
                                )}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    <div className="border-t border-slate-100 px-4 py-2">
                      <Link
                        to="/projects"
                        onClick={() => setProjectMenuOpen(false)}
                        className="flex items-center justify-between text-xs font-medium text-slate-600 hover:text-slate-900"
                      >
                        <span>All projects</span>
                        <span aria-hidden>→</span>
                      </Link>
                    </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          )}

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
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors lg:gap-2 lg:px-3 lg:text-sm ${
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
          <ReconnectionPill />
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

            <AnimatePresence>
              {notificationsOpen && (
                <>
                  <motion.div
                    variants={fadeIn}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    className="fixed inset-0 z-40"
                    onClick={() => setNotificationsOpen(false)}
                  />
                  <motion.div
                    variants={popover}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    className="absolute right-0 z-50 mt-2 w-[calc(100vw-1rem)] max-w-96 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg sm:w-96"
                  >
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
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

          {/* User menu — Settings + Sign out + role chip in one dropdown. */}
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
              <div className="relative">
                <Avatar className="h-7 w-7">
                  <AvatarImage src={currentUser.avatar} />
                  <AvatarFallback className="text-[10px] font-semibold">{initials}</AvatarFallback>
                </Avatar>
                {currentProfile?.isOwner && (
                  <span
                    className="absolute -right-1 -top-1 grid h-3.5 w-3.5 place-items-center rounded-full bg-amber-500 ring-1 ring-white"
                    title="Owner"
                    aria-label="Owner"
                  >
                    <Crown className="h-2 w-2 text-white" />
                  </span>
                )}
              </div>
              <span className="hidden text-xs font-medium text-slate-700 lg:inline">
                {currentUser.fullName.split(' ')[0]}
              </span>
              <ChevronDown
                className={`h-3.5 w-3.5 text-slate-400 transition-transform ${
                  userMenuOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            <AnimatePresence>
              {userMenuOpen && (
                <>
                  <motion.div
                    variants={fadeIn}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    className="fixed inset-0 z-40"
                    onClick={() => setUserMenuOpen(false)}
                  />
                  <motion.div
                    variants={popover}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    className="absolute right-0 z-50 mt-2 w-[calc(100vw-1rem)] max-w-xs overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg sm:w-64"
                    role="menu"
                  >
                  <div className="border-b border-slate-100 px-4 py-3">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {currentUser.fullName}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">{currentUser.email}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-emerald-700">
                        {roleLabel}
                      </span>
                      {currentProfile?.isOwner && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-700">
                          <Crown className="h-2.5 w-2.5" />
                          Owner
                        </span>
                      )}
                    </div>
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
                  </motion.div>
                </>
              )}
            </AnimatePresence>
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

      {/* Mobile nav drawer — slides down from under the header on toggle. */}
      <AnimatePresence initial={false}>
        {mobileMenuOpen && (
          <motion.div
            key="mobile-nav-drawer"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1, transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] } }}
            exit={{ height: 0, opacity: 0, transition: { duration: 0.2 } }}
            className="overflow-hidden border-t border-slate-200 bg-white md:hidden"
          >
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
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// components/layout/TopBar.tsx — the slim top bar of the P9.B shell.
//
// Desktop: sits beside AppSidebar (which owns brand + nav) — this bar carries
// page context (project switcher), the reconnection pill, notifications, and
// the user menu. Phone: also carries the brand (the rail is hidden there);
// primary nav lives in BottomTabBar.
//
// Popovers (project switcher / bell / user menu) are transplanted VERBATIM
// from the retired TopNav so behavior — deep links, focus return, Esc — is
// unchanged. Backdrop blur is md+ ONLY: translucent chrome ghosted content on
// mobile WebKit (the original TopNav documented the bug), so phones get a
// solid paper surface.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useAppStore } from '../../store';
import { useProjectsListStore } from '../../pages/projects/store';
import { useNotificationStore } from '../../store/notifications';
import { fadeIn, popover } from '../../lib/motion/variants';
import {
  Bell, Settings, LogOut, Building2, Shield, MessageCircle, TrendingUp,
  FileCheck, ChevronDown, Check, Crown, Package,
} from 'lucide-react';
import { SECURITY_GROUP_LABELS } from '../../lib/permissions';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { ScrollArea } from '../ui/scroll-area';
import ReconnectionPill from './ReconnectionPill';
import { useProjectConfig } from '../../lib/hooks/useProjectConfig';
import { FRAUNCES } from '../../pages/gantt/components/ledger';
import { format } from 'date-fns';

const getNotificationIcon = (type: string) => {
  switch (type) {
    case 'safety_alert':  return Shield;
    case 'task_update':   return TrendingUp;
    case 'chat_message':  return MessageCircle;
    case 'ai_analysis':   return Building2;
    case 'weekly_report': return FileCheck;
    case 'stock_allocation': return Package;
    default:              return Bell;
  }
};

const getNotificationColor = (type: string) => {
  switch (type) {
    case 'safety_alert':  return 'bg-[#FBE5E5] text-[#C44545]';
    case 'task_update':   return 'bg-[#E5F2EA] text-[#246F47]';
    case 'chat_message':  return 'bg-[#F0EDE4] text-[#1A1A1A]';
    case 'ai_analysis':   return 'bg-[#F9EFD9] text-[#C8841E]';
    case 'weekly_report': return 'bg-[#E5F2EA] text-[#246F47]';
    case 'stock_allocation': return 'bg-[#F9EFD9] text-[#C8841E]';
    default:              return 'bg-[#EEF1F4] text-[#5B6B7B]';
  }
};

export default function TopBar() {
  const navigate = useNavigate();
  const { currentUser, currentProfile, logout } = useAppStore();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotificationStore();
  const projects        = useProjectsListStore((s) => s.projects);
  const activeProjectId = useProjectsListStore((s) => s.activeProjectId);
  const setActiveProject = useProjectsListStore((s) => s.setActiveProject);

  const navPrincipal = currentProfile ?? currentUser ?? null;
  const isCustomer = navPrincipal?.securityGroup === 'customer';

  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);

  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null;
  const projectPillRef = useRef<HTMLButtonElement | null>(null);
  const { config: activeConfig } = useProjectConfig(activeProjectId ?? undefined);
  const activeAccent = activeConfig?.accentColor ?? '#10B981';

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
    // PHONE-ONLY since P9.B6: on desktop the sidebar owns the project
    // switcher, notifications, and account (Jordan's test.html mock has no
    // desktop top bar). Solid paper — mobile WebKit ghosts through blur.
    <header className="sticky top-0 z-40 border-b border-[#E6E1D4] bg-[#FAF8F2] md:hidden print:hidden">
      <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6">
        {/* ─── Left: brand (phone only — the rail owns it on md+) + project pill ─── */}
        <div className="flex min-w-0 items-center gap-4">
          <Link to="/" className="flex flex-shrink-0 items-center gap-2 md:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[#2F8F5C] shadow-[0_1px_2px_rgba(20,20,20,0.12)]">
              <Building2 className="h-5 w-5 text-white" strokeWidth={1.75} />
            </div>
            <span
              className="hidden text-[21px] font-medium tracking-tight text-[#1A1A1A] min-[400px]:inline"
              style={{ fontFamily: FRAUNCES, letterSpacing: '-0.02em' }}
            >
              SiteProof
            </span>
          </Link>

          {activeProject && !isCustomer && (
            <div className="relative flex min-w-0">
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
                className="group flex h-9 min-w-0 max-w-[60vw] items-center gap-1.5 rounded-full border border-[#E6E1D4] bg-white px-3 text-sm font-medium text-[#3A3A3A] transition-all hover:bg-[#FAF8F2] hover:ring-1 hover:ring-[color-mix(in_srgb,var(--accent-color,#2F8F5C)_40%,transparent)] active:bg-[#F0EDE4] sm:max-w-[260px]"
              >
                <span
                  className="h-2 w-2 flex-shrink-0 rounded-full"
                  style={{ backgroundColor: activeAccent }}
                  aria-hidden
                />
                <span className="hidden truncate min-[480px]:inline">{activeProject.name}</span>
                <ChevronDown className={`h-3.5 w-3.5 flex-shrink-0 text-[#A0A0A0] transition-transform ${projectMenuOpen ? 'rotate-180' : ''}`} aria-hidden />
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
                      className="absolute left-0 z-50 mt-2 w-72 max-w-[calc(100vw-1rem)] overflow-hidden rounded-[14px] border border-[#E6E1D4] bg-white shadow-[0_8px_28px_rgba(20,20,20,0.12)]"
                    >
                    <div className="border-b border-[#EFEBE0] px-4 py-2.5">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#6B6B6B]">Active project</p>
                      <p className="mt-0.5 truncate text-sm font-medium text-[#1A1A1A]">{activeProject.name}</p>
                    </div>
                    {projects.length <= 1 ? (
                      <div className="px-4 py-6 text-center">
                        <p className="text-xs text-[#6B6B6B]">Only one project on this account.</p>
                        <Link
                          to="/projects"
                          onClick={() => setProjectMenuOpen(false)}
                          className="mt-2 inline-block text-xs font-medium text-[#246F47] hover:text-[#2F8F5C]"
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
                                    ? 'bg-[#E5F2EA] text-[#246F47]'
                                    : 'text-[#3A3A3A] hover:bg-[#FAF8F2]'
                                }`}
                              >
                                <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center">
                                  {isActive && <Check className="h-3.5 w-3.5" aria-hidden />}
                                </span>
                                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                                {p.client && (
                                  <span className="ml-2 truncate text-[11px] text-[#A0A0A0]">{p.client}</span>
                                )}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    <div className="border-t border-[#EFEBE0] px-4 py-2">
                      <Link
                        to="/projects"
                        onClick={() => setProjectMenuOpen(false)}
                        className="flex items-center justify-between text-xs font-medium text-[#6B6B6B] hover:text-[#1A1A1A]"
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
        </div>

        {/* ─── Right: reconnection + bell + user menu ─── */}
        <div className="flex flex-shrink-0 items-center gap-1.5 sm:gap-2">
          <ReconnectionPill />

          {/* Notifications bell + popover */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setNotificationsOpen((o) => !o);
                setUserMenuOpen(false);
              }}
              className={`relative flex h-11 w-11 items-center justify-center rounded-full text-[#6B6B6B] transition-colors hover:bg-[#F0EDE4] hover:text-[#1A1A1A] active:bg-[#E6E1D4] ${
                notificationsOpen ? 'bg-[#F0EDE4] text-[#1A1A1A]' : ''
              }`}
              aria-label="Notifications"
            >
              <Bell className="h-5 w-5" strokeWidth={1.75} />
              {unreadCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#C44545] px-1 text-[10px] font-semibold text-white ring-2 ring-[#FAF8F2]">
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
                    className="absolute right-0 z-50 mt-2 w-[calc(100vw-1rem)] max-w-96 overflow-hidden rounded-[14px] border border-[#E6E1D4] bg-white shadow-[0_8px_28px_rgba(20,20,20,0.12)] sm:w-96"
                  >
                  <div className="flex items-center justify-between border-b border-[#EFEBE0] px-4 py-3">
                    <h3 className="text-sm font-semibold text-[#1A1A1A]">Notifications</h3>
                    {unreadCount > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          markAllAsRead();
                          setNotificationsOpen(false);
                        }}
                        className="text-xs font-medium text-[#246F47] hover:text-[#2F8F5C]"
                      >
                        Mark all read
                      </button>
                    )}
                  </div>

                  <ScrollArea className="max-h-96">
                    {notifications.length === 0 ? (
                      <div className="p-8 text-center">
                        <Bell className="mx-auto h-10 w-10 text-[#D8D2C4]" strokeWidth={1.5} />
                        <p className="mt-3 text-sm text-[#6B6B6B]">No notifications yet</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-[#EFEBE0]">
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
                                // Deep links: accepted/declined boxes carry the
                                // job ref → manager lands on the job's drawer;
                                // otherwise (worker's "box ready") → My Van.
                                if (notification.type === 'stock_allocation') {
                                  const jobId = (notification.metadata as { serviceJobId?: string } | undefined)?.serviceJobId;
                                  navigate(jobId ? `/jobs?job=${jobId}` : '/stock');
                                }
                              }}
                              className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-[#FAF8F2] ${
                                !notification.read ? 'bg-[#E5F2EA]/50' : ''
                              }`}
                            >
                              <div className={`flex-shrink-0 rounded-[9px] p-2 ${colorClass}`}>
                                <Icon className="h-4 w-4" strokeWidth={1.75} />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium text-[#1A1A1A]">
                                  {notification.title}
                                </p>
                                <p className="mt-0.5 line-clamp-2 text-xs text-[#6B6B6B]">
                                  {notification.message}
                                </p>
                                <p className="mt-1 text-[10px] text-[#A0A0A0]">
                                  {format(new Date(notification.createdAt), 'MMM d, h:mm a')}
                                </p>
                              </div>
                              {!notification.read && (
                                <span className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-[#2F8F5C]" />
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
              className={`flex min-h-11 items-center gap-2 rounded-full border border-[#E6E1D4] py-1 pl-1 pr-2.5 text-sm transition-colors hover:bg-[#FAF8F2] active:bg-[#F0EDE4] ${
                userMenuOpen ? 'border-[#D8D2C4] bg-[#FAF8F2]' : ''
              }`}
              aria-haspopup="menu"
              aria-expanded={userMenuOpen}
            >
              <div className="relative">
                <Avatar className="h-7 w-7">
                  <AvatarImage src={currentUser.avatar} />
                  <AvatarFallback className="bg-[#F0EDE4] text-[10px] font-semibold text-[#1A1A1A]">{initials}</AvatarFallback>
                </Avatar>
                {currentProfile?.isOwner && (
                  <span
                    className="absolute -right-1 -top-1 grid h-3.5 w-3.5 place-items-center rounded-full bg-[#D69A2E] ring-1 ring-[#FAF8F2]"
                    title="Owner"
                    aria-label="Owner"
                  >
                    <Crown className="h-2 w-2 text-white" />
                  </span>
                )}
              </div>
              <span className="hidden text-xs font-medium text-[#3A3A3A] lg:inline">
                {currentUser.fullName.split(' ')[0]}
              </span>
              <ChevronDown
                className={`h-3.5 w-3.5 text-[#A0A0A0] transition-transform ${
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
                    className="absolute right-0 z-50 mt-2 w-[calc(100vw-1rem)] max-w-xs overflow-hidden rounded-[14px] border border-[#E6E1D4] bg-white shadow-[0_8px_28px_rgba(20,20,20,0.12)] sm:w-64"
                    role="menu"
                  >
                  <div className="border-b border-[#EFEBE0] px-4 py-3">
                    <p className="truncate text-sm font-medium text-[#1A1A1A]">
                      {currentUser.fullName}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-[#6B6B6B]">{currentUser.email}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <span className="inline-flex items-center rounded-full bg-[#E5F2EA] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[#246F47]">
                        {roleLabel}
                      </span>
                      {currentProfile?.isOwner && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-[#F9EFD9] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[#C8841E]">
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
                    className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-[#3A3A3A] transition-colors hover:bg-[#FAF8F2]"
                    role="menuitem"
                  >
                    <Settings className="h-4 w-4 text-[#A0A0A0]" strokeWidth={1.75} />
                    Settings
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setUserMenuOpen(false);
                      void logout();
                    }}
                    className="flex w-full items-center gap-2.5 border-t border-[#EFEBE0] px-4 py-2.5 text-left text-sm text-[#3A3A3A] transition-colors hover:bg-[#FBE5E5] hover:text-[#C44545]"
                    role="menuitem"
                  >
                    <LogOut className="h-4 w-4 text-[#A0A0A0]" strokeWidth={1.75} />
                    Sign out
                  </button>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </header>
  );
}

import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useAppStore } from '../../store';
import { useProjectsListStore } from '../../pages/projects/store';
import { useNotificationStore } from '../../store/notifications';
import { fadeIn, popover } from '../../lib/motion/variants';
import {
  LayoutDashboard, FolderOpen, MessageSquare,
  Bell, Settings, LogOut, Building2,
  Menu, X, Shield, MessageCircle, TrendingUp, FileCheck, HardHat,
  ShieldCheck, ChevronDown, Check, Crown, Wrench, ClipboardList, ReceiptText, Package,
} from 'lucide-react';
import {
  canSeeAdminDashboard,
  canManageMaintenance,
  canManageSales,
  canViewJobsBoard,
  canViewStock,
  isFieldRole,
  SECURITY_GROUP_LABELS,
} from '../../lib/permissions';
import type { User, Profile } from '../../types';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { ScrollArea } from '../ui/scroll-area';
import ReconnectionPill from './ReconnectionPill';
import { useProjectConfig } from '../../lib/hooks/useProjectConfig';
import { FRAUNCES } from '../../pages/gantt/components/ledger';
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
// The first two items are role-aware (see the helpers below); the rest of the
// strip is shared. Item 1 swaps Home/Dashboard by role; item 2 is the projects
// list (suppliers/stakeholders only — internal staff reach projects via the
// Jobs hub at /jobs?view=projects so the standalone /projects entry is
// omitted for them). The tail runs Jobs → Customers → Messages so the
// most-used operations surface first. Jobs uses ClipboardList (not
// KanbanSquare) so it doesn't read as a twin of the Dashboard grid glyph.
// The strip grew with the Customer portal; OVERFLOW collapses non-daily
// items (Safety, Admin) into a "More ▾" pill below xl.
const CORE_NAV_TAIL: NavItem[] = [
  { label: 'Jobs',      icon: ClipboardList, path: '/jobs',      gate: canViewJobsBoard },
  { label: 'Stock',     icon: Package,       path: '/stock',     gate: canViewStock },
  { label: 'Customers', icon: Wrench,        path: '/customers', gate: canManageMaintenance },
  { label: 'Messages',  icon: MessageSquare, path: '/messages' },
];

const OVERFLOW_NAV: NavItem[] = [
  // Catalogue now lives under Sales (Service Quotes) as a tab — /sales?tab=catalogue.
  { label: 'Sales',        icon: ReceiptText,   path: '/sales',       gate: canManageSales },
  { label: 'Safety',       icon: HardHat,       path: '/safety' },
  { label: 'Admin',        icon: ShieldCheck,   path: '/admin',       gate: canSeeAdminDashboard },
];

// Customer-only nav — a minimal single-item strip scoped to the portal.
// Mirrors the supplier/stakeholder pattern: no project-scoped items, no
// construction tooling, no admin. Settings remains accessible via the user-menu
// dropdown (same as every other role) so it is not duplicated here.
const CUSTOMER_NAV: NavItem[] = [
  { label: 'My maintenance', icon: Wrench, path: '/customer' },
];

function homeNavItemFor(principal: User | Profile | null): NavItem {
  return isFieldRole(principal)
    ? { label: 'Home',      icon: LayoutDashboard, path: '/home' }
    : { label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' };
}

// The projects list. A supplier's mental model is purchase orders and
// deliveries, so they see it as "Materials"; every other role (worker, PM,
// manager, admin, stakeholder) sees the portfolio it actually is — "Projects".
function projectsNavItemFor(principal: User | Profile | null): NavItem {
  const isSupplier = principal?.securityGroup === 'supplier';
  return { label: isSupplier ? 'Materials' : 'Projects', icon: FolderOpen, path: '/projects' };
}

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

// Notification glyph tints drawn from the ledger TONE palette so the bell
// reads as part of the warm register, not a separate slate widget.
const getNotificationColor = (type: string) => {
  switch (type) {
    case 'safety_alert':  return 'bg-[#FBE5E5] text-[#C44545]'; // red tone
    case 'task_update':   return 'bg-[#E5F2EA] text-[#246F47]'; // sage tone
    case 'chat_message':  return 'bg-[#F0EDE4] text-[#1A1A1A]'; // ink tone
    case 'ai_analysis':   return 'bg-[#F9EFD9] text-[#C8841E]'; // amber tone
    case 'weekly_report': return 'bg-[#E5F2EA] text-[#246F47]'; // sage tone
    case 'stock_allocation': return 'bg-[#F9EFD9] text-[#C8841E]'; // amber tone — action needed
    default:              return 'bg-[#EEF1F4] text-[#5B6B7B]'; // slate tone
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
  const navPrincipal = currentProfile ?? currentUser ?? null;
  const isCustomer = navPrincipal?.securityGroup === 'customer';

  // Customers get a minimal portal-only strip; all other roles get the full
  // construction nav (gated per item as usual). The project switcher is also
  // suppressed for customers — they have no project context.
  // Internal staff (canViewJobsBoard) reach Projects via /jobs?view=projects
  // inside the hub — skip the standalone projects entry for them so the nav
  // doesn't list a route that immediately redirects. Suppliers and
  // stakeholders lack Jobs Board access and keep the standalone Projects item.
  const coreItems: NavItem[] = isCustomer
    ? CUSTOMER_NAV
    : [
        homeNavItemFor(navPrincipal),
        ...(!canViewJobsBoard(navPrincipal) ? [projectsNavItemFor(navPrincipal)] : []),
        ...CORE_NAV_TAIL,
      ];
  const overflowItems: NavItem[] = isCustomer ? [] : OVERFLOW_NAV;
  const visibleCore = coreItems.filter((item) => (item.gate ? item.gate(currentUser) : true));
  const visibleOverflow = overflowItems.filter((item) => (item.gate ? item.gate(currentUser) : true));
  // The mobile drawer shows everything in one column, original behaviour.
  const visibleNav = [...visibleCore, ...visibleOverflow];

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);

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
    // Warm "site register" chrome — cream wash + #E6E1D4 hairline, matching
    // the logbook surfaces. Solid (no backdrop-blur): it ghosted content
    // through on mobile WebKit, and the editorial design reads cleaner with a
    // hard edge anyway.
    <header className="sticky top-0 z-40 border-b border-[#E6E1D4] bg-[#FAF8F2]">
      <div className="flex h-16 items-center justify-between gap-6 px-6">
        {/* ─── Left: brand + primary nav ─── */}
        <div className="flex min-w-0 items-center gap-6">
          <Link to="/dashboard" className="flex flex-shrink-0 items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[#2F8F5C] shadow-[0_1px_2px_rgba(20,20,20,0.12)]">
              <Building2 className="h-5 w-5 text-white" strokeWidth={1.75} />
            </div>
            <span
              className="hidden text-[21px] font-medium tracking-tight text-[#1A1A1A] sm:inline"
              style={{ fontFamily: FRAUNCES, letterSpacing: '-0.02em' }}
            >
              SiteProof
            </span>
          </Link>

          {/* Project switcher pill — `flex` (not bare `relative`) so the button is
              a flex child of this min-w-0 box and truncates within its allotted
              slot instead of overflowing past the gap into the nav (which was
              clipping the first nav item's leading glyph when the row got tight). */}
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

          <nav className="hidden flex-shrink-0 md:flex items-center gap-0.5 xl:gap-1">
            {(() => {
              // One pill renderer for core, inline-overflow, and dropdown rows
              // so sizing/weights can never drift apart again. Tightened at md
              // (the 8-item strip was crowding the row); roomier from xl up.
              const navPill = (item: NavItem) => {
                const Icon = item.icon;
                const isActive =
                  location.pathname === item.path ||
                  location.pathname.startsWith(`${item.path}/`);
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium transition-colors xl:gap-2 xl:px-3 xl:text-sm ${
                      isActive
                        ? 'bg-[#1A1A1A] text-white'
                        : 'text-[#6B6B6B] hover:bg-[#F0EDE4] hover:text-[#1A1A1A] active:bg-[#E6E1D4]'
                    }`}
                  >
                    <Icon className="h-4 w-4" strokeWidth={isActive ? 2 : 1.75} />
                    {item.label}
                  </Link>
                );
              };
              const overflowActive = visibleOverflow.some(
                (item) =>
                  location.pathname === item.path ||
                  location.pathname.startsWith(`${item.path}/`),
              );
              return (
                <>
                  {visibleCore.map(navPill)}

                  {/* Wide screens: overflow items sit inline as before. */}
                  {visibleOverflow.length > 0 && (
                    <div className="hidden xl:flex items-center gap-1">
                      {visibleOverflow.map(navPill)}
                    </div>
                  )}

                  {/* md → xl: overflow collapses into a "More ▾" pill so the
                      row can never crowd or clip, whatever we add later. */}
                  {visibleOverflow.length > 0 && (
                    <div className="relative xl:hidden">
                      <button
                        type="button"
                        onClick={() => {
                          setMoreMenuOpen((o) => !o);
                          setNotificationsOpen(false);
                          setUserMenuOpen(false);
                          setProjectMenuOpen(false);
                        }}
                        aria-haspopup="menu"
                        aria-expanded={moreMenuOpen}
                        className={`flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-medium transition-colors ${
                          overflowActive
                            ? 'bg-[#1A1A1A] text-white'
                            : 'text-[#6B6B6B] hover:bg-[#F0EDE4] hover:text-[#1A1A1A] active:bg-[#E6E1D4]'
                        }`}
                      >
                        More
                        <ChevronDown
                          className={`h-3.5 w-3.5 transition-transform ${moreMenuOpen ? 'rotate-180' : ''}`}
                          aria-hidden
                        />
                      </button>

                      <AnimatePresence>
                        {moreMenuOpen && (
                          <>
                            <motion.div
                              variants={fadeIn}
                              initial="hidden"
                              animate="visible"
                              exit="exit"
                              className="fixed inset-0 z-40"
                              onClick={() => setMoreMenuOpen(false)}
                            />
                            <motion.div
                              variants={popover}
                              initial="hidden"
                              animate="visible"
                              exit="exit"
                              role="menu"
                              aria-label="More pages"
                              className="absolute left-0 z-50 mt-2 w-48 overflow-hidden rounded-[14px] border border-[#E6E1D4] bg-white py-1 shadow-[0_8px_28px_rgba(20,20,20,0.12)]"
                            >
                              {visibleOverflow.map((item) => {
                                const Icon = item.icon;
                                const isActive =
                                  location.pathname === item.path ||
                                  location.pathname.startsWith(`${item.path}/`);
                                return (
                                  <Link
                                    key={item.path}
                                    to={item.path}
                                    role="menuitem"
                                    onClick={() => setMoreMenuOpen(false)}
                                    className={`flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors ${
                                      isActive
                                        ? 'bg-[#E5F2EA] text-[#246F47]'
                                        : 'text-[#3A3A3A] hover:bg-[#FAF8F2]'
                                    }`}
                                  >
                                    <Icon className="h-4 w-4 text-[#A0A0A0]" strokeWidth={1.75} />
                                    {item.label}
                                  </Link>
                                );
                              })}
                            </motion.div>
                          </>
                        )}
                      </AnimatePresence>
                    </div>
                  )}
                </>
              );
            })()}
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
              className="relative flex h-11 w-11 items-center justify-center rounded-full text-[#6B6B6B] transition-colors hover:bg-[#F0EDE4] hover:text-[#1A1A1A] active:bg-[#E6E1D4]"
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

          {/* Mobile hamburger */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen((o) => !o)}
            className="flex h-11 w-11 items-center justify-center rounded-full text-[#6B6B6B] transition-colors hover:bg-[#F0EDE4] hover:text-[#1A1A1A] active:bg-[#E6E1D4] md:hidden"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" strokeWidth={1.75} /> : <Menu className="h-5 w-5" strokeWidth={1.75} />}
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
            className="overflow-hidden border-t border-[#E6E1D4] bg-[#FAF8F2] md:hidden"
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
                    className={`flex min-h-11 items-center gap-3 rounded-[10px] px-3 py-2.5 text-sm font-medium ${
                      isActive
                        ? 'bg-[#1A1A1A] text-white'
                        : 'text-[#3A3A3A] hover:bg-white active:bg-[#F0EDE4]'
                    }`}
                  >
                    <Icon className="h-5 w-5" strokeWidth={isActive ? 2 : 1.75} />
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

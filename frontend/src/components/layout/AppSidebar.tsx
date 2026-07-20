// ─────────────────────────────────────────────────────────────────────────────
// components/layout/AppSidebar.tsx — the desktop ink rail, v2 (P9.B6).
//
// Built to Jordan's test.html mock: a COLLAPSIBLE rail (220px ↔ 76px,
// persisted) that owns everything the old top bar floated — the project
// switcher, search, grouped nav, notifications, and the account card. The
// desktop top bar is gone; phones keep TopBar + BottomTabBar.
//
// Honesty rule: badges show REAL counts only (notifications unread today;
// per-section counts arrive when their stores exist). Menu behavior matches
// the retired TopNav popovers: outside-click + Escape close, deep links kept.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Bell, Check, ChevronDown, ChevronLeft, ChevronRight, LogOut, Search, Settings,
  Building2, Shield, MessageCircle, TrendingUp, FileCheck, Package,
} from 'lucide-react';
import { useAppStore } from '../../store';
import { useProjectsListStore } from '../../pages/projects/store';
import { useNotificationStore } from '../../store/notifications';
import { useProjectConfig } from '../../lib/hooks/useProjectConfig';
import { SECURITY_GROUP_LABELS } from '../../lib/permissions';
import { FRAUNCES } from '../../pages/gantt/components/ledger';
import { cn } from '../../lib/cn';
import { buildNavGroups, type NavItem } from './navConfig';
import { NavFlyout } from './NavFlyout';
import { format } from 'date-fns';

const COLLAPSE_KEY = 'casone.sidebar.collapsed';

const notifIcon = (type: string) => {
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

const notifColor = (type: string) => {
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

type Panel = 'project' | 'notifications' | 'user' | null;

export default function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser, currentProfile, logout } = useAppStore();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotificationStore();
  const projects        = useProjectsListStore((s) => s.projects);
  const activeProjectId = useProjectsListStore((s) => s.activeProjectId);
  const setActiveProject = useProjectsListStore((s) => s.setActiveProject);
  const { config: activeConfig } = useProjectConfig(activeProjectId ?? undefined);

  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === '1');
  const [panel, setPanel] = useState<Panel>(null);
  const [query, setQuery] = useState('');
  const asideRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // ── Hover mega-menu (Jobs / Quotes / Invoices) ──────────────────────────────
  // Hover-intent: open ~90ms after entering a flyout row, close ~160ms after
  // leaving the row OR the flyout — entering either cancels the pending close so
  // the pointer can cross the 8px gap between rail and panel.
  const [flyout, setFlyout] = useState<{ item: NavItem; anchor: DOMRect } | null>(null);
  const openTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);
  const clearTimers = () => {
    if (openTimer.current) { clearTimeout(openTimer.current); openTimer.current = null; }
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
  };
  const scheduleOpen = (item: NavItem, el: HTMLElement) => {
    clearTimers();
    const rect = el.getBoundingClientRect();
    openTimer.current = window.setTimeout(() => setFlyout({ item, anchor: rect }), 90);
  };
  const scheduleClose = () => {
    if (openTimer.current) { clearTimeout(openTimer.current); openTimer.current = null; }
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setFlyout(null), 160);
  };
  const cancelClose = () => { if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; } };
  const closeFlyoutNow = () => { clearTimers(); setFlyout(null); };
  useEffect(() => () => clearTimers(), []);

  const toggleCollapsed = () => {
    setCollapsed((v) => {
      localStorage.setItem(COLLAPSE_KEY, v ? '0' : '1');
      return !v;
    });
    setPanel(null);
  };

  // Panels: outside click + Escape close (one handler for all three).
  useEffect(() => {
    if (!panel) return;
    const onDown = (e: MouseEvent) => {
      if (asideRef.current && !asideRef.current.contains(e.target as Node)) setPanel(null);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPanel(null); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [panel]);

  // "/" focuses the rail search (desktop convenience; ignored while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  if (!currentUser) return null;

  const principal = currentProfile ?? currentUser ?? null;
  const isCustomer = principal?.securityGroup === 'customer';
  const groups = buildNavGroups(principal, currentUser);
  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null;
  const activeAccent = activeConfig?.accentColor ?? '#10B981';

  const roleLabel = currentProfile
    ? SECURITY_GROUP_LABELS[currentProfile.securityGroup]
    : currentUser.role.charAt(0).toUpperCase() + currentUser.role.slice(1);
  const initials = currentUser.fullName
    .split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();

  const isActive = (path: string) =>
    location.pathname === path || (path !== '/' && location.pathname.startsWith(path + '/'));

  const submitSearch = () => {
    const q = query.trim();
    if (!q) return;
    setQuery('');
    searchRef.current?.blur();
    navigate(`/jobs?q=${encodeURIComponent(q)}`);
  };

  // Floating panel base — anchors beside the rail when collapsed.
  const panelCls = (up: boolean) => cn(
    'absolute z-[60] overflow-hidden rounded-[14px] border border-[#E6E1D4] bg-white text-[#1A1A1A] shadow-[0_18px_40px_-14px_rgba(15,23,42,0.24)]',
    up ? 'bottom-[calc(100%+8px)]' : 'top-[calc(100%+6px)]',
    collapsed ? 'left-[70px] w-[264px]' : 'inset-x-3',
  );

  return (
    <aside
      ref={asideRef}
      aria-label="Primary"
      className={cn(
        'sticky top-0 z-20 hidden h-screen shrink-0 flex-col bg-[#1A1A1A] text-[#EDEBE6] transition-[width] duration-200 ease-out md:flex print:hidden',
        collapsed ? 'w-[76px]' : 'w-[230px]',
      )}
    >
      {/* ── Top: brand + collapse + project switcher + search ─────────────── */}
      <div className="relative flex flex-col gap-3 border-b border-white/[.08] px-3 pb-3.5 pt-[18px]">
        <div className="flex items-center justify-between gap-2">
          <Link
            to="/"
            className={cn('flex min-w-0 items-center gap-2.5 rounded-[9px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2F8F5C]', collapsed && 'mx-auto')}
          >
            <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px] bg-[#2F8F5C] shadow-[0_1px_2px_rgba(0,0,0,0.25)]">
              <span className="text-[16px] leading-none text-white" style={{ fontFamily: FRAUNCES }}>S</span>
            </span>
            {!collapsed && (
              <span className="truncate text-[19px] font-medium text-white" style={{ fontFamily: FRAUNCES, letterSpacing: '-0.01em' }}>
                Site<span className="text-[#2F8F5C]">Proof</span>
              </span>
            )}
          </Link>
          {!collapsed && (
            <button
              type="button"
              onClick={toggleCollapsed}
              title="Collapse sidebar"
              aria-label="Collapse sidebar"
              className="grid h-7 w-7 shrink-0 place-items-center rounded-[8px] text-white/55 transition-colors hover:bg-white/[.08] hover:text-white"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}
        </div>

        {collapsed && (
          <button
            type="button"
            onClick={toggleCollapsed}
            title="Expand sidebar"
            aria-label="Expand sidebar"
            className="mx-auto grid h-7 w-7 place-items-center rounded-[8px] text-white/55 transition-colors hover:bg-white/[.08] hover:text-white"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        )}

        {/* Project switcher — lives in the rail now (mock spec) */}
        {activeProject && !isCustomer && (
          <>
            <button
              type="button"
              onClick={() => setPanel(panel === 'project' ? null : 'project')}
              aria-haspopup="menu"
              aria-expanded={panel === 'project'}
              title={activeProject.name}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-[11px] border border-white/[.08] bg-white/[.06] px-2.5 py-2 text-left transition-colors hover:bg-white/[.10]',
                collapsed && 'justify-center px-0',
              )}
            >
              <span className="h-2 w-2 shrink-0 rounded-full shadow-[0_0_0_3px_rgba(255,255,255,0.12)]" style={{ backgroundColor: activeAccent }} aria-hidden />
              {!collapsed && (
                <>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[13px] font-semibold text-white">{activeProject.name}</span>
                    <span className="truncate text-[11px] text-white/50">{activeProject.client ?? 'Active project'}</span>
                  </span>
                  <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 text-white/45 transition-transform', panel === 'project' && 'rotate-180')} />
                </>
              )}
            </button>
            {panel === 'project' && (
              <div role="menu" aria-label="Switch project" className={panelCls(false)}>
                <div className="border-b border-[#EFEBE0] px-3.5 py-2">
                  <p className="text-[10px] font-bold uppercase tracking-[0.09em] text-[#6B6B6B]">Switch project</p>
                </div>
                <ul className="max-h-72 overflow-y-auto py-1">
                  {projects.map((p) => {
                    const active = p.id === activeProjectId;
                    return (
                      <li key={p.id}>
                        <button
                          type="button"
                          role="menuitemradio"
                          aria-checked={active}
                          onClick={() => { setActiveProject(p.id); setPanel(null); }}
                          className={cn(
                            'flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[13px] transition-colors',
                            active ? 'bg-[#E5F2EA] text-[#246F47]' : 'text-[#3A3A3A] hover:bg-[#FAF8F2]',
                          )}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-semibold">{p.name}</span>
                            {p.client && <span className="block truncate text-[11.5px] text-[#6B6B6B]">{p.client}</span>}
                          </span>
                          {active && <Check className="h-3.5 w-3.5 shrink-0 text-[#2F8F5C]" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <div className="border-t border-[#E6E1D4] px-3.5 py-2">
                  <Link
                    to="/projects"
                    onClick={() => setPanel(null)}
                    className="flex items-center justify-between text-[12.5px] font-semibold text-[#6B6B6B] hover:text-[#1A1A1A]"
                  >
                    All projects <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            )}
          </>
        )}

        {/* Search — routes to the Jobs board's search */}
        {!collapsed && !isCustomer && (
          <label className="flex items-center gap-2 rounded-[11px] border border-white/[.08] bg-white/[.06] px-2.5 py-2 text-white/50 transition-colors focus-within:border-white/[.28] focus-within:bg-white/[.10]">
            <Search className="h-4 w-4 shrink-0" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submitSearch(); }}
              placeholder="Search jobs, clients…"
              className="min-w-0 flex-1 bg-transparent text-[13px] text-white placeholder:text-white/40 focus:outline-none"
            />
            <span className="shrink-0 rounded-[5px] border border-white/[.14] bg-white/[.10] px-1.5 py-px text-[10.5px] font-semibold text-white/55">/</span>
          </label>
        )}
      </div>

      {/* ── Grouped nav ────────────────────────────────────────────────────── */}
      {/* No flex-1: the nav is content-height so the account block sits directly
          beneath the last item. Any spare rail height falls to the very bottom
          (reads as "rail continues"), instead of a void wedged between the nav
          and a bottom-pinned account card. min-h-0 keeps it scrollable if a very
          short viewport ever overflows. */}
      <nav className="flex min-h-0 flex-col gap-4 overflow-y-auto px-3 pb-2 pt-3.5">
        {groups.map((group, gi) => (
          <div key={group.label ?? gi} className="flex flex-col gap-0.5">
            {group.label && (
              collapsed
                ? <div aria-hidden className="mx-2.5 mb-2 h-px bg-white/10" />
                : (
                  <div className="px-2.5 pb-1.5 text-[10.5px] font-bold uppercase tracking-[0.11em] text-white/[.38]">
                    {group.label}
                  </div>
                )
            )}
            {group.items.map((item) => {
              const active = isActive(item.path);
              const hasFlyout = !!item.flyout;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  title={item.label}
                  aria-current={active ? 'page' : undefined}
                  aria-haspopup={hasFlyout ? 'menu' : undefined}
                  aria-expanded={hasFlyout ? flyout?.item.path === item.path : undefined}
                  onMouseEnter={hasFlyout ? (e) => scheduleOpen(item, e.currentTarget) : undefined}
                  onMouseLeave={hasFlyout ? scheduleClose : undefined}
                  onClick={hasFlyout ? closeFlyoutNow : undefined}
                  onKeyDown={hasFlyout ? (e) => { if (e.key === 'ArrowRight') { e.preventDefault(); scheduleOpen(item, e.currentTarget); } } : undefined}
                  className={cn(
                    'flex items-center gap-[11px] rounded-[10px] px-2.5 py-[9px] text-[13.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2F8F5C]',
                    active ? 'bg-[#2F8F5C] text-white' : 'text-white/[.72] hover:bg-white/[.07] hover:text-white',
                    collapsed && 'justify-center px-0 py-2.5',
                  )}
                >
                  <item.icon className={cn('h-[17px] w-[17px] shrink-0', active ? 'text-white' : 'text-white/55')} strokeWidth={active ? 2 : 1.75} />
                  {!collapsed && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Hover mega-menu (portaled beside the rail). */}
      {flyout && (
        <NavFlyout
          item={flyout.item}
          anchor={flyout.anchor}
          onClose={closeFlyoutNow}
          onEnter={cancelClose}
          onLeave={scheduleClose}
        />
      )}

      {/* ── Bottom: notifications + user card ─────────────────────────────── */}
      <div className="relative flex flex-col gap-0.5 border-t border-white/[.08] px-3 pb-3.5 pt-2.5">
        <button
          type="button"
          onClick={() => setPanel(panel === 'notifications' ? null : 'notifications')}
          aria-haspopup="menu"
          aria-expanded={panel === 'notifications'}
          title="Notifications"
          className={cn(
            'flex items-center gap-[11px] rounded-[10px] px-2.5 py-[9px] text-[13.5px] font-medium text-white/[.72] transition-colors hover:bg-white/[.07] hover:text-white',
            collapsed && 'justify-center px-0 py-2.5',
          )}
        >
          <span className="relative shrink-0">
            <Bell className="h-[17px] w-[17px] text-white/55" strokeWidth={1.75} />
            {collapsed && unreadCount > 0 && (
              <span aria-hidden className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-[#C44545]" />
            )}
          </span>
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1 truncate text-left">Notifications</span>
              {unreadCount > 0 && (
                <span className="shrink-0 rounded-full bg-[#C44545] px-[7px] py-px text-[11px] font-semibold tabular-nums text-white">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </>
          )}
        </button>
        {panel === 'notifications' && (
          <div className={cn(panelCls(true), 'w-[280px]', !collapsed && 'inset-x-auto left-3')}>
            <div className="flex items-center justify-between border-b border-[#EFEBE0] px-3.5 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-[0.09em] text-[#6B6B6B]">Notifications</p>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={() => { markAllAsRead(); setPanel(null); }}
                  className="text-[11.5px] font-semibold text-[#246F47] hover:text-[#2F8F5C]"
                >
                  Mark all read
                </button>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <p className="px-4 py-8 text-center text-[12.5px] text-[#6B6B6B]">No notifications yet</p>
              ) : (
                notifications.slice(0, 12).map((n) => {
                  const Icon = notifIcon(n.type);
                  return (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => {
                        markAsRead(n.id);
                        setPanel(null);
                        if (n.type === 'stock_allocation') {
                          const jobId = (n.metadata as { serviceJobId?: string } | undefined)?.serviceJobId;
                          navigate(jobId ? `/jobs?job=${jobId}` : '/stock');
                        }
                      }}
                      className={cn('flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-[#FAF8F2]', !n.read && 'bg-[#E5F2EA]/50')}
                    >
                      <span className={cn('grid h-7 w-7 shrink-0 place-items-center rounded-[9px]', notifColor(n.type))}>
                        <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[12.5px] font-medium leading-snug text-[#3A3A3A]">{n.title}</span>
                        <span className="block truncate text-[11px] text-[#6B6B6B]">{n.message}</span>
                        <span className="block text-[10px] text-[#A0A0A0]">{format(new Date(n.createdAt), 'MMM d, h:mm a')}</span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => setPanel(panel === 'user' ? null : 'user')}
          aria-haspopup="menu"
          aria-expanded={panel === 'user'}
          title={currentUser.fullName}
          className={cn(
            'mt-1 flex w-full items-center gap-2.5 rounded-[11px] p-2 text-left transition-colors hover:bg-white/[.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2F8F5C]',
            collapsed && 'justify-center p-2',
          )}
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#10B981] text-[12.5px] font-semibold text-[#0C2B1D]" style={{ fontFamily: FRAUNCES }}>
            {initials}
          </span>
          {!collapsed && (
            <>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[13px] font-semibold text-white">{currentUser.fullName}</span>
                <span className="truncate text-[11px] text-white/50">{roleLabel}</span>
              </span>
              <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 text-white/45 transition-transform', panel === 'user' && 'rotate-180')} />
            </>
          )}
        </button>
        {panel === 'user' && (
          <div role="menu" className={panelCls(true)}>
            <button
              type="button"
              role="menuitem"
              onClick={() => { setPanel(null); navigate('/settings'); }}
              className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] font-medium text-[#3A3A3A] transition-colors hover:bg-[#FAF8F2] hover:text-[#1A1A1A]"
            >
              <Settings className="h-4 w-4 text-[#A0A0A0]" /> Settings
            </button>
            <div className="mx-2 h-px bg-[#E6E1D4]" />
            <button
              type="button"
              role="menuitem"
              onClick={() => { setPanel(null); void logout(); }}
              className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] font-medium text-[#C44545] transition-colors hover:bg-[#FBE5E5]"
            >
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}

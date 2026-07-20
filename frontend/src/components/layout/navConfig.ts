// ─────────────────────────────────────────────────────────────────────────────
// components/layout/navConfig.ts — the app's navigation model (P9.B).
//
// One source of truth consumed by BOTH shells: AppSidebar (desktop ink rail,
// grouped) and BottomTabBar (phone, ≤4 tabs + More sheet). Extracted from the
// retired TopNav so role gates can never drift between the two.
//
// Groups encode the business's real shape, not decoration:
//   Operations    — the field: home base, jobs, stock, safety
//   Commerce      — the money: sales (quotes/invoices/catalogue)
//   Relationships — the people: customers, messages
//   Company       — admin (gated)
// ─────────────────────────────────────────────────────────────────────────────

import {
  LayoutDashboard, FolderOpen, MessageSquare, HardHat, ShieldCheck, Wrench,
  ClipboardList, ReceiptText, Package, FileText, BookOpen,
} from 'lucide-react';
import {
  canSeeAdminDashboard,
  canManageMaintenance,
  canManageSales,
  canManageServiceJobs,
  canCreateProject,
  canViewJobsBoard,
  canViewStock,
  isFieldRole,
} from '../../lib/permissions';
import type { User, Profile } from '../../types';
import type { CreateIntent } from '../../store/createModal';
import type { ToneKey } from '../../pages/gantt/components/ledger';

export type GatePrincipal = User | null;

/** One row in a nav item's hover mega-menu (left column). `search` is the query
 *  string appended to the item's path — '' means the base path. `tone` colours
 *  the status dot to match that lifecycle stage on the board/register (omit for
 *  neutral "view" rows like the board or projects). */
export interface NavSubView {
  label: string;
  search: string;
  tone?: ToneKey;
}

/** One "Create New" action in a nav item's hover mega-menu (right column).
 *  Dispatches a CreateIntent to the app-level create switchboard. */
export interface NavCreateAction {
  label: string;
  intent: CreateIntent;
  gate?: (p: GatePrincipal) => boolean;
}

export interface NavFlyout {
  subViews: NavSubView[];
  createActions: NavCreateAction[];
}

export interface NavItem {
  label: string;
  icon: typeof LayoutDashboard;
  path: string;
  /** Optional visibility gate. Omitted → always visible. */
  gate?: (p: GatePrincipal) => boolean;
  /** Optional SimPro-style hover mega-menu (Jobs / Quotes / Invoices). */
  flyout?: NavFlyout;
}

export interface NavGroup {
  /** 10px uppercase group label in the rail; null = ungrouped (customer). */
  label: string | null;
  items: NavItem[];
}

// ── Item definitions (moved verbatim from TopNav so gates stay identical) ────

const JOBS: NavItem      = {
  label: 'Jobs', icon: ClipboardList, path: '/jobs', gate: canViewJobsBoard,
  flyout: {
    subViews: [
      { label: 'Job Board',   search: '' },
      { label: 'Pending',     search: 'status=pending',     tone: 'slate' },
      { label: 'In progress', search: 'status=in_progress', tone: 'amber' },
      { label: 'Complete',    search: 'status=completed',   tone: 'sage' },
      { label: 'Invoiced',    search: 'status=invoiced',    tone: 'violet' },
      { label: 'Archived',    search: 'status=archived',    tone: 'ink' },
      { label: 'Projects',    search: 'view=projects' },
    ],
    createActions: [
      { label: 'Service job',   intent: 'job:service',       gate: canManageServiceJobs },
      { label: 'Project job',   intent: 'job:project',       gate: canManageServiceJobs },
      { label: 'Gantt project', intent: 'job:gantt-project', gate: canCreateProject },
    ],
  },
};
const STOCK: NavItem     = { label: 'Stock',     icon: Package,       path: '/stock',     gate: canViewStock };
const CUSTOMERS: NavItem = { label: 'Customers', icon: Wrench,        path: '/customers', gate: canManageMaintenance };
const MESSAGES: NavItem  = { label: 'Messages',  icon: MessageSquare, path: '/messages' };
const QUOTES: NavItem    = {
  label: 'Quotes', icon: FileText, path: '/quotes', gate: canManageSales,
  flyout: {
    subViews: [
      { label: 'Open',              search: '',              tone: 'ink' },
      { label: 'Progress',          search: 'view=progress', tone: 'slate' },
      { label: 'Approved',          search: 'view=approved', tone: 'sage' },
      { label: 'Complete',          search: 'view=complete', tone: 'emerald' },
      { label: 'Closed / Archived', search: 'view=closed',   tone: 'red' },
    ],
    createActions: [
      { label: 'Service quote', intent: 'quote:service' },
      { label: 'Project quote', intent: 'quote:project' },
    ],
  },
};
const INVOICES: NavItem  = {
  label: 'Invoices', icon: ReceiptText, path: '/invoices', gate: canManageSales,
  flyout: {
    subViews: [
      { label: 'Open',       search: '',                tone: 'slate' },
      { label: 'Overdue',    search: 'view=overdue',    tone: 'red' },
      { label: 'Paid',       search: 'view=paid',       tone: 'sage' },
      { label: 'Draft',      search: 'view=draft',      tone: 'ink' },
      { label: 'Variations', search: 'view=variations', tone: 'violet' },
    ],
    createActions: [
      { label: 'New invoice',  intent: 'invoice:blank' },
      { label: 'From a quote', intent: 'invoice:from-quote' },
      { label: 'From a job',   intent: 'invoice:from-job' },
    ],
  },
};
const CATALOGUE: NavItem = { label: 'Catalogue', icon: BookOpen,      path: '/catalogue', gate: canManageSales };
const SAFETY: NavItem    = { label: 'Safety',    icon: HardHat,       path: '/safety' };
const ADMIN: NavItem     = { label: 'Admin',     icon: ShieldCheck,   path: '/admin',     gate: canSeeAdminDashboard };

const CUSTOMER_NAV: NavItem[] = [
  { label: 'My maintenance', icon: Wrench, path: '/customer' },
];

// The Welcome deck retired (P9.B): every internal role's home is the
// role-lensed Dashboard. Field staff still see it labelled "Home" — that's
// what it is to them.
function homeNavItemFor(principal: User | Profile | null): NavItem {
  return isFieldRole(principal)
    ? { label: 'Home',      icon: LayoutDashboard, path: '/dashboard' }
    : { label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' };
}

// Suppliers think in purchase orders and deliveries → "Materials"; everyone
// else sees the portfolio it is → "Projects". Internal staff reach projects
// through the Jobs hub, so they don't get the standalone entry.
function projectsNavItemFor(principal: User | Profile | null): NavItem {
  const isSupplier = principal?.securityGroup === 'supplier';
  return { label: isSupplier ? 'Materials' : 'Projects', icon: FolderOpen, path: '/projects' };
}

// ── Assembly ─────────────────────────────────────────────────────────────────

/** Grouped, role-gated nav for the desktop rail. `gateUser` is currentUser
 *  (carries securityGroup for every gate); `principal` picks role-aware
 *  labels/paths (profile preferred). */
export function buildNavGroups(principal: User | Profile | null, gateUser: GatePrincipal): NavGroup[] {
  if (principal?.securityGroup === 'customer') {
    return [{ label: null, items: CUSTOMER_NAV }];
  }
  const showProjects = !canViewJobsBoard(gateUser);
  const groups: NavGroup[] = [
    {
      label: 'Operations',
      items: [
        homeNavItemFor(principal),
        ...(showProjects ? [projectsNavItemFor(principal)] : []),
        JOBS, STOCK, SAFETY,
      ],
    },
    { label: 'Commerce', items: [QUOTES, INVOICES, CATALOGUE] },
    { label: 'Relationships', items: [CUSTOMERS, MESSAGES] },
    { label: 'Company', items: [ADMIN] },
  ];
  return groups
    .map((g) => ({ ...g, items: g.items.filter((i) => (i.gate ? i.gate(gateUser) : true)) }))
    .filter((g) => g.items.length > 0);
}

/** Flat gated list (the old TopNav drawer order) — feeds the More sheet. */
export function buildNavFlat(principal: User | Profile | null, gateUser: GatePrincipal): NavItem[] {
  return buildNavGroups(principal, gateUser).flatMap((g) => g.items);
}

/** Phone tab bar: ≤4 role-preferred tabs; the rest go to the More sheet.
 *  Customers get none — the portal owns its own shell. */
export function bottomTabsFor(
  principal: User | Profile | null,
  gateUser: GatePrincipal,
): { tabs: NavItem[]; more: NavItem[] } {
  if (principal?.securityGroup === 'customer') return { tabs: [], more: [] };

  const all = buildNavFlat(principal, gateUser);
  const preferred = isFieldRole(principal)
    ? ['/dashboard', '/jobs', '/stock', '/messages']
    : canViewJobsBoard(gateUser)
      ? ['/dashboard', '/jobs', '/customers', '/messages']
      : ['/dashboard', '/projects', '/messages', '/safety']; // supplier / stakeholder

  const tabs: NavItem[] = [];
  for (const path of preferred) {
    const item = all.find((i) => i.path === path);
    if (item && tabs.length < 4) tabs.push(item);
  }
  // Fill any empty slots in flat order (a gate may have removed a preferred tab).
  for (const item of all) {
    if (tabs.length >= 4) break;
    if (!tabs.includes(item)) tabs.push(item);
  }
  const more = all.filter((i) => !tabs.includes(i));
  return { tabs, more };
}

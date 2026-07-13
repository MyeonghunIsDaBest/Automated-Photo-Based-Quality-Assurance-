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
  ClipboardList, ReceiptText, Package,
} from 'lucide-react';
import {
  canSeeAdminDashboard,
  canManageMaintenance,
  canManageSales,
  canViewJobsBoard,
  canViewStock,
  isFieldRole,
} from '../../lib/permissions';
import type { User, Profile } from '../../types';

export type GatePrincipal = User | null;

export interface NavItem {
  label: string;
  icon: typeof LayoutDashboard;
  path: string;
  /** Optional visibility gate. Omitted → always visible. */
  gate?: (p: GatePrincipal) => boolean;
}

export interface NavGroup {
  /** 10px uppercase group label in the rail; null = ungrouped (customer). */
  label: string | null;
  items: NavItem[];
}

// ── Item definitions (moved verbatim from TopNav so gates stay identical) ────

const JOBS: NavItem      = { label: 'Jobs',      icon: ClipboardList, path: '/jobs',      gate: canViewJobsBoard };
const STOCK: NavItem     = { label: 'Stock',     icon: Package,       path: '/stock',     gate: canViewStock };
const CUSTOMERS: NavItem = { label: 'Customers', icon: Wrench,        path: '/customers', gate: canManageMaintenance };
const MESSAGES: NavItem  = { label: 'Messages',  icon: MessageSquare, path: '/messages' };
const SALES: NavItem     = { label: 'Sales',     icon: ReceiptText,   path: '/sales',     gate: canManageSales };
const SAFETY: NavItem    = { label: 'Safety',    icon: HardHat,       path: '/safety' };
const ADMIN: NavItem     = { label: 'Admin',     icon: ShieldCheck,   path: '/admin',     gate: canSeeAdminDashboard };

const CUSTOMER_NAV: NavItem[] = [
  { label: 'My maintenance', icon: Wrench, path: '/customer' },
];

function homeNavItemFor(principal: User | Profile | null): NavItem {
  return isFieldRole(principal)
    ? { label: 'Home',      icon: LayoutDashboard, path: '/home' }
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
    { label: 'Commerce', items: [SALES] },
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
    ? ['/home', '/jobs', '/stock', '/messages']
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

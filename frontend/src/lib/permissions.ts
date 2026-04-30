import type { Profile, SecurityGroup, User, UserRole, Permission } from '../types';

// ─── Security-group write entitlements ──────────────────────────────────────
// Source of truth for "what can this account write?". Reads stay open across
// the app (the admin dashboard is the only read-gated surface, handled by
// `canSeeAdminDashboard`).
const ENTITY_BY_GROUP: Record<SecurityGroup, ReadonlySet<string>> = {
  company_admin: new Set(['*']),
  administrator: new Set(['users', 'stakeholders', 'suppliers']),
  construction_mgr: new Set(['tasks', 'projects', 'comments']),
  project_manager: new Set(['tasks', 'projects', 'comments', 'reports']),
  site_manager: new Set(['tasks', 'photos', 'comments']),
  worker: new Set(['photos', 'comments']),
};

function groupCanWrite(group: SecurityGroup | undefined, entity: string): boolean {
  if (!group) return false;
  const allowed = ENTITY_BY_GROUP[group];
  if (!allowed) return false;
  return allowed.has('*') || allowed.has(entity);
}

// ─── Legacy 5-role allowlist (kept so existing UI keeps compiling) ─────────
const ROLE_WRITE_ALLOWLIST: Record<UserRole, ReadonlySet<string>> = {
  admin: new Set(['*']),
  supervisor: new Set(['tasks', 'photos', 'comments']),
  inspector: new Set(['comments']),
  subcontractor: new Set(['photos', 'comments']),
  stakeholder: new Set(['comments']),
};

function canWrite(user: User | null, entity: string): boolean {
  if (!user) return false;
  // Prefer the security_group-based check when present (real Supabase users);
  // fall back to the legacy role allowlist for any remaining mock paths.
  if (user.securityGroup) return groupCanWrite(user.securityGroup, entity);
  const allowed = ROLE_WRITE_ALLOWLIST[user.role];
  if (!allowed) return false;
  return allowed.has('*') || allowed.has(entity);
}

export function canEditTasks(user: User | null): boolean {
  return canWrite(user, 'tasks');
}

export function canCreateProjects(user: User | null): boolean {
  if (user?.securityGroup) return groupCanWrite(user.securityGroup, 'projects');
  return user?.role === 'admin';
}

export function canEditProjects(user: User | null): boolean {
  if (user?.securityGroup) return groupCanWrite(user.securityGroup, 'projects');
  return user?.role === 'admin';
}

export function canDeleteTasks(user: User | null): boolean {
  if (user?.securityGroup) {
    return user.securityGroup === 'company_admin' || user.securityGroup === 'project_manager';
  }
  return user?.role === 'admin' || user?.role === 'supervisor';
}

export function canUploadPhotos(user: User | null): boolean {
  return canWrite(user, 'photos');
}

export function canAddComments(user: User | null): boolean {
  return canWrite(user, 'comments');
}

export function hasPermission(user: User | null, permission: Permission): boolean {
  return !!user?.permissions?.includes(permission);
}

export function canViewFinance(user: User | null): boolean {
  if (user?.securityGroup) {
    return user.securityGroup === 'company_admin' || user.securityGroup === 'project_manager';
  }
  return hasPermission(user, 'finance');
}

// ─── Admin-dashboard gates (drive Sidebar/TopNav visibility + RequireAuth) ─
// Accept either a Profile (post-auth) or the legacy User (in case some
// caller still has only that shape).
type AdminPrincipal = Profile | User | null | undefined;

function principalGroup(p: AdminPrincipal): SecurityGroup | undefined {
  if (!p) return undefined;
  if ('securityGroup' in p && p.securityGroup) return p.securityGroup;
  return undefined;
}

export function canSeeAdminDashboard(p: AdminPrincipal): boolean {
  const g = principalGroup(p);
  return g === 'company_admin' || g === 'administrator';
}

export function canManageUsers(user: AdminPrincipal): boolean {
  return canSeeAdminDashboard(user);
}

export function canManageStakeholders(user: AdminPrincipal): boolean {
  return canSeeAdminDashboard(user);
}

export function canManageSuppliers(user: AdminPrincipal): boolean {
  return canSeeAdminDashboard(user);
}

// Only Company Admin can change a user's security_group to/from
// `company_admin` itself — Administrators can manage everyone else.
export function canAssignSecurityGroup(actor: AdminPrincipal, target: SecurityGroup): boolean {
  const actorGroup = principalGroup(actor);
  if (actorGroup === 'company_admin') return true;
  if (actorGroup === 'administrator') return target !== 'company_admin';
  return false;
}

// Human-readable summary used by the Login page (legacy demo card flow).
// Kept intact even though the new login no longer renders demo cards — some
// tests / Storybook stories still consume this.
export function describeAccess(user: User): string[] {
  const lines: string[] = [];
  lines.push(canEditTasks(user) ? 'Can edit Gantt tasks' : 'Read-only Gantt');
  lines.push(canAddComments(user) ? 'Can leave notes (issue / accuracy)' : 'Cannot leave notes');
  lines.push(canViewFinance(user) ? 'Can view financials' : 'Financials hidden');
  return lines;
}

export const SECURITY_GROUP_LABELS: Record<SecurityGroup, string> = {
  company_admin: 'Company Admin',
  administrator: 'Administrator',
  construction_mgr: 'Construction Manager',
  project_manager: 'Project Manager',
  site_manager: 'Site Manager',
  worker: 'Worker',
};

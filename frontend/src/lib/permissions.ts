// ─────────────────────────────────────────────────────────────────────────────
// permissions.ts — Phase A unified gate.
//
// Every UI gate routes through this file. The single source of truth is
// `CAPABILITIES_BY_GROUP` in `./auth/capabilities` — these helpers are thin
// projections of that map. The legacy 5-role allowlist is kept as a graceful
// fallback for any mock-data paths that still emit a `User` without a
// `securityGroup`; Phase E removes it.
// ─────────────────────────────────────────────────────────────────────────────

import type { Profile, SecurityGroup, User, UserRole, Permission } from '../types';
import { capabilitiesFor, type Capabilities } from './auth/capabilities';

// AdminPrincipal — accept Profile (post-auth) or User (legacy mock paths).
type AdminPrincipal = Profile | User | null | undefined;

function principalGroup(p: AdminPrincipal): SecurityGroup | undefined {
  if (!p) return undefined;
  if ('securityGroup' in p && p.securityGroup) return p.securityGroup;
  return undefined;
}

function caps(p: AdminPrincipal): Capabilities {
  return capabilitiesFor(principalGroup(p));
}

// ─── Legacy 5-role allowlist ─────────────────────────────────────────────
// @deprecated Kept only so demo/mock data paths that emit a `User` without a
// `securityGroup` still pass basic gates. Phase E deletes this once all
// callers route through `securityGroup` + capabilities.
const ROLE_WRITE_ALLOWLIST: Record<UserRole, ReadonlySet<string>> = {
  admin: new Set(['*']),
  supervisor: new Set(['tasks', 'photos', 'comments']),
  inspector: new Set(['comments']),
  subcontractor: new Set(['photos', 'comments']),
  stakeholder: new Set(['comments']),
};

function legacyCanWrite(user: User | null, entity: string): boolean {
  if (!user) return false;
  const allowed = ROLE_WRITE_ALLOWLIST[user.role];
  if (!allowed) return false;
  return allowed.has('*') || allowed.has(entity);
}

// ─── Standard gates ──────────────────────────────────────────────────────

export function canEditTasks(user: User | null): boolean {
  if (user?.securityGroup) return caps(user).editGanttTasks;
  return legacyCanWrite(user, 'tasks');
}

export function canCreateProjects(user: User | null): boolean {
  if (user?.securityGroup) return caps(user).createProjects;
  return user?.role === 'admin';
}

export function canEditProjects(user: User | null): boolean {
  if (user?.securityGroup) return caps(user).editProjects;
  return user?.role === 'admin';
}

export function canDeleteTasks(user: User | null): boolean {
  if (user?.securityGroup) {
    return user.securityGroup === 'company_admin' || user.securityGroup === 'project_manager';
  }
  return user?.role === 'admin' || user?.role === 'supervisor';
}

export function canUploadPhotos(user: User | null): boolean {
  if (user?.securityGroup) return caps(user).uploadPhotos;
  return legacyCanWrite(user, 'photos');
}

export function canAddComments(user: User | null): boolean {
  if (user?.securityGroup) return caps(user).viewMessages; // comments require message access
  return legacyCanWrite(user, 'comments');
}

export function hasPermission(user: User | null, permission: Permission): boolean {
  return !!user?.permissions?.includes(permission);
}

export function canViewFinance(user: User | null): boolean {
  if (user?.securityGroup) return caps(user).viewReportsFinance;
  return hasPermission(user, 'finance');
}

// ─── Phase A — new helpers ────────────────────────────────────────────────

export function canViewGallery(p: AdminPrincipal): boolean {
  return caps(p).viewGallery;
}

export function canViewMessages(p: AdminPrincipal): boolean {
  return caps(p).viewMessages;
}

export function canViewProjectFiles(p: AdminPrincipal, _projectId?: string): boolean {
  // Per-project scoping requires a project_members / project_stakeholders
  // table that doesn't exist yet (deferred to follow-up migration). Until
  // then the capability flag is the only gate — RLS filters the rows.
  return caps(p).viewProjectFiles;
}

export function canConfirmAIAnalysis(p: AdminPrincipal): boolean {
  return caps(p).confirmAIAnalysis;
}

export function canExportAuditLog(p: AdminPrincipal): boolean {
  return caps(p).exportAuditLog;
}

export function canViewProject(p: AdminPrincipal, _projectId?: string): boolean {
  // Same rationale as canViewProjectFiles — capability flag now, per-project
  // RLS scoping in a follow-up migration. UI may still narrow further.
  return caps(p).viewProjects;
}

export function canViewSupplierTab(p: AdminPrincipal, _projectId?: string): boolean {
  return caps(p).viewGanttSupplierTab;
}

export function canEditSupplierTab(p: AdminPrincipal, _projectId?: string): boolean {
  return caps(p).editGanttSupplierTab;
}

export function canViewSafetyIncident(p: AdminPrincipal): boolean {
  return caps(p).viewSafety;
}

export function canResolveSafetyIncident(p: AdminPrincipal): boolean {
  return caps(p).resolveSafetyIncident;
}

export function canLogSafetyIncident(p: AdminPrincipal): boolean {
  return caps(p).logSafetyIncident;
}

// ─── Admin-dashboard gates (drive Sidebar/TopNav visibility + RequireAuth) ─

export function canSeeAdminDashboard(p: AdminPrincipal): boolean {
  return caps(p).seeAdminDashboard;
}

export function canManageUsers(user: AdminPrincipal): boolean {
  return caps(user).manageUsers;
}

export function canManageStakeholders(user: AdminPrincipal): boolean {
  return caps(user).manageStakeholders;
}

export function canManageSuppliers(user: AdminPrincipal): boolean {
  return caps(user).manageSuppliers;
}

// Per-project config (migration 09) — same admin-tier gate as suppliers /
// stakeholders. Worker / inspector / stakeholder / supplier tiers see the
// read-only mirror in ProjectDetailModal but can't reach the edit surface.
export function canManageProjectConfig(p: AdminPrincipal): boolean {
  return caps(p).manageStakeholders;
}

// ─── Owner-tier gates (migration 11) ────────────────────────────────────────
// `is_owner` is orthogonal to the security_group capability matrix — it's a
// flag any admin can have, and it grants the right to rescue other admins
// (reset password, edit profile, grant/revoke ownership). Permission helpers
// below check `profile.isOwner` directly because the capability table is
// keyed by security_group, not by this flag.

function isOwnerPrincipal(p: AdminPrincipal): boolean {
  if (!p) return false;
  return 'isOwner' in p ? p.isOwner === true : false;
}

export function canRescueAdmin(p: AdminPrincipal): boolean {
  return isOwnerPrincipal(p);
}

export function canGrantOwnership(p: AdminPrincipal): boolean {
  return isOwnerPrincipal(p);
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
  stakeholder: 'Stakeholder',
  supplier: 'Supplier',
};

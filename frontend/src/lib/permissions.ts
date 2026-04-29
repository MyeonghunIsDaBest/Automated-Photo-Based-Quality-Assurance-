import type { User, UserRole, Permission } from '../types';

// Single source of truth for what each role is allowed to write.
// Reads are deliberately left open for the demo (everyone can view the Gantt,
// photos, reports). Finance is gated separately via the Permission flag below.
const ROLE_WRITE_ALLOWLIST: Record<UserRole, ReadonlySet<string>> = {
  admin: new Set(['*']),
  supervisor: new Set(['tasks', 'photos', 'comments']),
  inspector: new Set(['comments']),
  subcontractor: new Set(['photos', 'comments']),
  stakeholder: new Set(['comments']),
};

function canWrite(user: User | null, entity: string): boolean {
  if (!user) return false;
  const allowed = ROLE_WRITE_ALLOWLIST[user.role];
  if (!allowed) return false;
  return allowed.has('*') || allowed.has(entity);
}

export function canEditTasks(user: User | null): boolean {
  return canWrite(user, 'tasks');
}

export function canDeleteTasks(user: User | null): boolean {
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
  return hasPermission(user, 'finance');
}

export function canManageUsers(user: User | null): boolean {
  return hasPermission(user, 'user_management') || user?.role === 'admin';
}

// Human-readable summary used by the Login page to show what each demo
// account will be able to do once signed in.
export function describeAccess(user: User): string[] {
  const lines: string[] = [];
  lines.push(canEditTasks(user) ? 'Can edit Gantt tasks' : 'Read-only Gantt');
  lines.push(canAddComments(user) ? 'Can leave notes (issue / accuracy)' : 'Cannot leave notes');
  lines.push(canViewFinance(user) ? 'Can view financials' : 'Financials hidden');
  return lines;
}

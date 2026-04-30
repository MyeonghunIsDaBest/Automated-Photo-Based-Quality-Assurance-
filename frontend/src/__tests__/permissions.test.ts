import { describe, expect, it } from 'vitest';
import {
  canSeeAdminDashboard,
  canAssignSecurityGroup,
  canEditTasks,
} from '../lib/permissions';
import type { Profile, SecurityGroup } from '../types';

function makeProfile(group: SecurityGroup, overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'user-1',
    email: 'test@example.com',
    firstName: 'Test',
    lastName: 'User',
    securityGroup: group,
    isActive: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('canSeeAdminDashboard', () => {
  const cases: Array<[SecurityGroup, boolean]> = [
    ['company_admin', true],
    ['administrator', true],
    ['construction_mgr', false],
    ['project_manager', false],
    ['site_manager', false],
    ['worker', false],
  ];

  it.each(cases)('returns %s for %s', (group, expected) => {
    expect(canSeeAdminDashboard(makeProfile(group))).toBe(expected);
  });

  it('returns false for null/undefined', () => {
    expect(canSeeAdminDashboard(null)).toBe(false);
    expect(canSeeAdminDashboard(undefined)).toBe(false);
  });
});

describe('canAssignSecurityGroup', () => {
  it('company_admin can assign any role including company_admin', () => {
    const actor = makeProfile('company_admin');
    expect(canAssignSecurityGroup(actor, 'company_admin')).toBe(true);
    expect(canAssignSecurityGroup(actor, 'worker')).toBe(true);
  });

  it('administrator can assign every role except company_admin', () => {
    const actor = makeProfile('administrator');
    expect(canAssignSecurityGroup(actor, 'administrator')).toBe(true);
    expect(canAssignSecurityGroup(actor, 'worker')).toBe(true);
    expect(canAssignSecurityGroup(actor, 'company_admin')).toBe(false);
  });

  it('non-admin roles cannot assign anything', () => {
    expect(canAssignSecurityGroup(makeProfile('site_manager'), 'worker')).toBe(false);
    expect(canAssignSecurityGroup(makeProfile('worker'), 'worker')).toBe(false);
  });
});

describe('canEditTasks (security_group path)', () => {
  it('grants edit to manager-tier groups', () => {
    expect(
      canEditTasks({
        id: '1',
        email: '',
        fullName: '',
        role: 'admin',
        securityGroup: 'project_manager',
      })
    ).toBe(true);
  });

  it('denies edit to worker', () => {
    expect(
      canEditTasks({
        id: '1',
        email: '',
        fullName: '',
        role: 'subcontractor',
        securityGroup: 'worker',
      })
    ).toBe(false);
  });
});

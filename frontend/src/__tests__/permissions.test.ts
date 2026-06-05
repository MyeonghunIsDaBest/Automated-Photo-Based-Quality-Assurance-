import { describe, expect, it } from 'vitest';
import {
  canSeeAdminDashboard,
  canAssignSecurityGroup,
  canEditTasks,
  canViewGallery,
  canViewMessages,
  canViewProjectFiles,
  canConfirmAIAnalysis,
  canExportAuditLog,
  canViewProject,
  canViewSupplierTab,
  canEditSupplierTab,
  canResolveSafetyIncident,
  canLogSafetyIncident,
  canViewFinance,
  canCreateProject,
  canDeleteProject,
} from '../lib/permissions';
import { CAPABILITIES_BY_GROUP } from '../lib/auth/capabilities';
import type { Profile, SecurityGroup } from '../types';

const ALL_GROUPS: SecurityGroup[] = [
  'company_admin',
  'administrator',
  'construction_mgr',
  'project_manager',
  'worker',
  'stakeholder',
  'supplier',
  'dev',
];

function makeProfile(group: SecurityGroup, overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'user-1',
    email: 'test@example.com',
    firstName: 'Test',
    lastName: 'User',
    securityGroup: group,
    isActive: true,
    isOwner: false,
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
    ['worker', false],
    ['stakeholder', false],
    ['supplier', false],
    ['dev', true],
  ];

  it.each(cases)('returns %s for %s', (group, expected) => {
    expect(canSeeAdminDashboard(makeProfile(group))).toBe(expected);
  });

  it('returns false for null/undefined', () => {
    expect(canSeeAdminDashboard(null)).toBe(false);
    expect(canSeeAdminDashboard(undefined)).toBe(false);
  });
});

describe('Phase A capability matrix', () => {
  it('every security_group is mapped in CAPABILITIES_BY_GROUP', () => {
    for (const g of ALL_GROUPS) {
      expect(CAPABILITIES_BY_GROUP[g]).toBeDefined();
    }
  });

  it('matrix matches the documented rules (snapshot)', () => {
    // Captures the truth table once; any silent drift fails CI.
    expect(CAPABILITIES_BY_GROUP).toMatchSnapshot();
  });
});

describe('Phase A: new helpers per security_group', () => {
  // Truth from feature-access-matrix.md. If any cell here changes, also
  // update the matrix doc + the CAPABILITIES_BY_GROUP map.
  const expectations: Record<SecurityGroup, Record<string, boolean>> = {
    company_admin: {
      gallery: true, messages: true, projectFiles: true, confirmAI: true,
      exportAudit: true, viewProject: true, supplierTabView: true,
      supplierTabEdit: true, resolveSafety: true, logSafety: true, finance: true,
    },
    administrator: {
      gallery: true, messages: true, projectFiles: true, confirmAI: true,
      exportAudit: true, viewProject: true, supplierTabView: true,
      supplierTabEdit: false, resolveSafety: false, logSafety: false, finance: false,
    },
    construction_mgr: {
      gallery: true, messages: true, projectFiles: true, confirmAI: true,
      exportAudit: false, viewProject: true, supplierTabView: true,
      supplierTabEdit: true, resolveSafety: true, logSafety: true, finance: false,
    },
    project_manager: {
      gallery: true, messages: true, projectFiles: true, confirmAI: true,
      exportAudit: false, viewProject: true, supplierTabView: true,
      supplierTabEdit: true, resolveSafety: true, logSafety: true, finance: true,
    },
    worker: {
      gallery: true, messages: true, projectFiles: true, confirmAI: false,
      exportAudit: false, viewProject: true, supplierTabView: false,
      supplierTabEdit: false, resolveSafety: false, logSafety: true, finance: false,
    },
    stakeholder: {
      gallery: true, messages: true, projectFiles: true, confirmAI: false,
      exportAudit: false, viewProject: true, supplierTabView: true,
      supplierTabEdit: false, resolveSafety: false, logSafety: false, finance: true,
    },
    supplier: {
      gallery: true, messages: true, projectFiles: true, confirmAI: false,
      exportAudit: false, viewProject: true, supplierTabView: true,
      supplierTabEdit: false, resolveSafety: false, logSafety: false, finance: false,
    },
    dev: {
      gallery: true, messages: true, projectFiles: true, confirmAI: true,
      exportAudit: true, viewProject: true, supplierTabView: true,
      supplierTabEdit: true, resolveSafety: true, logSafety: true, finance: true,
    },
  };

  it.each(ALL_GROUPS)('helpers for %s match the matrix', (group) => {
    const p = makeProfile(group);
    const e = expectations[group];
    expect(canViewGallery(p)).toBe(e.gallery);
    expect(canViewMessages(p)).toBe(e.messages);
    expect(canViewProjectFiles(p, 'proj-1')).toBe(e.projectFiles);
    expect(canConfirmAIAnalysis(p)).toBe(e.confirmAI);
    expect(canExportAuditLog(p)).toBe(e.exportAudit);
    expect(canViewProject(p, 'proj-1')).toBe(e.viewProject);
    expect(canViewSupplierTab(p, 'proj-1')).toBe(e.supplierTabView);
    expect(canEditSupplierTab(p, 'proj-1')).toBe(e.supplierTabEdit);
    expect(canResolveSafetyIncident(p)).toBe(e.resolveSafety);
    expect(canLogSafetyIncident(p)).toBe(e.logSafety);
    // canViewFinance accepts a User; legacy mock paths still feed it that
    // shape, so build a User from the profile here.
    expect(canViewFinance({
      id: p.id, email: p.email, fullName: '', role: 'admin', securityGroup: group,
    })).toBe(e.finance);
  });

  it('all helpers return false for null', () => {
    expect(canViewGallery(null)).toBe(false);
    expect(canViewMessages(null)).toBe(false);
    expect(canConfirmAIAnalysis(null)).toBe(false);
    expect(canExportAuditLog(null)).toBe(false);
    expect(canViewProject(null)).toBe(false);
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
    expect(canAssignSecurityGroup(makeProfile('worker'), 'worker')).toBe(false);
    expect(canAssignSecurityGroup(makeProfile('supplier'), 'worker')).toBe(false);
  });

  it('dev (superuser) can assign any role; nobody else can mint dev', () => {
    expect(canAssignSecurityGroup(makeProfile('dev'), 'company_admin')).toBe(true);
    expect(canAssignSecurityGroup(makeProfile('dev'), 'dev')).toBe(true);
    expect(canAssignSecurityGroup(makeProfile('company_admin'), 'dev')).toBe(false);
    expect(canAssignSecurityGroup(makeProfile('administrator'), 'dev')).toBe(false);
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

describe('owner-only project lifecycle', () => {
  it('canCreateProject is true only for owners', () => {
    expect(canCreateProject(makeProfile('company_admin', { isOwner: true }))).toBe(true);
    expect(canCreateProject(makeProfile('company_admin'))).toBe(false);
    expect(canCreateProject(makeProfile('administrator'))).toBe(false);
    expect(canCreateProject(makeProfile('worker'))).toBe(false);
    expect(canCreateProject(null)).toBe(false);
  });

  it('canDeleteProject is true only for owners', () => {
    expect(canDeleteProject(makeProfile('company_admin', { isOwner: true }))).toBe(true);
    expect(canDeleteProject(makeProfile('administrator', { isOwner: true }))).toBe(true);
    expect(canDeleteProject(makeProfile('worker'))).toBe(false);
    expect(canDeleteProject(null)).toBe(false);
  });
});

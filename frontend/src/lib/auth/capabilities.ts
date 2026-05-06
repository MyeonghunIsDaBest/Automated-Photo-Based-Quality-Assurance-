// ─────────────────────────────────────────────────────────────────────────────
// capabilities.ts — Phase A truth table.
//
// Single mapping from `security_group` → boolean capability flags. Every UI
// gate routes through this map (via the helpers in `lib/permissions.ts`); a
// snapshot test asserts the matrix against the documented design so silent
// drift fails CI. Mirror updates in `plans/.../feature-access-matrix.md`.
//
// Three flag families:
//   • View flags (canViewX): does this group see the surface at all?
//   • Write flags (canEditX, canCreateX): does this group mutate it?
//   • Specialised gates (confirmAIAnalysis, exportAuditLog, etc).
//
// "Scoped" reads (stakeholder, supplier) still set the view flag to true —
// per-row visibility is enforced by Postgres RLS once project_stakeholders /
// project_suppliers join tables land. Until then, UI sees the surface but
// the data behind it is filtered upstream.
// ─────────────────────────────────────────────────────────────────────────────

import type { SecurityGroup } from '../../types';

export interface Capabilities {
  // Top-level surfaces
  viewDashboard: boolean;
  viewProjects: boolean;
  createProjects: boolean;
  editProjects: boolean;
  viewGantt: boolean;
  editGanttTasks: boolean;
  /** Worker-only: can edit % completion on tasks they're assigned to. */
  editOwnTaskProgress: boolean;
  viewUpload: boolean;
  uploadPhotos: boolean;
  viewGallery: boolean;
  viewMessages: boolean;
  viewReports: boolean;
  viewReportsFinance: boolean;
  exportReports: boolean;
  viewSafety: boolean;
  logSafetyIncident: boolean;
  resolveSafetyIncident: boolean;
  viewFiles: boolean;
  viewProjectFiles: boolean;
  viewSettings: boolean;

  // Admin surfaces
  seeAdminDashboard: boolean;
  manageUsers: boolean;
  manageStakeholders: boolean;
  manageSuppliers: boolean;
  assignCompanyAdmin: boolean;

  // Audit + AI
  viewAudit: boolean;
  exportAuditLog: boolean;
  viewAIAnalysis: boolean;
  confirmAIAnalysis: boolean;
  reanalyzeWithOpus: boolean;
  viewGPSCoordinates: boolean;

  // Gantt sub-tabs (project workspace)
  viewGanttSiteDiary: boolean;
  writeGanttSiteDiary: boolean;
  viewGanttPunchList: boolean;
  writeGanttPunchList: boolean;
  viewGanttSupplierTab: boolean;
  editGanttSupplierTab: boolean;
  viewGanttInventory: boolean;
  writeGanttInventory: boolean;
  viewGanttPlans: boolean;
  writeGanttPlans: boolean;
}

const ALL_OFF: Capabilities = {
  viewDashboard: false,
  viewProjects: false,
  createProjects: false,
  editProjects: false,
  viewGantt: false,
  editGanttTasks: false,
  editOwnTaskProgress: false,
  viewUpload: false,
  uploadPhotos: false,
  viewGallery: false,
  viewMessages: false,
  viewReports: false,
  viewReportsFinance: false,
  exportReports: false,
  viewSafety: false,
  logSafetyIncident: false,
  resolveSafetyIncident: false,
  viewFiles: false,
  viewProjectFiles: false,
  viewSettings: false,
  seeAdminDashboard: false,
  manageUsers: false,
  manageStakeholders: false,
  manageSuppliers: false,
  assignCompanyAdmin: false,
  viewAudit: false,
  exportAuditLog: false,
  viewAIAnalysis: false,
  confirmAIAnalysis: false,
  reanalyzeWithOpus: false,
  viewGPSCoordinates: false,
  viewGanttSiteDiary: false,
  writeGanttSiteDiary: false,
  viewGanttPunchList: false,
  writeGanttPunchList: false,
  viewGanttSupplierTab: false,
  editGanttSupplierTab: false,
  viewGanttInventory: false,
  writeGanttInventory: false,
  viewGanttPlans: false,
  writeGanttPlans: false,
};

export const CAPABILITIES_BY_GROUP: Record<SecurityGroup, Capabilities> = {
  company_admin: {
    ...ALL_OFF,
    viewDashboard: true,
    viewProjects: true,
    createProjects: true,
    editProjects: true,
    viewGantt: true,
    editGanttTasks: true,
    editOwnTaskProgress: true,
    viewUpload: true,
    uploadPhotos: true,
    viewGallery: true,
    viewMessages: true,
    viewReports: true,
    viewReportsFinance: true,
    exportReports: true,
    viewSafety: true,
    logSafetyIncident: true,
    resolveSafetyIncident: true,
    viewFiles: true,
    viewProjectFiles: true,
    viewSettings: true,
    seeAdminDashboard: true,
    manageUsers: true,
    manageStakeholders: true,
    manageSuppliers: true,
    assignCompanyAdmin: true,
    viewAudit: true,
    exportAuditLog: true,
    viewAIAnalysis: true,
    confirmAIAnalysis: true,
    reanalyzeWithOpus: true,
    viewGPSCoordinates: true,
    viewGanttSiteDiary: true,
    writeGanttSiteDiary: true,
    viewGanttPunchList: true,
    writeGanttPunchList: true,
    viewGanttSupplierTab: true,
    editGanttSupplierTab: true,
    viewGanttInventory: true,
    writeGanttInventory: true,
    viewGanttPlans: true,
    writeGanttPlans: true,
  },
  administrator: {
    ...ALL_OFF,
    viewDashboard: true,
    viewProjects: true,
    viewGantt: true,
    viewGallery: true,
    viewMessages: true,
    viewReports: true,
    exportReports: true,
    viewSafety: true,
    viewFiles: true,
    viewProjectFiles: true,
    viewSettings: true,
    seeAdminDashboard: true,
    manageUsers: true,
    manageStakeholders: true,
    manageSuppliers: true,
    viewAudit: true,
    exportAuditLog: true,
    viewAIAnalysis: true,
    confirmAIAnalysis: true,
    viewGPSCoordinates: true,
    viewGanttSiteDiary: true,
    viewGanttPunchList: true,
    viewGanttSupplierTab: true,
    viewGanttInventory: true,
    viewGanttPlans: true,
  },
  construction_mgr: {
    ...ALL_OFF,
    viewDashboard: true,
    viewProjects: true,
    createProjects: true,
    editProjects: true,
    viewGantt: true,
    editGanttTasks: true,
    editOwnTaskProgress: true,
    viewUpload: true,
    uploadPhotos: true,
    viewGallery: true,
    viewMessages: true,
    viewReports: true,
    exportReports: true,
    viewSafety: true,
    logSafetyIncident: true,
    resolveSafetyIncident: true,
    viewFiles: true,
    viewProjectFiles: true,
    viewSettings: true,
    viewAudit: true,
    viewAIAnalysis: true,
    confirmAIAnalysis: true,
    reanalyzeWithOpus: true,
    viewGPSCoordinates: true,
    viewGanttSiteDiary: true,
    writeGanttSiteDiary: true,
    viewGanttPunchList: true,
    writeGanttPunchList: true,
    viewGanttSupplierTab: true,
    editGanttSupplierTab: true,
    viewGanttInventory: true,
    writeGanttInventory: true,
    viewGanttPlans: true,
    writeGanttPlans: true,
  },
  project_manager: {
    ...ALL_OFF,
    viewDashboard: true,
    viewProjects: true,
    createProjects: true,
    editProjects: true,
    viewGantt: true,
    editGanttTasks: true,
    editOwnTaskProgress: true,
    viewUpload: true,
    uploadPhotos: true,
    viewGallery: true,
    viewMessages: true,
    viewReports: true,
    viewReportsFinance: true,
    exportReports: true,
    viewSafety: true,
    logSafetyIncident: true,
    resolveSafetyIncident: true,
    viewFiles: true,
    viewProjectFiles: true,
    viewSettings: true,
    viewAudit: true,
    viewAIAnalysis: true,
    confirmAIAnalysis: true,
    reanalyzeWithOpus: true,
    viewGPSCoordinates: true,
    viewGanttSiteDiary: true,
    writeGanttSiteDiary: true,
    viewGanttPunchList: true,
    writeGanttPunchList: true,
    viewGanttSupplierTab: true,
    editGanttSupplierTab: true,
    viewGanttInventory: true,
    writeGanttInventory: true,
    viewGanttPlans: true,
    writeGanttPlans: true,
  },
  site_manager: {
    ...ALL_OFF,
    viewDashboard: true,
    viewProjects: true,
    viewGantt: true,
    editGanttTasks: true,
    editOwnTaskProgress: true,
    viewUpload: true,
    uploadPhotos: true,
    viewGallery: true,
    viewMessages: true,
    viewReports: true,
    exportReports: true,
    viewSafety: true,
    logSafetyIncident: true,
    resolveSafetyIncident: true,
    viewFiles: true,
    viewProjectFiles: true,
    viewSettings: true,
    viewAIAnalysis: true,
    confirmAIAnalysis: true,
    viewGPSCoordinates: true,
    viewGanttSiteDiary: true,
    writeGanttSiteDiary: true,
    viewGanttPunchList: true,
    writeGanttPunchList: true,
    viewGanttSupplierTab: true,
    viewGanttInventory: true,
    writeGanttInventory: true,
    viewGanttPlans: true,
    writeGanttPlans: true,
  },
  worker: {
    ...ALL_OFF,
    viewDashboard: true,
    viewProjects: true,
    viewGantt: true,
    editOwnTaskProgress: true,
    viewUpload: true,
    uploadPhotos: true,
    viewGallery: true,
    viewMessages: true,
    viewSafety: true,
    logSafetyIncident: true,
    viewFiles: true,
    viewProjectFiles: true,
    viewSettings: true,
    viewAIAnalysis: true,
    viewGanttSiteDiary: true,
    writeGanttSiteDiary: true,
    viewGanttPunchList: true,
    writeGanttPunchList: true,
    viewGanttInventory: true,
    viewGanttPlans: true,
  },
  stakeholder: {
    ...ALL_OFF,
    viewDashboard: true,
    viewProjects: true,
    viewGantt: true,
    viewGallery: true,
    viewMessages: true,
    viewReports: true,
    viewSafety: true,
    viewFiles: true,
    viewProjectFiles: true,
    viewSettings: true,
    viewAIAnalysis: true,
    viewGanttSiteDiary: true,
    viewGanttPunchList: true,
    viewGanttSupplierTab: true,
    viewGanttInventory: true,
    viewGanttPlans: true,
  },
  supplier: {
    ...ALL_OFF,
    viewDashboard: true,
    viewProjects: true,
    viewGantt: true,
    viewGallery: true,
    viewMessages: true,
    viewReports: true,
    viewSafety: true,
    viewFiles: true,
    viewProjectFiles: true,
    viewSettings: true,
    // Supplier sees their own scoped rows on the Supplier tab — RLS filters
    // by `supplier_id = own` once join tables land. Until then UI also
    // applies a client-side filter using `profile.supplierId`.
    viewGanttSupplierTab: true,
  },
};

export function capabilitiesFor(group: SecurityGroup | undefined | null): Capabilities {
  if (!group) return ALL_OFF;
  return CAPABILITIES_BY_GROUP[group] ?? ALL_OFF;
}

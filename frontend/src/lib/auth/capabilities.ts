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

  // Role-experience flags (supplier/stakeholder cockpits + management lenses).
  respondToOwnOrders: boolean;      // supplier — Accept/Hold/Decline their own POs
  releasePaymentMilestone: boolean; // stakeholder — sign off / release a payment milestone
  editFinance: boolean;             // write budgets/invoices (read is `viewReportsFinance`)
  viewPortfolioRollup: boolean;     // construction_mgr / admins — multi-project rollup band

  // Maintenance domain
  createMaintenanceRequest: boolean; // customer portal — file a request
  viewOwnMaintenance: boolean;       // customer portal — see own requests/properties
  manageMaintenance: boolean;        // internal — /maintenance area

  // Service jobs + jobs board
  viewJobsBoard: boolean;      // see /jobs kanban (all internal staff)
  manageServiceJobs: boolean;  // create/delete jobs, drag-schedule on the board
  logServiceJobWork: boolean;  // add photos/time entries, flip status from the field

  // TradeDesk P1 — catalogue / prebuilds / import
  manageCatalogue: boolean;

  // TradeDesk P2 — quotes, invoices, variations
  manageSales: boolean;
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
  respondToOwnOrders: false,
  releasePaymentMilestone: false,
  editFinance: false,
  viewPortfolioRollup: false,
  createMaintenanceRequest: false,
  viewOwnMaintenance: false,
  manageMaintenance: false,
  viewJobsBoard: false,
  manageServiceJobs: false,
  logServiceJobWork: false,
  manageCatalogue: false,
  manageSales: false,
};

// Hidden developer superuser — EVERY flag on. Built from ALL_OFF's keys so new
// capabilities are auto-granted to dev. DB/seed-assigned only (never in pickers).
const DEV_ALL: Capabilities = Object.fromEntries(
  Object.keys(ALL_OFF).map((k) => [k, true]),
) as unknown as Capabilities;

export const CAPABILITIES_BY_GROUP: Record<SecurityGroup, Capabilities> = {
  company_admin: {
    ...ALL_OFF,
    editFinance: true,
    viewPortfolioRollup: true,
    manageMaintenance: true,
    viewJobsBoard: true,
    manageServiceJobs: true,
    logServiceJobWork: true,
    manageCatalogue: true,
    manageSales: true,
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
    viewPortfolioRollup: true,
    manageMaintenance: true,
    viewJobsBoard: true,
    manageServiceJobs: true,
    logServiceJobWork: true,
    manageCatalogue: true,
    manageSales: true,
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
    viewPortfolioRollup: true,
    manageMaintenance: true,
    viewJobsBoard: true,
    manageServiceJobs: true,
    logServiceJobWork: true,
    manageCatalogue: true,
    manageSales: true,
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
    editFinance: true,
    manageMaintenance: true,
    viewJobsBoard: true,
    manageServiceJobs: true,
    logServiceJobWork: true,
    manageCatalogue: true,
    manageSales: true,
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
  worker: {
    ...ALL_OFF,
    viewJobsBoard: true,
    logServiceJobWork: true,
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
    viewReportsFinance: true,      // finance sponsor — READ-only (editFinance stays false)
    releasePaymentMilestone: true,
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
    respondToOwnOrders: true,
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
  // ─── Maintenance portal — property owner / customer ──────────────────────
  // External role scoped entirely to the maintenance portal. No access to
  // project/Gantt/finance surfaces; can only file and view their own requests.
  // Portal page scopes data by `currentProfile.customerId` via RLS.
  customer: {
    ...ALL_OFF,
    createMaintenanceRequest: true,
    viewOwnMaintenance: true,
  },
  // Hidden developer superuser — full access (see DEV_ALL).
  dev: DEV_ALL,
};

export function capabilitiesFor(group: SecurityGroup | undefined | null): Capabilities {
  if (!group) return ALL_OFF;
  return CAPABILITIES_BY_GROUP[group] ?? ALL_OFF;
}

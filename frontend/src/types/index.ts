/**
 * @deprecated Use `SecurityGroup` instead. The 5-role union is preserved only
 * for back-compat with seeded mock data and pre-Phase-A UI surfaces. New code
 * MUST gate via `securityGroup` and the helpers in `lib/permissions.ts`.
 */
export type UserRole = 'admin' | 'supervisor' | 'stakeholder' | 'inspector' | 'subcontractor';

// Security group sourced from the Postgres `security_group` enum
// (see supabase/migrations/00_init.sql + 01_security_group_expand.sql + 48).
//
// `administrator` is DEPRECATED — consolidated into the single `company_admin`
// admin tier (the owner-vs-admin distinction is carried by the `isOwner` badge).
// Migration 48 reassigns existing administrators → company_admin; the enum value
// stays dormant (Postgres can't drop it) and it's removed from all role pickers.
// `dev` is a hidden superuser — DB/seed-assigned only, never shown in pickers.
export type SecurityGroup =
  | 'company_admin'
  | 'administrator'  // @deprecated — alias of company_admin; not assignable
  | 'construction_mgr'
  | 'project_manager'
  | 'worker'
  | 'stakeholder'
  | 'supplier'
  | 'customer'       // external property owner — maintenance portal only
  | 'dev';            // hidden developer superuser — DB/seed only

// Document expiry alert window (matches the `expiry_alert` enum in 0005).
export type ExpiryAlert = '2_months' | '1_month' | '3_weeks' | '2_weeks' | '1_week';

// Permissions are orthogonal flags layered on top of security_group — used
// for capabilities that don't cleanly fit a tier (e.g. `quality_inspect`
// gives a worker authority to file QA notes, `finance` opens the Reports
// finance tab to a manager who'd otherwise miss it).
export type Permission =
  | 'finance'
  | 'export'
  | 'audit_export'
  | 'user_management'
  | 'quality_inspect';

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  securityGroup?: SecurityGroup;
  permissions?: Permission[];
  organization?: 'company' | 'client';
  projectId?: string;
  zoneAccess?: string[];
  avatar?: string;
}

// Mirrors the `profiles` table.
export interface Profile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  mobile?: string;
  emergencyContactName?: string;
  emergencyContactEmail?: string;
  emergencyContactMobile?: string;
  securityGroup: SecurityGroup;
  isActive: boolean;
  // Founding-owner flag (migration 11). Orthogonal to `securityGroup` — any
  // admin-tier user can also be an owner, and ownership grants the right to
  // rescue other admins (reset password / edit profile) via the
  // `admin-rescue-user` Edge Function. `is_active=false` users with
  // `is_owner=true` still count as ownership "seats" — guards in the UI +
  // Edge function prevent the last-owner from being revoked.
  isOwner: boolean;
  avatarUrl?: string;
  // Phase A linkage: stakeholder/supplier accounts point at their org-wide
  // directory record so the UI can render company name, contacts, etc.
  // CHECK constraint enforces at most one of these is set.
  stakeholderId?: string | null;
  supplierId?: string | null;
  // Maintenance domain linkage (migration 59): customer accounts point at
  // their customers directory record for portal scoping.
  customerId?: string | null;
  createdAt: string;
  updatedAt: string;
}

// Mirrors `user_documents`.
export interface UserDocument {
  id: string;
  userId: string;
  documentName: string;
  referenceNo?: string;
  expiryDate?: string;
  expiryAlert?: ExpiryAlert;
  notes?: string;
  storagePath: string;
  fileSizeKb: number;
  uploadedBy?: string;
  uploadedAt: string;
}

// Mirrors `stakeholders` plus the Phase D-2 child rows surfaced in the
// list view. `contacts` and `projectIds` are populated by `listStakeholders`
// in one shot; mutators may leave them undefined.
export interface Stakeholder {
  id: string;
  companyName: string;
  firstName: string;
  lastName: string;
  email?: string;
  mobile?: string;
  role?: string;
  notes?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
  contacts?: StakeholderContact[];
  projectIds?: string[];
}

// Mirrors `stakeholder_contacts`. Each company can carry an arbitrary number
// of additional contacts on top of the primary one stored on the parent row.
export interface StakeholderContact {
  id: string;
  stakeholderId: string;
  name: string;
  email?: string;
  mobile?: string;
  role?: string;
  notes?: string;
  createdAt: string;
}

export interface SupplierAddress {
  street?: string;
  suburb?: string;
  state?: string;
  postcode?: string;
  country?: string;
}

// Mirrors `suppliers` + child tables.
export interface Supplier {
  id: string;
  name: string;
  abn?: string;
  website?: string;
  mainEmail?: string;
  mainContactNumber?: string;
  mainContactName?: string;
  accountsEmail?: string;
  accountsContactNumber?: string;
  accountsContactName?: string;
  mainAddress?: SupplierAddress;
  postalAddress?: SupplierAddress;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  contacts?: SupplierContact[];
  branches?: SupplierBranch[];
}

export interface SupplierContact {
  id: string;
  supplierId: string;
  branchId?: string;
  name: string;
  email?: string;
  mobile?: string;
  role?: string;
  notes?: string;
  createdAt: string;
}

export interface SupplierBranch {
  id: string;
  supplierId: string;
  branchName: string;
  email?: string;
  contactNumber?: string;
  contactName?: string;
  accountsEmail?: string;
  accountsContactNumber?: string;
  accountsContactName?: string;
  address?: SupplierAddress;
  postalAddress?: SupplierAddress;
  createdAt: string;
}

// Maps the 8-tier security group onto the legacy 5-role union so older UI
// keeps working. Phase A widened the enum but kept this shim — Phase E
// removes it once all callers gate via `securityGroup` directly.
export function mapSecurityGroupToLegacyRole(group: SecurityGroup): UserRole {
  switch (group) {
    case 'company_admin':
    case 'administrator':
      return 'admin';
    case 'construction_mgr':
    case 'project_manager':
      return 'supervisor';
    case 'worker':
      return 'subcontractor';
    case 'stakeholder':
      return 'stakeholder';
    case 'supplier':
      // Supplier has no legacy equivalent; closest read-only viewer is
      // 'stakeholder' from the legacy taxonomy.
      return 'stakeholder';
    case 'customer':
      // Customer (maintenance portal) has no legacy equivalent; maps to
      // the closest read-only role from the legacy taxonomy.
      return 'stakeholder';
    case 'dev':
      return 'admin'; // hidden superuser → legacy admin
  }
}

// Builds the legacy `User` shape from a Supabase `Profile` so existing
// components reading `currentUser.role` / `.fullName` keep functioning.
export function profileToUser(p: Profile): User {
  const fullName = [p.firstName, p.lastName].filter(Boolean).join(' ').trim() || p.email;
  const isCompany =
    p.securityGroup === 'company_admin' || p.securityGroup === 'administrator';
  const isClient =
    p.securityGroup === 'stakeholder' || p.securityGroup === 'supplier' ||
    p.securityGroup === 'customer';
  return {
    id: p.id,
    email: p.email,
    fullName,
    role: mapSecurityGroupToLegacyRole(p.securityGroup),
    securityGroup: p.securityGroup,
    avatar: p.avatarUrl,
    organization: isCompany ? 'company' : isClient ? 'client' : undefined,
  };
}

// Project Types
export interface Project {
  id: string;
  name: string;
  description: string;
  clientName: string;
  startDate: string;
  endDate: string;
  status: 'active' | 'completed' | 'on_hold' | 'delayed';
  createdAt: string;
}

// Per-project membership (migration 16). One row per (project, user) pair
// linked by an admin/PM. `accepted_at` is stamped on the user's first /home
// visit via `accept_all_my_pending_invites`; `removed_at` is the soft-delete
// for uninvites. Field-role users (worker/stakeholder/supplier) only see
// projects with an active membership row.
export interface ProjectMember {
  id: string;
  projectId: string;
  userId: string;
  /** PM/admin who placed the invite — may be null after that user is deleted. */
  invitedBy: string | null;
  invitedAt: string;
  acceptedAt: string | null;
  /** Soft-delete timestamp. When set, the row is treated as inactive. */
  removedAt: string | null;
  notes: string | null;
}

// Per-project configuration — sidecar to Project (one row per project, edited
// via /admin → Project config). See migration 09 + lib/api/projectConfig.ts.
// Every AI threshold, progression weight, branding token, and operating mode
// the system uses lives here so two pilot sites can run on the same deploy
// with different policies.
export interface ProjectConfig {
  projectId: string;
  aiAutoUpdateThreshold: number;
  aiReviewQueueThreshold: number;
  aiDefaultModel: string;
  progressionMode: 'manual' | 'human_assisted' | 'full_auto';
  weightChecklist: number;
  weightPhotos: number;
  weightAi: number;
  targetPhotosPerTask: number;
  manualFloorAllowed: boolean;
  phashThreshold: number;
  accentColor: string | null;
  logoStoragePath: string | null;
  reportCadence: 'none' | 'weekly' | 'monthly';
  updatedBy: string | null;
  updatedAt: string;
}

// Zone Types
export interface Zone {
  id: string;
  projectId: string;
  name: string;
  description: string;
  colorCode: string;
}

// Task Status
export type TaskStatus = 'not_started' | 'in_progress' | 'complete' | 'delayed' | 'blocked';

// `ConstructionPhase`, `SafetyFlag`, `QualityFlag` live in `lib/ai/contract.ts`
// (the Photo-QA contract) and are re-exported here for back-compat — many
// pre-Phase-C files import from `~/types`. Edit the canonical file.
import type {
  ConstructionPhase,
  SafetyFlag,
  QualityFlag,
  AnalysisStatus,
  AnalysisAction,
  SafetySeverity,
} from '../lib/ai/contract';
export type {
  ConstructionPhase,
  SafetyFlag,
  QualityFlag,
  AnalysisStatus,
  AnalysisAction,
  SafetySeverity,
};

// Gantt Task
export interface Task {
  id: string;
  projectId: string;
  zoneId?: string;
  assigneeId?: string;
  parentTaskId?: string;
  name: string;
  phase: ConstructionPhase;
  startDate: string;
  endDate: string;
  durationDays: number;
  percentComplete: number;
  status: TaskStatus;
  dependencies: string[];
  photoCount: number;
  lastUpdated: string;
  updateSource: 'ai_auto' | 'manual' | 'supervisor';
  notes: string[];
  /** Migration 12 — true for the 8 per-project phase anchor rows that the
   *  `trg_seed_phase_anchors` trigger creates on project insert. Anchors
   *  are non-deletable; their `percent_complete` is rolled up from children
   *  (`rolled_up_pct(task_id)` SQL helper, or `rolledUpPct(task, allTasks)`
   *  on the frontend). Sub-tasks have `isPhaseAnchor=false` + a non-null
   *  `parentTaskId` pointing at the anchor. */
  isPhaseAnchor: boolean;
  /** Migration 44 — true for user-created custom phases (top-level groups
   *  beyond the built-in 8). Custom anchors are grouped + displayed by `name`
   *  and carry a placeholder `phase` value. */
  isCustom?: boolean;
}

/** Rolled-up % for a phase anchor (avg of its children), or the task's own
 *  `percentComplete` for leaves. Mirrors the `rolled_up_pct()` SQL helper. */
export function rolledUpPct(task: Task, allTasks: Task[]): number {
  if (!task.isPhaseAnchor) return task.percentComplete;
  const children = allTasks.filter((t) => t.parentTaskId === task.id);
  if (children.length === 0) return 0;
  const sum = children.reduce((acc, c) => acc + c.percentComplete, 0);
  return Math.round(sum / children.length);
}

// Photo Types
export interface Photo {
  id: string;
  projectId: string;
  zoneId?: string;
  taskId?: string;
  uploadedBy: string;
  filename: string;
  storageUrl: string;
  thumbnailUrl?: string;
  fileSizeKb: number;
  width: number;
  height: number;
  takenAt?: string;
  uploadedAt: string;
  gpsLat?: number;
  gpsLng?: number;
  notes?: string;
  aiAnalyzed: boolean;
  aiAnalysis?: AIAnalysis;
}

// AI Analysis — typed against the Phase C contract. Closed unions for the
// flag arrays (`SafetyFlag`, `QualityFlag`) so chips render with consistent
// icons + severity colour. Phase C also adds analysisStatus/rationale/
// rawResponse to mirror `02_phase_c_seam.sql`.
export interface AIAnalysis {
  id: string;
  photoId: string;
  modelUsed: string;
  phaseDetected: ConstructionPhase | null;
  completionPct: number;
  confidence: number;
  safetyFlags: SafetyFlag[];
  qualityFlags: QualityFlag[];
  materials: string[];
  suggestedTask: string | null;
  actionTaken: AnalysisAction;
  analysisStatus: AnalysisStatus;
  rationale: string | null;
  rawResponse: unknown;
  analyzedAt: string;
}

// Audit Log
export interface AuditLog {
  id: string;
  projectId: string;
  userId: string;
  action: string;
  entityType: 'task' | 'photo' | 'user' | 'project' | 'project_config';
  entityId?: string;
  oldValue?: any;
  newValue?: any;
  notes?: string;
  createdAt: string;
  ipAddress?: string;
}

// Comments / Notes
export type NoteType = 'issue' | 'accuracy_check' | 'general';
export type NoteStatus = 'open' | 'resolved';

export interface Comment {
  id: string;
  taskId?: string;
  photoId?: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  userRole?: UserRole;
  content: string;
  noteType?: NoteType;
  status?: NoteStatus;
  createdAt: string;
}

// Reports
export interface Report {
  id: string;
  projectId: string;
  reportType: 'daily' | 'weekly' | 'monthly';
  generatedBy: string;
  generatedAt: string;
  dateFrom: string;
  dateTo: string;
  storageUrl?: string;
  summary: {
    photosUploaded: number;
    tasksUpdated: number;
    overallProgress: number;
    progressChange: number;
    safetyFlags: number;
  };
}

// Dashboard Stats
export interface DashboardStats {
  overallProgress: number;
  photosToday: number;
  tasksComplete: number;
  totalTasks: number;
  daysRemaining: number;
  photosThisWeek: number;
  tasksInProgress: number;
  delayedTasks: number;
}

// `ActivityFeedItem` — REMOVED. The dead Dashboard "Recent Activity" panel
// that consumed this shape was wired up to `mockActivityFeed = []` and
// never actually populated. The connectedness pass replaced the panel with
// `useProjectActivity()` from `~/lib/hooks/useProjectActivity`, which
// derives a typed `ActivityEvent[]` from the real project stores.

// Upload State
export interface UploadState {
  files: File[];
  zoneId?: string;
  taskId?: string;
  notes: string;
  isProcessing: boolean;
  progress: number;
}

// Navigation Item
export interface NavItem {
  label: string;
  icon: string;
  path: string;
  roles: UserRole[];
}

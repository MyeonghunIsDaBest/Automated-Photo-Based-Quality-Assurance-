/**
 * @deprecated Use `SecurityGroup` instead. The 5-role union is preserved only
 * for back-compat with seeded mock data and pre-Phase-A UI surfaces. New code
 * MUST gate via `securityGroup` and the helpers in `lib/permissions.ts`.
 */
export type UserRole = 'admin' | 'supervisor' | 'stakeholder' | 'inspector' | 'subcontractor';

// 8-tier security group sourced from the Postgres `security_group` enum
// (see supabase/migrations/00_init.sql + 01_security_group_expand.sql).
export type SecurityGroup =
  | 'company_admin'
  | 'administrator'
  | 'construction_mgr'
  | 'project_manager'
  | 'site_manager'
  | 'worker'
  | 'stakeholder'
  | 'supplier';

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
  avatarUrl?: string;
  // Phase A linkage: stakeholder/supplier accounts point at their org-wide
  // directory record so the UI can render company name, contacts, etc.
  // CHECK constraint enforces at most one of these is set.
  stakeholderId?: string | null;
  supplierId?: string | null;
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

// Mirrors `stakeholders`.
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
    case 'site_manager':
      return 'supervisor';
    case 'worker':
      return 'subcontractor';
    case 'stakeholder':
      return 'stakeholder';
    case 'supplier':
      // Supplier has no legacy equivalent; closest read-only viewer is
      // 'stakeholder' from the legacy taxonomy.
      return 'stakeholder';
  }
}

// Builds the legacy `User` shape from a Supabase `Profile` so existing
// components reading `currentUser.role` / `.fullName` keep functioning.
export function profileToUser(p: Profile): User {
  const fullName = [p.firstName, p.lastName].filter(Boolean).join(' ').trim() || p.email;
  const isCompany =
    p.securityGroup === 'company_admin' || p.securityGroup === 'administrator';
  const isClient =
    p.securityGroup === 'stakeholder' || p.securityGroup === 'supplier';
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
  entityType: 'task' | 'photo' | 'user' | 'project';
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

// Activity Feed Item
export interface ActivityFeedItem {
  id: string;
  type: 'photo_upload' | 'ai_analysis' | 'task_update' | 'comment' | 'report';
  message: string;
  timestamp: string;
  userId: string;
  userName: string;
  metadata?: any;
}

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

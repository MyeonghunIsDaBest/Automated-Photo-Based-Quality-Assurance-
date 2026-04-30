// User Roles (legacy 5-role union, kept for backward compat with existing UI).
// Source of truth is now `SecurityGroup` below; legacy code reads `User.role`
// via a mapping in `mapSecurityGroupToLegacyRole`.
export type UserRole = 'admin' | 'supervisor' | 'stakeholder' | 'inspector' | 'subcontractor';

// 6-tier security group sourced from the Postgres `security_group` enum
// (see supabase/migrations/0004_profiles.sql).
export type SecurityGroup =
  | 'company_admin'
  | 'administrator'
  | 'construction_mgr'
  | 'project_manager'
  | 'site_manager'
  | 'worker';

// Document expiry alert window (matches the `expiry_alert` enum in 0005).
export type ExpiryAlert = '2_months' | '1_month' | '3_weeks' | '2_weeks' | '1_week';

// Permissions are layered on top of role — orthogonal to it. A `stakeholder`
// (external client) can hold `finance` if the company chooses to grant it.
export type Permission = 'finance' | 'export' | 'audit_export' | 'user_management';

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

// Maps the new 6-tier security group onto the legacy 5-role union so older
// UI keeps working. Both Company Admin and Administrator collapse to `admin`
// because their write surface is the union of legacy admin abilities.
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
  }
}

// Builds the legacy `User` shape from a Supabase `Profile` so existing
// components reading `currentUser.role` / `.fullName` keep functioning.
export function profileToUser(p: Profile): User {
  const fullName = [p.firstName, p.lastName].filter(Boolean).join(' ').trim() || p.email;
  return {
    id: p.id,
    email: p.email,
    fullName,
    role: mapSecurityGroupToLegacyRole(p.securityGroup),
    securityGroup: p.securityGroup,
    avatar: p.avatarUrl,
    organization:
      p.securityGroup === 'company_admin' || p.securityGroup === 'administrator'
        ? 'company'
        : undefined,
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
export type ConstructionPhase = 'foundation' | 'framing' | 'electrical' | 'plumbing' | 'drywall' | 'finishing' | 'roofing' | 'excavation';

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

// AI Analysis
export interface AIAnalysis {
  id: string;
  photoId: string;
  modelUsed: string;
  phaseDetected: ConstructionPhase;
  completionPct: number;
  confidence: number;
  safetyFlags: string[];
  qualityFlags: string[];
  materials: string[];
  suggestedTask?: string;
  actionTaken: 'auto_updated' | 'confirmed' | 'skipped' | 'pending';
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

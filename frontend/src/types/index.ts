// User Roles
export type UserRole = 'admin' | 'supervisor' | 'stakeholder' | 'inspector' | 'subcontractor';

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  projectId?: string;
  zoneAccess?: string[];
  avatar?: string;
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

// Comments
export interface Comment {
  id: string;
  taskId?: string;
  photoId?: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  content: string;
  createdAt: string;
}

// Reports
export interface Report {
  id: string;
  projectId: string;
  reportType: 'daily' | 'weekly' | 'milestone';
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

import { Project, Zone, Task, Photo, User, AuditLog, Comment, Report, DashboardStats, ActivityFeedItem } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Live test bed for the photo-based QA pipeline.
//
// Most domain seeds (zones, tasks, photos, audit logs, comments, reports,
// activity feed) are intentionally empty: uploads and updates flow in via the
// app itself, so every data point is authentic to the pilot. Only the user
// directory and the project shell are seeded.
// ─────────────────────────────────────────────────────────────────────────────

// Two demo accounts to walk through the access model:
//   • admin@siteproof.com — full internal access (create projects, upload,
//     edit Gantt, view financials, manage users).
//   • visitor@siteproof.com — read-only client view; can leave notes and
//     comments on charts and tasks but cannot edit anything or see Finance.
// Replace with real auth-backed users once the backend is wired up.
export const mockUsers: User[] = [
  {
    id: 'user_admin',
    email: 'admin@siteproof.com',
    fullName: 'Jordan Casone',
    role: 'admin',
    organization: 'company',
    permissions: ['finance', 'user_management', 'audit_export', 'export'],
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=jordan',
  },
  {
    id: 'user_visitor',
    email: 'visitor@siteproof.com',
    fullName: 'Casey Visitor',
    role: 'stakeholder',
    organization: 'client',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=visitor',
  },
];

// Mock Project — single live test bed for the photo-QA pipeline
export const mockProject: Project = {
  id: 'project_1',
  name: 'Casone Electrical — QA Pilot',
  description: 'Live pilot for the SiteProof automated photo-based QA system. Upload field photos, videos, and documents from active jobs to validate AI analysis, audit trails, and reporting.',
  clientName: 'Casone Electrical Pty Ltd',
  startDate: '2026-04-01',
  endDate: '2026-12-31',
  status: 'active',
  createdAt: '2026-04-01T08:00:00Z',
};

// Empty seeds — every zone, task and photo is created in-app via the
// real flows (Project → Task → Upload). The pilot starts blank by design.
export const mockZones: Zone[] = [];
export const mockTasks: Task[] = [];
export const mockPhotos: Photo[] = [];
export const mockAuditLogs: AuditLog[] = [];
export const mockComments: Comment[] = [];
export const mockReports: Report[] = [];

// Fresh stats — every counter starts at zero until the pilot generates data.
const totalDays = Math.max(
  1,
  Math.round(
    (new Date(mockProject.endDate).getTime() - new Date().getTime()) / 86_400_000
  )
);

export const mockDashboardStats: DashboardStats = {
  overallProgress: 0,
  photosToday: 0,
  tasksComplete: 0,
  totalTasks: 0,
  daysRemaining: totalDays,
  photosThisWeek: 0,
  tasksInProgress: 0,
  delayedTasks: 0,
};

export const mockActivityFeed: ActivityFeedItem[] = [];

// Helpers — unchanged shape, but they now operate on the empty seeds and will
// pick up live data as it lands in the stores.
export const getTasksByZone = (zoneId: string): Task[] =>
  mockTasks.filter((task) => task.zoneId === zoneId);

export const getPhotosByTask = (taskId: string): Photo[] =>
  mockPhotos.filter((photo) => photo.taskId === taskId);

export const getCommentsByTask = (taskId: string): Comment[] =>
  mockComments.filter((comment) => comment.taskId === taskId);

// No historical progress trend until the pilot logs progress.
export const getProgressTrend = (): { date: string; progress: number }[] => [];

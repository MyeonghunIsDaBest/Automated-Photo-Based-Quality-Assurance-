import { create } from 'zustand';
import { Task, Comment, Report, ProjectConfig } from '../types';
import { updateTaskProgress as apiUpdateTaskProgress } from '../lib/api/tasks';
import { supabaseConfigured } from '../lib/supabase';
import { useNotificationStore, createTaskUpdate, createAIAnalysisAlert, createWeeklyReport } from './notifications';
import { demoInflightTasks } from '../data/demoInflightProject';
import { demoExtraSiteTasks } from '../data/demoExtraSites';

// Progress Trend Data Point
export interface ProgressDataPoint {
  date: string;
  progress: number;
  photosUploaded: number;
  tasksCompleted: number;
}

// File Document (renamed to avoid conflict with global Document type)
export interface ProjectDocument {
  id: string;
  projectId: string;
  taskId?: string;
  name: string;
  type: 'document' | 'photo' | 'video';
  category: 'contract' | 'permit' | 'blueprint' | 'invoice' | 'report' | 'other';
  size: number;
  uploadedBy: string;
  uploadedAt: string;
  url: string;
  thumbnailUrl?: string;
}

// Export alias for convenience
export type { ProjectDocument as Document };

// User Settings
export interface UserSettings {
  email: string;
  currentPassword?: string;
  newPassword?: string;
  confirmPassword?: string;
  notifications: {
    emailNotifications: boolean;
    safetyAlerts: boolean;
    taskUpdates: boolean;
    chatMessages: boolean;
    aiAnalysis: boolean;
    weeklyReports: boolean;
  };
  profile: {
    fullName: string;
    phone?: string;
    timezone: string;
    language: string;
  };
}

interface FeatureState {
  // Progress Tracking
  progressHistory: ProgressDataPoint[];
  addProgressData: (data: Omit<ProgressDataPoint, 'date'>) => void;
  getProgressTrend: (days?: number) => ProgressDataPoint[];
  calculateOverallProgress: () => number;
  
  // Task Management
  tasks: Task[];
  updateTaskProgress: (taskId: string, newProgress: number, source: 'ai_auto' | 'manual') => void;
  addTask: (task: Task) => void;
  // Idempotent — replace if a task with the same id exists, append otherwise.
  // Used by `useProjectTasksRealtime` so INSERT and UPDATE both route through
  // one action and a stale duplicate INSERT can't double the row.
  upsertTask: (task: Task) => void;
  // Replace one task in place (no-op if absent). Used by `saveTaskShared` to
  // mirror an authoritative DB row into the cache without filter-and-map at
  // every call site.
  updateTask: (task: Task) => void;
  deleteTask: (taskId: string) => void;
  // Bulk append used by `createProject` after creating milestones in one shot.
  appendTasks: (tasks: Task[]) => void;
  // Replace every task for a single project — used by realtime hydration
  // (`useProjectTasksRealtime`) on mount and on project switch.
  setTasksForProject: (projectId: string, tasks: Task[]) => void;
  getTasksByZone: (zoneId: string) => Task[];
  getTasksByStatus: (status: Task['status']) => Task[];
  getOverdueTasks: () => Task[];
  
  // File & Document Management
  documents: ProjectDocument[];
  uploadDocument: (doc: Omit<ProjectDocument, 'id' | 'uploadedAt'>) => void;
  deleteDocument: (id: string) => void;
  getDocumentsByType: (type: ProjectDocument['type']) => ProjectDocument[];
  getDocumentsByCategory: (category: ProjectDocument['category']) => ProjectDocument[];
  
  // Comments
  comments: Comment[];
  addComment: (comment: Omit<Comment, 'id' | 'createdAt'>) => void;
  getCommentsByTask: (taskId: string) => Comment[];
  
  // Reports
  reports: Report[];
  generateWeeklyReport: (projectId: string) => Report;
  generateReport: (projectId: string, type: Report['reportType']) => Report;
  getReportsByType: (type: Report['reportType']) => Report[];
  
  // User Settings
  userSettings: UserSettings;
  updateUserSettings: (settings: Partial<UserSettings>) => void;
  updatePassword: (currentPassword: string, newPassword: string) => Promise<{ success: boolean; error?: string }>;
  updateEmail: (email: string) => Promise<{ success: boolean; error?: string }>;
  
  // Automated Features
  runAutoProgressUpdate: () => void;
  scheduleWeeklyReports: () => void;

  // Per-project configuration (migration 09). Keyed by projectId so a project
  // switch doesn't blow away cached config for the previous one. The
  // `useProjectConfig` hook is the only writer.
  projectConfig: Record<string, ProjectConfig>;
  setProjectConfig: (config: ProjectConfig) => void;
}

export const useFeatureStore = create<FeatureState>((set, get) => ({
  // Progress Tracking
  progressHistory: [
    { date: '2024-02-01', progress: 35, photosUploaded: 45, tasksCompleted: 2 },
    { date: '2024-02-05', progress: 42, photosUploaded: 67, tasksCompleted: 3 },
    { date: '2024-02-10', progress: 48, photosUploaded: 89, tasksCompleted: 3 },
    { date: '2024-02-15', progress: 52, photosUploaded: 112, tasksCompleted: 4 },
    { date: '2024-02-20', progress: 57, photosUploaded: 145, tasksCompleted: 4 },
    { date: '2024-02-25', progress: 62, photosUploaded: 178, tasksCompleted: 4 },
    { date: '2024-02-28', progress: 67, photosUploaded: 201, tasksCompleted: 4 },
  ],

  addProgressData: (data) => {
    set((state) => ({
      progressHistory: [
        ...state.progressHistory,
        { ...data, date: new Date().toISOString().split('T')[0] },
      ],
    }));
  },

  getProgressTrend: (days = 30) => {
    const state = get();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return state.progressHistory.filter((p) => new Date(p.date) >= cutoff);
  },

  calculateOverallProgress: () => {
    const { tasks } = get();
    if (tasks.length === 0) return 0;
    const total = tasks.reduce((sum, task) => sum + task.percentComplete, 0);
    return Math.round(total / tasks.length);
  },

  // Task Management.
  // All three demo projects (Hampstead Heights + Bondi + Marrickville) seed
  // the editable Gantt unconditionally so the realistic phasing is always
  // visible — even when Supabase is configured. Realtime subscribes per-
  // project so it never overwrites these rows (their IDs don't exist on the
  // server). Live projects fill the slice normally via
  // `useProjectTasksRealtime`.
  tasks: [...demoInflightTasks, ...demoExtraSiteTasks],

  // Write-through: optimistic local update, then Supabase persist. The
  // realtime channel subscribes via `useProjectTasksRealtime` and will
  // re-apply the canonical row when it lands, so a failed PATCH self-heals
  // on the next reconnect. Source-of-truth split:
  //   - manual user updates flow through here
  //   - Edge Functions (analyze-photo, confirm-analysis) write directly to
  //     Supabase and rely on realtime to push back into the cache.
  // Safety incidents are inserted by analyze-photo on detection — no need
  // to scan local photos here (the legacy mock-data scan was a no-op).
  updateTaskProgress: (taskId, newProgress, source) => {
    const { tasks } = get();
    const task = tasks.find((t) => t.id === taskId);

    if (!task) return;

    const oldProgress = task.percentComplete;

    if (newProgress !== oldProgress) {
      useNotificationStore.getState().addNotification(
        createTaskUpdate(taskId, task.name, oldProgress, newProgress)
      );
    }

    // Optimistic local update so the UI moves instantly.
    set({
      tasks: tasks.map((t) =>
        t.id === taskId
          ? {
              ...t,
              percentComplete: newProgress,
              status: newProgress >= 100 ? 'complete' : newProgress > 0 ? 'in_progress' : 'not_started',
              lastUpdated: new Date().toISOString(),
              updateSource: source,
            }
          : t
      ),
    });

    // Persist to Supabase. No-op when not configured (dev / demo). Errors
    // are logged but not surfaced — realtime will reconcile on retry.
    if (supabaseConfigured() && newProgress !== oldProgress) {
      void apiUpdateTaskProgress(taskId, newProgress).catch((e) => {
        // eslint-disable-next-line no-console
        console.error('[updateTaskProgress] persist failed:', e);
      });
    }

    // Append a point to the progress trend on EVERY change (deduped by day —
    // the latest write of the day wins). The Dashboard/Reports chart subscribes
    // to this so each update visibly extends the curve.
    if (newProgress !== oldProgress) {
      const today = new Date().toISOString().split('T')[0];
      const updatedTasks = get().tasks;
      const overall = updatedTasks.length
        ? Math.round(updatedTasks.reduce((s, t) => s + t.percentComplete, 0) / updatedTasks.length)
        : 0;
      const completed = updatedTasks.filter((t) => t.percentComplete >= 100).length;
      set((state) => {
        const lastIndex = state.progressHistory.length - 1;
        const lastEntry = state.progressHistory[lastIndex];
        const newPoint = {
          date: today,
          progress: overall,
          // photosUploaded was previously sourced from the mock photos seed
          // (always empty); the real photo count is in useAppStore.photos
          // and isn't snapshotted into the trend. Phase E will wire it to a
          // proper aggregate query.
          photosUploaded: 0,
          tasksCompleted: completed,
        };
        if (lastEntry?.date === today) {
          // Replace today's entry with the latest snapshot.
          const next = state.progressHistory.slice(0, lastIndex);
          return { progressHistory: [...next, newPoint] };
        }
        return { progressHistory: [...state.progressHistory, newPoint] };
      });
    }
  },

  addTask: (task) => {
    set((state) => ({ tasks: [...state.tasks, task] }));
  },

  upsertTask: (task) => {
    set((state) => {
      const idx = state.tasks.findIndex((t) => t.id === task.id);
      if (idx < 0) return { tasks: [...state.tasks, task] };
      const next = state.tasks.slice();
      next[idx] = task;
      return { tasks: next };
    });
  },

  updateTask: (task) => {
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === task.id ? task : t)),
    }));
  },

  deleteTask: (taskId) => {
    set((state) => ({ tasks: state.tasks.filter((t) => t.id !== taskId) }));
  },

  appendTasks: (incoming) => {
    set((state) => ({ tasks: [...state.tasks, ...incoming] }));
  },

  setTasksForProject: (projectId, projectTasks) => {
    set((state) => ({
      tasks: [
        ...state.tasks.filter((t) => t.projectId !== projectId),
        ...projectTasks,
      ],
    }));
  },

  getTasksByZone: (zoneId) => {
    const { tasks } = get();
    return tasks.filter((t) => t.zoneId === zoneId);
  },

  getTasksByStatus: (status) => {
    const { tasks } = get();
    return tasks.filter((t) => t.status === status);
  },

  getOverdueTasks: () => {
    const { tasks } = get();
    const today = new Date();
    return tasks.filter(
      (t) => new Date(t.endDate) < today && t.percentComplete < 100
    );
  },

  // File & Document Management
  documents: [
    {
      id: 'doc_1',
      projectId: 'project_1',
      name: 'Project Proposal.pdf',
      type: 'document' as const,
      category: 'contract' as const,
      size: 2456000,
      uploadedBy: 'user_1',
      uploadedAt: '2024-04-20T10:00:00Z',
      url: '#',
    },
    {
      id: 'doc_2',
      projectId: 'project_1',
      name: 'Contract Agreement.pdf',
      type: 'document',
      category: 'contract',
      size: 1890000,
      uploadedBy: 'user_1',
      uploadedAt: '2024-04-18T14:30:00Z',
      url: '#',
    },
    {
      id: 'doc_3',
      projectId: 'project_1',
      name: 'Budget Breakdown.xlsx',
      type: 'document',
      category: 'invoice',
      size: 856000,
      uploadedBy: 'user_1',
      uploadedAt: '2024-04-15T09:15:00Z',
      url: '#',
    },
    {
      id: 'doc_4',
      projectId: 'project_1',
      name: 'Timeline Schedule.pdf',
      type: 'document',
      category: 'report',
      size: 1200000,
      uploadedBy: 'user_1',
      uploadedAt: '2024-04-12T11:00:00Z',
      url: '#',
    },
    {
      id: 'doc_5',
      projectId: 'project_1',
      name: 'Safety Guidelines.pdf',
      type: 'document',
      category: 'permit',
      size: 3100000,
      uploadedBy: 'user_1',
      uploadedAt: '2024-04-10T16:45:00Z',
      url: '#',
    },
    {
      id: 'doc_6',
      projectId: 'project_1',
      name: 'Permit Applications.pdf',
      type: 'document',
      category: 'permit',
      size: 4500000,
      uploadedBy: 'user_1',
      uploadedAt: '2024-04-08T13:20:00Z',
      url: '#',
    },
  ],

  uploadDocument: (doc) => {
    const newDoc: ProjectDocument = {
      ...doc,
      id: `doc_${Date.now()}`,
      uploadedAt: new Date().toISOString(),
    };
    set((state) => ({ documents: [newDoc, ...state.documents] }));
  },

  deleteDocument: (id) => {
    set((state) => ({ documents: state.documents.filter((d) => d.id !== id) }));
  },

  getDocumentsByType: (type) => {
    const { documents } = get();
    return documents.filter((d) => d.type === type);
  },

  getDocumentsByCategory: (category) => {
    const { documents } = get();
    return documents.filter((d) => d.category === category);
  },

  // Comments — populated via lib/api/realtime + addComment. Pre-Phase D-2
  // there's no Supabase comments table, so this stays empty until a comment
  // is posted via the task drawer.
  comments: [],

  addComment: (comment) => {
    const newComment: Comment = {
      ...comment,
      id: `comment_${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    set((state) => ({ comments: [...state.comments, newComment] }));
  },

  getCommentsByTask: (taskId) => {
    const { comments } = get();
    return comments.filter((c) => c.taskId === taskId);
  },

  // Reports — generated via generateReport() calls; pre-Phase E there's
  // no persistent reports table, so this stays empty across reload.
  reports: [],

  generateWeeklyReport: (projectId) => get().generateReport(projectId, 'weekly'),

  generateReport: (projectId, type) => {
    const { tasks, calculateOverallProgress } = get();
    const currentProgress = calculateOverallProgress();

    const windowMs =
      type === 'daily'   ? 1  * 24 * 60 * 60 * 1000 :
      type === 'weekly'  ? 7  * 24 * 60 * 60 * 1000 :
                           30 * 24 * 60 * 60 * 1000;

    const progressHistory = get().progressHistory;
    const lastProgress = progressHistory.length > 1
      ? progressHistory[progressHistory.length - 2].progress
      : 0;
    const progressChange = currentProgress - lastProgress;

    const newReport: Report = {
      id: `report_${Date.now()}`,
      projectId,
      reportType: type,
      generatedBy: 'user_1',
      generatedAt: new Date().toISOString(),
      dateFrom: new Date(Date.now() - windowMs).toISOString().split('T')[0],
      dateTo: new Date().toISOString().split('T')[0],
      summary: {
        // photosUploaded + safetyFlags previously sourced from the mock
        // photos seed (always empty). Phase E wires these to real aggregate
        // queries against `photos` + `safety_incidents`.
        photosUploaded: 0,
        tasksUpdated: tasks.filter((t) => new Date(t.lastUpdated) > new Date(Date.now() - windowMs)).length,
        overallProgress: currentProgress,
        progressChange,
        safetyFlags: 0,
      },
    };

    set((state) => ({ reports: [newReport, ...state.reports] }));

    if (type === 'weekly') {
      useNotificationStore.getState().addNotification(
        createWeeklyReport(projectId, 'Casone Electrical — QA Pilot', currentProgress, progressChange)
      );
    }

    return newReport;
  },

  getReportsByType: (type) => {
    const { reports } = get();
    return reports.filter((r) => r.reportType === type);
  },

  // User Settings
  userSettings: {
    email: 'admin@siteproof.com',
    notifications: {
      emailNotifications: true,
      safetyAlerts: true,
      taskUpdates: true,
      chatMessages: true,
      aiAnalysis: true,
      weeklyReports: true,
    },
    profile: {
      fullName: 'John Anderson',
      phone: '+1 (555) 123-4567',
      timezone: 'America/New_York',
      language: 'en',
    },
  },

  updateUserSettings: (settings) => {
    set((state) => ({
      userSettings: {
        ...state.userSettings,
        ...settings,
        notifications: {
          ...state.userSettings.notifications,
          ...(settings.notifications || {}),
        },
        profile: {
          ...state.userSettings.profile,
          ...(settings.profile || {}),
        },
      },
    }));
  },

  updatePassword: async (currentPassword, newPassword) => {
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 500));
    
    // In real app, verify currentPassword with backend
    if (currentPassword.length < 6) {
      return { success: false, error: 'Current password is incorrect' };
    }
    
    if (newPassword.length < 8) {
      return { success: false, error: 'New password must be at least 8 characters' };
    }

    return { success: true };
  },

  updateEmail: async (email) => {
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 500));
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return { success: false, error: 'Invalid email format' };
    }

    set((state) => ({
      userSettings: { ...state.userSettings, email },
    }));

    return { success: true };
  },

  // Automated Features
  runAutoProgressUpdate: () => {
    const { tasks, updateTaskProgress } = get();
    
    // Simulate AI detecting progress from new photos
    const incompleteTasks = tasks.filter(t => t.percentComplete < 100);
    
    incompleteTasks.forEach((task) => {
      // Simulate AI analysis detecting progress
      const detectedProgress = Math.min(100, task.percentComplete + Math.floor(Math.random() * 5));
      
      if (detectedProgress > task.percentComplete) {
        useNotificationStore.getState().addNotification(
          createAIAnalysisAlert(
            task.id,
            task.name,
            task.phase,
            0.85 + Math.random() * 0.14
          )
        );
        
        updateTaskProgress(task.id, detectedProgress, 'ai_auto');
      }
    });
  },

  scheduleWeeklyReports: () => {
    // In real app, this would set up a cron job
    // For demo, we'll just generate a report
    const { generateWeeklyReport } = get();
    generateWeeklyReport('project_1');
  },

  // Per-project config cache. `useProjectConfig` hydrates each project on
  // demand and on switch; pages read from here without re-fetching.
  projectConfig: {},
  setProjectConfig: (config: ProjectConfig) => {
    set((state) => ({
      projectConfig: { ...state.projectConfig, [config.projectId]: config },
    }));
  },
}));

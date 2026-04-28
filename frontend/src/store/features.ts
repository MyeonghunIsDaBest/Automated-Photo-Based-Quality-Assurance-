import { create } from 'zustand';
import { Task, Comment, Report } from '../types';
import { mockTasks, mockPhotos, mockComments, mockReports } from '../data/mockData';
import { useNotificationStore, createTaskUpdate, createSafetyAlert, createAIAnalysisAlert, createWeeklyReport } from './notifications';

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
  deleteTask: (taskId: string) => void;
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
  getReportsByType: (type: Report['reportType']) => Report[];
  
  // User Settings
  userSettings: UserSettings;
  updateUserSettings: (settings: Partial<UserSettings>) => void;
  updatePassword: (currentPassword: string, newPassword: string) => Promise<{ success: boolean; error?: string }>;
  updateEmail: (email: string) => Promise<{ success: boolean; error?: string }>;
  
  // Automated Features
  runAutoProgressUpdate: () => void;
  scheduleWeeklyReports: () => void;
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

  // Task Management
  tasks: mockTasks,

  updateTaskProgress: (taskId, newProgress, source) => {
    const { tasks } = get();
    const task = tasks.find((t) => t.id === taskId);
    
    if (!task) return;

    const oldProgress = task.percentComplete;
    
    // Create notification
    if (newProgress !== oldProgress) {
      useNotificationStore.getState().addNotification(
        createTaskUpdate(taskId, task.name, oldProgress, newProgress)
      );
    }

    // Check for safety flags from AI
    const recentPhotos = mockPhotos.filter(p => p.taskId === taskId && p.aiAnalysis);
    const safetyFlags = recentPhotos.flatMap(p => p.aiAnalysis?.safetyFlags || []);
    
    if (safetyFlags.length > 0) {
      useNotificationStore.getState().addNotification(
        createSafetyAlert(taskId, task.name, safetyFlags)
      );
    }

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

    // Update progress history if task completed
    if (oldProgress < 100 && newProgress >= 100) {
      get().addProgressData({
        progress: get().calculateOverallProgress(),
        photosUploaded: mockPhotos.length,
        tasksCompleted: tasks.filter(t => t.percentComplete >= 100).length + 1,
      });
    }
  },

  addTask: (task) => {
    set((state) => ({ tasks: [...state.tasks, task] }));
  },

  deleteTask: (taskId) => {
    set((state) => ({ tasks: state.tasks.filter((t) => t.id !== taskId) }));
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

  // Comments
  comments: mockComments,

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

  // Reports
  reports: mockReports,

  generateWeeklyReport: (projectId) => {
    const { tasks, calculateOverallProgress } = get();
    const currentProgress = calculateOverallProgress();
    
    // Get last week's progress
    const progressHistory = get().progressHistory;
    const lastWeekProgress = progressHistory.length > 1 
      ? progressHistory[progressHistory.length - 2].progress 
      : 0;
    const progressChange = currentProgress - lastWeekProgress;

    const newReport: Report = {
      id: `report_${Date.now()}`,
      projectId,
      reportType: 'weekly',
      generatedBy: 'user_1',
      generatedAt: new Date().toISOString(),
      dateFrom: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      dateTo: new Date().toISOString().split('T')[0],
      summary: {
        photosUploaded: mockPhotos.length,
        tasksUpdated: tasks.filter(t => 
          new Date(t.lastUpdated) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        ).length,
        overallProgress: currentProgress,
        progressChange,
        safetyFlags: mockPhotos.filter(p => 
          p.aiAnalysis?.safetyFlags && p.aiAnalysis.safetyFlags.length > 0
        ).length,
      },
    };

    set((state) => ({ reports: [newReport, ...state.reports] }));

    // Create notification
    useNotificationStore.getState().addNotification(
      createWeeklyReport(projectId, 'Lincoln Elementary School', currentProgress, progressChange)
    );

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
}));

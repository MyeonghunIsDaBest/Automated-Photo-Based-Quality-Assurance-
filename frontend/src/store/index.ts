import { create } from 'zustand';
import { 
  User, Project, Zone, Task, Photo, AIAnalysis, 
  AuditLog, Comment, Report, DashboardStats, ActivityFeedItem,
  TaskStatus, ConstructionPhase
} from '../types';
import {
  mockUsers, mockProject, mockZones, mockTasks, mockPhotos,
  mockAuditLogs, mockComments, mockReports, mockDashboardStats,
  mockActivityFeed
} from '../data/mockData';

interface AppState {
  // Auth
  currentUser: User | null;
  isAuthenticated: boolean;
  login: (email: string) => Promise<User>;
  logout: () => void;
  
  // Data
  project: Project;
  users: User[];
  zones: Zone[];
  tasks: Task[];
  photos: Photo[];
  auditLogs: AuditLog[];
  comments: Comment[];
  reports: Report[];
  dashboardStats: DashboardStats;
  activityFeed: ActivityFeedItem[];
  
  // Actions
  addPhoto: (photo: Photo) => Promise<void>;
  updateTaskProgress: (taskId: string, newProgress: number, source: 'ai_auto' | 'manual') => void;
  addComment: (taskId: string, content: string) => void;
  addAuditLog: (log: Omit<AuditLog, 'id' | 'createdAt'>) => void;
  
  // UI State
  selectedTask: Task | null;
  setSelectedTask: (task: Task | null) => void;
  isUploading: boolean;
  setIsUploading: (uploading: boolean) => void;
  uploadProgress: number;
  setUploadProgress: (progress: number) => void;
  aiAnalysisResult: AIAnalysis | null;
  setAiAnalysisResult: (result: AIAnalysis | null) => void;
  notification: { message: string; type: 'success' | 'error' | 'info' } | null;
  setNotification: (notification: { message: string; type: 'success' | 'error' | 'info' } | null) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  // Auth State
  currentUser: null,
  isAuthenticated: false,
  
  login: async (email: string) => {
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 500));
    const user = mockUsers.find(u => u.email === email);
    if (user) {
      set({ currentUser: user, isAuthenticated: true });
      return user;
    }
    throw new Error('User not found');
  },
  
  logout: () => {
    set({ currentUser: null, isAuthenticated: false });
  },
  
  // Data State (from mock data)
  project: mockProject,
  users: mockUsers,
  zones: mockZones,
  tasks: mockTasks,
  photos: mockPhotos,
  auditLogs: mockAuditLogs,
  comments: mockComments,
  reports: mockReports,
  dashboardStats: mockDashboardStats,
  activityFeed: mockActivityFeed,
  
  // Actions
  addPhoto: async (photo: Photo) => {
    const { tasks, addAuditLog } = get();
    
    // Add photo to state
    set(state => ({ photos: [photo, ...state.photos] }));
    
    // Add audit log
    addAuditLog({
      projectId: photo.projectId,
      userId: photo.uploadedBy,
      action: 'photo_uploaded',
      entityType: 'photo',
      entityId: photo.id,
      newValue: { filename: photo.filename, zoneId: photo.zoneId },
      notes: photo.notes || 'Photo uploaded',
    });
    
    // Update task photo count
    if (photo.taskId) {
      set(state => ({
        tasks: state.tasks.map(task => 
          task.id === photo.taskId 
            ? { ...task, photoCount: task.photoCount + 1 }
            : task
        ),
      }));
    }
    
    // Simulate AI analysis
    set({ isUploading: true, uploadProgress: 0 });
    
    for (let i = 0; i <= 100; i += 10) {
      await new Promise(resolve => setTimeout(resolve, 200));
      set({ uploadProgress: i });
    }
    
    // Generate AI analysis result
    const aiAnalysis: AIAnalysis = {
      id: `ai_${Date.now()}`,
      photoId: photo.id,
      modelUsed: 'gpt-4-vision',
      phaseDetected: photo.taskId ? tasks.find(t => t.id === photo.taskId)?.phase || 'framing' : 'framing',
      completionPct: Math.floor(Math.random() * 30) + 50,
      confidence: 0.85 + Math.random() * 0.14,
      safetyFlags: Math.random() > 0.8 ? ['Verify safety equipment usage'] : [],
      qualityFlags: [],
      materials: ['lumber', 'metal connectors', 'concrete'],
      suggestedTask: photo.taskId,
      actionTaken: 'pending',
      analyzedAt: new Date().toISOString(),
    };
    
    set({ 
      isUploading: false,
      aiAnalysisResult: aiAnalysis,
      notification: { 
        message: `AI Analysis: ${aiAnalysis.phaseDetected} detected at ${aiAnalysis.completionPct}% completion`, 
        type: 'success' 
      }
    });
    
    // Add AI audit log
    addAuditLog({
      projectId: photo.projectId,
      userId: 'system',
      action: 'ai_analysis_completed',
      entityType: 'photo',
      entityId: photo.id,
      newValue: { phaseDetected: aiAnalysis.phaseDetected, confidence: aiAnalysis.confidence },
      notes: 'AI analysis completed automatically',
    });
    
    // Update photo with AI analysis
    set(state => ({
      photos: state.photos.map(p => 
        p.id === photo.id 
          ? { ...p, aiAnalyzed: true, aiAnalysis }
          : p
      ),
    }));
  },
  
  updateTaskProgress: (taskId: string, newProgress: number, source: 'ai_auto' | 'manual') => {
    const { tasks, addAuditLog, project } = get();
    const task = tasks.find(t => t.id === taskId);
    
    if (task) {
      const oldProgress = task.percentComplete;
      
      set(state => ({
        tasks: state.tasks.map(t => 
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
      }));
      
      // Add audit log
      addAuditLog({
        projectId: project.id,
        userId: get().currentUser?.id || 'system',
        action: 'task_progress_updated',
        entityType: 'task',
        entityId: taskId,
        oldValue: { percentComplete: oldProgress },
        newValue: { percentComplete: newProgress },
        notes: source === 'ai_auto' ? 'Auto-updated based on AI analysis' : 'Manual update',
      });
      
      set({ 
        notification: { 
          message: `Task progress updated to ${newProgress}%`, 
          type: 'success' 
        } 
      });
    }
  },
  
  addComment: (taskId: string, content: string) => {
    const { currentUser, comments } = get();
    
    if (currentUser) {
      const newComment: Comment = {
        id: `comment_${Date.now()}`,
        taskId,
        userId: currentUser.id,
        userName: currentUser.fullName,
        userAvatar: currentUser.avatar,
        content,
        createdAt: new Date().toISOString(),
      };
      
      set({ comments: [...comments, newComment] });
      
      // Add audit log
      get().addAuditLog({
        projectId: get().project.id,
        userId: currentUser.id,
        action: 'comment_added',
        entityType: 'task',
        entityId: taskId,
        newValue: { comment: content },
        notes: 'Comment added to task',
      });
    }
  },
  
  addAuditLog: (log: Omit<AuditLog, 'id' | 'createdAt'>) => {
    const newLog: AuditLog = {
      ...log,
      id: `audit_${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    
    set(state => ({ auditLogs: [newLog, ...state.auditLogs] }));
  },
  
  // UI State
  selectedTask: null,
  setSelectedTask: (task) => set({ selectedTask: task }),
  
  isUploading: false,
  setIsUploading: (uploading) => set({ isUploading: uploading }),
  
  uploadProgress: 0,
  setUploadProgress: (progress) => set({ uploadProgress: progress }),
  
  aiAnalysisResult: null,
  setAiAnalysisResult: (result) => set({ aiAnalysisResult: result }),
  
  notification: null,
  setNotification: (notification) => set({ notification }),
}));

// Helper selectors
export const getPhotosForTask = (taskId: string) => {
  const photos = useAppStore.getState().photos;
  return photos.filter(p => p.taskId === taskId);
};

export const getCommentsForTask = (taskId: string) => {
  const comments = useAppStore.getState().comments;
  return comments.filter(c => c.taskId === taskId);
};

export const getStatusColor = (status: TaskStatus): string => {
  switch (status) {
    case 'not_started': return 'bg-slate-400';
    case 'in_progress': return 'bg-blue-500';
    case 'complete': return 'bg-green-500';
    case 'delayed': return 'bg-red-500';
    case 'blocked': return 'bg-gray-700';
    default: return 'bg-slate-400';
  }
};

export const getStatusBadgeColor = (status: TaskStatus): string => {
  switch (status) {
    case 'not_started': return 'bg-slate-100 text-slate-700';
    case 'in_progress': return 'bg-blue-100 text-blue-700';
    case 'complete': return 'bg-green-100 text-green-700';
    case 'delayed': return 'bg-red-100 text-red-700';
    case 'blocked': return 'bg-gray-100 text-gray-700';
    default: return 'bg-slate-100 text-slate-700';
  }
};

export const getPhaseIcon = (phase: ConstructionPhase): string => {
  switch (phase) {
    case 'excavation': return '🏗️';
    case 'foundation': return '🏛️';
    case 'framing': return '🔨';
    case 'electrical': return '⚡';
    case 'plumbing': return '🚰';
    case 'drywall': return '🧱';
    case 'finishing': return '✨';
    case 'roofing': return '🏠';
    default: return '📋';
  }
};

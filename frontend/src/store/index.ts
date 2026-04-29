import { create } from 'zustand';
import {
  User, Project, Zone, Task, Photo, AIAnalysis,
  AuditLog, Comment, Report, DashboardStats, ActivityFeedItem,
  TaskStatus, ConstructionPhase, NoteType
} from '../types';
import {
  mockUsers, mockProject, mockZones, mockTasks, mockPhotos,
  mockAuditLogs, mockComments, mockReports, mockDashboardStats,
  mockActivityFeed
} from '../data/mockData';
import { useFeatureStore } from './features';

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
  addComment: (taskId: string, content: string, noteType?: NoteType) => void;
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
    const { addAuditLog } = get();
    const tasks = useFeatureStore.getState().tasks;

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

    // Update task photo count on the source-of-truth store; the subscription
    // below mirrors it back into useAppStore.tasks for any consumer still
    // reading from there.
    if (photo.taskId) {
      useFeatureStore.setState((state) => ({
        tasks: state.tasks.map((task) =>
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
    const { addAuditLog, project, currentUser } = get();
    const featureState = useFeatureStore.getState();
    const task = featureState.tasks.find((t) => t.id === taskId);
    if (!task) return;

    const oldProgress = task.percentComplete;

    // Delegate mutation to the source-of-truth store. It also appends a
    // point to the progress trend, fires task-update notifications, and
    // raises any safety alerts surfaced from existing photo analyses.
    featureState.updateTaskProgress(taskId, newProgress, source);

    if (newProgress !== oldProgress) {
      addAuditLog({
        projectId: project.id,
        userId: currentUser?.id || 'system',
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
          type: 'success',
        },
      });
    }
  },
  
  addComment: (taskId: string, content: string, noteType: NoteType = 'general') => {
    const { currentUser } = get();
    if (!currentUser) return;

    // Source-of-truth write goes to useFeatureStore; the subscription mirrors
    // it back into useAppStore.comments so existing consumers stay unchanged.
    useFeatureStore.getState().addComment({
      taskId,
      userId: currentUser.id,
      userName: currentUser.fullName,
      userAvatar: currentUser.avatar,
      userRole: currentUser.role,
      content,
      noteType,
      status: 'open',
    });

    get().addAuditLog({
      projectId: get().project.id,
      userId: currentUser.id,
      action: 'comment_added',
      entityType: 'task',
      entityId: taskId,
      newValue: { comment: content, noteType },
      notes: `Note added (${noteType})`,
    });
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

// Mirror tasks/comments from useFeatureStore into useAppStore so the legacy
// `tasks` and `comments` slices stay reactive without requiring every consumer
// to switch stores. useFeatureStore is the source of truth — every mutation
// goes through it (see updateTaskProgress / addComment / addPhoto above).
useAppStore.setState({
  tasks: useFeatureStore.getState().tasks,
  comments: useFeatureStore.getState().comments,
});
useFeatureStore.subscribe((state, prevState) => {
  const update: Partial<AppState> = {};
  if (state.tasks !== prevState.tasks) update.tasks = state.tasks;
  if (state.comments !== prevState.comments) update.comments = state.comments;
  if (Object.keys(update).length > 0) useAppStore.setState(update);
});

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

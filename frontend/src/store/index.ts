import { create } from 'zustand';
import {
  User, Profile, Project, Zone, Task, Photo, AIAnalysis,
  AuditLog, Comment, Report, DashboardStats, ActivityFeedItem,
  TaskStatus, ConstructionPhase, NoteType,
  profileToUser,
} from '../types';
import {
  mockUsers, mockProject, mockZones, mockTasks, mockPhotos,
  mockAuditLogs, mockComments, mockReports, mockDashboardStats,
  mockActivityFeed
} from '../data/mockData';
import { useFeatureStore } from './features';
import { useProjectsListStore, selectActiveProject } from '../pages/projects/store';
import type { Project as ListProject } from '../pages/projects/types';
import {
  signIn as apiSignIn,
  signUp as apiSignUp,
  signOut as apiSignOut,
  getCurrentProfile,
  onAuthStateChange,
  type SignupRole,
} from '../lib/api/auth';
import { supabaseConfigured } from '../lib/supabase';

// The Projects list and the legacy app store use slightly different `Project`
// shapes. This adapter maps a list-side record to the global `Project` shape
// so views still using `useAppStore.project` keep working when the user
// switches active projects.
function toLegacyProject(p: ListProject | null): Project {
  if (!p) return mockProject;
  return {
    id: p.id,
    name: p.name,
    description: '',
    clientName: p.client,
    startDate: p.startDate,
    endDate: p.endDate,
    status: p.status === 'archived' ? 'on_hold' : (p.status as Project['status']),
    createdAt: mockProject.createdAt,
  };
}

interface AppState {
  // Auth — Supabase-backed.
  currentUser: User | null;
  currentProfile: Profile | null;
  isAuthenticated: boolean;
  isAuthLoading: boolean;
  login: (email: string, password: string) => Promise<{ error: string | null }>;
  register: (
    email: string,
    password: string,
    firstName: string,
    lastName: string,
    role?: SignupRole,
  ) => Promise<{ error: string | null }>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  
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
  currentProfile: null,
  isAuthenticated: false,
  // Starts true so RequireAuth can render a spinner until the first
  // getSession() call resolves (avoids a redirect-flash to /login on reload).
  isAuthLoading: supabaseConfigured(),

  login: async (email: string, password: string) => {
    if (!supabaseConfigured()) {
      return { error: 'Supabase is not configured. Add keys to frontend/.env.local.' };
    }
    try {
      await apiSignIn(email, password);
      await get().refreshProfile();
      return { error: null };
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Sign-in failed.' };
    }
  },

  register: async (
    email: string,
    password: string,
    firstName: string,
    lastName: string,
    role: SignupRole = 'worker',
  ) => {
    if (!supabaseConfigured()) {
      return { error: 'Supabase is not configured. Add keys to frontend/.env.local.' };
    }
    try {
      await apiSignUp(email, password, firstName, lastName, role);
      // With email confirmation off, signUp also signs the user in. If
      // confirmation is on, getSession() returns null and the UI prompts
      // the user to confirm before signing in.
      await get().refreshProfile();
      return { error: null };
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Sign-up failed.' };
    }
  },

  logout: async () => {
    await apiSignOut().catch(() => {});
    set({ currentUser: null, currentProfile: null, isAuthenticated: false });
  },

  refreshProfile: async () => {
    try {
      const profile = await getCurrentProfile();
      if (profile) {
        set({
          currentProfile: profile,
          currentUser: profileToUser(profile),
          isAuthenticated: true,
          isAuthLoading: false,
        });
        // Pull the live project list as soon as we know who the user is.
        // No-op when Supabase isn't configured.
        void useProjectsListStore.getState().loadProjects();
      } else {
        set({
          currentProfile: null,
          currentUser: null,
          isAuthenticated: false,
          isAuthLoading: false,
        });
      }
    } catch {
      set({ isAuthLoading: false });
    }
  },
  
  // Data State (from mock data — `project` is mirrored from useProjectsListStore
  // by the subscription below so changing the active project propagates here).
  project: toLegacyProject(selectActiveProject(useProjectsListStore.getState())),
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
  // Saves the photo and bumps the linked task's photo count. The AI analysis
  // pipeline is intentionally not wired yet — the next step in the demo is
  // for the user to confirm task progress manually after each upload.
  addPhoto: async (photo: Photo) => {
    const { addAuditLog } = get();

    set((state) => ({ photos: [photo, ...state.photos] }));

    addAuditLog({
      projectId: photo.projectId,
      userId: photo.uploadedBy,
      action: 'photo_uploaded',
      entityType: 'photo',
      entityId: photo.id,
      newValue: { filename: photo.filename, zoneId: photo.zoneId, taskId: photo.taskId },
      notes: photo.notes || 'Photo uploaded',
    });

    if (photo.taskId) {
      useFeatureStore.setState((state) => ({
        tasks: state.tasks.map((task) =>
          task.id === photo.taskId
            ? { ...task, photoCount: task.photoCount + 1, lastUpdated: new Date().toISOString() }
            : task
        ),
      }));
    }
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

// ─── Auth bootstrap ─────────────────────────────────────────────────────────
// Kick off the initial profile fetch (resolves isAuthLoading) and subscribe
// to auth changes so SIGNED_OUT in another tab clears local state too.
if (supabaseConfigured()) {
  void useAppStore.getState().refreshProfile();
  onAuthStateChange((session) => {
    if (!session) {
      useAppStore.setState({
        currentUser: null,
        currentProfile: null,
        isAuthenticated: false,
        isAuthLoading: false,
      });
    } else {
      void useAppStore.getState().refreshProfile();
    }
  });
}

// Mirror the active project from useProjectsListStore into useAppStore.project.
// Any view reading `project` from useAppStore re-renders when the user switches
// projects via the Sidebar dropdown, so Gantt / Upload / Reports stay in sync.
useProjectsListStore.subscribe((state, prevState) => {
  if (
    state.activeProjectId !== prevState.activeProjectId ||
    state.projects !== prevState.projects
  ) {
    useAppStore.setState({ project: toLegacyProject(selectActiveProject(state)) });
  }
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

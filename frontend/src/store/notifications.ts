import { create } from 'zustand';
import {
  listNotifications, insertNotification, markNotificationRead, markAllNotificationsRead,
  type NotificationRow,
} from '../lib/api/notifications';

export type NotificationType = 'safety_alert' | 'task_update' | 'chat_message' | 'ai_analysis' | 'weekly_report' | 'project_added' | 'stock_allocation';
export type NotificationPriority = 'low' | 'medium' | 'high' | 'critical';

export interface Notification {
  id: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  message: string;
  taskId?: string;
  projectId?: string;
  userId?: string;
  read: boolean;
  createdAt: string;
  metadata?: any;
}

function rowToNotification(r: NotificationRow): Notification {
  return {
    id: r.id,
    type: r.type as NotificationType,
    priority: (r.priority as NotificationPriority) ?? 'medium',
    title: r.title,
    message: r.message,
    taskId: r.task_id ?? undefined,
    projectId: r.project_id ?? undefined,
    read: r.read,
    createdAt: r.created_at,
    metadata: r.metadata,
  };
}

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  addNotification: (notification: Omit<Notification, 'id' | 'createdAt' | 'read'>) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearNotifications: () => void;
  getUnreadByType: (type: NotificationType) => Notification[];
  // Persistence (Tier-3 #12). All no-op gracefully when the table isn't deployed.
  /** Load the signed-in user's stored notifications on sign-in / mount. */
  hydrate: () => Promise<void>;
  /** Merge a realtime INSERT row, deduped by id (skips our own optimistic copy). */
  upsertFromRow: (row: NotificationRow) => void;
}

const recompute = (notifications: Notification[]) => ({
  notifications,
  unreadCount: notifications.filter((n) => !n.read).length,
});

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,

  addNotification: (notification) => {
    // Stable uuid id so the DB row + its realtime echo dedupe against this
    // optimistic copy (see upsertFromRow). Falls back to a random string on
    // the rare engine without crypto.randomUUID.
    const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `notif_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    const newNotification: Notification = {
      ...notification,
      id,
      createdAt: new Date().toISOString(),
      read: false,
    };

    set((state) => ({
      notifications: [newNotification, ...state.notifications],
      unreadCount: state.unreadCount + 1,
    }));

    // Persist (fire-and-forget). The recipient is the signed-in user, so the
    // RLS insert-self check passes. Swallows when the table isn't deployed.
    void insertNotification({
      id,
      type: newNotification.type,
      priority: newNotification.priority,
      title: newNotification.title,
      message: newNotification.message,
      taskId: newNotification.taskId,
      projectId: newNotification.projectId,
      metadata: newNotification.metadata,
    });

    // Show browser notification if supported
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(notification.title, {
        body: notification.message,
        icon: '/favicon.ico',
        tag: newNotification.id,
      });
    }
  },

  markAsRead: (id) => {
    set((state) => recompute(
      state.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
    ));
    void markNotificationRead(id);
  },

  markAllAsRead: () => {
    set((state) => recompute(state.notifications.map((n) => ({ ...n, read: true }))));
    void markAllNotificationsRead();
  },

  clearNotifications: () => {
    set({ notifications: [], unreadCount: 0 });
  },

  getUnreadByType: (type) => {
    const state = get();
    return state.notifications.filter((n) => n.type === type && !n.read);
  },

  hydrate: async () => {
    const rows = await listNotifications(50);
    if (rows.length === 0) return; // not deployed yet, or genuinely empty
    set((state) => {
      const seen = new Set(state.notifications.map((n) => n.id));
      const fromDb = rows.filter((r) => !seen.has(r.id)).map(rowToNotification);
      const merged = [...state.notifications, ...fromDb]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return recompute(merged);
    });
  },

  upsertFromRow: (row) => {
    set((state) => {
      if (state.notifications.some((n) => n.id === row.id)) return state; // dedupe our optimistic copy
      return recompute([rowToNotification(row), ...state.notifications]);
    });
  },
}));

// Helper function to request notification permission
export const requestNotificationPermission = async () => {
  if ('Notification' in window) {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }
  return false;
};

// Notification templates
export const createSafetyAlert = (taskId: string, taskName: string, flags: string[]) => ({
  type: 'safety_alert' as NotificationType,
  priority: 'critical' as NotificationPriority,
  title: '⚠️ Safety Alert',
  message: `Safety concerns detected in ${taskName}: ${flags.join(', ')}`,
  taskId,
  metadata: { flags },
});

export const createTaskUpdate = (taskId: string, taskName: string, oldProgress: number, newProgress: number) => ({
  type: 'task_update' as NotificationType,
  priority: 'medium' as NotificationPriority,
  title: '📊 Task Progress Updated',
  message: `${taskName} progress updated from ${oldProgress}% to ${newProgress}%`,
  taskId,
  metadata: { oldProgress, newProgress },
});

export const createAIAnalysisAlert = (taskId: string, taskName: string, phase: string, confidence: number) => ({
  type: 'ai_analysis' as NotificationType,
  priority: 'high' as NotificationPriority,
  title: '🤖 AI Analysis Complete',
  message: `${taskName}: Detected ${phase} phase with ${(confidence * 100).toFixed(0)}% confidence`,
  taskId,
  metadata: { phase, confidence },
});

export const createProjectAdded = (projectId: string, projectName: string) => ({
  type: 'project_added' as NotificationType,
  priority: 'medium' as NotificationPriority,
  title: '👷 Added to a project',
  message: `You've been added to ${projectName}. Open it from Home → Projects.`,
  projectId,
});

export const createWeeklyReport = (projectId: string, projectName: string, progress: number, change: number) => ({
  type: 'weekly_report' as NotificationType,
  priority: 'low' as NotificationPriority,
  title: '📋 Weekly Report Generated',
  message: `${projectName}: Overall progress ${progress}% (${change > 0 ? '+' : ''}${change}% this week)`,
  projectId,
  metadata: { progress, change },
});

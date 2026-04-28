import { create } from 'zustand';

export type NotificationType = 'safety_alert' | 'task_update' | 'chat_message' | 'ai_analysis' | 'weekly_report';
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

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  addNotification: (notification: Omit<Notification, 'id' | 'createdAt' | 'read'>) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearNotifications: () => void;
  getUnreadByType: (type: NotificationType) => Notification[];
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,

  addNotification: (notification) => {
    const newNotification: Notification = {
      ...notification,
      id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date().toISOString(),
      read: false,
    };

    set((state) => ({
      notifications: [newNotification, ...state.notifications],
      unreadCount: state.unreadCount + 1,
    }));

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
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n
      ),
      unreadCount: Math.max(0, state.unreadCount - 1),
    }));
  },

  markAllAsRead: () => {
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    }));
  },

  clearNotifications: () => {
    set({ notifications: [], unreadCount: 0 });
  },

  getUnreadByType: (type) => {
    const state = get();
    return state.notifications.filter((n) => n.type === type && !n.read);
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

export const createChatMessage = (userId: string, userName: string, message: string) => ({
  type: 'chat_message' as NotificationType,
  priority: 'medium' as NotificationPriority,
  title: '💬 New Message',
  message: `${userName}: ${message.substring(0, 50)}${message.length > 50 ? '...' : ''}`,
  userId,
  metadata: { userName, preview: message },
});

export const createAIAnalysisAlert = (taskId: string, taskName: string, phase: string, confidence: number) => ({
  type: 'ai_analysis' as NotificationType,
  priority: 'high' as NotificationPriority,
  title: '🤖 AI Analysis Complete',
  message: `${taskName}: Detected ${phase} phase with ${(confidence * 100).toFixed(0)}% confidence`,
  taskId,
  metadata: { phase, confidence },
});

export const createWeeklyReport = (projectId: string, projectName: string, progress: number, change: number) => ({
  type: 'weekly_report' as NotificationType,
  priority: 'low' as NotificationPriority,
  title: '📋 Weekly Report Generated',
  message: `${projectName}: Overall progress ${progress}% (${change > 0 ? '+' : ''}${change}% this week)`,
  projectId,
  metadata: { progress, change },
});

// Local-only types for the Gantt page's side tabs (Daily Logs, To-Dos,
// Change Orders, Selections, Warranties). These live in localStorage via
// the useGanttSideStore Zustand slice — they are NOT yet backed by
// Supabase tables. When promoting any of these to real schemas, mirror
// the field names exactly so the migration is mechanical.

export interface DailyLogEntry {
  id: string;
  projectId: string;
  date: string;          // ISO yyyy-mm-dd
  hours: number;
  personnelCount: number;
  photosCount: number;
  description: string;
  createdAt: string;
}

export interface Todo {
  id: string;
  projectId: string;
  text: string;
  done: boolean;
  dueDate?: string;      // ISO yyyy-mm-dd
  createdAt: string;
}

export type ChangeOrderStatus = 'draft' | 'sent' | 'approved' | 'rejected';

export interface ChangeOrder {
  id: string;
  projectId: string;
  poNumber: string;
  description: string;
  amount: number;        // positive or negative — net change to budget
  status: ChangeOrderStatus;
  createdAt: string;
}

export type SelectionStatus = 'pending' | 'selected' | 'ordered' | 'delivered';

export interface Selection {
  id: string;
  projectId: string;
  zoneId?: string;
  item: string;
  supplier: string;
  status: SelectionStatus;
  createdAt: string;
}

export interface Warranty {
  id: string;
  projectId: string;
  item: string;
  supplier: string;
  expiryDate: string;    // ISO yyyy-mm-dd
  fileRef?: string;      // free text — link or filename
  createdAt: string;
}

// Convenience union — used by the tab strip to render counter badges.
export type TabId =
  | 'schedule'
  | 'daily_logs'
  | 'todos'
  | 'tasks'
  | 'change_orders'
  | 'selections'
  | 'warranties'
  | 'plans'
  | 'uploads';

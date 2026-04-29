export type ProjectStatus = 'active' | 'on_hold' | 'completed' | 'archived';

export interface Project {
  id: string;
  name: string;
  client: string;
  percentComplete: number;
  tasksComplete: number;
  tasksPending: number;
  tasksOutstanding: number;
  startDate: string;
  endDate: string;
  status: ProjectStatus;
}

export interface Worker {
  id: string;
  name: string;
  role: string;
  company: string;
  totalHours: number;
  avatar: string;
  projectIds: string[];
}

export type DocumentCategory =
  | 'tasks'
  | 'photos'
  | 'files'
  | 'drawings'
  | 'warranties'
  | 'products'
  | 'documents'
  | 'specifications';

export interface ProjectDocument {
  id: string;
  projectId: string;
  name: string;
  category: DocumentCategory;
  size: number;
  uploadedAt: string;
}

export interface DailyLogPersonnel {
  name: string;
  role: string;
  hours: number;
  company: string;
}

export interface DailyLog {
  id: string;
  projectId: string;
  date: string;
  hours: number;
  personnel: DailyLogPersonnel[];
  photos: number;
  description: string;
}

export type SortDirection = 'asc' | 'desc';

export interface SortState<K extends string = string> {
  key: K | null;
  direction: SortDirection;
}

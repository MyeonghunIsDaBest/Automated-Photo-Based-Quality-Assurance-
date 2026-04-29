import { useAppStore } from '../../../store';
import { useFeatureStore } from '../../../store/features';
import { useNotificationStore } from '../../../store/notifications';
import { useFinanceStore } from '../../../store/finance';
import { ConstructionPhase, Project as GlobalProject, Task } from '../../../types';
import { Project as ListProject, ProjectStatus } from '../types';
import { useProjectsListStore } from '../store';

export interface NewProjectMilestone {
  name: string;
  phase: ConstructionPhase;
  startDate: string;
  endDate: string;
}

export interface NewProjectInput {
  name: string;
  clientName: string;
  description: string;
  startDate: string;
  endDate: string;
  status: ProjectStatus;
  budget: number;
  milestones: NewProjectMilestone[];
}

export interface CreatedProjectResult {
  project: GlobalProject;
  listEntry: ListProject;
  tasks: Task[];
}

function daysBetween(startISO: string, endISO: string): number {
  const ms = new Date(endISO).getTime() - new Date(startISO).getTime();
  return Math.max(1, Math.round(ms / 86_400_000));
}

const STATUS_TO_GLOBAL: Record<ProjectStatus, GlobalProject['status']> = {
  active: 'active',
  on_hold: 'on_hold',
  completed: 'completed',
  archived: 'completed',
};

export function createProject(input: NewProjectInput): CreatedProjectResult {
  const id = `proj_${Date.now()}`;
  const createdAt = new Date().toISOString();

  const newProject: GlobalProject = {
    id,
    name: input.name,
    description: input.description,
    clientName: input.clientName,
    startDate: input.startDate,
    endDate: input.endDate,
    status: STATUS_TO_GLOBAL[input.status],
    createdAt,
  };

  const listEntry: ListProject = {
    id,
    name: input.name,
    client: input.clientName,
    percentComplete: 0,
    tasksComplete: 0,
    tasksPending: input.milestones.length,
    tasksOutstanding: 0,
    startDate: input.startDate,
    endDate: input.endDate,
    status: input.status,
  };

  const tasks: Task[] = input.milestones.map((m, idx) => ({
    id: `${id}_task_${idx + 1}`,
    projectId: id,
    name: m.name,
    phase: m.phase,
    startDate: m.startDate,
    endDate: m.endDate,
    durationDays: daysBetween(m.startDate, m.endDate),
    percentComplete: 0,
    status: 'not_started',
    dependencies: [],
    photoCount: 0,
    lastUpdated: createdAt,
    updateSource: 'manual',
    notes: [],
  }));

  // 1. Append to the projects-list view
  useProjectsListStore.getState().addProject(listEntry);

  // 2. Make this the active project (updates the TopNav subheader site-wide)
  useAppStore.setState((state) => ({
    project: newProject,
    dashboardStats: { ...state.dashboardStats, overallProgress: 0 },
  }));

  // 3. Append milestones to the Gantt task list (source of truth: feature store)
  useFeatureStore.setState((state) => ({ tasks: [...state.tasks, ...tasks] }));

  // 3b. Seed the finance store with this project's budget
  useFinanceStore.getState().setBudget({
    projectId: id,
    total: input.budget,
    spent: 0,
    committed: 0,
  });

  // 4. Audit trail — one entry per project, plus one per milestone
  const userId = useAppStore.getState().currentUser?.id ?? 'system';
  useAppStore.getState().addAuditLog({
    projectId: id,
    userId,
    action: 'project_created',
    entityType: 'project',
    entityId: id,
    newValue: {
      name: input.name,
      clientName: input.clientName,
      budget: input.budget,
      milestoneCount: input.milestones.length,
    },
    notes: `Project "${input.name}" created with ${input.milestones.length} milestones and a budget of $${input.budget.toLocaleString()}`,
  });
  for (const t of tasks) {
    useAppStore.getState().addAuditLog({
      projectId: id,
      userId,
      action: 'task_created',
      entityType: 'task',
      entityId: t.id,
      newValue: { name: t.name, phase: t.phase, startDate: t.startDate, endDate: t.endDate },
      notes: `Milestone "${t.name}" scheduled`,
    });
  }

  // 5. Notification bell — surfaces in TopNav
  useNotificationStore.getState().addNotification({
    type: 'weekly_report',
    priority: 'medium',
    title: '📁 New Project Created',
    message: `${input.name} for ${input.clientName} — ${input.milestones.length} milestones, budget $${input.budget.toLocaleString()}`,
    projectId: id,
    metadata: { budget: input.budget, milestones: input.milestones.length },
  });

  // 6. Toast confirmation
  useAppStore.setState({
    notification: {
      type: 'success',
      message: `Project "${input.name}" created`,
    },
  });

  return { project: newProject, listEntry, tasks };
}

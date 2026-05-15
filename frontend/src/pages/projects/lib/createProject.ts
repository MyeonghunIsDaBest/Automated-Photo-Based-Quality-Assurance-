import { useAppStore } from '../../../store';
import { useFeatureStore } from '../../../store/features';
import { useNotificationStore } from '../../../store/notifications';
import { useFinanceStore } from '../../../store/finance';
import { ConstructionPhase, Project as GlobalProject, Task } from '../../../types';
import { Project as ListProject, ProjectStatus } from '../types';
import { useProjectsListStore } from '../store';
import {
  DEFAULT_PHASE_MILESTONES,
  milestoneDates,
  totalDefaultMilestones,
} from '../../../lib/construction/phaseMilestones';

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
  // Optional — the wizard no longer collects milestones; every project gets
  // the 57-milestone default library auto-seeded below. The field remains so
  // callers (programmatic spawners, future bulk imports) can layer extras.
  milestones?: NewProjectMilestone[];
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
    tasksPending: totalDefaultMilestones() + (input.milestones?.length ?? 0),
    tasksOutstanding: 0,
    startDate: input.startDate,
    endDate: input.endDate,
    status: input.status,
  };

  // Migration 12 parity for mock mode: every new project gets 8 phase-anchor
  // rows. In live mode, the `trg_seed_phase_anchors` trigger handles this on
  // INSERT — but the feature store mirrors the local cache too, so we still
  // emit them here.
  //
  // Each phase anchor is then auto-populated with the canonical milestone
  // list from `lib/construction/phaseMilestones.ts` so site managers don't
  // start from a blank Gantt. User-provided milestones (if any) are appended
  // alongside the defaults under the matching phase anchor.
  const PHASES: ConstructionPhase[] = [
    'excavation', 'foundation', 'framing', 'roofing',
    'electrical', 'plumbing', 'drywall', 'finishing',
  ];
  const PHASE_LABELS: Record<ConstructionPhase, string> = {
    excavation: 'Excavation',
    foundation: 'Foundation',
    framing: 'Framing',
    roofing: 'Roofing',
    electrical: 'Electrical',
    plumbing: 'Plumbing',
    drywall: 'Drywall',
    finishing: 'Finishing',
  };

  const anchorIdFor = (phase: ConstructionPhase) => `${id}_anchor_${phase}`;

  // Each phase gets an equal slice of the project window — site managers
  // can re-stretch these in the Gantt once construction starts. The defaults
  // give a sensible starting cadence for typical residential builds.
  const projectMs = new Date(input.endDate).getTime() - new Date(input.startDate).getTime();
  const phaseSliceMs = Math.max(86_400_000, projectMs / PHASES.length);
  const phaseWindowFor = (idx: number) => {
    const start = new Date(new Date(input.startDate).getTime() + idx * phaseSliceMs);
    const end = new Date(start.getTime() + phaseSliceMs);
    return {
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
    };
  };

  const anchorTasks: Task[] = PHASES.map((phase, idx) => {
    const window = phaseWindowFor(idx);
    return {
      id: anchorIdFor(phase),
      projectId: id,
      name: PHASE_LABELS[phase],
      phase,
      startDate: window.startDate,
      endDate: window.endDate,
      durationDays: daysBetween(window.startDate, window.endDate),
      percentComplete: 0,
      status: 'not_started',
      dependencies: [],
      photoCount: 0,
      lastUpdated: createdAt,
      updateSource: 'manual',
      notes: [],
      isPhaseAnchor: true,
    };
  });

  // Default milestones from the canonical library, dated within their phase
  // window using each milestone's start/end offset.
  const defaultMilestoneTasks: Task[] = PHASES.flatMap((phase, phaseIdx) => {
    const window = phaseWindowFor(phaseIdx);
    return DEFAULT_PHASE_MILESTONES[phase].map((m, mIdx) => {
      const dates = milestoneDates(window.startDate, window.endDate, m);
      return {
        id: `${id}_${phase}_${mIdx + 1}`,
        projectId: id,
        parentTaskId: anchorIdFor(phase),
        name: m.name,
        phase,
        startDate: dates.startDate,
        endDate: dates.endDate,
        durationDays: dates.durationDays,
        percentComplete: 0,
        status: 'not_started',
        dependencies: [],
        photoCount: 0,
        lastUpdated: createdAt,
        updateSource: 'manual',
        notes: [],
        isPhaseAnchor: false,
      };
    });
  });

  // User-provided extra milestones from the new-project wizard, if any. They
  // attach to the phase anchor on top of the defaults.
  const userMilestoneTasks: Task[] = (input.milestones ?? []).map((m, idx) => ({
    id: `${id}_user_${idx + 1}`,
    projectId: id,
    parentTaskId: anchorIdFor(m.phase),
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
    isPhaseAnchor: false,
  }));

  const tasks: Task[] = [...anchorTasks, ...defaultMilestoneTasks, ...userMilestoneTasks];

  // 1. Append to the projects-list view
  useProjectsListStore.getState().addProject(listEntry);

  // 2. Make this the active project (updates the TopNav subheader site-wide)
  useAppStore.getState().setActiveProjectFromCreate(newProject);

  // 3. Append milestones to the Gantt task list (source of truth: feature store)
  useFeatureStore.getState().appendTasks(tasks);

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
      milestoneCount: (input.milestones?.length ?? 0),
    },
    notes: `Project "${input.name}" created with ${(input.milestones?.length ?? 0)} milestones and a budget of $${input.budget.toLocaleString()}`,
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
    message: `${input.name} for ${input.clientName} — ${(input.milestones?.length ?? 0)} milestones, budget $${input.budget.toLocaleString()}`,
    projectId: id,
    metadata: { budget: input.budget, milestones: (input.milestones?.length ?? 0) },
  });

  // 6. Toast confirmation
  useAppStore.getState().setNotification({
    type: 'success',
    message: `Project "${input.name}" created`,
  });

  return { project: newProject, listEntry, tasks };
}

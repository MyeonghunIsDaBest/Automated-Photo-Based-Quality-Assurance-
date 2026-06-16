import { Project } from '../types';
import { DEMO_INFLIGHT_PROJECT_META } from '../../../data/demoInflightProject';
import { DEMO_BONDI_META, DEMO_MARRICKVILLE_META } from '../../../data/demoExtraSites';

// ─────────────────────────────────────────────────────────────────────────────
// Two demo projects (mock mode only):
//   1. Casone Electrical — QA Pilot. The blank-canvas pilot; every datapoint
//      is created in-app so the audit trail is authentic.
//   2. Hampstead Heights — Demo Build. A pre-seeded in-flight project showing
//      what the Gantt looks like mid-construction. Useful for screenshots,
//      onboarding walk-throughs, and seeing AI signal & rolled-up phase %s.
//
// The first id intentionally matches `mockProject.id` in `data/mockData.ts`
// so the dashboard, gallery and gantt views stay in sync with that entry.
// ─────────────────────────────────────────────────────────────────────────────

export const mockProjects: Project[] = [
  {
    id: DEMO_INFLIGHT_PROJECT_META.id,
    name: DEMO_INFLIGHT_PROJECT_META.name,
    client: DEMO_INFLIGHT_PROJECT_META.client,
    // 8 complete (excavation) + 5 actively in progress (foundation work) +
    // ~44 scheduled but not started. Numbers update via the Gantt — these
    // are just the snapshot the projects list shows on first paint.
    percentComplete: 19,
    tasksComplete: 8,
    tasksPending: 49,
    tasksBlocked: 0,
    tasksOutstanding: 0,
    startDate: DEMO_INFLIGHT_PROJECT_META.startDate,
    endDate: DEMO_INFLIGHT_PROJECT_META.endDate,
    status: 'active',
  },
  {
    id: DEMO_BONDI_META.id,
    name: DEMO_BONDI_META.name,
    client: DEMO_BONDI_META.client,
    percentComplete: 5,
    tasksComplete: 2,
    tasksPending: 55,
    tasksBlocked: 0,
    tasksOutstanding: 0,
    startDate: DEMO_BONDI_META.startDate,
    endDate: DEMO_BONDI_META.endDate,
    status: 'active',
  },
  {
    id: DEMO_MARRICKVILLE_META.id,
    name: DEMO_MARRICKVILLE_META.name,
    client: DEMO_MARRICKVILLE_META.client,
    percentComplete: 86,
    tasksComplete: 44,
    tasksPending: 13,
    tasksBlocked: 0,
    tasksOutstanding: 0,
    startDate: DEMO_MARRICKVILLE_META.startDate,
    endDate: DEMO_MARRICKVILLE_META.endDate,
    status: 'active',
  },
  {
    id: 'project_1',
    name: 'Casone Electrical — QA Pilot',
    client: 'Casone Electrical Pty Ltd',
    percentComplete: 0,
    tasksComplete: 0,
    tasksPending: 0,
    tasksBlocked: 0,
    tasksOutstanding: 0,
    startDate: '2026-04-01',
    endDate: '2026-12-31',
    status: 'active',
  },
];

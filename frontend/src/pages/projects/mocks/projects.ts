import { Project } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Single working project — the live test bed for the photo-QA pipeline.
// Use this one to upload images, videos and documents from real jobs. Every
// upload, AI analysis and status change should funnel through this project so
// the audit trail stays coherent.
//
// The id intentionally matches `mockProject.id` in `data/mockData.ts` so the
// dashboard, gallery and gantt views all stay in sync with this entry.
// ─────────────────────────────────────────────────────────────────────────────

export const mockProjects: Project[] = [
  {
    id: 'project_1',
    name: 'Casone Electrical — QA Pilot',
    client: 'Casone Electrical Pty Ltd',
    percentComplete: 0,
    tasksComplete: 0,
    tasksPending: 0,
    tasksOutstanding: 0,
    startDate: '2026-04-01',
    endDate: '2026-12-31',
    status: 'active',
  },
];

// Re-export of the activity-feed types from `pages/gantt/types.ts` so non-Gantt
// consumers (Dashboard, future review surfaces) can `import from '~/lib/activity/types'`
// without reaching into the Gantt namespace.
//
// The canonical declaration still lives in `pages/gantt/types.ts`; this file
// is the migration seam. A later cleanup can flip the canonical home to here
// and have Gantt re-export back, but that's out of scope for the connectedness
// pass — the move would touch every Gantt sub-tab's import.

export type {
  ActivityEvent,
  ActivityKind,
  TabId,
} from '../../pages/gantt/types';

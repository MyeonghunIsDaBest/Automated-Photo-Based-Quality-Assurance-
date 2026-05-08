// Re-export shim. The canonical hook now lives at `lib/hooks/useProjectActivity.ts`
// so non-Gantt surfaces (Dashboard activity feed) can import it without
// reaching into the Gantt namespace. Existing Gantt sub-tabs (OverviewTab,
// TaskDrawer, OrderDrawer, InvoiceDrawer) continue to import from this path —
// the shim avoids touching files with pre-existing typecheck issues during
// the connectedness pass. A future cleanup can flip the imports.

export { useProjectActivity, ACTIVITY_VERBS } from '../../../lib/hooks/useProjectActivity';

// jobsBoard.ts — Cross-type status mapping and board data aggregation.
//
// Pure mapping functions (columnFor*, dropResult) are the board's brain: they
// are fully unit-tested in src/__tests__/jobsBoard.test.ts and kept as flat
// record lookups — no cleverness, easy to audit.
//
// fetchBoardCards() aggregates three parallel reads (service jobs, maintenance
// requests, projects) and maps each through the appropriate columnFor* function,
// dropping hidden (null-column) cards unless opts.includeCancelled is set.

import { supabase, supabaseConfigured } from '../supabase';
import { listServiceJobs, displayJobNumber } from './serviceJobs';
import { listJobIdsWithSentVariations } from './commercial';
import { listAllRequests } from './maintenanceRequests';
import { listProjects, type ProjectRow } from './projects';
import type { SimproStage } from '../jobs/simproCsv';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

// Active board columns. 'completed' is the renamed 'done'; 'invoiced'/'paid' are
// new terminal stages (mig 76). 'archived' is intentionally NOT a column — archived
// jobs leave the active board and are reached via the toolbar's archived view.
export type BoardColumn = 'pending' | 'scheduled' | 'in_progress' | 'completed' | 'invoiced' | 'paid';
export type BoardCardType = 'service' | 'maintenance' | 'project';

export interface BoardCard {
  type: BoardCardType;
  id: string;
  title: string;
  /** service: clientName; maintenance: customerName · propertyName; project: client_name */
  clientLabel: string | null;
  column: BoardColumn;
  /** Maintenance urgency (1–5). null for other types. */
  urgency: number | null;
  /** Assigned staff profile id (service only in v1). */
  assignedTo: string | null;
  scheduledFor: string | null;
  createdAt: string;
  /** ISO timestamp when the card was completed. null for projects (no field) and
   *  open cards. Slice to 'YYYY-MM-DD' for date comparisons. */
  completedAt: string | null;
  /** Present and true only for cancelled cards included via includeCancelled. */
  cancelled?: boolean;
  /** Present and true only for archived cards (the archived view). */
  archived?: boolean;
  /** Human-friendly job number to display (service: external_ref ?? job_number;
   *  project: external_ref; maintenance: none). null when the job predates numbering. */
  number?: string | null;
  /** Project-type cards only: user_ids of active members (accepted + pending, removed_at IS NULL). */
  memberIds?: string[];
  /** Original Sim-Pro stage for service/project cards promoted from an import
   *  (matched by external_ref). null when the job didn't come from Sim-Pro. Lets
   *  the board distinguish Complete / Invoiced / Archived, which otherwise all
   *  collapse into the single "done" column. */
  simproStage?: SimproStage | null;
  /** Service cards only: the work register inherited from the originating quote
   *  (mig 93). Drives the Project filter/badge; drag semantics stay 'service'. */
  kind?: 'service' | 'project';
  /** Service cards only: a variation is SENT and awaiting the customer's yes —
   *  upsell money in flight. */
  variationPending?: boolean;
  /** Service cards only: external-subcontractor job (mig 102) — drives the
   *  Contractor sub-view/badge. */
  isContractor?: boolean;
  contractorName?: string | null;
  /** Service cards only: customer paid upfront (mig 103) — drives the Prepaid
   *  sub-view/badge. */
  prepaid?: boolean;
}

export type DropResult =
  | { kind: 'apply'; status: string }
  | { kind: 'needs-date' }
  | { kind: 'confirm'; status: string }
  | { kind: 'blocked'; reason: string };

// ---------------------------------------------------------------------------
// Local-date helper
// ---------------------------------------------------------------------------

/**
 * Convert a full ISO timestamp (e.g. "2026-06-11T09:30:00.000Z") to the
 * LOCAL calendar date string "YYYY-MM-DD".  Using Date parts (not slice) so
 * that a timestamp that is still "yesterday" in UTC but "today" in the local
 * timezone (or vice-versa) resolves to the correct LOCAL day.
 */
export function localDateOf(isoTimestamp: string): string {
  const d = new Date(isoTimestamp);
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

// ---------------------------------------------------------------------------
// Priority derivation
// ---------------------------------------------------------------------------

export type BoardPriority = 'P1' | 'P2' | 'P3' | null;

/**
 * Derive a display priority for a card.
 *
 * Maintenance: real urgency field (5-4 → P1, 3 → P2, 1-2 → P3).
 * Service / Project: schedule pressure — overdue or due today → P1,
 *   due within 3 days → P2, dated later → P3, undated → null.
 * Done / cancelled cards → null (closed work has no priority).
 */
export function priorityFor(
  card: Pick<BoardCard, 'type' | 'urgency' | 'scheduledFor' | 'column' | 'cancelled'>,
  todayIso: string,
): BoardPriority {
  // Closed / cancelled cards have no actionable priority (Completed/Invoiced/Paid
  // are all terminal — the work is done).
  if (card.column === 'completed' || card.column === 'invoiced' || card.column === 'paid' || card.cancelled) {
    return null;
  }

  if (card.type === 'maintenance') {
    const u = card.urgency;
    if (u === null) return null;
    if (u >= 4) return 'P1';
    if (u === 3) return 'P2';
    return 'P3';
  }

  // Service and Project: schedule pressure.
  const sf = card.scheduledFor;
  if (sf === null) return null;

  // Lexicographic comparison is valid for YYYY-MM-DD strings (no new Date()).
  if (sf <= todayIso) return 'P1';

  // Days difference: parse year/month/day parts to avoid TZ pitfalls.
  const [ty, tm, td] = todayIso.split('-').map(Number);
  const [sy, sm, sd] = sf.split('-').map(Number);
  // Use UTC midnight to get clean day counts.
  const todayMs = Date.UTC(ty, tm - 1, td);
  const sfMs    = Date.UTC(sy, sm - 1, sd);
  const diffDays = Math.round((sfMs - todayMs) / 86_400_000);

  if (diffDays <= 3) return 'P2';
  return 'P3';
}

// ---------------------------------------------------------------------------
// Hours waiting (pending cards)
// ---------------------------------------------------------------------------

/**
 * Whole hours a pending card has waited since creation. Always >= 0.
 */
export function hoursWaiting(createdAt: string, now: Date): number {
  const ms = now.getTime() - new Date(createdAt).getTime();
  return Math.max(0, Math.floor(ms / 3_600_000));
}

// ---------------------------------------------------------------------------
// Column micro-metrics
// ---------------------------------------------------------------------------

/**
 * Derive column-level metrics from the current set of board cards.
 *
 * - pendingAvgWaitH: average whole hours in pending (1 decimal place), null if empty.
 * - scheduledNextDue: earliest scheduledFor string among scheduled cards, null if none.
 * - inProgressAvgAgeD: average age in whole days among in_progress cards, null if empty.
 * - doneClosedToday: count of done cards whose completedAt LOCAL date === todayIso.
 */
export function columnMetrics(
  cards: BoardCard[],
  todayIso: string,
  now: Date,
): {
  pendingAvgWaitH: number | null;
  scheduledNextDue: string | null;
  inProgressAvgAgeD: number | null;
  doneClosedToday: number;
} {
  // --- Pending avg wait hours ---
  const pendingWaits = cards
    .filter((c) => c.column === 'pending')
    .map((c) => hoursWaiting(c.createdAt, now));

  const pendingAvgWaitH =
    pendingWaits.length === 0
      ? null
      : Math.round((pendingWaits.reduce((a, b) => a + b, 0) / pendingWaits.length) * 10) / 10;

  // --- Scheduled: next due date ---
  const scheduledDates = cards
    .filter((c) => c.column === 'scheduled' && c.scheduledFor !== null)
    .map((c) => c.scheduledFor as string);

  const scheduledNextDue =
    scheduledDates.length === 0
      ? null
      : scheduledDates.reduce((min, d) => (d < min ? d : min));

  // --- In-progress: avg age in whole days ---
  const inProgressAges = cards
    .filter((c) => c.column === 'in_progress')
    .map((c) => {
      const ms = now.getTime() - new Date(c.createdAt).getTime();
      return Math.max(0, Math.floor(ms / 86_400_000));
    });

  const inProgressAvgAgeD =
    inProgressAges.length === 0
      ? null
      : Math.floor(inProgressAges.reduce((a, b) => a + b, 0) / inProgressAges.length);

  // --- Done: closed today (compare LOCAL date to avoid UTC-vs-local mismatch) ---
  const doneClosedToday = cards.filter(
    (c) => c.column === 'completed' && c.completedAt !== null && localDateOf(c.completedAt) === todayIso,
  ).length;

  return { pendingAvgWaitH, scheduledNextDue, inProgressAvgAgeD, doneClosedToday };
}

// ---------------------------------------------------------------------------
// Column mapping — service jobs
// ---------------------------------------------------------------------------

const SERVICE_COLUMN: Record<string, BoardColumn | null> = {
  pending:    'pending',
  scheduled:  'scheduled',
  in_progress: 'in_progress',
  done:       'completed',   // 'done' status renders in the "Completed" column
  invoiced:   'invoiced',
  paid:       'paid',
  archived:   null, // off the active board — reached via the archived view
  cancelled:  null, // hidden from the board
};

/** Returns the board column for a service job status, or null if the card
 *  should be hidden (cancelled). */
export function columnForServiceJob(status: string): BoardColumn | null {
  return Object.prototype.hasOwnProperty.call(SERVICE_COLUMN, status)
    ? SERVICE_COLUMN[status]
    : null;
}

// ---------------------------------------------------------------------------
// Column mapping — maintenance requests
// ---------------------------------------------------------------------------

const MAINTENANCE_COLUMN: Record<string, BoardColumn | null> = {
  new:          'pending',
  acknowledged: 'pending',
  scheduled:    'scheduled',
  completed:    'completed',
  cancelled:    null, // hidden
};

/** Returns the board column for a maintenance request status, or null if
 *  hidden (cancelled). */
export function columnForMaintenance(status: string): BoardColumn | null {
  return Object.prototype.hasOwnProperty.call(MAINTENANCE_COLUMN, status)
    ? MAINTENANCE_COLUMN[status]
    : null;
}

// ---------------------------------------------------------------------------
// Column mapping — projects
// ---------------------------------------------------------------------------

const PROJECT_COLUMN: Record<string, BoardColumn | null> = {
  on_hold:   'pending',
  active:    'in_progress',
  completed: 'completed',
  archived:  null, // off the active board — reached via the archived view
};

/** Returns the board column for a project status, or null if hidden (archived). */
export function columnForProject(status: string): BoardColumn | null {
  return Object.prototype.hasOwnProperty.call(PROJECT_COLUMN, status)
    ? PROJECT_COLUMN[status]
    : null;
}

// ---------------------------------------------------------------------------
// Drop result — what happens when a card is dragged to a column
// ---------------------------------------------------------------------------

/**
 * Determine the action to take when a card of `type` is dropped onto `target`.
 *
 * Service jobs: unrestricted status changes; scheduled requires a date picker.
 *
 * Maintenance: maps board columns back to the maintenance domain's own statuses.
 * NOTE v1 wrinkle — maintenance has no native `in_progress` status. Dropping a
 * maintenance card on the In Progress column applies `scheduled` (closest
 * semantic: actively being worked). The card therefore re-renders in the
 * Scheduled column after the next reload. Acceptable v1 behaviour, documented
 * here so future migrations can introduce a real `in_progress` maintenance
 * status without breaking the mapping logic.
 *
 * Projects: Done requires an explicit confirm dialog (closes the whole project);
 * Scheduled is blocked — projects are scheduled via the Gantt, not the board.
 */
export function dropResult(type: BoardCardType, target: BoardColumn): DropResult {
  switch (type) {
    case 'service': {
      // The "Completed" column maps to the DB status 'done' (kept as-is).
      const SERVICE_DROP: Record<BoardColumn, DropResult> = {
        pending:     { kind: 'apply', status: 'pending' },
        scheduled:   { kind: 'needs-date' },
        in_progress: { kind: 'apply', status: 'in_progress' },
        completed:   { kind: 'apply', status: 'done' },
        invoiced:    { kind: 'apply', status: 'invoiced' },
        paid:        { kind: 'apply', status: 'paid' },
      };
      return SERVICE_DROP[target];
    }

    case 'maintenance': {
      const MAINTENANCE_DROP: Record<BoardColumn, DropResult> = {
        pending:    { kind: 'apply',      status: 'acknowledged' },
        scheduled:  { kind: 'needs-date' },
        // v1 wrinkle: no native in_progress — apply 'scheduled'; card re-renders
        // in Scheduled column after reload.
        in_progress: { kind: 'apply',     status: 'scheduled' },
        completed:  { kind: 'apply',      status: 'completed' },
        // Maintenance requests aren't invoiced/paid through the board.
        invoiced:   { kind: 'blocked', reason: 'Maintenance requests aren’t invoiced here' },
        paid:       { kind: 'blocked', reason: 'Maintenance requests aren’t invoiced here' },
      };
      return MAINTENANCE_DROP[target];
    }

    case 'project': {
      const PROJECT_DROP: Record<BoardColumn, DropResult> = {
        pending:    { kind: 'apply',   status: 'on_hold' },
        scheduled:  { kind: 'blocked', reason: 'Projects are scheduled in the Gantt' },
        in_progress: { kind: 'apply',  status: 'active' },
        completed:  { kind: 'confirm', status: 'completed' },
        invoiced:   { kind: 'blocked', reason: 'Projects aren’t invoiced through the board' },
        paid:       { kind: 'blocked', reason: 'Projects aren’t invoiced through the board' },
      };
      return PROJECT_DROP[target];
    }
  }
}

// ---------------------------------------------------------------------------
// Board data aggregation
// ---------------------------------------------------------------------------

/** Sort comparator: scheduledFor asc (nulls last), then createdAt asc. */
function compareCards(a: BoardCard, b: BoardCard): number {
  // nulls-last on scheduledFor
  if (a.scheduledFor !== b.scheduledFor) {
    if (a.scheduledFor === null) return 1;
    if (b.scheduledFor === null) return -1;
    if (a.scheduledFor < b.scheduledFor) return -1;
    if (a.scheduledFor > b.scheduledFor) return 1;
  }
  // secondary: createdAt asc
  if (a.createdAt < b.createdAt) return -1;
  if (a.createdAt > b.createdAt) return 1;
  return 0;
}

/**
 * Map of external_ref → Sim-Pro stage for every staged job (paginated past the
 * 1000-row PostgREST ceiling). Lets the board show the real Sim-Pro status on
 * promoted cards without a schema change — the staging row persists after
 * promotion and keeps its stage. Failure-tolerant: any error yields an empty
 * map (badges simply don't render), never blocking the board.
 */
async function fetchSimproStages(): Promise<Map<string, SimproStage>> {
  const map = new Map<string, SimproStage>();
  if (!supabaseConfigured()) return map;
  const PAGE = 1000;
  try {
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('simpro_jobs')
        .select('external_ref, stage')
        .range(from, from + PAGE - 1);
      if (error) break;
      const rows = (data ?? []) as { external_ref: string | null; stage: SimproStage }[];
      for (const r of rows) if (r.external_ref) map.set(r.external_ref, r.stage);
      if (rows.length < PAGE) break;
    }
  } catch {
    // non-fatal — board renders without Sim-Pro badges
  }
  return map;
}

/**
 * Fetch all board cards from the three domains in parallel.
 *
 * - Service jobs and maintenance requests return [] when Supabase is not
 *   configured (module guards), so the board gracefully renders empty.
 * - Cards whose columnFor* mapping returns null are dropped UNLESS the matching
 *   opt is set: cancelled cards appear in the Completed column with
 *   `cancelled: true` when `includeCancelled`; archived cards are returned with
 *   `archived: true` when `includeArchived` (the toolbar's archived view renders
 *   those as a flat list, not in the columns).
 * - Sort: scheduledFor asc nulls-last, then createdAt asc.
 */
export async function fetchBoardCards(
  opts?: { includeCancelled?: boolean; includeArchived?: boolean },
): Promise<BoardCard[]> {
  const [serviceJobs, maintenanceReqs, projects, simproStages, sentVariationJobIds] = await Promise.all([
    listServiceJobs(),
    listAllRequests(),
    listProjects(),
    fetchSimproStages(),
    listJobIdsWithSentVariations().catch(() => new Set<string>()),
  ]);

  // Look up a promoted card's original Sim-Pro stage by its job number.
  const stageFor = (externalRef: string | null | undefined): SimproStage | null =>
    externalRef ? simproStages.get(externalRef) ?? null : null;

  const cards: BoardCard[] = [];

  // --- Service jobs ---
  for (const job of serviceJobs) {
    const col = columnForServiceJob(job.status);
    const number = displayJobNumber(job);
    if (col === null) {
      // Hidden status: 'archived' → archived view; 'cancelled' → cancelled toggle.
      const isArchived = job.status === 'archived';
      const include = isArchived ? opts?.includeArchived : opts?.includeCancelled;
      if (include) {
        cards.push({
          type:         'service',
          id:           job.id,
          title:        job.title,
          clientLabel:  job.clientName ?? null,
          column:       'completed', // placeholder; archived/cancelled render outside the columns
          urgency:      null,
          assignedTo:   job.assignedTo,
          scheduledFor: job.scheduledFor,
          createdAt:    job.createdAt,
          completedAt:  job.completedAt,
          cancelled:    !isArchived,
          archived:     isArchived,
          number,
          simproStage:  stageFor(job.externalRef),
          kind:         job.kind,
          variationPending: sentVariationJobIds.has(job.id),
          isContractor: job.isContractor,
          contractorName: job.contractorName,
          prepaid:      job.prepaid,
        });
      }
      continue;
    }
    cards.push({
      type:         'service',
      id:           job.id,
      title:        job.title,
      clientLabel:  job.clientName ?? null,
      column:       col,
      urgency:      null,
      assignedTo:   job.assignedTo,
      scheduledFor: job.scheduledFor,
      createdAt:    job.createdAt,
      completedAt:  job.completedAt,
      number,
      simproStage:  stageFor(job.externalRef),
      kind:         job.kind,
      variationPending: sentVariationJobIds.has(job.id),
      isContractor: job.isContractor,
      contractorName: job.contractorName,
      prepaid:      job.prepaid,
    });
  }

  // --- Maintenance requests ---
  for (const req of maintenanceReqs) {
    const col = columnForMaintenance(req.status);
    // Build a graceful "customer · property" label, handling nulls.
    const parts: string[] = [];
    if (req.customerName) parts.push(req.customerName);
    if (req.propertyName) parts.push(req.propertyName);
    const clientLabel = parts.length > 0 ? parts.join(' · ') : null;

    if (col === null) {
      // Maintenance requests only have a hidden 'cancelled' status (no archive).
      if (opts?.includeCancelled) {
        cards.push({
          type:         'maintenance',
          id:           req.id,
          title:        req.title,
          clientLabel,
          column:       'completed',
          urgency:      req.urgency,
          assignedTo:   null,
          scheduledFor: req.scheduledFor,
          createdAt:    req.createdAt,
          completedAt:  req.completedAt,
          cancelled:    true,
        });
      }
      continue;
    }
    cards.push({
      type:         'maintenance',
      id:           req.id,
      title:        req.title,
      clientLabel,
      column:       col,
      urgency:      req.urgency,
      assignedTo:   null,
      scheduledFor: req.scheduledFor,
      createdAt:    req.createdAt,
      completedAt:  req.completedAt,
    });
  }

  // --- Projects ---
  // ProjectRow uses snake_case (returned directly from Supabase, no mapper).
  for (const project of projects as ProjectRow[]) {
    const col = columnForProject(project.status);
    const number = project.external_ref ?? null;
    if (col === null) {
      // Projects' only hidden status is 'archived' → archived view.
      if (opts?.includeArchived) {
        cards.push({
          type:         'project',
          id:           project.id,
          title:        project.name,
          clientLabel:  project.client_name ?? null,
          column:       'completed', // placeholder; archived renders outside the columns
          urgency:      null,
          assignedTo:   null,
          scheduledFor: null,
          createdAt:    project.created_at,
          completedAt:  null,
          archived:     true,
          number,
          simproStage:  stageFor(project.external_ref),
        });
      }
      continue;
    }
    cards.push({
      type:         'project',
      id:           project.id,
      title:        project.name,
      clientLabel:  project.client_name ?? null,
      column:       col,
      urgency:      null,
      assignedTo:   null,
      scheduledFor: null,
      createdAt:    project.created_at,
      completedAt:  null,
      number,
      simproStage:  stageFor(project.external_ref),
    });
  }

  // --- Bulk member query for project cards ---
  // One query for all project ids in this fetch; no per-project loop.
  // Includes both accepted and pending members (removed_at IS NULL is the only
  // active-membership gate; accepted/pending are crew either way).
  // Failure-tolerant: memberIds stays undefined on error so cards render without coins.
  if (supabaseConfigured()) {
    const projectCardIds = cards
      .filter((c) => c.type === "project")
      .map((c) => c.id);

    if (projectCardIds.length > 0) {
      try {
        const { data: memberRows } = await supabase
          .from("project_members")
          .select("project_id, user_id")
          .in("project_id", projectCardIds)
          .is("removed_at", null);

        if (memberRows) {
          // Group user_ids by project_id
          const byProject = new Map<string, string[]>();
          for (const row of memberRows as { project_id: string; user_id: string }[]) {
            const list = byProject.get(row.project_id);
            if (list) {
              list.push(row.user_id);
            } else {
              byProject.set(row.project_id, [row.user_id]);
            }
          }
          // Attach to each project card
          for (const c of cards) {
            if (c.type === "project") {
              const ids = byProject.get(c.id);
              if (ids && ids.length > 0) c.memberIds = ids;
            }
          }
        }
      } catch {
        // Failure-tolerant: memberIds stays undefined; project cards render without coins.
      }
    }
  }

  cards.sort(compareCards);
  return cards;
}

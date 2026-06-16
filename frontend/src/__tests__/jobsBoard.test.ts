import { describe, it, expect } from 'vitest';
import {
  columnForServiceJob, columnForMaintenance, columnForProject,
  dropResult,
  priorityFor,
  hoursWaiting,
  columnMetrics,
  localDateOf,
  type BoardCard,
} from '../lib/api/jobsBoard';

describe('jobsBoard status mapping', () => {
  it('maps service job statuses to columns', () => {
    expect(columnForServiceJob('pending')).toBe('pending');
    expect(columnForServiceJob('scheduled')).toBe('scheduled');
    expect(columnForServiceJob('in_progress')).toBe('in_progress');
    expect(columnForServiceJob('done')).toBe('done');
    expect(columnForServiceJob('cancelled')).toBeNull(); // hidden
  });
  it('maps maintenance statuses to columns', () => {
    expect(columnForMaintenance('new')).toBe('pending');
    expect(columnForMaintenance('acknowledged')).toBe('pending');
    expect(columnForMaintenance('scheduled')).toBe('scheduled');
    expect(columnForMaintenance('completed')).toBe('done');
    expect(columnForMaintenance('cancelled')).toBeNull();
  });
  it('maps project statuses to columns', () => {
    expect(columnForProject('on_hold')).toBe('pending');
    expect(columnForProject('active')).toBe('in_progress');
    expect(columnForProject('completed')).toBe('done');
    expect(columnForProject('archived')).toBeNull();
  });
  it('dropResult: service job drags are unrestricted and need a date for scheduled', () => {
    expect(dropResult('service', 'scheduled')).toEqual({ kind: 'needs-date' });
    expect(dropResult('service', 'done')).toEqual({ kind: 'apply', status: 'done' });
    expect(dropResult('service', 'pending')).toEqual({ kind: 'apply', status: 'pending' });
  });
  it('dropResult: maintenance maps columns back to its own statuses', () => {
    expect(dropResult('maintenance', 'pending')).toEqual({ kind: 'apply', status: 'acknowledged' });
    expect(dropResult('maintenance', 'scheduled')).toEqual({ kind: 'needs-date' });
    expect(dropResult('maintenance', 'in_progress')).toEqual({ kind: 'apply', status: 'scheduled' });
    expect(dropResult('maintenance', 'done')).toEqual({ kind: 'apply', status: 'completed' });
  });
  it('dropResult: projects confirm Done, block Scheduled', () => {
    expect(dropResult('project', 'pending')).toEqual({ kind: 'apply', status: 'on_hold' });
    expect(dropResult('project', 'in_progress')).toEqual({ kind: 'apply', status: 'active' });
    expect(dropResult('project', 'done')).toEqual({ kind: 'confirm', status: 'completed' });
    expect(dropResult('project', 'scheduled')).toEqual({ kind: 'blocked', reason: 'Projects are scheduled in the Gantt' });
  });
});

// ---------------------------------------------------------------------------
// priorityFor
// ---------------------------------------------------------------------------

/** Helper to build a minimal card stub for priorityFor. */
function makeCard(
  overrides: Partial<Pick<BoardCard, 'type' | 'urgency' | 'scheduledFor' | 'column' | 'cancelled'>>,
): Pick<BoardCard, 'type' | 'urgency' | 'scheduledFor' | 'column' | 'cancelled'> {
  return {
    type: 'service',
    urgency: null,
    scheduledFor: null,
    column: 'pending',
    cancelled: undefined,
    ...overrides,
  };
}

describe('priorityFor — maintenance urgency mapping', () => {
  it('urgency 5 → P1', () => {
    expect(priorityFor(makeCard({ type: 'maintenance', urgency: 5, column: 'pending' }), '2026-06-11')).toBe('P1');
  });
  it('urgency 4 → P1', () => {
    expect(priorityFor(makeCard({ type: 'maintenance', urgency: 4, column: 'pending' }), '2026-06-11')).toBe('P1');
  });
  it('urgency 3 → P2', () => {
    expect(priorityFor(makeCard({ type: 'maintenance', urgency: 3, column: 'pending' }), '2026-06-11')).toBe('P2');
  });
  it('urgency 2 → P3', () => {
    expect(priorityFor(makeCard({ type: 'maintenance', urgency: 2, column: 'pending' }), '2026-06-11')).toBe('P3');
  });
  it('urgency 1 → P3', () => {
    expect(priorityFor(makeCard({ type: 'maintenance', urgency: 1, column: 'pending' }), '2026-06-11')).toBe('P3');
  });
  it('maintenance in done column → null (closed work)', () => {
    expect(priorityFor(makeCard({ type: 'maintenance', urgency: 5, column: 'done' }), '2026-06-11')).toBeNull();
  });
  it('maintenance cancelled → null', () => {
    expect(priorityFor(makeCard({ type: 'maintenance', urgency: 5, column: 'pending', cancelled: true }), '2026-06-11')).toBeNull();
  });
});

describe('priorityFor — service/project schedule pressure', () => {
  const TODAY = '2026-06-11';

  it('service: overdue (past date) → P1', () => {
    expect(priorityFor(makeCard({ type: 'service', scheduledFor: '2026-06-10', column: 'scheduled' }), TODAY)).toBe('P1');
  });
  it('service: due today → P1', () => {
    expect(priorityFor(makeCard({ type: 'service', scheduledFor: TODAY, column: 'scheduled' }), TODAY)).toBe('P1');
  });
  it('service: due in 2 days (within 3) → P2', () => {
    expect(priorityFor(makeCard({ type: 'service', scheduledFor: '2026-06-13', column: 'scheduled' }), TODAY)).toBe('P2');
  });
  it('service: due in exactly 3 days (within 3) → P2', () => {
    expect(priorityFor(makeCard({ type: 'service', scheduledFor: '2026-06-14', column: 'scheduled' }), TODAY)).toBe('P2');
  });
  it('service: due in 5 days → P3', () => {
    expect(priorityFor(makeCard({ type: 'service', scheduledFor: '2026-06-16', column: 'scheduled' }), TODAY)).toBe('P3');
  });
  it('service: undated → null (no badge)', () => {
    expect(priorityFor(makeCard({ type: 'service', scheduledFor: null, column: 'pending' }), TODAY)).toBeNull();
  });
  it('service: done column → null', () => {
    expect(priorityFor(makeCard({ type: 'service', scheduledFor: '2026-06-10', column: 'done' }), TODAY)).toBeNull();
  });
  it('service: cancelled → null', () => {
    expect(priorityFor(makeCard({ type: 'service', scheduledFor: '2026-06-10', column: 'pending', cancelled: true }), TODAY)).toBeNull();
  });
  it('project: overdue → P1', () => {
    expect(priorityFor(makeCard({ type: 'project', scheduledFor: '2026-06-01', column: 'in_progress' }), TODAY)).toBe('P1');
  });
  it('project: undated → null', () => {
    expect(priorityFor(makeCard({ type: 'project', scheduledFor: null, column: 'in_progress' }), TODAY)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// hoursWaiting
// ---------------------------------------------------------------------------

describe('hoursWaiting', () => {
  it('returns whole hours elapsed since creation', () => {
    const created = '2026-06-10T08:00:00.000Z';
    const now = new Date('2026-06-10T10:30:00.000Z');
    expect(hoursWaiting(created, now)).toBe(2); // 2.5h → floor → 2
  });
  it('returns 0 when now equals createdAt', () => {
    const ts = '2026-06-11T00:00:00.000Z';
    expect(hoursWaiting(ts, new Date(ts))).toBe(0);
  });
  it('clamps to 0 (non-negative) when now is before createdAt', () => {
    const created = '2026-06-11T12:00:00.000Z';
    const now = new Date('2026-06-11T08:00:00.000Z');
    expect(hoursWaiting(created, now)).toBe(0);
  });
  it('returns exact whole hours with no remainder', () => {
    const created = '2026-06-10T00:00:00.000Z';
    const now = new Date('2026-06-10T05:00:00.000Z');
    expect(hoursWaiting(created, now)).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// columnMetrics
// ---------------------------------------------------------------------------

// Build a "now" that is deterministic in any timezone: local noon today.
// Using local-Date constructor parts avoids the UTC-midnight-is-yesterday-local
// problem that would otherwise make the suite fail in UTC+10 / UTC+12 zones.
const _today = new Date();
const TODAY_ISO =
  `${_today.getFullYear()}-` +
  `${String(_today.getMonth() + 1).padStart(2, '0')}-` +
  `${String(_today.getDate()).padStart(2, '0')}`;
// Local noon so we have headroom above/below without crossing midnight in any tz.
const NOW = new Date(_today.getFullYear(), _today.getMonth(), _today.getDate(), 12, 0, 0);

// Helper: ISO timestamp for a local time offset (hours) relative to NOW.
// e.g. nowMinus(2) = 2 hours before local noon today.
function nowMinus(hours: number): string {
  return new Date(NOW.getTime() - hours * 3_600_000).toISOString();
}
// Helper: ISO timestamp at a specific LOCAL hour today (minute/second = 0).
function localToday(hour: number): string {
  return new Date(_today.getFullYear(), _today.getMonth(), _today.getDate(), hour).toISOString();
}
// Helper: ISO timestamp at a specific LOCAL hour YESTERDAY.
function localYesterday(hour: number): string {
  return new Date(_today.getFullYear(), _today.getMonth(), _today.getDate() - 1, hour).toISOString();
}

function card(overrides: Partial<BoardCard>): BoardCard {
  return {
    type: 'service',
    id: 'x',
    title: 'Test',
    clientLabel: null,
    column: 'pending',
    urgency: null,
    assignedTo: null,
    scheduledFor: null,
    // Default createdAt = 2h before NOW (local noon), always within today.
    createdAt: nowMinus(2),
    completedAt: null,
    ...overrides,
  };
}

describe('columnMetrics — empty board', () => {
  it('all nulls / zero when no cards', () => {
    const result = columnMetrics([], TODAY_ISO, NOW);
    expect(result.pendingAvgWaitH).toBeNull();
    expect(result.scheduledNextDue).toBeNull();
    expect(result.inProgressAvgAgeD).toBeNull();
    expect(result.doneClosedToday).toBe(0);
  });
});

describe('columnMetrics — pending avg wait hours', () => {
  it('single pending card: 2h wait → 2', () => {
    const cards = [
      card({ column: 'pending', createdAt: nowMinus(2) }),
    ];
    // NOW is local noon; card created 2h ago → 2h wait
    const result = columnMetrics(cards, TODAY_ISO, NOW);
    expect(result.pendingAvgWaitH).toBe(2);
  });
  it('two pending cards: 2h and 4h → avg 3.0', () => {
    const cards = [
      card({ column: 'pending', createdAt: nowMinus(2) }), // 2h
      card({ column: 'pending', createdAt: nowMinus(4) }), // 4h
    ];
    const result = columnMetrics(cards, TODAY_ISO, NOW);
    expect(result.pendingAvgWaitH).toBe(3.0);
  });
  it('avg is rounded to 1 decimal place', () => {
    const cards = [
      card({ column: 'pending', createdAt: nowMinus(1) }), // 1h
      card({ column: 'pending', createdAt: nowMinus(2) }), // 2h
      card({ column: 'pending', createdAt: nowMinus(3) }), // 3h
    ];
    // avg = 2h → 2.0
    const result = columnMetrics(cards, TODAY_ISO, NOW);
    expect(result.pendingAvgWaitH).toBe(2.0);
  });
  it('non-pending cards are excluded from pending avg', () => {
    const cards = [
      card({ column: 'scheduled', createdAt: nowMinus(26) }),
      card({ column: 'done',      createdAt: nowMinus(26) }),
    ];
    const result = columnMetrics(cards, TODAY_ISO, NOW);
    expect(result.pendingAvgWaitH).toBeNull();
  });
});

describe('columnMetrics — scheduled nextDue', () => {
  it('picks the earliest scheduledFor among scheduled cards', () => {
    const cards = [
      card({ column: 'scheduled', scheduledFor: '2026-06-15' }),
      card({ column: 'scheduled', scheduledFor: '2026-06-12' }),
      card({ column: 'scheduled', scheduledFor: '2026-06-20' }),
    ];
    const result = columnMetrics(cards, TODAY_ISO, NOW);
    expect(result.scheduledNextDue).toBe('2026-06-12');
  });
  it('null when no scheduled cards have a scheduledFor', () => {
    const cards = [
      card({ column: 'scheduled', scheduledFor: null }),
    ];
    const result = columnMetrics(cards, TODAY_ISO, NOW);
    expect(result.scheduledNextDue).toBeNull();
  });
  it('null when no scheduled-column cards at all', () => {
    const cards = [card({ column: 'pending' })];
    const result = columnMetrics(cards, TODAY_ISO, NOW);
    expect(result.scheduledNextDue).toBeNull();
  });
});

describe('columnMetrics — inProgress avg age days', () => {
  it('card created exactly 48h ago → avgAgeD 2', () => {
    // nowMinus(48) = exactly 48h before NOW → 2 whole days
    const cards = [
      card({ column: 'in_progress', createdAt: nowMinus(48) }),
    ];
    const result = columnMetrics(cards, TODAY_ISO, NOW);
    expect(result.inProgressAvgAgeD).toBe(2);
  });
  it('null when no in_progress cards', () => {
    const result = columnMetrics([], TODAY_ISO, NOW);
    expect(result.inProgressAvgAgeD).toBeNull();
  });
});

describe('columnMetrics — doneClosedToday', () => {
  it('counts done cards whose completedAt LOCAL date === todayIso', () => {
    // Construct completedAt as LOCAL timestamps so the local date is unambiguously today.
    const cards = [
      card({ column: 'done', completedAt: localToday(9)  }),  // local 09:00 today
      card({ column: 'done', completedAt: localToday(14) }),  // local 14:00 today
      card({ column: 'done', completedAt: localYesterday(22) }), // local 22:00 yesterday
      card({ column: 'done', completedAt: null }),               // no timestamp
    ];
    const result = columnMetrics(cards, TODAY_ISO, NOW);
    expect(result.doneClosedToday).toBe(2);
  });
  it('counts 0 when no cards completed today', () => {
    const cards = [
      card({ column: 'done', completedAt: localYesterday(9) }), // local 09:00 yesterday
    ];
    const result = columnMetrics(cards, TODAY_ISO, NOW);
    expect(result.doneClosedToday).toBe(0);
  });
  it('only counts done column (not other columns)', () => {
    const cards = [
      card({ column: 'pending',     completedAt: localToday(9) }),
      card({ column: 'in_progress', completedAt: localToday(9) }),
    ];
    const result = columnMetrics(cards, TODAY_ISO, NOW);
    expect(result.doneClosedToday).toBe(0);
  });
  it('early local morning (08:00) completion still counts as today even in UTC+10 zones', () => {
    // local 08:00 today is prior-day UTC in +10 offset zones (22:00 prev day UTC).
    // localDateOf() must resolve to TODAY_ISO, not yesterday.
    const earlyMorning = localToday(8);
    expect(localDateOf(earlyMorning)).toBe(TODAY_ISO);
    const cards = [card({ column: 'done', completedAt: earlyMorning })];
    const result = columnMetrics(cards, TODAY_ISO, NOW);
    expect(result.doneClosedToday).toBe(1);
  });
});

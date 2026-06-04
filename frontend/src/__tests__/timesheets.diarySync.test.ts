import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { DiaryEntry, DiaryPersonnel } from '../pages/gantt/types';

// Pins the safe gap-fill contract of syncDiaryPersonnelToTimesheets (migration
// 42 bridge): for each diary person with hours>0, a timesheet is created ONLY
// when that worker has none for the date — never overwriting an existing sheet,
// never duplicating, clamping hours to the table's 0..24 check. If the gap-fill
// logic drifts (e.g. starts overwriting approved hours) the regression lands
// here first.

const { state, fromMock } = vi.hoisted(() => {
  const state = {
    configured: true,
    selectData: [] as Array<{ worker_name: string }>,
    selectError: null as { message: string } | null,
    insertError: null as { message: string } | null,
    inserted: [] as Array<Record<string, unknown>>,
    fromTables: [] as string[],
  };
  const fromMock = vi.fn((table: string) => {
    state.fromTables.push(table);
    // Thenable builder — mirrors supabase-js: the select chain is awaited
    // directly, while .insert() returns its own resolved promise.
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: () => builder,
      insert: (rows: Array<Record<string, unknown>>) => {
        state.inserted.push(...rows);
        return Promise.resolve({ error: state.insertError });
      },
      then: (resolve: (v: unknown) => void) =>
        resolve({ data: state.selectData, error: state.selectError }),
    };
    return builder;
  });
  return { state, fromMock };
});

vi.mock('../lib/supabase', () => ({
  supabase: { from: fromMock },
  supabaseConfigured: () => state.configured,
  isUuid: (id: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id),
}));

import { syncDiaryPersonnelToTimesheets } from '../lib/api/timesheets';

const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440000';

function person(over: Partial<DiaryPersonnel>): DiaryPersonnel {
  return {
    id: 'p_' + Math.random().toString(36).slice(2, 8),
    workerId: '',
    workerName: 'Worker',
    hours: 8,
    role: '',
    company: '',
    ...over,
  };
}

function entry(over: Partial<DiaryEntry> = {}): DiaryEntry {
  return {
    id: 'diary_1',
    projectId: PROJECT_ID,
    date: '2026-06-02',
    description: '',
    personnel: [],
    photoIds: [],
    createdBy: 'user-1',
    createdAt: '2026-06-02T00:00:00Z',
    ...over,
  } as DiaryEntry;
}

beforeEach(() => {
  state.configured = true;
  state.selectData = [];
  state.selectError = null;
  state.insertError = null;
  state.inserted.length = 0;
  state.fromTables.length = 0;
});

describe('syncDiaryPersonnelToTimesheets — gap-fill bridge', () => {
  it('inserts only workers who have no sheet for that date', async () => {
    state.selectData = [{ worker_name: 'John' }]; // John already clocked today
    await syncDiaryPersonnelToTimesheets(
      entry({
        personnel: [
          person({ workerName: 'John', hours: 12, role: 'Electrician', company: 'Casone' }),
          person({ workerName: 'Sarah', hours: 8, role: 'Apprentice', company: 'Casone' }),
        ],
      }),
    );
    expect(state.inserted).toHaveLength(1);
    expect(state.inserted[0]).toMatchObject({
      worker_name: 'Sarah',
      work_date: '2026-06-02',
      hours: 8,
      notes: 'Apprentice · Casone',
      status: 'submitted',
      source_diary_entry_id: 'diary_1',
      project_id: PROJECT_ID,
    });
  });

  it('never overwrites — when every worker already has a sheet, inserts nothing', async () => {
    state.selectData = [{ worker_name: 'John' }];
    await syncDiaryPersonnelToTimesheets(
      entry({ personnel: [person({ workerName: 'John', hours: 12 })] }),
    );
    expect(state.inserted).toHaveLength(0);
  });

  it('clamps hours to the 0..24 check', async () => {
    await syncDiaryPersonnelToTimesheets(
      entry({ personnel: [person({ workerName: 'Bob', hours: 30 })] }),
    );
    expect(state.inserted).toHaveLength(1);
    expect(state.inserted[0].hours).toBe(24);
  });

  it('collapses same-named people within one entry (first wins)', async () => {
    await syncDiaryPersonnelToTimesheets(
      entry({
        personnel: [
          person({ workerName: 'Bob', hours: 8 }),
          person({ workerName: 'Bob', hours: 4 }),
        ],
      }),
    );
    expect(state.inserted).toHaveLength(1);
  });

  it('skips blank names and zero-hour people', async () => {
    await syncDiaryPersonnelToTimesheets(
      entry({
        personnel: [
          person({ workerName: '', hours: 8 }),
          person({ workerName: 'Idle', hours: 0 }),
        ],
      }),
    );
    expect(state.inserted).toHaveLength(0);
  });

  it('is a no-op when Supabase is not configured', async () => {
    state.configured = false;
    await syncDiaryPersonnelToTimesheets(
      entry({ personnel: [person({ workerName: 'Sarah', hours: 8 })] }),
    );
    expect(state.inserted).toHaveLength(0);
    expect(state.fromTables).toHaveLength(0);
  });

  it('is a no-op for a demo (non-uuid) project', async () => {
    await syncDiaryPersonnelToTimesheets(
      entry({ projectId: 'demo-123', personnel: [person({ workerName: 'Sarah', hours: 8 })] }),
    );
    expect(state.inserted).toHaveLength(0);
    expect(state.fromTables).toHaveLength(0);
  });
});

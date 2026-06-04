import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { DefectRow } from '../lib/api/defects';

// Pins the supply-material link (migration 43): createDefect must send
// order_id / line_item_id to Postgres, and mapDefectRow must round-trip them
// (null → undefined). If the column wiring drifts, the Inventory↔Defects link
// silently breaks — this catches it.

const { state, fromMock } = vi.hoisted(() => {
  const state = {
    insertPayload: null as Record<string, unknown> | null,
    returnRow: null as DefectRow | null,
  };
  const single = () => Promise.resolve({ data: state.returnRow, error: null });
  const select = () => ({ single });
  const insert = (payload: Record<string, unknown>) => {
    state.insertPayload = payload;
    return { select };
  };
  const fromMock = vi.fn(() => ({ insert }));
  return { state, fromMock };
});

vi.mock('../lib/supabase', () => ({
  supabase: { from: fromMock },
  supabaseConfigured: () => true,
  isUuid: () => true,
}));

import { createDefect, mapDefectRow } from '../lib/api/defects';

const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440000';

function makeRow(over: Partial<DefectRow> = {}): DefectRow {
  return {
    id: 'def-1',
    project_id: PROJECT_ID,
    org_id: null,
    title: 'Damaged drywall',
    description: null,
    severity: 'high',
    status: 'open',
    task_id: null,
    photo_id: null,
    order_id: null,
    line_item_id: null,
    assignee_id: null,
    created_by: null,
    created_at: '2026-06-02T00:00:00Z',
    updated_at: '2026-06-02T00:00:00Z',
    verified_at: null,
    ...over,
  };
}

beforeEach(() => {
  state.insertPayload = null;
  state.returnRow = null;
});

describe('defects ↔ inventory material link', () => {
  it('createDefect sends order_id + line_item_id and maps them back', async () => {
    state.returnRow = makeRow({ order_id: 'ord-1', line_item_id: 'li-1', severity: 'high' });
    const created = await createDefect(PROJECT_ID, {
      title: 'Damaged drywall',
      severity: 'high',
      orderId: 'ord-1',
      lineItemId: 'li-1',
    });
    expect(state.insertPayload).toMatchObject({
      project_id: PROJECT_ID,
      title: 'Damaged drywall',
      severity: 'high',
      status: 'open',
      order_id: 'ord-1',
      line_item_id: 'li-1',
    });
    expect(created.orderId).toBe('ord-1');
    expect(created.lineItemId).toBe('li-1');
  });

  it('createDefect omits the link keys entirely when not provided (pre-migration safe)', async () => {
    state.returnRow = makeRow();
    await createDefect(PROJECT_ID, { title: 'No-link defect' });
    expect(state.insertPayload).not.toHaveProperty('order_id');
    expect(state.insertPayload).not.toHaveProperty('line_item_id');
  });

  it('mapDefectRow maps the link columns, null → undefined', () => {
    expect(mapDefectRow(makeRow({ order_id: 'ord-9', line_item_id: 'li-9' }))).toMatchObject({
      orderId: 'ord-9',
      lineItemId: 'li-9',
    });
    const bare = mapDefectRow(makeRow());
    expect(bare.orderId).toBeUndefined();
    expect(bare.lineItemId).toBeUndefined();
  });
});

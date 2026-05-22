import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the supabase singleton before the API module loads. Each test seeds
// a fresh `selectResolve` / `updateResolve` and the mocked `from()` returns
// a fluent builder that resolves to whatever was seeded.

const { state, setUser } = vi.hoisted(() => {
  const state = {
    user: { id: 'admin-id' } as { id: string } | null,
    selectResolve: { data: null as unknown, error: null as { message: string } | null },
    updateResolve: { data: null as unknown, error: null as { message: string } | null },
  };
  const setUser = (u: { id: string } | null) => {
    state.user = u;
  };
  return { state, setUser };
});

vi.mock('../lib/supabase', () => {
  const supabase = {
    auth: {
      getUser: () =>
        Promise.resolve({
          data: state.user ? { user: state.user } : { user: null },
          error: null,
        }),
    },
    from: vi.fn((table: string) => {
      if (table !== 'project_config') throw new Error(`Unexpected table ${table}`);
      // Two distinct query shapes:
      //   getProjectConfig → .select().eq().maybeSingle()
      //   updateProjectConfig → .update().eq().select().single()
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve(state.selectResolve),
          }),
        }),
        update: () => ({
          eq: () => ({
            select: () => ({
              single: () => Promise.resolve(state.updateResolve),
            }),
          }),
        }),
      };
    }),
  };
  return {
    supabase,
    supabaseConfigured: () => true,
    // getProjectConfig now short-circuits on non-UUID ids; the test fixture
    // uses 'project-1' (kept stable for snapshots) which is not a UUID, so we
    // stub isUuid to true so the production code path still executes.
    isUuid: () => true,
  };
});

beforeEach(() => {
  state.selectResolve = { data: null, error: null };
  state.updateResolve = { data: null, error: null };
  setUser({ id: 'admin-id' });
});

import {
  getProjectConfig,
  updateProjectConfig,
  DEFAULT_PROJECT_CONFIG,
} from '../lib/api/projectConfig';

describe('getProjectConfig', () => {
  it('returns defaults when the row is missing (backfill not yet applied)', async () => {
    state.selectResolve = { data: null, error: null };
    const cfg = await getProjectConfig('project-1');
    expect(cfg.projectId).toBe('project-1');
    expect(cfg.aiAutoUpdateThreshold).toBe(DEFAULT_PROJECT_CONFIG.aiAutoUpdateThreshold);
    expect(cfg.progressionMode).toBe('human_assisted');
    expect(cfg.phashThreshold).toBe(6);
  });

  it('maps a returned row to camelCase + coerces numeric strings', async () => {
    state.selectResolve = {
      data: {
        project_id: 'project-1',
        // Postgres `numeric(4,3)` is serialised as a string by supabase-js.
        ai_auto_update_threshold: '0.700',
        ai_review_queue_threshold: '0.400',
        ai_default_model: 'claude-sonnet-4-6',
        progression_mode: 'full_auto',
        weight_checklist: 50,
        weight_photos: 20,
        weight_ai: 30,
        target_photos_per_task: 5,
        manual_floor_allowed: false,
        phash_threshold: 10,
        accent_color: '#BE123C',
        logo_storage_path: 'p1/logo.jpg',
        report_cadence: 'weekly',
        updated_by: 'admin-id',
        updated_at: '2026-05-11T00:00:00Z',
      },
      error: null,
    };
    const cfg = await getProjectConfig('project-1');
    expect(cfg.aiAutoUpdateThreshold).toBe(0.7);
    expect(cfg.aiReviewQueueThreshold).toBe(0.4);
    expect(cfg.progressionMode).toBe('full_auto');
    expect(cfg.manualFloorAllowed).toBe(false);
    expect(cfg.accentColor).toBe('#BE123C');
    expect(cfg.reportCadence).toBe('weekly');
  });

  it('throws when the select returns an error', async () => {
    state.selectResolve = { data: null, error: { message: 'permission denied' } };
    await expect(getProjectConfig('project-1')).rejects.toMatchObject({
      message: 'permission denied',
    });
  });
});

describe('updateProjectConfig', () => {
  const fullRow = {
    project_id: 'project-1',
    ai_auto_update_threshold: '0.700',
    ai_review_queue_threshold: '0.500',
    ai_default_model: 'mvp-stub@v0',
    progression_mode: 'human_assisted',
    weight_checklist: 40,
    weight_photos: 25,
    weight_ai: 35,
    target_photos_per_task: 3,
    manual_floor_allowed: true,
    phash_threshold: 6,
    accent_color: null,
    logo_storage_path: null,
    report_cadence: 'none',
    updated_by: 'admin-id',
    updated_at: '2026-05-11T00:00:00Z',
  };

  it('returns the updated row mapped to camelCase', async () => {
    state.updateResolve = { data: fullRow, error: null };
    const cfg = await updateProjectConfig('project-1', { aiAutoUpdateThreshold: 0.7 });
    expect(cfg.aiAutoUpdateThreshold).toBe(0.7);
    expect(cfg.updatedBy).toBe('admin-id');
  });

  it('rejects when the user is not authenticated', async () => {
    setUser(null);
    await expect(
      updateProjectConfig('project-1', { aiAutoUpdateThreshold: 0.7 }),
    ).rejects.toMatchObject({ message: 'not authenticated' });
  });

  it('surfaces an RLS rejection error from the update path', async () => {
    state.updateResolve = {
      data: null,
      error: { message: 'new row violates row-level security policy' },
    };
    await expect(
      updateProjectConfig('project-1', { aiAutoUpdateThreshold: 0.7 }),
    ).rejects.toMatchObject({ message: 'new row violates row-level security policy' });
  });
});

import { describe, it, expect, vi } from 'vitest';

// `vi.hoisted` lets the mock factories reference shared values without
// running into the "Cannot access X before initialization" error that
// vitest's hoisted vi.mock would otherwise hit.
const { fakeProfiles } = vi.hoisted(() => ({
  fakeProfiles: [
    {
      id: 'p1',
      email: 'alice@example.com',
      firstName: 'Alice',
      lastName: 'Park',
      securityGroup: 'project_manager',
      isActive: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'p2',
      email: 'bob@example.com',
      firstName: 'Bob',
      lastName: 'Stone',
      securityGroup: 'worker',
      isActive: false, // soft-deleted
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'me',
      email: 'me@example.com',
      firstName: 'Self',
      lastName: 'User',
      securityGroup: 'site_manager',
      isActive: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ],
}));

vi.mock('../lib/supabase', () => ({
  supabase: {},
  supabaseConfigured: () => true,
}));

vi.mock('../lib/api/profiles', () => ({
  listProfiles: vi.fn().mockResolvedValue(fakeProfiles),
}));

import { searchProfiles } from '../lib/api/messaging';

describe('searchProfiles', () => {
  it('filters out inactive accounts and excluded ids (e.g. self)', async () => {
    const list = await searchProfiles('', { excludeUserIds: ['me'] });
    expect(list.map((p) => p.id)).toEqual(['p1']);
    // Bob is excluded for is_active=false; me for excludeUserIds.
  });

  it('matches on full name (case-insensitive)', async () => {
    const list = await searchProfiles('alice', { excludeUserIds: ['me'] });
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('p1');
  });

  it('matches on email substring', async () => {
    const list = await searchProfiles('alice@', { excludeUserIds: ['me'] });
    expect(list).toHaveLength(1);
    expect(list[0].email).toBe('alice@example.com');
  });
});

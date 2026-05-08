import { describe, it, expect, beforeEach, vi } from 'vitest';

// Pass 3 — `createDirectConversation` is idempotent at the application
// layer: when a 1:1 conversation between {me, other} already exists, it
// returns that row instead of inserting a duplicate.
//
// vi.hoisted lets the mock factory reference a shared `state` without
// hitting the "Cannot access X before initialization" trap that
// hoisted vi.mock would otherwise fire.
const { state, makeBuilder } = vi.hoisted(() => {
  type ResolveValue = { data: unknown; error: null };
  const state = {
    user: { id: 'me-id' },
    builders: {
      directList: null as null | { resolve: ResolveValue },
      memberCheck: null as null | { resolve: ResolveValue },
    },
  };
  const makeBuilder = (resolve: { data: unknown; error: null }) => {
    const b: any = {
      select: () => b,
      eq: () => b,
      in: () => b,
      // `.returns<T>()` is a Supabase JS typing helper added in v2 — chains
      // through with no runtime change. Mock returns the builder so the
      // chain continues as before.
      returns: () => b,
      single: () => Promise.resolve(resolve),
      then: (cb: (v: typeof resolve) => unknown) => Promise.resolve(resolve).then(cb),
    };
    return b;
  };
  return { state, makeBuilder };
});

vi.mock('../lib/supabase', () => {
  const supabase = {
    auth: {
      getUser: () => Promise.resolve({ data: { user: state.user } }),
    },
    from: vi.fn((table: string) => {
      if (table === 'conversation_members') {
        if (!state.builders.directList) {
          state.builders.directList = { resolve: { data: [], error: null } };
          return makeBuilder(state.builders.directList.resolve);
        }
        if (!state.builders.memberCheck) {
          state.builders.memberCheck = { resolve: { data: [], error: null } };
          return makeBuilder(state.builders.memberCheck.resolve);
        }
      }
      throw new Error(`Unexpected from(${table})`);
    }),
  };
  return { supabase, supabaseConfigured: () => true };
});

vi.mock('../lib/api/profiles', () => ({
  listProfiles: vi.fn().mockResolvedValue([]),
}));

beforeEach(() => {
  state.builders.directList = null;
  state.builders.memberCheck = null;
});

import { createDirectConversation } from '../lib/api/messaging';

describe('createDirectConversation', () => {
  it('returns the existing conversation when one already exists between me and other', async () => {
    const existingConv = {
      id: 'conv-existing',
      is_group: false,
      name: null,
      created_by: 'me-id',
      created_at: '2026-01-01T00:00:00.000Z',
    };
    // Stub builder resolves: first call (my direct conversations) returns
    // a row; second call (other in those candidate ids) confirms membership.
    state.builders.directList = {
      resolve: {
        data: [{ conversation_id: existingConv.id, conversations: existingConv }],
        error: null,
      },
    };
    state.builders.memberCheck = {
      resolve: {
        data: [{ conversation_id: existingConv.id }],
        error: null,
      },
    };

    // Re-mount supabase mock to pick up the seeded builders. Each from()
    // call drains the pre-seeded builder.
    const { supabase } = await import('../lib/supabase');
    let phase: 0 | 1 = 0;
    (supabase.from as unknown as ReturnType<typeof vi.fn>).mockImplementation((table: string) => {
      if (table !== 'conversation_members') {
        throw new Error(`Unexpected from(${table})`);
      }
      const seeded = phase === 0 ? state.builders.directList! : state.builders.memberCheck!;
      phase = 1;
      return makeBuilder(seeded.resolve);
    });

    const conv = await createDirectConversation('other-id');
    expect(conv.id).toBe(existingConv.id);
    expect(conv.isGroup).toBe(false);
  });
});

// useMyMemberships — read the current user's active project memberships.
//
// Reads through the `useFeatureStore.projectMemberships` slice so consumers
// stay reactive in mock mode without an extra network hop. In live mode the
// API helpers (`listMyMemberships`, `inviteToProject`, etc.) mirror the
// authoritative DB rows into the same slice, so this hook is the single
// read path regardless of backend state.
//
// A small bootstrap effect fires once per user-id change to refresh the
// cache from Supabase (best-effort). Loading is a soft signal — consumers
// can render against the cached data even while the refresh is in flight.

import { useEffect, useMemo, useState } from 'react';
import { useFeatureStore } from '../../store/features';
import { listMyMemberships } from '../api/projectMembers';
import { supabaseConfigured } from '../supabase';
import type { ProjectMember } from '../../types';

interface MembershipsResult {
  memberships: ProjectMember[];
  isLoading: boolean;
  /** Force-refresh from Supabase. No-op in mock mode (the cache is canonical). */
  refresh: () => Promise<void>;
}

export function useMyMemberships(userId: string | undefined): MembershipsResult {
  const slice = useFeatureStore((s) => s.projectMemberships);
  const upsert = useFeatureStore((s) => s.upsertProjectMembership);

  const [isLoading, setIsLoading] = useState<boolean>(() =>
    Boolean(supabaseConfigured() && userId),
  );

  const memberships = useMemo<ProjectMember[]>(() => {
    if (!userId) return [];
    const list = slice[userId] ?? [];
    return list.filter((m) => !m.removedAt);
  }, [slice, userId]);

  // Bootstrap fetch — runs once per userId change. The cache is the source
  // of truth for renders; this just keeps it fresh from the server.
  useEffect(() => {
    if (!userId || !supabaseConfigured()) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    listMyMemberships(userId)
      .then((rows) => {
        if (cancelled) return;
        for (const m of rows) upsert(m);
      })
      .catch(() => { /* swallow — UI falls back to whatever's in the slice */ })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // upsert is stable — Zustand setters never change identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const refresh = useMemo(
    () => async () => {
      if (!userId || !supabaseConfigured()) return;
      const rows = await listMyMemberships(userId);
      for (const m of rows) upsert(m);
    },
    [userId, upsert],
  );

  return { memberships, isLoading, refresh };
}

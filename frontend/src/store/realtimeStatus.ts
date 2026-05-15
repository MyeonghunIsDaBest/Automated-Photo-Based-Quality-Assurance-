// Tracks the per-channel status of every Supabase Realtime subscription
// mounted at Layout level. Powers the "Reconnecting…" pill in TopNav so the
// operator gets a visible signal when the feed is in trouble.
//
// Supabase channel subscribe statuses (from the supabase-js typings):
//   'SUBSCRIBED' | 'CHANNEL_ERROR' | 'CLOSED' | 'TIMED_OUT'
// We collapse those into a binary "ok"/"degraded" per channel and let the
// pill aggregate.

import { create } from 'zustand';

export type RealtimeChannelStatus =
  | 'SUBSCRIBED'
  | 'CHANNEL_ERROR'
  | 'CLOSED'
  | 'TIMED_OUT';

interface RealtimeStatusState {
  /** Per-channel last-seen status. Channels removed from the map are
   *  considered "not subscribed" — that's fine, they don't count toward the
   *  degraded count. */
  channels: Record<string, { status: RealtimeChannelStatus; since: number }>;
  setStatus: (name: string, status: RealtimeChannelStatus) => void;
  clear: (name: string) => void;
}

export const useRealtimeStatusStore = create<RealtimeStatusState>((set) => ({
  channels: {},
  setStatus: (name, status) =>
    set((s) => ({
      channels: {
        ...s.channels,
        [name]: { status, since: Date.now() },
      },
    })),
  clear: (name) =>
    set((s) => {
      const next = { ...s.channels };
      delete next[name];
      return { channels: next };
    }),
}));

/** Returns true if any tracked channel has been in a degraded state for
 *  longer than `windowMs` (default 5 s). The TopNav pill watches this and
 *  fades in when it flips to true. */
export function isAnyChannelDegraded(
  state: RealtimeStatusState,
  windowMs = 5_000,
): boolean {
  const now = Date.now();
  for (const { status, since } of Object.values(state.channels)) {
    if (status === 'SUBSCRIBED') continue;
    if (now - since >= windowMs) return true;
  }
  return false;
}

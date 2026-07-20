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
   *  degraded count. `everSubscribed` separates a DROPPED connection (worth a
   *  "Reconnecting…" pill) from one that never connected at all (usually a
   *  misconfiguration — realtime not enabled on the table — where the pill
   *  would just cry wolf forever). */
  channels: Record<string, { status: RealtimeChannelStatus; since: number; everSubscribed: boolean }>;
  setStatus: (name: string, status: RealtimeChannelStatus) => void;
  clear: (name: string) => void;
}

export const useRealtimeStatusStore = create<RealtimeStatusState>((set) => ({
  channels: {},
  setStatus: (name, status) =>
    set((s) => {
      const prev = s.channels[name];
      // A late CLOSED for a channel we already clear()ed is the unmount ack
      // arriving after cleanup — recording it would resurrect a zombie entry
      // that later reads as "never subscribed".
      if (status === 'CLOSED' && !prev) return s;
      const wasDegraded = prev !== undefined && prev.status !== 'SUBSCRIBED';
      const nowDegraded = status !== 'SUBSCRIBED';
      return {
        channels: {
          ...s.channels,
          [name]: {
            status,
            // `since` marks the START of the current degraded stretch — phoenix
            // re-fires CHANNEL_ERROR on every rejoin attempt (≤10s apart), and
            // resetting the clock each time would keep both the pill's 5s and
            // the misconfig warning's 30s windows from ever elapsing.
            since: nowDegraded && wasDegraded ? prev.since : Date.now(),
            everSubscribed: (prev?.everSubscribed ?? false) || status === 'SUBSCRIBED',
          },
        },
      };
    }),
  clear: (name) =>
    set((s) => {
      const next = { ...s.channels };
      delete next[name];
      return { channels: next };
    }),
}));

/** Returns true if any channel that HAD a live connection has been degraded
 *  for longer than `windowMs` (default 5 s). Channels that never subscribed
 *  don't count — you can't RE-connect what never connected; those are surfaced
 *  once to the console instead (see ReconnectionPill). */
export function isAnyChannelDegraded(
  state: RealtimeStatusState,
  windowMs = 5_000,
): boolean {
  const now = Date.now();
  // Boot-offline / navigate-during-outage: channels created while the network
  // is down never earn everSubscribed, yet that IS a genuine outage the pill
  // must show. When the browser itself reports offline, never-subscribed
  // channels count; when online, they stay quiet (misconfiguration, warned
  // separately) so the pill can't cry wolf forever.
  const browserOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
  for (const { status, since, everSubscribed } of Object.values(state.channels)) {
    if (status === 'SUBSCRIBED') continue;
    if (!everSubscribed && !browserOffline) continue;
    if (now - since >= windowMs) return true;
  }
  return false;
}

/** Channel names that have NEVER managed to subscribe and have been failing
 *  for longer than `windowMs` — almost always a misconfiguration (realtime
 *  publication missing on the table) rather than connectivity. */
export function neverSubscribedChannels(
  state: RealtimeStatusState,
  windowMs = 30_000,
): string[] {
  const now = Date.now();
  const out: string[] = [];
  for (const [name, { status, since, everSubscribed }] of Object.entries(state.channels)) {
    if (status === 'SUBSCRIBED' || everSubscribed) continue;
    if (now - since >= windowMs) out.push(name);
  }
  return out;
}

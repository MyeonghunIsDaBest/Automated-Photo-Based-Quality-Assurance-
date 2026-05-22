// useAutoAcceptInvites — fire-and-forget effect that stamps `accepted_at` on
// every pending project membership for the current user when /home mounts.
//
// Design choice (per the plan): implicit accept, no UI. Workers / stakeholders
// / suppliers shouldn't need to click "Accept invite" — the PM has already
// vetted them by inviting them, and the audit trail (`invited_by`,
// `invited_at`, `accepted_at`) is enough for liability. PMs uninvite via
// `removeMember` from the Team section.
//
// The effect calls the `accept_all_my_pending_invites` RPC in live mode (or
// the local equivalent in mock mode). Errors are swallowed — this is a
// best-effort polish; the user's home will still render correctly if it
// fails, they'll just see the same pending state on next visit.

import { useEffect } from 'react';
import { acceptAllMyPendingInvites } from '../api/projectMembers';

export function useAutoAcceptInvites(userId: string | undefined): void {
  useEffect(() => {
    if (!userId) return;
    acceptAllMyPendingInvites(userId).catch(() => {
      /* best-effort; no toast, no retry. The Home renders against whatever
         the cache has anyway. */
    });
  }, [userId]);
}

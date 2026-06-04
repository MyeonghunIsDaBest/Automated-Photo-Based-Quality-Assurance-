// Tiny pill that fades into TopNav when any Supabase Realtime channel has
// been in a degraded state for more than 5 seconds. Connects to the global
// `realtimeStatus` store so it sees every subscribe() call instrumented by
// `lib/api/realtime.ts`.
//
// Demo niceness: a quick flicker (e.g. a reconnect that resolves in <5 s)
// stays invisible. Only a sustained outage surfaces, so the pill reads as
// signal rather than noise.

import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';
import { useRealtimeStatusStore, isAnyChannelDegraded } from '../../store/realtimeStatus';

const WINDOW_MS = 5_000;

export default function ReconnectionPill() {
  const channels = useRealtimeStatusStore((s) => s.channels);
  const [show, setShow] = useState(false);

  // Re-evaluate on a 1-second tick. Cheap — the iteration is O(channels)
  // and there are <10 channels total in this app.
  useEffect(() => {
    const tick = () => {
      const next = isAnyChannelDegraded(
        useRealtimeStatusStore.getState(),
        WINDOW_MS,
      );
      setShow(next);
    };
    tick();
    const id = window.setInterval(tick, 1_000);
    return () => window.clearInterval(id);
    // Re-arm when the channels map changes — covers the case where a
    // channel transitions back to SUBSCRIBED and the pill should disappear
    // immediately rather than waiting for the next tick.
  }, [channels]);

  if (!show) return null;

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-[#E8D4A8] bg-[#F9EFD9] px-2 py-0.5 text-[10px] font-medium text-[#C8841E]"
      role="status"
      aria-live="polite"
      title="Realtime channel is reconnecting"
    >
      <WifiOff className="h-2.5 w-2.5 animate-pulse" />
      Reconnecting…
    </span>
  );
}

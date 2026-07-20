import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  Calendar as CalendarIcon,
  ChevronRight,
  ClipboardList,
  DollarSign,
  Image as ImageIcon,
  ListChecks,
  MessageSquare,
  Package,
  ShoppingCart,
  Sparkles,
  TrendingUp,
  Truck,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ACTIVITY_VERBS } from '../../lib/hooks/useProjectActivity';
import type { ActivityEvent, ActivityKind } from '../../lib/activity/types';
import { fadeUp } from '../../lib/motion/variants';

interface ActivityFeedProps {
  events: ActivityEvent[];
  /** Click handler. Receives the event so the caller can deep-link by `targetTabId` + `targetEntityId`. */
  onSelect?: (event: ActivityEvent) => void;
  /** Compact rendering (smaller padding) — used by Dashboard sidebar. */
  dense?: boolean;
  /** Empty-state caption override. */
  emptyLabel?: string;
}

// Shared activity-row list. Used by Dashboard's "Recent Activity" panel and
// Gantt OverviewTab's "Live activity" panel. Each row is a real <button> so
// it picks up keyboard focus + screen-reader semantics for free.
//
// Pass 2: rows whose ids weren't in the previous render get
// `data-just-arrived="true"` for 1500ms — paired with the `activityHighlight`
// keyframe in index.css to flash newly-arrived events. This is what makes
// teammate updates feel "live" rather than "rendered".
export default function ActivityFeed({
  events, onSelect, dense, emptyLabel,
}: ActivityFeedProps) {
  // Track event ids across renders. The set of ids in the previous render is
  // the baseline; any id appearing this render that wasn't in the baseline is
  // a fresh arrival. Each fresh id is held in `justArrived` for 1500ms.
  const seenRef = useRef<Set<string>>(new Set());
  const [justArrived, setJustArrived] = useState<Set<string>>(new Set());
  useEffect(() => {
    const seen = seenRef.current;
    const fresh: string[] = [];
    for (const e of events) {
      if (!seen.has(e.id)) fresh.push(e.id);
    }
    if (fresh.length === 0) {
      seenRef.current = new Set(events.map((e) => e.id));
      return;
    }
    // Don't highlight on the first render (cold mount): seed `seen` and skip.
    if (seen.size === 0) {
      seenRef.current = new Set(events.map((e) => e.id));
      return;
    }
    setJustArrived((prev) => {
      const next = new Set(prev);
      for (const id of fresh) next.add(id);
      return next;
    });
    seenRef.current = new Set(events.map((e) => e.id));
    const t = window.setTimeout(() => {
      setJustArrived((prev) => {
        if (prev.size === 0) return prev;
        const next = new Set(prev);
        for (const id of fresh) next.delete(id);
        return next;
      });
    }, 1500);
    return () => window.clearTimeout(t);
  }, [events]);

  if (events.length === 0) {
    return (
      <p className={`text-center text-sm italic text-[#A0A0A0] ${dense ? 'py-6' : 'py-12'}`}>
        {emptyLabel ?? 'No activity yet — uploads, comments, and updates will appear here.'}
      </p>
    );
  }

  return (
    <ul className="divide-y divide-[#EFEBE0]">
      {/* `initial={false}` prevents the entrance animation from firing on the
          first paint — the activityHighlight keyframe already handles new
          arrivals via data-just-arrived, and a big stagger on initial mount
          would feel slow. New events still get the motion.li entrance. */}
      <AnimatePresence initial={false}>
        {events.map((e) => (
          <motion.li
            key={e.id}
            layout
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            exit={{ opacity: 0, height: 0, transition: { duration: 0.2 } }}
            data-just-arrived={justArrived.has(e.id) ? 'true' : undefined}
          >
            <button
              type="button"
              onClick={() => onSelect?.(e)}
              disabled={!onSelect}
              aria-label={`${e.actorName} ${ACTIVITY_VERBS[e.kind]} ${e.targetLabel}, ${timeAgo(e.timestamp)}`}
              className={`flex w-full items-center gap-3 text-left transition-colors hover:bg-[#FAF8F2] active:bg-[#F0EDE4] disabled:hover:bg-transparent disabled:active:bg-transparent disabled:cursor-default ${
                dense ? 'px-3 py-2.5' : 'px-4 py-3 sm:px-5'
              }`}
            >
              <div className={`flex flex-shrink-0 items-center justify-center rounded-full ${
                dense ? 'h-8 w-8' : 'h-9 w-9'
              } ${ICON_TONE[e.kind] ?? 'bg-[#F0EDE4]'}`}>
                <ActivityIcon kind={e.kind} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-[#3A3A3A]">
                  <span className="font-medium text-[#1A1A1A]">{e.actorName}</span>{' '}
                  <span className="text-[#6B6B6B]">{ACTIVITY_VERBS[e.kind]}</span>{' '}
                  {e.targetLabel}
                </p>
                <p className="text-[11px] text-[#A0A0A0]">{timeAgo(e.timestamp)}</p>
              </div>
              {onSelect && <ChevronRight className="h-4 w-4 flex-shrink-0 text-[#D8D2C4]" />}
            </button>
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}

const ICON_TONE: Partial<Record<ActivityKind, string>> = {
  ai_analysed:  'bg-[#E3F0FA]',
  safety_flag:  'bg-[#FBE5E5]',
  invoice_paid: 'bg-[#E1F3EA]',
};

function ActivityIcon({ kind }: { kind: ActivityKind }) {
  const Icon = ICON_FOR_KIND[kind];
  const tone = ICON_FG[kind] ?? 'text-[#6B7A8F]';
  return <Icon className={`h-3.5 w-3.5 ${tone}`} aria-hidden />;
}

const ICON_FOR_KIND: Record<ActivityKind, typeof TrendingUp> = {
  task_progress:     TrendingUp,
  task_created:      ListChecks,
  photo_upload:      ImageIcon,
  order_placed:      ShoppingCart,
  order_received:    Package,
  delivery_received: Truck,
  invoice_paid:      DollarSign,
  punch_item_added:  ClipboardList,
  punch_item_closed: ClipboardList,
  diary_entry:       CalendarIcon,
  comment_added:     MessageSquare,
  ai_analysed:       Sparkles,
  safety_flag:       AlertTriangle,
};

const ICON_FG: Partial<Record<ActivityKind, string>> = {
  ai_analysed:  'text-[#2A6F9E]',
  safety_flag:  'text-[#C44545]',
  invoice_paid: 'text-[#2F8F5C]',
};

// Lifted from Gantt OverviewTab so the helper has a single home. Date-fns is
// already a project dep.
function timeAgo(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return format(parseISO(iso), 'MMM d');
  const m = Math.floor(ms / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7)  return `${d}d ago`;
  return format(parseISO(iso), 'MMM d');
}

// frontend/src/pages/gantt/tabs/LiveActivityCard.tsx
//
// Project Overview · Live activity card. Editorial styling that matches the
// Site Diary palette: Fraunces title, beige separators, day-grouped sections,
// tinted avatars with a kind-badge in the corner, and verb colours that match
// the rest of the editorial surfaces.

import { useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import {
  AlertTriangle,
  Calendar as CalendarIcon,
  ChevronDown,
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
import type { ActivityEvent, ActivityKind } from '../../../lib/activity/types';
import { ACTIVITY_VERBS } from '../../../lib/hooks/useProjectActivity';

interface LiveActivityCardProps {
  events: ActivityEvent[];
  onSelect?: (e: ActivityEvent) => void;
  emptyLabel?: string;
}

type FilterKey = 'all' | 'updates' | 'diary' | 'files';

// Which event kinds each filter chip reveals.
const FILTER_KINDS: Record<FilterKey, ActivityKind[] | null> = {
  all: null,
  updates: [
    'task_progress', 'task_created', 'punch_item_added', 'punch_item_closed',
    'comment_added', 'order_placed', 'order_received', 'delivery_received',
    'invoice_paid', 'safety_flag',
  ],
  diary: ['diary_entry'],
  files: ['photo_upload', 'ai_analysed'],
};

const FILTERS: Array<{ k: FilterKey; label: string }> = [
  { k: 'all',     label: 'All'     },
  { k: 'updates', label: 'Updates' },
  { k: 'diary',   label: 'Diary'   },
  { k: 'files',   label: 'Files'   },
];

// Verb colour per kind — keeps the editorial mood (green for progress-y
// things, amber for task progress, red for safety, blue for AI).
const VERB_TONE: Partial<Record<ActivityKind, string>> = {
  diary_entry:       'text-[#246F47]',
  task_progress:     'text-[#C8841E]',
  task_created:      'text-[#246F47]',
  punch_item_added:  'text-[#C44545]',
  punch_item_closed: 'text-[#246F47]',
  ai_analysed:       'text-[#4A5DAD]',
  safety_flag:       'text-[#C44545]',
  photo_upload:      'text-[#246F47]',
  invoice_paid:      'text-[#246F47]',
  order_placed:      'text-[#8B5E3C]',
  order_received:    'text-[#8B5E3C]',
  delivery_received: 'text-[#8B5E3C]',
  comment_added:     'text-[#3A3A3A]',
};

// Badge icon in the bottom-right corner of the avatar.
const KIND_ICON: Record<ActivityKind, typeof TrendingUp> = {
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

// Noun used in the cluster summary headline. [singular, plural].
const KIND_NOUN: Record<ActivityKind, [string, string]> = {
  task_progress:     ['task',          'tasks'],
  task_created:      ['task',          'tasks'],
  photo_upload:      ['photo',         'photos'],
  order_placed:      ['order',         'orders'],
  order_received:    ['order',         'orders'],
  delivery_received: ['delivery',      'deliveries'],
  invoice_paid:      ['invoice',       'invoices'],
  punch_item_added:  ['punch item',    'punch items'],
  punch_item_closed: ['punch item',    'punch items'],
  diary_entry:       ['diary entry',   'diary entries'],
  comment_added:     ['comment',       'comments'],
  ai_analysed:       ['photo',         'photos'],
  safety_flag:       ['hazard',        'hazards'],
};

// Summary verb when we collapse N events of the same kind into one row.
// Falls back to the existing per-event verb when no override is needed.
const SUMMARY_VERB: Partial<Record<ActivityKind, string>> = {
  task_progress:     'bulk-updated',
  photo_upload:      'uploaded',
  ai_analysed:       'analysed',
  comment_added:     'left',
  diary_entry:       'logged',
  punch_item_added:  'added',
  punch_item_closed: 'closed',
  order_placed:      'placed',
  order_received:    'received',
  delivery_received: 'logged',
  invoice_paid:      'paid',
  task_created:      'created',
  safety_flag:       'flagged',
};

// Tint of the avatar circle, keyed by a stable hash of actorId so the same
// person keeps the same colour across renders. Same palette the diary
// timeline uses — keeps the brand coherent.
const ACTOR_COLORS: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: '#3B6E54',
  2: '#8B5E3C',
  3: '#5C6BC0',
  4: '#B5602A',
  5: '#6B7A8F',
};

function colorIndex(id: string): 1 | 2 | 3 | 4 | 5 {
  if (!id) return 5;
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return ((h % 5) + 1) as 1 | 2 | 3 | 4 | 5;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '—';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

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

// Threshold at which consecutive same-actor + same-kind events collapse
// into one summary row. 2+ keeps the feed scrollable on busy days while
// still showing every individual update one tap away.
const CLUSTER_THRESHOLD = 2;

interface ActivityCluster {
  key: string;
  representative: ActivityEvent;
  events: ActivityEvent[];     // when length >= CLUSTER_THRESHOLD, collapsed
}

// Walk the day's events in order and merge consecutive runs of the same
// (actor, kind). Preserves order across boundaries — interleaving with a
// different kind / actor breaks the run and starts a new cluster.
function clusterEvents(events: ActivityEvent[]): ActivityCluster[] {
  const out: ActivityCluster[] = [];
  for (const e of events) {
    const last = out[out.length - 1];
    if (
      last &&
      last.representative.actorId === e.actorId &&
      last.representative.kind === e.kind
    ) {
      last.events.push(e);
    } else {
      out.push({ key: e.id, representative: e, events: [e] });
    }
  }
  return out;
}

// Day-bucketing for the section headers (TODAY / YESTERDAY / N DAYS AGO /
// formatted date for anything older than a week).
function bucketLabel(iso: string): string {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return 'Earlier';
  const eventDay = new Date(ts);
  const today = new Date();
  // Compare by local-date boundaries, not by elapsed milliseconds — an event
  // logged at 11pm last night should bucket as YESTERDAY, not "10h ago".
  const ed = new Date(eventDay.getFullYear(), eventDay.getMonth(), eventDay.getDate());
  const td = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const days = Math.round((td.getTime() - ed.getTime()) / 86_400_000);
  if (days <= 0) return 'TODAY';
  if (days === 1) return 'YESTERDAY';
  if (days < 7)   return `${days} DAYS AGO`;
  return format(eventDay, 'MMM d').toUpperCase();
}

export function LiveActivityCard({ events, onSelect, emptyLabel }: LiveActivityCardProps) {
  const [filter, setFilter] = useState<FilterKey>('all');

  const filtered = useMemo(() => {
    const allowed = FILTER_KINDS[filter];
    if (allowed === null) return events;
    const set = new Set(allowed);
    return events.filter((e) => set.has(e.kind));
  }, [events, filter]);

  // Group by bucket label, preserving original order within each bucket.
  const groups = useMemo(() => {
    const map = new Map<string, ActivityEvent[]>();
    for (const e of filtered) {
      const label = bucketLabel(e.timestamp);
      const bucket = map.get(label);
      if (bucket) bucket.push(e);
      else map.set(label, [e]);
    }
    return Array.from(map.entries());
  }, [filtered]);

  return (
    <div className="rounded-[12px] border border-[#E6E1D4] bg-white shadow-[0_1px_2px_rgba(20,20,20,0.04)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[#EFEBE0] flex-wrap">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2 flex-shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          <h3
            className="text-[17px] font-medium m-0 leading-tight text-[#1A1A1A]"
            style={{ fontFamily: "'Fraunces', Georgia, serif" }}
          >
            Live activity
          </h3>
          <span className="text-[12px] text-[#6B6B6B]">· {events.length} latest</span>
        </div>
        <div className="ml-auto flex items-center gap-1">
          {FILTERS.map(({ k, label }) => {
            const on = filter === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setFilter(k)}
                className={`px-2.5 py-0.5 rounded-full border text-[11.5px] font-medium transition-colors ${
                  on
                    ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]'
                    : 'bg-white text-[#3A3A3A] border-[#E6E1D4] hover:bg-[#FAF8F2]'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Body */}
      {filtered.length === 0 ? (
        <p className="px-5 py-12 text-center text-sm italic text-[#A0A0A0]">
          {emptyLabel ?? 'No activity yet — uploads, comments, and updates will appear here.'}
        </p>
      ) : (
        <div>
          {groups.map(([label, items]) => (
            <section key={label} aria-label={label}>
              {/* Section header — TODAY ───── 1 event */}
              <div className="flex items-center gap-3 px-4 pt-3 pb-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#6B6B6B]">
                  {label}
                </span>
                <span className="flex-1 h-px bg-[#E6E1D4]" />
                <span className="text-[11px] text-[#A0A0A0]">
                  {items.length} {items.length === 1 ? 'event' : 'events'}
                </span>
              </div>

              {/* Section rows — clustered so busy days don't blow up scroll */}
              <ul className="bg-[#FAF8F2]">
                {clusterEvents(items).map((cluster) => (
                  <li key={cluster.key}>
                    <ClusterRow cluster={cluster} onSelect={onSelect} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

// One cluster of consecutive same-actor / same-kind events. When the run
// length is below CLUSTER_THRESHOLD we render a regular ActivityRow; when
// it's at or above, we render a summary row with a "Show N updates" toggle
// that reveals the full list inline.
function ClusterRow({
  cluster, onSelect,
}: {
  cluster: ActivityCluster;
  onSelect?: (e: ActivityEvent) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const collapsed = cluster.events.length >= CLUSTER_THRESHOLD;

  if (!collapsed) {
    return <ActivityRow event={cluster.representative} onSelect={onSelect} />;
  }

  return (
    <>
      <SummaryRow
        cluster={cluster}
        expanded={expanded}
        onToggle={() => setExpanded((v) => !v)}
      />
      {expanded ? (
        <ul className="bg-white border-t border-[#EFEBE0]">
          {cluster.events.map((e) => (
            <li key={e.id} className="border-b border-[#EFEBE0] last:border-b-0">
              <ActivityRow event={e} onSelect={onSelect} compact />
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

// Summary row — shown when N consecutive same-actor + same-kind events are
// folded into one. Click anywhere on the row to expand / collapse; an
// explicit "Show N updates" link sits at the bottom-left as the affordance.
function SummaryRow({
  cluster, expanded, onToggle,
}: {
  cluster: ActivityCluster;
  expanded: boolean;
  onToggle: () => void;
}) {
  const ev = cluster.representative;
  const count = cluster.events.length;
  const verbTone = VERB_TONE[ev.kind] ?? 'text-[#3A3A3A]';
  const BadgeIcon = KIND_ICON[ev.kind] ?? TrendingUp;
  const avatarBg = ACTOR_COLORS[colorIndex(ev.actorId || ev.actorName)];
  const initials = initialsOf(ev.actorName);
  const verb = SUMMARY_VERB[ev.kind] ?? ACTIVITY_VERBS[ev.kind];
  const noun = KIND_NOUN[ev.kind];
  const nounDisplay = count === 1 ? noun[0] : noun[1];

  // Use the oldest event's timestamp as the cluster's anchor — matches how
  // "3 days ago" reads on a batch that landed in one sitting.
  const earliest = cluster.events[cluster.events.length - 1] ?? ev;

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      aria-label={`${ev.actorName} ${verb} ${count} ${nounDisplay}, ${expanded ? 'expanded' : 'collapsed'}`}
      className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-[#F4F1E8] active:bg-[#EFEBE0]"
    >
      {/* Avatar with badge */}
      <div className="relative flex-shrink-0">
        <div
          className="h-10 w-10 rounded-full grid place-items-center text-white text-[11.5px] font-semibold"
          style={{ background: avatarBg }}
        >
          {initials}
        </div>
        <span className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full bg-[#FAEBC8] border border-white grid place-items-center">
          <BadgeIcon className="h-2.5 w-2.5 text-[#1A1A1A]" />
        </span>
      </div>

      {/* Headline + meta + toggle */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] text-[#3A3A3A]">
          <span className="font-semibold text-[#1A1A1A]">{ev.actorName}</span>{' '}
          <span className={`font-semibold ${verbTone}`}>{verb}</span>{' '}
          <span className="font-semibold text-[#1A1A1A]">{count}</span>{' '}
          {nounDisplay}
        </p>
        <p className="mt-0.5 text-[11px] text-[#A0A0A0]">{timeAgo(earliest.timestamp)}</p>
        <span className="mt-0.5 inline-flex items-center gap-1 text-[11.5px] font-semibold text-[#246F47]">
          {expanded ? 'Hide updates' : `Show ${count} updates`}
          <ChevronDown
            className={`h-3 w-3 transition-transform ${expanded ? 'rotate-180' : ''}`}
          />
        </span>
      </div>
    </button>
  );
}

// Single row — avatar with corner badge, headline (actor + colored verb +
// target), and the muted "Xm ago" line beneath.
function ActivityRow({
  event, onSelect, compact,
}: {
  event: ActivityEvent;
  onSelect?: (e: ActivityEvent) => void;
  /** Nested inside an expanded cluster — slightly tighter padding + indent. */
  compact?: boolean;
}) {
  const verbTone = VERB_TONE[event.kind] ?? 'text-[#3A3A3A]';
  const BadgeIcon = KIND_ICON[event.kind] ?? TrendingUp;
  const avatarBg = ACTOR_COLORS[colorIndex(event.actorId || event.actorName)];
  const initials = initialsOf(event.actorName);

  return (
    <button
      type="button"
      onClick={() => onSelect?.(event)}
      disabled={!onSelect}
      aria-label={`${event.actorName} ${ACTIVITY_VERBS[event.kind]} ${event.targetLabel}, ${timeAgo(event.timestamp)}`}
      className={`flex w-full items-center gap-3 text-left transition-colors hover:bg-[#F4F1E8] active:bg-[#EFEBE0] disabled:hover:bg-transparent disabled:active:bg-transparent disabled:cursor-default ${
        compact ? 'pl-10 pr-4 py-2' : 'px-4 py-3'
      }`}
    >
      {/* Avatar with badge — slightly smaller when nested */}
      <div className="relative flex-shrink-0">
        <div
          className={`rounded-full grid place-items-center text-white font-semibold ${
            compact ? 'h-7 w-7 text-[10.5px]' : 'h-10 w-10 text-[11.5px]'
          }`}
          style={{ background: avatarBg }}
        >
          {initials}
        </div>
        {!compact ? (
          <span className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full bg-[#FAEBC8] border border-white grid place-items-center">
            <BadgeIcon className="h-2.5 w-2.5 text-[#1A1A1A]" />
          </span>
        ) : null}
      </div>

      {/* Headline + meta */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] text-[#3A3A3A]">
          <span className="font-semibold text-[#1A1A1A]">{event.actorName}</span>{' '}
          <span className={`font-semibold ${verbTone}`}>{ACTIVITY_VERBS[event.kind]}</span>
          {event.targetLabel ? <>{' '}{event.targetLabel}</> : null}
        </p>
        <p className="mt-0.5 text-[11px] text-[#A0A0A0]">{timeAgo(event.timestamp)}</p>
      </div>

      {onSelect ? <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-[#A0A0A0]" /> : null}
    </button>
  );
}

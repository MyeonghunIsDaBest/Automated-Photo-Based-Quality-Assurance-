// ActivityDetailModal — opens when an ActivityFeed row is clicked, surfaces
// the full event detail (who / what / when / where), and offers a single
// "Open detail" button that deep-links to the entity that was made or
// updated. The detail is read-only; mutations still happen on the entity's
// own drawer/page that the deep-link opens.
//
// Used by:
//   • pages/Dashboard.tsx           — "Recent activity" panel
//   • pages/gantt/tabs/OverviewTab  — "Live activity" panel
//
// Both consumers pass the same projectId so the deep-link router lands the
// user on the correct project context.

import { AnimatePresence, motion } from 'framer-motion';
import { X, ArrowRight } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import type { NavigateFunction } from 'react-router-dom';
import type { ActivityEvent, ActivityKind } from '../../lib/activity/types';
import { ACTIVITY_VERBS } from '../../lib/hooks/useProjectActivity';
import { navigateActivityEvent } from '../../lib/activity/navigate';

interface ActivityDetailModalProps {
  /** When non-null, the modal is open and shows this event's detail. */
  event: ActivityEvent | null;
  projectId: string;
  navigate: NavigateFunction;
  onClose: () => void;
}

// Human-readable target type — used in the "Open detail" button label and
// the modal sub-heading. Falls back to "entity" for unknown kinds so the UI
// degrades gracefully if a new ActivityKind ships before this map is
// updated.
const TARGET_NOUN: Record<ActivityKind, string> = {
  task_progress:     'task',
  task_created:      'task',
  comment_added:     'task',
  photo_upload:      'photo',
  ai_analysed:       'photo',
  safety_flag:       'safety incident',
  order_placed:      'order',
  order_received:    'order',
  delivery_received: 'delivery',
  invoice_paid:      'invoice',
  punch_item_added:  'punch item',
  punch_item_closed: 'punch item',
  diary_entry:       'diary entry',
};

// Tone for the leading accent strip + icon background. Mirrors the verbs
// used in ActivityFeed so the modal feels like an expanded version of the
// row that opened it.
const KIND_TONE: Record<ActivityKind, { accent: string; chip: string }> = {
  task_progress:     { accent: 'bg-blue-500',    chip: 'bg-blue-50 text-blue-700' },
  task_created:      { accent: 'bg-slate-500',   chip: 'bg-slate-50 text-slate-700' },
  comment_added:     { accent: 'bg-violet-500',  chip: 'bg-violet-50 text-violet-700' },
  photo_upload:      { accent: 'bg-slate-500',   chip: 'bg-slate-50 text-slate-700' },
  ai_analysed:       { accent: 'bg-blue-500',    chip: 'bg-blue-50 text-blue-700' },
  safety_flag:       { accent: 'bg-red-500',     chip: 'bg-red-50 text-red-700' },
  order_placed:      { accent: 'bg-amber-500',   chip: 'bg-amber-50 text-amber-700' },
  order_received:    { accent: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-700' },
  delivery_received: { accent: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-700' },
  invoice_paid:      { accent: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-700' },
  punch_item_added:  { accent: 'bg-amber-500',   chip: 'bg-amber-50 text-amber-700' },
  punch_item_closed: { accent: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-700' },
  diary_entry:       { accent: 'bg-slate-500',   chip: 'bg-slate-50 text-slate-700' },
};

export default function ActivityDetailModal({
  event, projectId, navigate, onClose,
}: ActivityDetailModalProps) {
  const handleOpenEntity = () => {
    if (!event) return;
    navigateActivityEvent(event, projectId, navigate);
    onClose();
  };

  return (
    <AnimatePresence>
      {event && (
        <>
          <motion.div
            key="scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            key="dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Activity detail"
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            className="fixed inset-x-2 top-1/2 z-50 mx-auto w-auto max-w-md -translate-y-1/2 overflow-hidden rounded-2xl bg-white shadow-2xl sm:inset-x-0"
          >
            <ActivityDetailBody
              event={event}
              onClose={onClose}
              onOpenEntity={handleOpenEntity}
            />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function ActivityDetailBody({
  event, onClose, onOpenEntity,
}: {
  event: ActivityEvent;
  onClose: () => void;
  onOpenEntity: () => void;
}) {
  const tone = KIND_TONE[event.kind] ?? KIND_TONE.task_progress;
  const noun = TARGET_NOUN[event.kind] ?? 'item';
  const verb = ACTIVITY_VERBS[event.kind] ?? 'updated';
  const ts = parseISO(event.timestamp);
  const absolute = Number.isNaN(ts.getTime())
    ? event.timestamp
    : format(ts, 'EEEE, MMM d, yyyy · h:mm a');

  return (
    <>
      {/* Leading colored strip — the same accent the row used. */}
      <div className={`h-1 w-full ${tone.accent}`} aria-hidden />

      <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-slate-500">
            Activity detail · {noun}
          </p>
          <h3 className="mt-1 text-base font-semibold text-slate-900">
            {event.targetLabel}
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <dl className="grid gap-3 px-5 py-4 text-sm">
        <DetailRow label="Who">
          <span className="font-medium text-slate-900">{event.actorName}</span>
        </DetailRow>
        <DetailRow label="What">
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${tone.chip}`}>
            {verb}
          </span>
        </DetailRow>
        <DetailRow label="When">
          <span className="tabular-nums text-slate-800">{absolute}</span>
        </DetailRow>
      </dl>

      <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
        >
          Close
        </button>
        <button
          type="button"
          onClick={onOpenEntity}
          className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-slate-800"
        >
          Open {noun}
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <dt className="w-16 flex-shrink-0 text-[11px] font-medium uppercase tracking-wider text-slate-500">
        {label}
      </dt>
      <dd className="flex min-w-0 flex-1 items-center gap-2">{children}</dd>
    </div>
  );
}

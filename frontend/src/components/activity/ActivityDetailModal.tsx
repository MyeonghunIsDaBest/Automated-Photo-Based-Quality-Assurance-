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

import { X, ArrowRight } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import type { NavigateFunction } from 'react-router-dom';
import MotionDrawer from '../ui/MotionDrawer';
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
// row that opened it. Hexes come from the warm-ledger TONE map
// (pages/gantt/components/ledger): sky / slate / violet / red / amber /
// emerald.
const KIND_TONE: Record<ActivityKind, { accent: string; chip: string }> = {
  task_progress:     { accent: 'bg-[#2A6F9E]', chip: 'bg-[#E3F0FA] text-[#2A6F9E]' },
  task_created:      { accent: 'bg-[#6B7A8F]', chip: 'bg-[#EEF1F4] text-[#5B6B7B]' },
  comment_added:     { accent: 'bg-[#6B3FA0]', chip: 'bg-[#EFE7FB] text-[#6B3FA0]' },
  photo_upload:      { accent: 'bg-[#6B7A8F]', chip: 'bg-[#EEF1F4] text-[#5B6B7B]' },
  ai_analysed:       { accent: 'bg-[#2A6F9E]', chip: 'bg-[#E3F0FA] text-[#2A6F9E]' },
  safety_flag:       { accent: 'bg-[#C44545]', chip: 'bg-[#FBE5E5] text-[#C44545]' },
  order_placed:      { accent: 'bg-[#D69A2E]', chip: 'bg-[#F9EFD9] text-[#9A6B12]' },
  order_received:    { accent: 'bg-[#10B981]', chip: 'bg-[#E1F3EA] text-[#2F8F5C]' },
  delivery_received: { accent: 'bg-[#10B981]', chip: 'bg-[#E1F3EA] text-[#2F8F5C]' },
  invoice_paid:      { accent: 'bg-[#10B981]', chip: 'bg-[#E1F3EA] text-[#2F8F5C]' },
  punch_item_added:  { accent: 'bg-[#D69A2E]', chip: 'bg-[#F9EFD9] text-[#9A6B12]' },
  punch_item_closed: { accent: 'bg-[#10B981]', chip: 'bg-[#E1F3EA] text-[#2F8F5C]' },
  diary_entry:       { accent: 'bg-[#6B7A8F]', chip: 'bg-[#EEF1F4] text-[#5B6B7B]' },
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
    <MotionDrawer
      open={!!event}
      onClose={onClose}
      variant="modal"
      ariaLabel="Activity detail"
      sizeClass="max-w-md"
    >
      {event && (
        <ActivityDetailBody
          event={event}
          onClose={onClose}
          onOpenEntity={handleOpenEntity}
        />
      )}
    </MotionDrawer>
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
      <div className={`h-1 w-full flex-shrink-0 ${tone.accent}`} aria-hidden />

      <div className="flex items-start justify-between gap-3 border-b border-[#EFEBE0] px-5 py-4">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-[#6B6B6B]">
            Activity detail · {noun}
          </p>
          <h3 className="mt-1 text-base font-semibold text-[#1A1A1A]">
            {event.targetLabel}
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="grid min-h-11 min-w-11 flex-shrink-0 place-items-center rounded-md text-[#A0A0A0] hover:bg-[#F0EDE4] hover:text-[#3A3A3A]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <dl className="grid gap-3 px-5 py-4 text-sm">
        <DetailRow label="Who">
          <span className="font-medium text-[#1A1A1A]">{event.actorName}</span>
        </DetailRow>
        <DetailRow label="What">
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${tone.chip}`}>
            {verb}
          </span>
        </DetailRow>
        <DetailRow label="When">
          <span className="tabular-nums text-[#3A3A3A]">{absolute}</span>
        </DetailRow>
      </dl>

      <div className="flex items-center justify-end gap-2 border-t border-[#EFEBE0] bg-[#FAF8F2] px-5 py-3">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center rounded-md border border-[#E6E1D4] bg-white px-3 py-1.5 text-xs font-medium text-[#3A3A3A] transition-colors hover:bg-[#FAF8F2]"
        >
          Close
        </button>
        <button
          type="button"
          onClick={onOpenEntity}
          className="inline-flex items-center gap-1.5 rounded-md bg-[#1A1A1A] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#3A3A3A]"
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
      <dt className="w-16 flex-shrink-0 text-[11px] font-medium uppercase tracking-wider text-[#6B6B6B]">
        {label}
      </dt>
      <dd className="flex min-w-0 flex-1 items-center gap-2">{children}</dd>
    </div>
  );
}

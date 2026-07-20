// ScheduleDatePopover — small modal that prompts for a date when a card is
// dragged to the Scheduled column. Keeps it minimal: date input + Confirm /
// Cancel. Busy state while the parent is calling the API.

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Calendar } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { FRAUNCES } from '../gantt/components/ledger';

const MODAL_SHELL =
  'fixed inset-0 z-50 flex items-center justify-center bg-[#1A1A1A]/50 p-4';
const DIALOG_SHELL =
  'flex w-full max-w-sm flex-col overflow-hidden rounded-[14px] border border-[#E6E1D4] bg-white shadow-[0_8px_28px_rgba(20,20,20,0.12)]';

interface ScheduleDatePopoverProps {
  open: boolean;
  /** Card title — shown in the modal for context. */
  cardTitle: string;
  onConfirm: (date: string) => void;
  onCancel: () => void;
  /** While a parent async operation is in flight. */
  busy?: boolean;
}

/** Returns today's date as 'YYYY-MM-DD' in local time. */
function todayIso(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function ScheduleDatePopover({
  open,
  cardTitle,
  onConfirm,
  onCancel,
  busy = false,
}: ScheduleDatePopoverProps) {
  const [date, setDate] = useState(todayIso);

  // Reset to today each time the popover opens so a second drag always starts fresh.
  useEffect(() => {
    if (open) setDate(todayIso());
  }, [open]);

  if (!open) return null;

  const handleConfirm = () => {
    if (!date) return;
    onConfirm(date);
  };

  // Portaled to <body>: the routed page sits inside a transform-animated
  // wrapper, which would trap this fixed overlay above the phone tab bar.
  return createPortal(
    <div
      className={MODAL_SHELL}
      style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}
      // Allow backdrop click to cancel
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className={DIALOG_SHELL}>
        {/* Header */}
        <div className="flex items-start justify-between border-b border-[#E6E1D4] px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-[9px] border border-[#E6E1D4] bg-[#FAF8F2]">
              <Calendar className="h-4 w-4 text-[#6B6B6B]" strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#6B6B6B]">
                Schedule
              </p>
              <h2
                className="mt-0.5 text-base font-medium leading-tight text-[#1A1A1A]"
                style={{ fontFamily: FRAUNCES, letterSpacing: '-0.01em' }}
              >
                Pick a date
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="grid min-h-11 min-w-11 place-items-center rounded-md text-[#A0A0A0] hover:bg-[#F0EDE4] hover:text-[#3A3A3A] disabled:opacity-50"
            aria-label="Cancel"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-3">
          <p className="text-[13px] text-[#6B6B6B] leading-snug">
            Scheduling:{' '}
            <span className="font-medium text-[#1A1A1A]">{cardTitle}</span>
          </p>
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">
              Scheduled date
            </label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              min={todayIso()}
              disabled={busy}
              className="w-full"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-[#E6E1D4] bg-[#FAF8F2] px-6 py-3">
          <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={busy || !date}>
            {busy ? 'Scheduling…' : 'Confirm'}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

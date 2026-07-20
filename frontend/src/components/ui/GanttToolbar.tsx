// GanttToolbar — sits above the split-pane Gantt inside TasksTab. Controls:
//   • Zoom level (Day / Week / Month / Quarter)
//   • Custom date-range popover
//   • Today-scroll button
//   • Active-range badge showing the effective window
//
// All state lives on the consumer (TasksTab); the toolbar is a controlled
// component. Wiring it up is intentionally minimal so swapping it in doesn't
// require touching the Gantt's percentage math — TasksTab just hands the
// toolbar the current window + zoom, the toolbar emits change events.

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Calendar, ChevronDown, RotateCcw, Target } from 'lucide-react';
import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import { fadeIn, popover } from '../../lib/motion/variants';
import type { GanttZoom, TimeWindow } from '../../lib/construction/ganttLayout';

interface GanttToolbarProps {
  /** The full project window (uncustomised). Used for the badge fallback and
   *  to reset the range. */
  projectWindow: TimeWindow;
  /** The active window — either the project window or a user override. */
  activeWindow: TimeWindow;
  /** True iff `activeWindow` differs from `projectWindow`. */
  hasCustomRange: boolean;
  zoom: GanttZoom;
  onZoomChange: (zoom: GanttZoom) => void;
  /** Called when the user picks a custom range. Both strings are ISO dates. */
  onRangeChange: (start: string, end: string) => void;
  /** Called when the user resets the custom range. */
  onRangeReset: () => void;
  /** Called when the user clicks the Today scroll button. */
  onScrollToToday: () => void;
  /** True iff today falls inside the active window (gates the Today button). */
  todayInRange: boolean;
}

const ZOOM_LABELS: Record<GanttZoom, string> = {
  day:     'Day',
  week:    'Week',
  month:   'Month',
  quarter: 'Quarter',
};
const ZOOMS: GanttZoom[] = ['day', 'week', 'month', 'quarter'];

export default function GanttToolbar({
  projectWindow,
  activeWindow,
  hasCustomRange,
  zoom,
  onZoomChange,
  onRangeChange,
  onRangeReset,
  onScrollToToday,
  todayInRange,
}: GanttToolbarProps) {
  const [rangeOpen, setRangeOpen] = useState(false);
  const prefersReduced = useReducedMotion();

  const totalDays = activeWindow.totalDays;
  const startLabel = format(parseISO(activeWindow.startDate), 'MMM d, yyyy');
  const endLabel   = format(parseISO(activeWindow.endDate), 'MMM d, yyyy');

  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#E6E1D4] bg-white px-3 py-2 shadow-sm">
      {/* Left: zoom segmented control + Today button */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-0.5 rounded-xl bg-[#F0EDE4] p-0.5">
          {ZOOMS.map((z) => {
            const isActive = z === zoom;
            return (
              <button
                key={z}
                type="button"
                onClick={() => onZoomChange(z)}
                className={`relative px-2.5 py-1 text-xs font-medium transition-colors ${
                  isActive ? 'text-white' : 'text-[#3A3A3A] hover:text-[#1A1A1A]'
                }`}
              >
                {isActive && (
                  <motion.span
                    layoutId="gantt-zoom-pill"
                    className="absolute inset-0 rounded-lg bg-[#1A1A1A]"
                    transition={
                      prefersReduced
                        ? { duration: 0 }
                        : { type: 'spring', damping: 30, stiffness: 360 }
                    }
                  />
                )}
                <span className="relative">{ZOOM_LABELS[z]}</span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={onScrollToToday}
          disabled={!todayInRange}
          title={todayInRange ? "Scroll the timeline to today's marker" : "Today is outside the active range"}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#E6E1D4] bg-white px-2.5 py-1 text-xs font-medium text-[#3A3A3A] transition-colors hover:border-[#D8D2C4] hover:bg-[#FAF8F2] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Target className="h-3 w-3" />
          Today
        </button>
      </div>

      {/* Right: active-range badge + custom range picker */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="hidden text-[11px] font-medium uppercase tracking-[0.18em] text-[#A0A0A0] sm:inline">
          Range
        </span>
        <span className="tabular-nums rounded-full border border-[#E6E1D4] bg-[#FAF8F2]/60 px-2.5 py-1 text-xs text-[#3A3A3A]">
          {startLabel} → {endLabel}
          <span className="ml-1.5 text-[#A0A0A0]">· {totalDays}d</span>
        </span>

        <div className="relative">
          <button
            type="button"
            onClick={() => setRangeOpen((o) => !o)}
            className={`inline-flex items-center gap-1.5 rounded-lg border bg-white px-2.5 py-1 text-xs font-medium transition-colors ${
              hasCustomRange
                ? 'border-[#A8D0B8] text-[#246F47] hover:bg-[#E5F2EA]'
                : 'border-[#E6E1D4] text-[#3A3A3A] hover:border-[#D8D2C4] hover:bg-[#FAF8F2]'
            }`}
            aria-haspopup="dialog"
            aria-expanded={rangeOpen}
          >
            <Calendar className="h-3 w-3" />
            {hasCustomRange ? 'Custom range' : 'Set range'}
            <ChevronDown className={`h-3 w-3 transition-transform ${rangeOpen ? 'rotate-180' : ''}`} />
          </button>

          <AnimatePresence>
            {rangeOpen && (
              <>
                <motion.div
                  variants={fadeIn}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  className="fixed inset-0 z-40"
                  onClick={() => setRangeOpen(false)}
                />
                <motion.div
                  variants={popover}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  className="absolute right-0 top-full z-50 mt-2 w-72 origin-top-right overflow-hidden rounded-xl border border-[#E6E1D4] bg-white shadow-lg"
                >
                  <RangePicker
                    initialStart={activeWindow.startDate}
                    initialEnd={activeWindow.endDate}
                    onApply={(s, e) => {
                      onRangeChange(s, e);
                      setRangeOpen(false);
                    }}
                    onReset={
                      hasCustomRange
                        ? () => {
                            onRangeReset();
                            setRangeOpen(false);
                          }
                        : undefined
                    }
                    projectStart={projectWindow.startDate}
                    projectEnd={projectWindow.endDate}
                  />
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function RangePicker({
  initialStart,
  initialEnd,
  onApply,
  onReset,
  projectStart,
  projectEnd,
}: {
  initialStart: string;
  initialEnd: string;
  onApply: (start: string, end: string) => void;
  onReset?: () => void;
  projectStart: string;
  projectEnd: string;
}) {
  const [start, setStart] = useState(initialStart.slice(0, 10));
  const [end, setEnd]     = useState(initialEnd.slice(0, 10));
  const firstInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { firstInputRef.current?.focus(); }, []);

  const invalid =
    !start || !end ||
    differenceInCalendarDays(parseISO(end), parseISO(start)) < 0;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (invalid) return;
        onApply(start, end);
      }}
      className="space-y-3 p-4"
    >
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#6B6B6B]">
        Custom timeline range
      </p>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-[11px] font-medium text-[#6B6B6B]">
          From
          <input
            ref={firstInputRef}
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            min={projectStart.slice(0, 10)}
            max={projectEnd.slice(0, 10)}
            className="rounded-md border border-[#E6E1D4] bg-white px-2 py-1.5 text-xs text-[#1A1A1A] focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]"
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-medium text-[#6B6B6B]">
          To
          <input
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            min={projectStart.slice(0, 10)}
            max={projectEnd.slice(0, 10)}
            className="rounded-md border border-[#E6E1D4] bg-white px-2 py-1.5 text-xs text-[#1A1A1A] focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]"
          />
        </label>
      </div>
      <div className="flex items-center justify-between gap-2">
        {onReset ? (
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-[#6B6B6B] hover:text-[#1A1A1A]"
          >
            <RotateCcw className="h-3 w-3" />
            Reset to project
          </button>
        ) : <span />}
        <button
          type="submit"
          disabled={invalid}
          className="rounded-md bg-[#1A1A1A] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#3A3A3A] disabled:opacity-50"
        >
          Apply
        </button>
      </div>
    </form>
  );
}

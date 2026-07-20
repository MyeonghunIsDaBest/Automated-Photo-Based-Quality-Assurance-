// ─────────────────────────────────────────────────────────────────────────────
// pages/jobs/MoveJobSheet.tsx — the phone answer to drag-and-drop (P9.C).
//
// Native HTML5 drag never fires on touch, so on phones every card gets a Move
// button that opens this bottom sheet: the six board columns as 44px+ rows,
// each with its lifecycle tone dot. The row for the card's current column is
// marked "Here now"; rows the move engine would refuse (dropResult "blocked")
// are disabled with the refusal shown honestly as the row's sub-line, so the
// sheet never offers a tap that would only produce an error toast.
//
// The sheet only PICKS — the caller runs the exact same move path the drag
// path uses (blocked toast / confirm dialog / date popover / optimistic apply),
// so tapping and dragging can never drift apart.
// ─────────────────────────────────────────────────────────────────────────────

import { Check } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import MotionDrawer from "../../components/ui/MotionDrawer";
import { DrawerHeader } from "../../components/ui/Sheet";
import { TONE, type ToneKey } from "../gantt/components/ledger";
import { dropResult, type BoardCard, type BoardColumn } from "../../lib/api/jobsBoard";

interface MoveJobSheetProps {
  /** The card being moved; null = closed. */
  card: BoardCard | null;
  /** Column registry + tones, passed from the board (single source of truth). */
  columns: { key: BoardColumn; label: string; icon: LucideIcon }[];
  columnTone: Record<BoardColumn, ToneKey>;
  onClose: () => void;
  /** Fires with the tapped column; the board runs the shared move engine. */
  onPick: (target: BoardColumn) => void;
}

export default function MoveJobSheet({ card, columns, columnTone, onClose, onPick }: MoveJobSheetProps) {
  return (
    <MotionDrawer
      open={card !== null}
      onClose={onClose}
      ariaLabel="Move job"
      sizeClass="sm:w-[400px]"
    >
      {card && (
        <>
          <DrawerHeader title="Move job" subtitle={card.title} onClose={onClose} />
          <div className="flex-1 overflow-y-auto py-2 pb-safe">
            {columns.map((col) => {
              const tone = TONE[columnTone[col.key]];
              const isHere = card.column === col.key;
              const verdict = isHere ? null : dropResult(card.type, col.key);
              const blocked = verdict?.kind === "blocked";
              // The v1 wrinkle: maintenance dropped on In Progress actually
              // applies Scheduled. Disclose it, and when the card is ALREADY
              // in Scheduled, disable the row — the tap would be a no-op that
              // toasts a contradictory "Moved to Scheduled."
              const tracksAsScheduled = card.type === "maintenance" && col.key === "in_progress";
              const landsHere = tracksAsScheduled && card.column === "scheduled";
              const disabled = isHere || blocked || landsHere;
              return (
                <button
                  key={col.key}
                  type="button"
                  disabled={disabled}
                  onClick={() => onPick(col.key)}
                  className={[
                    "flex min-h-12 w-full items-center gap-3.5 px-5 py-2.5 text-left transition-colors",
                    disabled ? "cursor-default" : "active:bg-[#FAF8F2] hover:bg-[#FAF8F2]",
                  ].join(" ")}
                >
                  <span
                    aria-hidden
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: tone.dot, opacity: disabled && !isHere ? 0.35 : 1 }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className={`block text-[15px] font-semibold ${disabled ? "text-[#A0A0A0]" : "text-[#1A1A1A]"}`}>
                      {col.label}
                    </span>
                    {blocked && verdict.kind === "blocked" && (
                      <span className="block text-[11.5px] leading-snug text-[#A0A0A0]">{verdict.reason}</span>
                    )}
                    {verdict?.kind === "needs-date" && (
                      <span className="block text-[11.5px] leading-snug text-[#A0A0A0]">Picks a date next</span>
                    )}
                    {tracksAsScheduled && !blocked && (
                      <span className="block text-[11.5px] leading-snug text-[#A0A0A0]">
                        {landsHere ? "Maintenance tracks as Scheduled — already there" : "Maintenance tracks as Scheduled"}
                      </span>
                    )}
                  </span>
                  {isHere && (
                    <span className="flex shrink-0 items-center gap-1 rounded-full border border-[#E6E1D4] bg-[#FAF8F2] px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-[#6B6B6B]">
                      <Check className="h-3 w-3" /> Here now
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
    </MotionDrawer>
  );
}

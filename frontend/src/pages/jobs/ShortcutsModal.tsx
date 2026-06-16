// ShortcutsModal — keyboard shortcuts cheat-sheet for the Jobs Board.
//
// Opens on "?" (shift+/). Rows: F or / focus search · N new service job
// (manager-only note) · Esc clear search / close dialogs · ? this sheet.

import { X } from "lucide-react";
import { FRAUNCES } from "../gantt/components/ledger";

interface ShortcutsRow {
  keys: string[];
  description: string;
  managerOnly?: boolean;
}

const ROWS: ShortcutsRow[] = [
  { keys: ["F", "/"], description: "Focus search" },
  { keys: ["N"], description: "New service job", managerOnly: true },
  { keys: ["Esc"], description: "Clear search / close dialogs" },
  { keys: ["?"], description: "This shortcuts sheet" },
];

interface ShortcutsModalProps {
  open: boolean;
  onClose: () => void;
}

export function ShortcutsModal({ open, onClose }: ShortcutsModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#1A1A1A]/50 p-4"
      style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-sm rounded-[14px] border border-[#E6E1D4] bg-white shadow-[0_8px_28px_rgba(20,20,20,0.12)]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#E6E1D4] px-6 py-4">
          <h2
            className="text-lg font-medium text-[#1A1A1A]"
            style={{ fontFamily: FRAUNCES, letterSpacing: "-0.02em" }}
          >
            Keyboard shortcuts
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-[#A0A0A0] hover:bg-[#F0EDE4] hover:text-[#3A3A3A]"
            aria-label="Close shortcuts"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Rows */}
        <div className="divide-y divide-[#F0EDE4] px-6 py-2">
          {ROWS.map((row) => (
            <div
              key={row.keys.join("+")}
              className="flex items-center justify-between py-3"
            >
              <span className="flex items-center gap-1.5">
                {row.keys.map((k) => (
                  <kbd
                    key={k}
                    className="inline-flex h-5 min-w-[20px] items-center justify-center rounded border border-[#D8D2C4] bg-[#F5F2E9] px-1.5 text-[11px] font-semibold text-[#3A3A3A] shadow-[0_1px_0_#D8D2C4]"
                  >
                    {k}
                  </kbd>
                ))}
              </span>
              <span className="flex items-center gap-2 text-[13px] text-[#3A3A3A]">
                {row.description}
                {row.managerOnly && (
                  <span className="rounded-full bg-[#F0EDE4] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[#6B6B6B]">
                    Manager
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

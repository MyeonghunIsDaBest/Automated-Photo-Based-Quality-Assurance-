// ─────────────────────────────────────────────────────────────────────────────
// pages/catalogue/ConfirmDeleteDialog.tsx
//
// Shared confirm dialog for PERMANENT deletes across the catalogue tabs
// (materials / prebuilds / templates). Permanent delete is deliberately
// distinct from the reversible Archive (deactivate): the copy spells that out,
// and when an `onArchiveInstead` handler is passed the dialog offers it as the
// safer alternative. Red confirm button + busy spinner.
//
// Shell: MotionDrawer variant="modal" (portal, Esc/backdrop close, focus
// plumbing). Esc/backdrop are busy-guarded — a delete in flight can't be
// dismissed mid-write.
// ─────────────────────────────────────────────────────────────────────────────

import { Trash2, Archive, Loader2 } from "lucide-react";
import MotionDrawer from "../../components/ui/MotionDrawer";
import { btnGhost } from "../gantt/components/ledger";

interface ConfirmDeleteDialogProps {
  /** The item's name, shown in the prompt. */
  name: string;
  /** Noun used in the body copy, e.g. "material", "prebuild", "template". */
  noun: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /** When provided, shows an "Archive instead" button (reversible alternative). */
  onArchiveInstead?: () => void;
}

export default function ConfirmDeleteDialog({
  name,
  noun,
  busy,
  onConfirm,
  onCancel,
  onArchiveInstead,
}: ConfirmDeleteDialogProps) {
  return (
    <MotionDrawer open onClose={() => { if (!busy) onCancel(); }} variant="modal" ariaLabel={`Delete ${noun}`} sizeClass="max-w-md">
      <div className="p-6">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#FBE5E5] text-[#C44545]">
            <Trash2 className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold text-[#1A1A1A]">
              Delete &ldquo;{name}&rdquo;?
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-[#6B6B6B]">
              This permanently removes the {noun} and can&rsquo;t be undone.
              {onArchiveInstead ? (
                <> If you only want to hide it from quotes and pickers, <strong>Archive</strong> it instead &mdash; that&rsquo;s reversible.</>
              ) : null}
            </p>
          </div>
        </div>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={busy} className={btnGhost}>
            Cancel
          </button>
          {onArchiveInstead && (
            <button
              type="button"
              onClick={onArchiveInstead}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#E6E1D4] bg-white px-3.5 py-2 text-[13px] font-semibold text-[#6B6B6B] transition-colors hover:bg-[#FAF8F2] hover:text-[#1A1A1A] disabled:opacity-50"
            >
              <Archive className="h-3.5 w-3.5" />
              Archive instead
            </button>
          )}
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#C44545] px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-[#A83838] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Delete permanently
          </button>
        </div>
      </div>
    </MotionDrawer>
  );
}

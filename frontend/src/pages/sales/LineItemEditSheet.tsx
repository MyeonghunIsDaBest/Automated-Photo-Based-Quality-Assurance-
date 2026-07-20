// Phone editing surface for one quote line (Phase D). The desktop tables edit
// inline; on a phone each line renders as a card and tapping it opens this
// bottom sheet. Every change routes through the SAME handlers the desktop
// cells use (handleItemUpdate / handleItemMarkup / moveItem / moveItemToSection
// / handleRemoveItem, passed in as props) — the sheet owns zero save logic, so
// phone and desktop edits are the same write path by construction.
import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Trash2, X } from "lucide-react";

import MotionDrawer from "../../components/ui/MotionDrawer";
import { FRAUNCES, btnPrimary } from "../gantt/components/ledger";
import { lineTotal, isBelowFloor } from "../../lib/commercial/money";
import { fmtMoney } from "../../lib/format";
import type { QuoteItem, QuoteSection } from "../../lib/api/commercial";

interface Props {
  /** Live-derived by the parent from the freshly loaded quote (null = closed).
   *  After each save the quote refetches and this prop carries the new values,
   *  so the sheet always shows what the database holds. */
  item: QuoteItem | null;
  saving: boolean;
  canSeeCost: boolean;
  sections: QuoteSection[];
  minMarkupPct: number;
  /** Position within the same reorder group the desktop chevrons use. */
  idxInGroup: number;
  groupSize: number;
  onClose: () => void;
  onUpdate: (item: QuoteItem, patch: { qty?: number; unitPriceExGst?: number; costPriceExGst?: number; description?: string }) => void;
  onMarkup: (item: QuoteItem, markupPct: number) => void;
  onMove: (item: QuoteItem, dir: -1 | 1) => void;
  onMoveToSection: (item: QuoteItem, sectionId: string | null) => void;
  onRemove: (item: QuoteItem) => void;
}

const fieldCls =
  "w-full min-h-11 rounded-[11px] border border-[#E6E1D4] bg-white px-3 py-2 text-[15px] text-[#1A1A1A] focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C] disabled:opacity-50";
const labelCls = "mb-1 block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6B6B6B]";

/** Commit-on-blur number field — same semantics as the desktop NumCell
 *  (local draft, commit only when parsed and changed), sized for thumbs. */
function SheetNumField({
  label,
  value,
  disabled,
  onCommit,
  suffix,
}: {
  label: string;
  value: number;
  disabled: boolean;
  onCommit: (v: number) => void;
  suffix?: string;
}) {
  const [local, setLocal] = useState(String(value));
  useEffect(() => { setLocal(String(value)); }, [value]);
  return (
    <label className="block">
      <span className={labelCls}>{label}{suffix ? ` ${suffix}` : ""}</span>
      <input
        type="number"
        inputMode="decimal"
        min="0"
        step="any"
        value={local}
        disabled={disabled}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => {
          const n = parseFloat(local);
          if (!isNaN(n) && n !== value) onCommit(n);
        }}
        className={`${fieldCls} text-right tabular-nums`}
      />
    </label>
  );
}

export default function LineItemEditSheet({
  item,
  saving,
  canSeeCost,
  sections,
  minMarkupPct,
  idxInGroup,
  groupSize,
  onClose,
  onUpdate,
  onMarkup,
  onMove,
  onMoveToSection,
  onRemove,
}: Props) {
  // Keep the last non-null item so the close animation doesn't render an
  // empty shell (the parent nulls `item` the moment the line is deleted or
  // the sheet is dismissed).
  const lastItem = useRef<QuoteItem | null>(null);
  if (item) lastItem.current = item;
  const view = item ?? lastItem.current;

  // Description drafts locally, commits on blur — identical to TextCell.
  const [desc, setDesc] = useState(view?.description ?? "");
  useEffect(() => { setDesc(view?.description ?? ""); }, [view?.id, view?.description]);

  if (!view) return null;

  // Close via ANY path (Done, backdrop, Esc) must first flush the focused
  // field: fields commit on blur, but on iOS Safari tapping a button doesn't
  // blur the input, and React fires no blur on unmount — without this flush a
  // just-typed price is silently discarded while the label says "Saves
  // automatically". A programmatic blur() fires the commit synchronously.
  const requestClose = () => {
    const el = document.activeElement;
    if (el instanceof HTMLElement) el.blur();
    onClose();
  };

  const isLabour = view.kind === "labour";
  const cost = view.costPriceExGst;
  const markupPct = cost && cost > 0 ? Math.round(((view.unitPriceExGst - cost) / cost) * 1000) / 10 : null;
  const belowFloor = canSeeCost && view.kind === "material" && isBelowFloor(view.unitPriceExGst, cost, minMarkupPct);
  const total = lineTotal({ qty: view.qty, unitPriceExGst: view.unitPriceExGst });
  const live = item !== null; // false only during the close animation

  return (
    <MotionDrawer open={item !== null} onClose={requestClose} ariaLabel="Edit line item" sizeClass="sm:w-[440px]">
      <div className="flex items-start justify-between gap-3 border-b border-[#E6E1D4] px-4 pb-3 pt-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#A0A0A0]">
            {isLabour ? "Labour line" : view.kind === "material" ? "Part" : "Custom line"}
          </p>
          <h2 className="text-[19px] text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>Edit line</h2>
        </div>
        <button
          type="button"
          onClick={requestClose}
          aria-label="Close"
          className="flex h-11 w-11 items-center justify-center rounded-full text-[#6B6B6B] hover:bg-[#F0EDE4]"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div key={view.id} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <label className="block">
          <span className={labelCls}>{isLabour ? "Labour type" : "Description"}</span>
          <textarea
            rows={2}
            value={desc}
            disabled={saving || !live}
            onChange={(e) => setDesc(e.target.value)}
            onBlur={() => {
              const t = desc.trim();
              if (t && t !== view.description) onUpdate(view, { description: t });
            }}
            className={`${fieldCls} resize-none leading-snug`}
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <SheetNumField
            label={isLabour ? "Sell rate" : "Sell"}
            suffix={isLabour ? "($/hr)" : "($)"}
            value={view.unitPriceExGst}
            disabled={saving || !live}
            onCommit={(v) => onUpdate(view, { unitPriceExGst: v })}
          />
          <SheetNumField
            label={isLabour ? "Time" : "Qty"}
            suffix={isLabour ? "(hrs)" : undefined}
            value={view.qty}
            disabled={saving || !live}
            onCommit={(v) => onUpdate(view, { qty: v })}
          />
        </div>

        {canSeeCost && (
          <div className="rounded-[11px] bg-[#FAF8F2] p-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#A0A0A0]">Internal — never printed</p>
            <div className="grid grid-cols-2 gap-3">
              <SheetNumField
                label={isLabour ? "Cost rate" : "Cost"}
                suffix="($)"
                value={cost ?? 0}
                disabled={saving || !live}
                onCommit={(v) => onUpdate(view, { costPriceExGst: v })}
              />
              {markupPct === null ? (
                <div>
                  <span className={labelCls}>Markup (%)</span>
                  <p className="flex min-h-11 items-center justify-end rounded-[11px] border border-[#E6E1D4] bg-white px-3 text-[15px] text-[#A0A0A0]">—</p>
                </div>
              ) : (
                <SheetNumField
                  label="Markup"
                  suffix="(%)"
                  value={markupPct}
                  disabled={saving || !live}
                  onCommit={(v) => onMarkup(view, v)}
                />
              )}
            </div>
            {belowFloor && (
              <p className="mt-2 rounded-[8px] bg-[#F9EFD9] px-2.5 py-1.5 text-[12px] text-[#8A6D1C]">
                Selling below the minimum-markup floor.
              </p>
            )}
          </div>
        )}

        {sections.length > 0 && (
          <label className="block">
            <span className={labelCls}>Cost centre</span>
            <select
              value={view.sectionId ?? ""}
              disabled={saving || !live}
              onChange={(e) => onMoveToSection(view, e.target.value || null)}
              className={fieldCls}
            >
              <option value="">General</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>
        )}

        <div>
          <span className={labelCls}>Position</span>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              disabled={saving || !live || idxInGroup <= 0}
              onClick={() => onMove(view, -1)}
              className="flex min-h-11 items-center justify-center gap-2 rounded-[11px] border border-[#E6E1D4] bg-white text-sm font-medium text-[#3A3A3A] hover:bg-[#F0EDE4] disabled:opacity-40"
            >
              <ArrowUp className="h-4 w-4" /> Move up
            </button>
            <button
              type="button"
              disabled={saving || !live || idxInGroup < 0 || idxInGroup >= groupSize - 1}
              onClick={() => onMove(view, 1)}
              className="flex min-h-11 items-center justify-center gap-2 rounded-[11px] border border-[#E6E1D4] bg-white text-sm font-medium text-[#3A3A3A] hover:bg-[#F0EDE4] disabled:opacity-40"
            >
              <ArrowDown className="h-4 w-4" /> Move down
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-[#EFEBE0] pt-3">
          <span className="text-sm text-[#6B6B6B]">Line total</span>
          <span className="text-[17px] font-semibold tabular-nums text-[#1A1A1A]">{fmtMoney(total)}</span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-[#E6E1D4] px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          disabled={saving || !live}
          onClick={() => onRemove(view)}
          className="flex min-h-11 items-center gap-2 rounded-[11px] px-3 text-sm font-medium text-[#C44545] hover:bg-[#FBE5E5] disabled:opacity-40"
        >
          <Trash2 className="h-4 w-4" /> Delete line
        </button>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-[#A0A0A0]">{saving ? "Saving…" : "Saves automatically"}</span>
          <button type="button" onClick={requestClose} className={`${btnPrimary} min-h-11`}>
            Done
          </button>
        </div>
      </div>
    </MotionDrawer>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// components/ui/ItemCombobox.tsx — generic type-to-search picker over an
// in-memory option list (materials, jobs, wholesalers…). Replaces the native
// <select> in the PO surfaces per the test.html mock: focus opens a popover of
// up to `maxMatches` filtered rows; ArrowUp/Down + Enter pick; Escape closes
// ONLY the popover (stopPropagation — MotionDrawer's document-level Esc would
// otherwise close the whole modal).
//
// Popover mechanics lifted from AddressSearchInput: blur closes after a
// 200ms grace so a click can land; option buttons preventDefault on mousedown
// to keep focus; a pickedRef guard stops the programmatic label write-back
// from reopening the list.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { inputField } from '../../pages/gantt/components/ledger';

export interface ComboOption {
  id: string;
  label: string;
  /** Secondary match/display text (e.g. SKU) shown faintly after the label. */
  sublabel?: string | null;
}

/** Pure filter — exported for single-fork unit tests. Case-insensitive substring
 *  match over label + sublabel; empty query returns the head of the list. */
export function filterComboOptions(options: ComboOption[], query: string, max: number): ComboOption[] {
  const q = query.trim().toLowerCase();
  if (q === '') return options.slice(0, max);
  const out: ComboOption[] = [];
  for (const o of options) {
    if ((o.label + ' ' + (o.sublabel ?? '')).toLowerCase().includes(q)) {
      out.push(o);
      if (out.length >= max) break;
    }
  }
  return out;
}

interface Props {
  options: ComboOption[];
  /** Selected option id; '' = nothing selected. */
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  disabled?: boolean;
  maxMatches?: number;
  inputClassName?: string;
  emptyText?: string;
  /** Pinned action row under the results (e.g. "+ New wholesaler"). Rendered
   *  inside the popover; use onMouseDown-safe buttons. */
  footer?: ReactNode;
  /** Honest note pinned at the very bottom (e.g. "showing the latest 200 jobs"). */
  footnote?: string;
  ariaLabel?: string;
}

export default function ItemCombobox({
  options, value, onChange, placeholder = 'Type to search…', disabled,
  maxMatches = 8, inputClassName, emptyText = 'No matches.', footer, footnote, ariaLabel,
}: Props) {
  const selected = useMemo(() => options.find((o) => o.id === value) ?? null, [options, value]);
  const [query, setQuery] = useState<string | null>(null); // null = not editing; show selected label
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const pickedRef = useRef(false);

  const text = query ?? selected?.label ?? '';
  const matches = useMemo(
    () => filterComboOptions(options, query ?? '', maxMatches),
    [options, query, maxMatches],
  );

  function pick(o: ComboOption) {
    pickedRef.current = true;
    onChange(o.id);
    setQuery(null);
    setOpen(false);
    inputRef.current?.blur();
  }

  function openList() {
    if (disabled) return;
    setHighlight(0);
    setOpen(true);
  }

  return (
    <div className="relative min-w-0">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          value={text}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => {
            setQuery(e.target.value);
            setHighlight(0);
            setOpen(true);
            // Typing over a selection un-selects — the caller sees '' until a pick.
            if (value !== '') onChange('');
          }}
          onFocus={() => {
            if (pickedRef.current) { pickedRef.current = false; return; }
            openList();
          }}
          onBlur={() => window.setTimeout(() => { setOpen(false); setQuery(null); }, 200)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              if (!open) openList();
              else setHighlight((h) => Math.min(h + 1, matches.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setHighlight((h) => Math.max(h - 1, 0));
            } else if (e.key === 'Enter') {
              if (open && matches[highlight]) {
                e.preventDefault();
                pick(matches[highlight]);
              }
            } else if (e.key === 'Escape') {
              if (open) {
                // Close ONLY the popover — never the surrounding modal/drawer.
                e.stopPropagation();
                e.preventDefault();
                setOpen(false);
                setQuery(null);
              }
            }
          }}
          className={cn(inputField, 'pr-8', inputClassName)}
        />
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A0A0A0]" aria-hidden />
      </div>

      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 overflow-hidden rounded-[12px] border border-[#E6E1D4] bg-white shadow-[0_18px_40px_-14px_rgba(15,23,42,0.24)]">
          <ul role="listbox" className="max-h-56 overflow-y-auto py-1">
            {matches.length === 0 && (
              <li className="px-3 py-2 text-[13px] italic text-[#A0A0A0]">{emptyText}</li>
            )}
            {matches.map((o, i) => (
              <li key={o.id} role="option" aria-selected={i === highlight}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()} // keep focus so blur doesn't close early
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => pick(o)}
                  className={cn(
                    'block w-full px-3 py-2 text-left text-[13px] leading-snug text-[#3A3A3A]',
                    i === highlight && 'bg-[#FAF8F2] text-[#1A1A1A]',
                  )}
                >
                  {o.label}
                  {o.sublabel && <span className="ml-1.5 text-[11px] text-[#A0A0A0]">{o.sublabel}</span>}
                </button>
              </li>
            ))}
          </ul>
          {footer && <div className="border-t border-[#EFEBE0]">{footer}</div>}
          {footnote && <p className="border-t border-[#EFEBE0] px-3 py-1.5 text-[10.5px] text-[#A0A0A0]">{footnote}</p>}
        </div>
      )}
    </div>
  );
}

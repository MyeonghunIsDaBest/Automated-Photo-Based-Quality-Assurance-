// ─────────────────────────────────────────────────────────────────────────────
// components/ui/Register.tsx — the responsive register (table) kit (P9.A).
//
// Generalizes the maintenance/CustomersList pattern: a CSS-grid "table" whose
// header renders `hidden sm:grid` and whose rows show desktop cells at sm+ and
// a hand-authored `mobile` summary below sm. The grid template is declared
// ONCE on <Register> and shared to every row via context — the drift the old
// pattern invited (header/row templates duplicated verbatim) can't happen.
//
//   <Register cols="minmax(0,2fr) 100px 80px 40px" header={<>
//     <span>Item</span><span className="text-right">Qty</span>…
//   </>}>
//     {rows.map((r) => (
//       <RegisterRow key={r.id} onClick={…} mobile={<MobileSummary r={r} />}>
//         <span>{r.name}</span><span className="text-right">{r.qty}</span>…
//       </RegisterRow>
//     ))}
//   </Register>
//
// RowMenu renders the row-overflow "…" menu through a portal with fixed
// positioning, so it can never be clipped by an overflow container.
// ─────────────────────────────────────────────────────────────────────────────

import {
  createContext, useContext, useEffect, useLayoutEffect, useRef, useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical } from 'lucide-react';
import { cn } from '../../lib/cn';
import { cardShell } from '../../pages/gantt/components/ledger';

const ColsContext = createContext<string>('1fr');

interface RegisterProps {
  /** CSS grid-template-columns for header + every row (declared once). */
  cols: string;
  /** Desktop header cells — same order/count as row children. */
  header: ReactNode;
  children: ReactNode;
  className?: string;
  /** Optional footer row (e.g. "Showing 8 of 12"). */
  footer?: ReactNode;
}

export function Register({ cols, header, children, className, footer }: RegisterProps) {
  return (
    <ColsContext.Provider value={cols}>
      <div className={cn(cardShell, 'overflow-hidden', className)}>
        <div
          className="hidden gap-3 border-b border-[#E6E1D4] bg-[#FAF8F2] px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B] sm:grid"
          style={{ gridTemplateColumns: cols }}
        >
          {header}
        </div>
        <div className="divide-y divide-[#EFEBE0]">{children}</div>
        {footer}
      </div>
    </ColsContext.Provider>
  );
}

interface RegisterRowProps {
  children: ReactNode;
  /** Phone rendering of this row (shown < sm). Omit to reuse desktop cells stacked. */
  mobile?: ReactNode;
  onClick?: () => void;
  className?: string;
}

export function RegisterRow({ children, mobile, onClick, className }: RegisterRowProps) {
  const cols = useContext(ColsContext);
  const interactive = Boolean(onClick);
  const Tag = interactive ? 'button' : 'div';
  return (
    <Tag
      {...(interactive ? { type: 'button' as const, onClick } : {})}
      className={cn(
        'block w-full min-h-11 px-4 py-2.5 text-left text-sm text-[#1A1A1A]',
        interactive && 'cursor-pointer transition-colors hover:bg-[#FAF8F2] focus-visible:bg-[#FAF8F2] focus-visible:outline-none',
        className,
      )}
    >
      {/* Desktop cells */}
      <span className="hidden items-center gap-3 sm:grid" style={{ gridTemplateColumns: cols }}>
        {children}
      </span>
      {/* Phone summary */}
      <span className="block sm:hidden">{mobile ?? <span className="grid gap-1">{children}</span>}</span>
    </Tag>
  );
}

// ─── RowMenu — portal-rendered overflow menu (never clips) ──────────────────

export interface RowMenuItem {
  label: string;
  onSelect: () => void;
  tone?: 'default' | 'danger';
  disabled?: boolean;
}

export function RowMenu({ items, label = 'Row actions' }: { items: RowMenuItem[]; label?: string }) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const MENU_W = 192;
    setPos({
      top: r.bottom + 4,
      left: Math.max(8, Math.min(r.right - MENU_W, window.innerWidth - MENU_W - 8)),
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); btnRef.current?.focus(); } };
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="inline-flex h-11 w-11 items-center justify-center rounded-full text-[#6B6B6B] transition-colors hover:bg-[#F0EDE4] hover:text-[#1A1A1A]"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && pos && createPortal(
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div
            role="menu"
            className="fixed z-50 w-48 overflow-hidden rounded-[11px] border border-[#E6E1D4] bg-white py-1 shadow-[0_8px_28px_rgba(20,20,20,0.12)]"
            style={{ top: pos.top, left: pos.left }}
          >
            {items.map((item, i) => (
              <button
                key={i}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={(e) => { e.stopPropagation(); setOpen(false); item.onSelect(); }}
                className={cn(
                  'block w-full px-3.5 py-2.5 text-left text-[13px] font-medium transition-colors hover:bg-[#FAF8F2] disabled:cursor-not-allowed disabled:opacity-40',
                  item.tone === 'danger' ? 'text-[#C44545]' : 'text-[#3A3A3A]',
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </>,
        document.body,
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// components/ui/Sheet.tsx — content scaffolding for MotionDrawer (P9.A).
//
// Not a new overlay: MotionDrawer stays the only drawer/modal primitive. These
// recipes give every sheet the same anatomy — pinned header, scrolling body,
// pinned footer — so the ~18 migrated hand-rolled modals and all new edit
// sheets read identically and the safe-area/scroll behavior lives in one place.
//
//   <MotionDrawer open={open} onClose={close} ariaLabel="Edit line">
//     <div className="flex h-full flex-col">
//       <DrawerHeader title="Edit line" subtitle="Downlight point" onClose={close} />
//       <DrawerBody>…form…</DrawerBody>
//       <DrawerFooter>
//         <button className={btnGhost}>Cancel</button>
//         <button className={btnPrimary}>Save</button>
//       </DrawerFooter>
//     </div>
//   </MotionDrawer>
// ─────────────────────────────────────────────────────────────────────────────

import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { FRAUNCES } from '../../pages/gantt/components/ledger';

export function DrawerHeader({
  title, subtitle, onClose, actions, className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  onClose?: () => void;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-3 border-b border-[#EFEBE0] px-4 py-3 sm:px-5', className)}>
      <div className="min-w-0">
        <h2 className="truncate text-[19px] font-medium text-[#1A1A1A]" style={{ fontFamily: FRAUNCES, letterSpacing: '-0.01em' }}>
          {title}
        </h2>
        {subtitle && <p className="mt-0.5 truncate text-[13px] text-[#6B6B6B]">{subtitle}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {actions}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-[#6B6B6B] transition-colors hover:bg-[#F0EDE4] hover:text-[#1A1A1A]"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

/** The scrolling element — header/footer stay pinned around it. */
export function DrawerBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex-1 space-y-4 overflow-y-auto p-4 sm:p-5', className)}>{children}</div>;
}

export function DrawerFooter({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center justify-end gap-2 border-t border-[#EFEBE0] px-4 py-3 pb-safe sm:px-5', className)}>
      {children}
    </div>
  );
}

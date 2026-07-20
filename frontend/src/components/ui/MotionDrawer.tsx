import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useMediaQuery } from '../../lib/hooks/useMediaQuery';
import { drawerBottom, drawerRight, fadeIn, modalCard } from '../../lib/motion/variants';
import { cn } from '../../lib/cn';

// Shared across every mounted drawer — see the scroll-lock effect.
let scrollLocks = 0;

// Open-drawer stack: with NESTED drawers (the allocate sheet inside the
// Service Job drawer, the new-wholesaler mini modal inside the PO modal),
// every instance's document-level Esc listener fires on the same keypress —
// one Esc would close the whole stack. Only the TOP-MOST open drawer may
// answer Esc; the rest stay put until it's their turn.
const openStack: symbol[] = [];

interface MotionDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Tailwind width classes applied at `sm:` and up (e.g. "sm:w-[520px] lg:w-[640px]"). */
  sizeClass?: string;
  /** ARIA role on the aside; defaults to "dialog". */
  role?: 'dialog' | 'region';
  ariaLabel?: string;
  className?: string;
  /**
   * Layout variant:
   * - `drawer` (default): right-side slide on tablet+, bottom-sheet on mobile.
   * - `modal`: centered popup with scale+fade. Same scroll-lock / Esc / backdrop
   *   plumbing, just a different stage position. Use for surfaces that read as
   *   a discrete "edit this thing" task (e.g. clicking a sub-task) rather than
   *   a persistent side panel.
   */
  variant?: 'drawer' | 'modal';
  children: ReactNode;
}

/**
 * Shared drawer shell with editorial motion language:
 * - mobile: slides up from the bottom edge with a spring
 * - tablet+: slides in from the right edge with a spring
 * - backdrop fades in/out independently
 *
 * Absorbs the body scroll-lock + Esc-to-close effects that each drawer used
 * to duplicate; the consumer just renders header/body/footer inside.
 */
export default function MotionDrawer({
  open,
  onClose,
  sizeClass = 'sm:w-[520px] lg:w-[640px]',
  role = 'dialog',
  ariaLabel,
  className,
  variant = 'drawer',
  children,
}: MotionDrawerProps) {
  // Tablet+ uses the right-side variant; phones get the bottom-sheet variant.
  // The `sm:` breakpoint in Tailwind is 640px — mirror that here so the JS
  // animation choice agrees with the CSS rounded-corner switch below.
  const isDesktop = useMediaQuery('(min-width: 640px)');
  const slideVariants = isDesktop ? drawerRight : drawerBottom;

  // Lock scroll while open. Keying off `open` ensures cleanup runs even if the
  // consumer unmounts mid-open. Refcounted at module level: with stacked
  // drawers (e.g. the PO modal opening the new-wholesaler mini modal), a bare
  // add/remove would unlock the page the moment the INNER one closed.
  useEffect(() => {
    if (!open) return;
    scrollLocks += 1;
    document.body.classList.add('body-scroll-lock');
    return () => {
      scrollLocks = Math.max(0, scrollLocks - 1);
      if (scrollLocks === 0) document.body.classList.remove('body-scroll-lock');
    };
  }, [open]);

  // Track this instance's position in the open stack.
  const stackIdRef = useRef<symbol | null>(null);
  if (stackIdRef.current === null) stackIdRef.current = Symbol('motion-drawer');
  useEffect(() => {
    if (!open) return;
    const id = stackIdRef.current as symbol;
    openStack.push(id);
    return () => {
      const i = openStack.indexOf(id);
      if (i >= 0) openStack.splice(i, 1);
    };
  }, [open]);

  // Esc closes — but only the top-most open drawer (see openStack above).
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (openStack[openStack.length - 1] !== stackIdRef.current) return;
      onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Dialog focus contract: on open, move focus INTO the dialog (else keyboard
  // and screen-reader users keep reading the obscured page behind the scrim —
  // the portal renders at the END of <body>, after all page content); on close,
  // hand focus back to wherever it came from. A full Tab trap is P9.H scope.
  const asideRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const t = window.setTimeout(() => asideRef.current?.focus(), 0);
    return () => {
      window.clearTimeout(t);
      previouslyFocused?.focus();
    };
  }, [open]);

  // Portal to <body>: the routed page is wrapped in a transform-animated
  // <motion.div> (pageTransition), and a `transform` ancestor makes
  // `position: fixed` resolve relative to THAT wrapper, not the viewport —
  // which trapped the backdrop above the phone tab bar and would scroll
  // desktop drawers with the page. Rendering at body level sidesteps every
  // such ancestor. Context + events still follow the React tree (portals
  // preserve both), so onClose/scroll-lock/Esc are unaffected.
  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            type="button"
            aria-label={ariaLabel ? `Close ${ariaLabel}` : 'Close drawer'}
            onClick={onClose}
            variants={fadeIn}
            initial="hidden"
            animate="visible"
            exit="exit"
            // z-50 (not lower than the aside): all drawers portal to <body>,
            // so with a NESTED pair (PO modal → new-wholesaler mini modal) the
            // inner drawer's backdrop must paint ABOVE the outer drawer's
            // panel. Same z + later DOM position = painted above; a lower z
            // here left the outer form undimmed and fully clickable.
            className="fixed inset-0 z-50 cursor-default bg-[#1A1A1A]/40 backdrop-blur-sm print:hidden"
          />
          {variant === 'modal' ? (
            // Centering wrapper sits between backdrop (z-40) and aside (z-50).
            // pointer-events-none lets clicks on the empty letterbox fall
            // through to the backdrop button; the aside re-enables pointer
            // events so its own interactions still register normally.
            <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 print:hidden">
              <motion.aside
                ref={asideRef}
                role={role}
                aria-modal={role === 'dialog' ? true : undefined}
                aria-label={ariaLabel}
                tabIndex={-1}
                variants={modalCard}
                initial="hidden"
                animate="visible"
                exit="exit"
                // cn (twMerge) lets a caller's sizeClass cleanly override the
                // base max-w-[640px] (e.g. the PO modal's max-w-[680px]).
                className={cn(
                  'pointer-events-auto flex max-h-[90dvh] w-full max-w-[640px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl',
                  sizeClass,
                  className,
                )}
              >
                {children}
              </motion.aside>
            </div>
          ) : (
            <motion.aside
              ref={asideRef}
              role={role}
              aria-modal={role === 'dialog' ? true : undefined}
              aria-label={ariaLabel}
              tabIndex={-1}
              variants={slideVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className={cn(
                'fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col rounded-t-2xl bg-white shadow-2xl print:hidden',
                'sm:inset-y-0 sm:right-0 sm:left-auto sm:max-h-none sm:rounded-l-2xl sm:rounded-tr-none',
                sizeClass,
                className,
              )}
            >
              {children}
            </motion.aside>
          )}
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}

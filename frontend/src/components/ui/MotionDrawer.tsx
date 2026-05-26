import { useEffect, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useMediaQuery } from '../../lib/hooks/useMediaQuery';
import { drawerBottom, drawerRight, fadeIn, modalCard } from '../../lib/motion/variants';

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
  // consumer unmounts mid-open.
  useEffect(() => {
    if (!open) return;
    document.body.classList.add('body-scroll-lock');
    return () => document.body.classList.remove('body-scroll-lock');
  }, [open]);

  // Esc closes.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  return (
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
            className="fixed inset-0 z-40 cursor-default bg-slate-900/40 backdrop-blur-sm"
          />
          {variant === 'modal' ? (
            // Centering wrapper sits between backdrop (z-40) and aside (z-50).
            // pointer-events-none lets clicks on the empty letterbox fall
            // through to the backdrop button; the aside re-enables pointer
            // events so its own interactions still register normally.
            <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
              <motion.aside
                role={role}
                aria-label={ariaLabel}
                variants={modalCard}
                initial="hidden"
                animate="visible"
                exit="exit"
                className={[
                  'pointer-events-auto flex max-h-[90dvh] w-full max-w-[640px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl',
                  sizeClass,
                  className,
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {children}
              </motion.aside>
            </div>
          ) : (
            <motion.aside
              role={role}
              aria-label={ariaLabel}
              variants={slideVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className={[
                'fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col rounded-t-2xl bg-white shadow-2xl',
                'sm:inset-y-0 sm:right-0 sm:left-auto sm:max-h-none sm:rounded-l-2xl sm:rounded-tr-none',
                sizeClass,
                className,
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {children}
            </motion.aside>
          )}
        </>
      )}
    </AnimatePresence>
  );
}

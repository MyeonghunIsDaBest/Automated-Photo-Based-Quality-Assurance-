import { useEffect, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useMediaQuery } from '../../lib/hooks/useMediaQuery';
import { drawerBottom, drawerRight, fadeIn } from '../../lib/motion/variants';

interface MotionDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Tailwind width classes applied at `sm:` and up (e.g. "sm:w-[520px] lg:w-[640px]"). */
  sizeClass?: string;
  /** ARIA role on the aside; defaults to "dialog". */
  role?: 'dialog' | 'region';
  ariaLabel?: string;
  className?: string;
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
        </>
      )}
    </AnimatePresence>
  );
}

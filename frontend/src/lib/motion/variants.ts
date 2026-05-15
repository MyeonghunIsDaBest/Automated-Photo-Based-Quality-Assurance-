import type { Variants } from 'framer-motion';

// Shared motion language for the editorial UI. Every consumer imports from here
// so route changes, modal pops, drawer slides, list reorders and hover lifts
// read consistently. Eases are tuned for a "premium native app" feel:
//   - spring physics for entrances that should feel material (modal, drawer)
//   - cubic-bezier(0.22, 1, 0.36, 1) for content fade-ups (a soft overshoot)
//   - linear 0.2–0.3s for overlays (they shouldn't feel theatrical)
// Reduced-motion is honoured globally via <MotionConfig reducedMotion="user">
// in App.tsx — every variant below becomes a no-op for OS-level reduced motion.

const editorialEase = [0.22, 1, 0.36, 1] as const;

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: editorialEase },
  },
};

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.3 } },
  exit: { opacity: 0, transition: { duration: 0.2 } },
};

export const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
};

export const modalOverlay: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.2 } },
};

export const modalCard: Variants = {
  hidden: { opacity: 0, scale: 0.94, y: 16 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: 'spring', damping: 26, stiffness: 320 },
  },
  exit: {
    opacity: 0,
    scale: 0.96,
    y: 12,
    transition: { duration: 0.2 },
  },
};

export const drawerRight: Variants = {
  hidden: { x: '100%' },
  visible: {
    x: 0,
    transition: { type: 'spring', damping: 30, stiffness: 300 },
  },
  exit: { x: '100%', transition: { duration: 0.25, ease: 'easeIn' } },
};

export const drawerBottom: Variants = {
  hidden: { y: '100%' },
  visible: {
    y: 0,
    transition: { type: 'spring', damping: 30, stiffness: 300 },
  },
  exit: { y: '100%', transition: { duration: 0.25, ease: 'easeIn' } },
};

export const pageTransition: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: editorialEase } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.2 } },
};

export const popover: Variants = {
  hidden: { opacity: 0, scale: 0.96, y: -4 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: 'spring', damping: 28, stiffness: 360 },
  },
  exit: {
    opacity: 0,
    scale: 0.97,
    y: -4,
    transition: { duration: 0.15 },
  },
};

export const tapShrink = { scale: 0.97 } as const;

export const hoverLift = {
  y: -2,
  transition: { type: 'spring' as const, stiffness: 400, damping: 28 },
};

export const hoverLiftLg = {
  y: -4,
  transition: { type: 'spring' as const, stiffness: 400, damping: 28 },
};

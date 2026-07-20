// components/layout/NavFlyout.tsx — the desktop hover mega-menu.
//
// Portaled to <body> (not absolute in the rail) because the rail's <nav> is
// overflow-y-auto and would clip an absolutely-positioned flyout — the same
// reason RowMenu portals. Positioned `fixed` beside the hovered row, clamped so
// it never runs off the bottom. Closes on scroll / resize / Escape; hover-intent
// (open/close delay, cross-the-gap) is owned by AppSidebar.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import type { NavItem } from './navConfig';
import { NavFlyoutContent } from './NavFlyoutContent';

interface Props {
  item: NavItem;
  /** The hovered nav row's viewport rect — the flyout anchors to its right edge. */
  anchor: DOMRect;
  onClose: () => void;
  /** Pointer entered the flyout — cancel any pending close. */
  onEnter: () => void;
  /** Pointer left the flyout — schedule a close. */
  onLeave: () => void;
}

export function NavFlyout({ item, anchor, onClose, onEnter, onLeave }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Measure after mount so we can clamp against the flyout's real height.
  useLayoutEffect(() => {
    const h = ref.current?.offsetHeight ?? 0;
    const top = Math.max(8, Math.min(anchor.top, window.innerHeight - h - 8));
    setPos({ top, left: anchor.right + 8 });
  }, [anchor]);

  useEffect(() => {
    const close = () => onClose();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return createPortal(
    <motion.div
      ref={ref}
      role="menu"
      aria-label={item.label}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      // Stay invisible (opacity 0 via the hidden variant) until measured, so it
      // never flashes at the unclamped top; once positioned, slide/fade in from
      // the rail edge. MotionConfig reducedMotion="user" makes this instant for
      // users who ask for less motion.
      variants={{ hidden: { opacity: 0, x: -6, scale: 0.98 }, visible: { opacity: 1, x: 0, scale: 1 } }}
      initial="hidden"
      animate={pos ? 'visible' : 'hidden'}
      transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
      style={{
        top: pos?.top ?? anchor.top,
        left: pos?.left ?? anchor.right + 8,
        transformOrigin: 'left center',
      }}
      className="fixed z-[70] w-[400px] max-w-[calc(100vw-24px)] overflow-hidden rounded-[16px] border border-[#E6E1D4] bg-white shadow-[0_20px_44px_-16px_rgba(15,23,42,0.30)] print:hidden"
    >
      <NavFlyoutContent item={item} onNavigate={onClose} />
    </motion.div>,
    document.body,
  );
}

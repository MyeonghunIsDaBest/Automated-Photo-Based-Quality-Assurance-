// ─────────────────────────────────────────────────────────────────────────────
// editorial.ts
//
// Phase B — typed className recipes for the editorial design system. These
// are the only places that should encode the slate/emerald + Fraunces+DM Sans
// design language. New components compose these strings via clsx/cn rather
// than re-typing Tailwind utilities inline.
//
// Tokens (declared in `index.css` @theme):
//   font-display = Fraunces            font-sans = DM Sans
//   shadow-card / shadow-modal / shadow-pill
//   rounded-pill = 9999px
// ─────────────────────────────────────────────────────────────────────────────

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Combine class names; later values win on conflicts (powered by tailwind-merge). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/* ─── Buttons ────────────────────────────────────────────────────────────── */

/** Slate-900 pill that hovers up to emerald-700 with a shadow lift. The brand
 *  primary affordance — used for the page-level CTA on every editorial page. */
export const buttonPill = cn(
  'group inline-flex items-center justify-center gap-2 whitespace-nowrap',
  'rounded-pill bg-slate-900 px-5 py-2.5 text-sm font-medium text-white',
  'shadow-sm transition-all',
  'hover:-translate-y-0.5 hover:bg-emerald-700 hover:shadow-pill',
  'active:translate-y-0 active:bg-emerald-800',
  'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:bg-slate-900',
);

/** Outlined alternative — slate text on white, hover lifts to emerald. */
export const buttonGhost = cn(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap',
  'rounded-pill border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700',
  'transition-colors hover:border-emerald-500/40 hover:text-emerald-700',
);

/** Inline action button that lives next to a SectionHeader title. Smaller. */
export const buttonEyebrow = cn(
  'inline-flex items-center gap-1 text-xs font-medium uppercase tracking-[0.18em] text-slate-500',
  'transition-colors hover:text-emerald-700',
);

/* ─── Eyebrow + display ──────────────────────────────────────────────────── */

/** "— UPPERCASE TRACKED" eyebrow line preceded by the slate dash. */
export const eyebrow = cn(
  'flex items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-slate-500',
);

/** The Fraunces display heading utility. Pages use it via the `.display`
 *  className when wrapping in `.editorial-root` (automatic via primitives). */
export const displayHeading = cn(
  'display text-2xl font-medium leading-tight text-slate-900 sm:text-3xl md:text-4xl',
);

/* ─── Cards + sections ───────────────────────────────────────────────────── */

/** White card, slate-200 border, 2xl radius. Every editorial section card. */
export const editorialCard = cn(
  'overflow-hidden rounded-2xl border border-slate-200 bg-white',
);

/** Stat cell — white, thin coloured top-left bar declared via inline style
 *  on the consumer (the accent colour varies per cell, so it can't live in a
 *  single className). The recipe just sets the rest of the chrome. */
export const statCard = cn(
  'relative overflow-hidden bg-white p-4 sm:p-5',
);

/* ─── Modal + sheet (sm: bottom-sheet) ───────────────────────────────────── */

/** Fixed full-screen overlay behind a modal. Slate-900 / 50% with body blur. */
export const modalOverlay = cn(
  'fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm',
);

/** Modal card — fills the viewport on phones (max-h-[100dvh] handles the
 *  iOS toolbar correctly), settles into a centered card on tablet+. */
export const modalCard = cn(
  'fixed z-50',
  // Mobile: bottom-sheet pinned to the bottom safe area.
  'left-0 right-0 bottom-0 max-h-[100dvh] rounded-t-2xl',
  // Tablet+: centered card.
  'sm:top-1/2 sm:left-1/2 sm:right-auto sm:bottom-auto',
  'sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl',
  'sm:max-h-[90vh] sm:w-[min(560px,calc(100vw-2rem))]',
  // Visual chrome.
  'flex flex-col bg-white shadow-modal',
);

/* ─── Status badges ──────────────────────────────────────────────────────── */

/** A pill-shaped status badge. Pass the colour palette via `chip` (e.g. one
 *  of the maps in admin/UsersTab or pages/Dashboard). */
export const statusPill = cn(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wider',
);

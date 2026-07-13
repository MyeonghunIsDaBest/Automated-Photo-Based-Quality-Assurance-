// ─────────────────────────────────────────────────────────────────────────────
// lib/cn.ts — the class-name combiner, extracted from lib/editorial.ts (P9.A)
// so the editorial design system can be retired without orphaning cn().
// ─────────────────────────────────────────────────────────────────────────────

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Combine class names; later values win on conflicts (powered by tailwind-merge). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

// ActionTile — the large "what should I do next" CTA on the /home page.
// Three of them sit in a 1/3-col grid (stacking on mobile) and link to the
// loops the role actually uses (Photo QA, Site Diary, Inbox / Reports /
// Supplier-section). ≥48px tap target on mobile, hover-lift on desktop.

import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';
import { hoverLift, tapShrink } from '../../../lib/motion/variants';
import type { ActionTileSpec, AccentTone } from '../roleHomeConfig';

interface ActionTileProps {
  tile: ActionTileSpec;
}

// Tailwind doesn't see dynamic strings — these maps stay verbose so the JIT
// keeps the classes in the bundle. Each variant's three tiles use these
// three tones so the trio reads as a single set.
const ACCENT_BG: Record<AccentTone, string> = {
  emerald: 'bg-emerald-50',
  slate:   'bg-slate-100',
  amber:   'bg-amber-50',
  blue:    'bg-blue-50',
};
const ACCENT_FG: Record<AccentTone, string> = {
  emerald: 'text-emerald-700',
  slate:   'text-slate-700',
  amber:   'text-amber-700',
  blue:    'text-blue-700',
};
const ACCENT_RING: Record<AccentTone, string> = {
  emerald: 'group-hover:ring-emerald-200',
  slate:   'group-hover:ring-slate-200',
  amber:   'group-hover:ring-amber-200',
  blue:    'group-hover:ring-blue-200',
};

export default function ActionTile({ tile }: ActionTileProps) {
  const Icon = tile.icon;
  return (
    <motion.div whileHover={hoverLift} whileTap={tapShrink}>
      <Link
        to={tile.to}
        className={`group relative flex h-full min-h-[148px] flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 ring-1 ring-transparent transition-all hover:shadow-md ${ACCENT_RING[tile.accent]} sm:p-6`}
      >
        <span
          className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${ACCENT_BG[tile.accent]} ${ACCENT_FG[tile.accent]}`}
          aria-hidden
        >
          <Icon className="h-5 w-5" strokeWidth={1.75} />
        </span>

        <div className="flex min-w-0 flex-1 flex-col">
          <h3 className="display text-lg font-medium leading-tight text-slate-900 sm:text-xl">
            {tile.title}
          </h3>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-500">
            {tile.sub}
          </p>
        </div>

        <ArrowUpRight
          className="absolute right-5 top-5 h-4 w-4 text-slate-300 transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-slate-700"
          aria-hidden
        />
      </Link>
    </motion.div>
  );
}

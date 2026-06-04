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
  emerald: 'bg-[#E5F2EA]',
  slate:   'bg-[#EEF1F4]',
  amber:   'bg-[#F9EFD9]',
  blue:    'bg-[#EEF1F4]',
};
const ACCENT_FG: Record<AccentTone, string> = {
  emerald: 'text-[#246F47]',
  slate:   'text-[#5B6B7B]',
  amber:   'text-[#C8841E]',
  blue:    'text-[#5B6B7B]',
};
const ACCENT_RING: Record<AccentTone, string> = {
  emerald: 'group-hover:ring-[#A8D0B8]',
  slate:   'group-hover:ring-[#D8D2C4]',
  amber:   'group-hover:ring-[#F9EFD9]',
  blue:    'group-hover:ring-[#D8D2C4]',
};

export default function ActionTile({ tile }: ActionTileProps) {
  const Icon = tile.icon;
  return (
    <motion.div whileHover={hoverLift} whileTap={tapShrink}>
      <Link
        to={tile.to}
        className={`group relative flex h-full min-h-[148px] flex-col gap-3 rounded-[14px] border border-[#E6E1D4] bg-white p-5 ring-1 ring-transparent shadow-[0_1px_2px_rgba(20,20,20,0.04)] transition-all hover:shadow-[0_4px_12px_rgba(20,20,20,0.08)] ${ACCENT_RING[tile.accent]} sm:p-6`}
      >
        <span
          className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${ACCENT_BG[tile.accent]} ${ACCENT_FG[tile.accent]}`}
          aria-hidden
        >
          <Icon className="h-5 w-5" strokeWidth={1.75} />
        </span>

        <div className="flex min-w-0 flex-1 flex-col">
          <h3 className="display text-lg font-medium leading-tight text-[#1A1A1A] sm:text-xl">
            {tile.title}
          </h3>
          <p className="mt-1.5 text-sm leading-relaxed text-[#6B6B6B]">
            {tile.sub}
          </p>
        </div>

        <ArrowUpRight
          className="absolute right-5 top-5 h-4 w-4 text-[#D8D2C4] transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-[#3A3A3A]"
          aria-hidden
        />
      </Link>
    </motion.div>
  );
}

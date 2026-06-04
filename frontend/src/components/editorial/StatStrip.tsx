import { cn } from '../../lib/editorial';

// At-a-glance metric strip — the 4-up StatCell row that makes Safety / Reports
// read as informative. Lifts the inline grid those pages hand-rolled into one
// reusable wrapper: a hairline-divided rounded card whose children are
// <StatCell> elements. Stacks 2-up on mobile, expands to `cols` on md+.
//
//   <StatStrip>
//     <StatCell label="Open" value={12} accent="rose" />
//     …
//   </StatStrip>

interface StatStripProps {
  children: React.ReactNode;
  /** Columns on md+ screens. Mobile is always 2-up. Default 4. */
  cols?: 2 | 3 | 4;
  className?: string;
}

const MD_COLS: Record<2 | 3 | 4, string> = {
  2: 'md:grid-cols-2',
  3: 'md:grid-cols-3',
  4: 'md:grid-cols-4',
};

export default function StatStrip({ children, cols = 4, className }: StatStripProps) {
  return (
    <div
      className={cn(
        // gap-px over a slate-200 background draws the hairline dividers between
        // cells (each StatCell is white), matching the Safety/Reports strip.
        'grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200',
        MD_COLS[cols],
        className,
      )}
    >
      {children}
    </div>
  );
}

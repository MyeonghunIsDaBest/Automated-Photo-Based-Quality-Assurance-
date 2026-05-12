// AccentBar — thin coloured bar used as a section / card accent.
//
// Reads `--accent-color` from the nearest CSS variable scope (set on the
// `editorial-root` wrapper by Layout.tsx from the per-project config).
// Falls back to the global emerald-500 when the variable isn't defined so
// pre-config UIs look identical.
//
// Width and rounding mirror the StatCell accent stub at the top-left corner
// so this component slots into existing cards without bespoke styling.

interface AccentBarProps {
  /** Override the variable / fallback. Useful for status accents (rose, amber). */
  color?: string;
  /** Total CSS width — defaults to 3rem ("w-12") so the look matches StatCell. */
  width?: string;
  /** Total CSS height — defaults to 0.25rem ("h-1"). */
  height?: string;
  className?: string;
}

export default function AccentBar({
  color,
  width = '3rem',
  height = '0.25rem',
  className,
}: AccentBarProps) {
  return (
    <span
      aria-hidden
      className={className}
      style={{
        display: 'inline-block',
        width,
        height,
        backgroundColor: color ?? 'var(--accent-color, #10B981)',
        borderTopRightRadius: '999px',
        borderBottomRightRadius: '999px',
      }}
    />
  );
}

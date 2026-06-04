import { pageShell, cn } from '../../lib/editorial';

// The standard body region under a page header. Centers + caps content at the
// shared page max-width (so wide monitors get calm side margins instead of
// edge-to-edge sprawl) and applies the canonical vertical rhythm. Replaces the
// hand-rolled `px-4 py-8 sm:px-8 sm:py-10` wrappers each page used to declare.

interface PageContainerProps {
  children: React.ReactNode;
  /** Extra classes — e.g. `space-y-6` for stacked sections, or a tighter `py`. */
  className?: string;
}

export default function PageContainer({ children, className }: PageContainerProps) {
  return <div className={cn(pageShell, 'py-6 sm:py-8', className)}>{children}</div>;
}

import { eyebrow, cn } from '../../lib/editorial';

interface EyebrowLabelProps {
  children: React.ReactNode;
  /** Render as a different element. Defaults to <p> for sectional usage. */
  as?: 'p' | 'span' | 'div';
  /** Hide the leading slate dash. */
  bare?: boolean;
  className?: string;
}

export default function EyebrowLabel({
  children,
  as = 'p',
  bare = false,
  className,
}: EyebrowLabelProps) {
  const Tag = as as 'p';
  return (
    <Tag className={cn(eyebrow, className)}>
      {!bare && <span className="inline-block h-px w-6 bg-slate-400" aria-hidden />}
      <span>{children}</span>
    </Tag>
  );
}

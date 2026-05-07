import EyebrowLabel from './EyebrowLabel';
import { cn } from '../../lib/editorial';

interface SectionHeaderProps {
  eyebrow: string;
  title: string;
  description?: string;
  /** Right-side affordance. Pass an `<EditorialButton>` or anchor. */
  action?: React.ReactNode;
  className?: string;
}

export default function SectionHeader({
  eyebrow,
  title,
  description,
  action,
  className,
}: SectionHeaderProps) {
  return (
    <header
      className={cn(
        'flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6',
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <EyebrowLabel>{eyebrow}</EyebrowLabel>
        <h2 className="display mt-1 text-lg font-medium text-slate-900 sm:text-xl">{title}</h2>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </header>
  );
}

import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}

// A consistent "nothing to show yet" placeholder. Keeps every tab's empty
// state visually identical so the page doesn't feel like a patchwork.
export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#E6E1D4] bg-[#FAF8F2]/60 px-6 py-16 text-center">
      {Icon && (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-sm">
          <Icon className="h-5 w-5 text-[#A0A0A0]" />
        </div>
      )}
      <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[#6B6B6B]">
        Nothing yet
      </p>
      <h3 className="mt-2 text-lg font-semibold text-[#1A1A1A]">{title}</h3>
      {description && (
        <p className="mt-1 max-w-md text-sm leading-relaxed text-[#6B6B6B]">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

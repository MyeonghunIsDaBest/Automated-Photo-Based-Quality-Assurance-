import type { ReactNode } from 'react';

interface TabHeaderProps {
  eyebrow: string;
  title: string;
  // Optional emerald-italic accent word inside the title — render with
  // <em>{accent}</em> in the JSX call site if a fancier styling is wanted.
  description?: string;
  action?: ReactNode;
}

// Shared header used by every Gantt tab. Mirrors the editorial style of the
// Dashboard's "The brief." block so the page reads as one cohesive surface.
export function TabHeader({ eyebrow, title, description, action }: TabHeaderProps) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0 flex-1">
        <div className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.2em] text-slate-500">
          <span className="inline-block h-px w-6 bg-slate-400" />
          {eyebrow}
        </div>
        <h2
          className="text-3xl font-medium leading-tight text-slate-900"
          style={{
            fontFamily: "'Fraunces', Georgia, serif",
            fontFeatureSettings: "'ss01'",
            letterSpacing: '-0.02em',
          }}
        >
          {title}
        </h2>
        {description && (
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-500">
            {description}
          </p>
        )}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}

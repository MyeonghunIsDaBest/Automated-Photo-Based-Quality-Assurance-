import { clsx } from 'clsx';

// Tiny skeleton primitive for loading states. Drop it in any spot waiting on
// data — Tailwind's animate-pulse handles the shimmer.
//
//   <Skeleton className="h-4 w-32" />
//   <Skeleton className="h-8 w-full rounded-md" />
export function Skeleton({
  className,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx('animate-pulse rounded-md bg-slate-200/70', className)}
      {...rest}
    />
  );
}

// Convenience preset: a row that mimics one Gantt bar while the tasks query
// is in flight. Render N of these inside the task body.
export function GanttRowSkeleton() {
  return (
    <div className="flex items-center gap-3 border-b border-slate-100 px-3 py-3">
      <Skeleton className="h-8 w-8 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3 w-1/3" />
        <Skeleton className="h-3 w-1/4" />
      </div>
      <Skeleton className="h-6 w-2/5 rounded-md" />
    </div>
  );
}

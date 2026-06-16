import { clsx } from 'clsx';

// Tiny skeleton primitive for loading states. Drop it in any spot waiting on
// data — Tailwind's animate-pulse handles the shimmer (disabled under
// prefers-reduced-motion). Toned to the editorial cream palette so loading
// surfaces read as the same paper as the loaded page — no white/gray flash.
//
//   <Skeleton className="h-4 w-32" />
//   <Skeleton className="h-8 w-full rounded-md" />
export function Skeleton({
  className,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={clsx(
        'animate-pulse rounded-md bg-[#F0EDE4] motion-reduce:animate-none',
        className,
      )}
      {...rest}
    />
  );
}

/** Text-line shimmer — thinner, fully rounded. */
export function SkeletonLine({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <Skeleton className={clsx('h-3 rounded-full', className)} {...rest} />;
}

/** Card-shaped shimmer: white shell + internal lines, matching the app's
 *  hairline-card grammar so loading cards sit where real cards will. */
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div aria-hidden className={clsx('rounded-[12px] border border-[#EFEBE0] bg-white p-4', className)}>
      <div className="flex items-center justify-between">
        <SkeletonLine className="w-16" />
        <SkeletonLine className="w-8" />
      </div>
      <SkeletonLine className="mt-3 h-4 w-3/4" />
      <SkeletonLine className="mt-2 w-1/2" />
      <div className="mt-4 flex items-center justify-between">
        <SkeletonLine className="w-20" />
        <Skeleton className="h-6 w-6 rounded-full" />
      </div>
    </div>
  );
}

/** Full page-shell skeleton: masthead band + content blocks. Used as the
 *  route-level Suspense fallback so navigation never flashes a blank page. */
export function PageSkeleton() {
  return (
    <div
      className="min-h-screen bg-[#F5F2E9] px-4 py-5 sm:px-6"
      aria-busy="true"
      aria-label="Loading page"
    >
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="mb-5 rounded-[14px] border border-[#E6E1D4] bg-white px-6 py-5">
          <div className="flex flex-wrap items-center gap-5">
            <Skeleton className="h-14 w-14 rounded-[11px]" />
            <div>
              <SkeletonLine className="w-28" />
              <Skeleton className="mt-2 h-7 w-40" />
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Skeleton className="h-9 w-24 rounded-full" />
              <Skeleton className="h-9 w-32 rounded-full" />
            </div>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard className="hidden sm:block" />
          <SkeletonCard className="hidden lg:block" />
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <SkeletonCard />
          <SkeletonCard className="hidden sm:block" />
        </div>
      </div>
    </div>
  );
}

/** Kanban-shaped skeleton: four ledger columns with a couple of cards each.
 *  Used by the Jobs hub while the board chunk/data loads. */
export function BoardSkeleton() {
  return (
    <div className="flex gap-3 overflow-x-hidden" aria-busy="true" aria-label="Loading board">
      {[0, 1, 2, 3].map((col) => (
        <div
          key={col}
          className="min-w-[280px] flex-1 overflow-hidden rounded-[14px] border border-[#E6E1D4] bg-[#FAF8F2]"
        >
          <Skeleton className="h-[2px] w-full rounded-none" />
          <div className="flex items-center justify-between px-4 py-3">
            <SkeletonLine className="w-20" />
            <Skeleton className="h-5 w-7 rounded-full" />
          </div>
          <div className="space-y-2.5 px-3 pb-4">
            <SkeletonCard />
            {col < 2 && <SkeletonCard />}
          </div>
        </div>
      ))}
    </div>
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

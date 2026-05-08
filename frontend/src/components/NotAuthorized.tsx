import { Lock, ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';

interface NotAuthorizedProps {
  /** Page name shown in the eyebrow line. Defaults to "this area". */
  surface?: string;
  /** Optional one-liner explaining why access is denied. */
  detail?: string;
}

export default function NotAuthorized({ surface = 'this area', detail }: NotAuthorizedProps) {
  return (
    <div className="editorial-root flex min-h-[60vh] items-center justify-center px-6 py-12">
      <div className="max-w-lg text-center">
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-slate-900 text-white">
          <Lock className="h-6 w-6" aria-hidden />
        </div>
        <p className="mb-3 text-xs uppercase tracking-[0.2em] text-slate-500">
          — Restricted access
        </p>
        <h1 className="display text-3xl font-semibold text-slate-900 sm:text-4xl">
          You don't have access to {surface}.
        </h1>
        <p className="mx-auto mt-4 max-w-md text-base text-slate-600">
          {detail ??
            'Your role doesn’t include this surface. If you think this is wrong, ask a Company Admin to update your security group.'}
        </p>
        <Link
          to="/dashboard"
          className="mt-8 inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700 hover:shadow-md"
        >
          Back to dashboard
          <ArrowUpRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </div>
  );
}

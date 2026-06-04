import { Lock, ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { FRAUNCES } from '../pages/gantt/components/ledger';

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
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-[#1A1A1A] text-white shadow-[0_8px_28px_rgba(20,20,20,0.18)]">
          <Lock className="h-6 w-6" aria-hidden />
        </div>
        <p className="mb-3 text-xs uppercase tracking-[0.2em] text-[#6B6B6B]">
          — Restricted access
        </p>
        <h1
          className="text-3xl font-semibold text-[#1A1A1A] sm:text-4xl"
          style={{ fontFamily: FRAUNCES, letterSpacing: '-0.02em' }}
        >
          You don't have access to {surface}.
        </h1>
        <p className="mx-auto mt-4 max-w-md text-base text-[#3A3A3A]">
          {detail ??
            "Your role doesn't include this surface. If you think this is wrong, ask a Company Admin to update your security group."}
        </p>
        <Link
          to="/dashboard"
          className="mt-8 inline-flex items-center gap-2 rounded-full bg-[#2F8F5C] px-5 py-2.5 text-sm font-medium text-white shadow-[0_2px_8px_rgba(47,143,92,0.25)] transition hover:bg-[#246F47] hover:shadow-[0_4px_14px_rgba(47,143,92,0.30)]"
        >
          Back to dashboard
          <ArrowUpRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </div>
  );
}

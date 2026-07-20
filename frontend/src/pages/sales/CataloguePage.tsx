// pages/sales/CataloguePage.tsx — the standalone Catalogue area (/catalogue).
//
// The parts/labour master, promoted out of Sales into its own route (it's
// deep-linked from both quoting and Stock). A thin warm masthead wraps the
// existing CatalogueSection. Manager-gated (canManageSales).

import { Navigate } from 'react-router-dom';
import { BookOpen } from 'lucide-react';
import { useAppStore } from '../../store';
import { canManageSales } from '../../lib/permissions';
import { FRAUNCES } from '../gantt/components/ledger';
import CatalogueSection from './CatalogueSection';

export default function CataloguePage() {
  const { currentUser, currentProfile } = useAppStore();
  if (!canManageSales(currentProfile ?? currentUser)) return <Navigate to="/" replace />;

  return (
    <div className="flex min-h-full flex-col bg-[#F5F2E9]" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <div className="mx-auto w-full max-w-[1400px] px-4 py-5 sm:px-6">
        <div className="mb-5 overflow-hidden rounded-[14px] border border-[#E6E1D4] bg-white shadow-[0_1px_2px_rgba(20,20,20,0.04)]">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-4 px-5 py-5 sm:px-6">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-[14px] bg-linear-to-b from-[#242424] to-[#141414] text-white shadow-[0_2px_10px_rgba(20,20,20,0.16)] ring-1 ring-inset ring-white/10">
              <BookOpen className="h-7 w-7" strokeWidth={1.75} />
            </div>
            <div className="leading-tight">
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#6B6B6B]">Commerce</div>
              <h1 className="m-0 text-[28px] font-medium leading-none text-[#1A1A1A] sm:text-[30px]" style={{ fontFamily: FRAUNCES, letterSpacing: '-0.015em' }}>
                Catalogue.
              </h1>
            </div>
          </div>
        </div>

        <CatalogueSection onChanged={() => {}} />
      </div>
    </div>
  );
}

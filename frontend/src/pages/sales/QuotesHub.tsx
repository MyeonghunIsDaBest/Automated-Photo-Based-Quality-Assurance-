// pages/sales/QuotesHub.tsx — the standalone Quotes area (/quotes).
//
// SimPro-shaped: a warm masthead (mirroring the Jobs hub) + underline sub-view
// tabs (Open / Progress / Approved / Complete / Closed) that drive QuotesTab's
// derived filtering, plus a Settings sub-view. Service/Project stays a secondary
// segment inside QuotesTab. Manager-gated (canManageSales).

import { Navigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FileText } from 'lucide-react';
import { useAppStore } from '../../store';
import { canManageSales } from '../../lib/permissions';
import { FRAUNCES } from '../gantt/components/ledger';
import { quoteSubViewFromParam } from '../../lib/commercial/quoteSubViews';
import QuotesTab from './QuotesTab';
import SettingsTab from './SettingsTab';

const TABS: { key: string; label: string; view: string }[] = [
  { key: 'open',     label: 'Open',              view: '' },
  { key: 'progress', label: 'Progress',          view: 'progress' },
  { key: 'approved', label: 'Approved',          view: 'approved' },
  { key: 'complete', label: 'Complete',          view: 'complete' },
  { key: 'closed',   label: 'Closed / Archived', view: 'closed' },
  { key: 'settings', label: 'Settings',          view: 'settings' },
];

export default function QuotesHub() {
  const { currentUser, currentProfile } = useAppStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const rawView = searchParams.get('view');
  const customer = searchParams.get('customer');
  const quote = searchParams.get('quote');

  if (!canManageSales(currentProfile ?? currentUser)) return <Navigate to="/" replace />;

  const isSettings = rawView === 'settings';
  const subView = quoteSubViewFromParam(rawView);
  const activeKey = isSettings ? 'settings' : subView;

  const setView = (view: string) => {
    // Preserve the customer scope across sub-view switches (the ?quote= deep-link
    // is one-shot — carrying it would re-open the editor on every tab click).
    const next: Record<string, string> = {};
    if (view) next.view = view;
    if (customer) next.customer = customer;
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="flex min-h-full flex-col bg-[#F5F2E9]" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <div className="mx-auto w-full max-w-[1400px] px-4 py-5 sm:px-6">
        <div className="mb-5 overflow-hidden rounded-[14px] border border-[#E6E1D4] bg-white shadow-[0_1px_2px_rgba(20,20,20,0.04)]">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-4 px-5 py-5 sm:px-6">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-[14px] bg-linear-to-b from-[#242424] to-[#141414] text-white shadow-[0_2px_10px_rgba(20,20,20,0.16)] ring-1 ring-inset ring-white/10">
              <FileText className="h-7 w-7" strokeWidth={1.75} />
            </div>
            <div className="leading-tight">
              <div className="mb-1.5 flex items-center gap-2">
                <span className="relative flex h-2 w-2" aria-hidden>
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#2F8F5C] opacity-60 motion-reduce:hidden" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-[#2F8F5C]" />
                </span>
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#6B6B6B]">Commerce · Live</span>
              </div>
              <h1 className="m-0 text-[28px] font-medium leading-none text-[#1A1A1A] sm:text-[30px]" style={{ fontFamily: FRAUNCES, letterSpacing: '-0.015em' }}>
                Quotes.
              </h1>
            </div>
            <nav className="ml-auto flex flex-wrap items-center gap-x-5 gap-y-1 sm:gap-x-6" aria-label="Quote views">
              {TABS.map((t) => {
                const active = activeKey === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setView(t.view)}
                    aria-current={active ? 'page' : undefined}
                    className={`relative pb-2 pt-0.5 text-[15px] font-medium transition-colors ${active ? 'text-[#1A1A1A]' : 'text-[#6B6B6B] hover:text-[#1A1A1A]'}`}
                  >
                    {t.label}
                    {active && (
                      <motion.span
                        layoutId="quotes-hub-underline"
                        className="absolute inset-x-0 bottom-0 h-[2px] rounded-full bg-[#1A1A1A]"
                        transition={{ type: 'spring', damping: 30, stiffness: 360 }}
                      />
                    )}
                  </button>
                );
              })}
            </nav>
          </div>
        </div>

        {isSettings ? (
          <SettingsTab onChanged={() => {}} />
        ) : (
          <QuotesTab
            subView={subView}
            canSeeCost
            onChanged={() => {}}
            initialCustomerFilter={customer}
            initialQuoteId={quote}
          />
        )}
      </div>
    </div>
  );
}

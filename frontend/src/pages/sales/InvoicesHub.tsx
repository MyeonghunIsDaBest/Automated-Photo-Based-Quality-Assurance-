// pages/sales/InvoicesHub.tsx — the standalone Invoices area (/invoices).
//
// Warm masthead + underline sub-view tabs (Open / Overdue / Paid / Draft /
// Variations). The status views seed InvoicesTab's filter; Variations renders
// VariationsTab (a variation is a billable change-order → it lives with
// receivables). Sidebar create actions land here via ?new=. Manager-gated.

import { Navigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ReceiptText } from 'lucide-react';
import { useAppStore } from '../../store';
import { canManageSales } from '../../lib/permissions';
import { FRAUNCES } from '../gantt/components/ledger';
import InvoicesTab from './InvoicesTab';
import VariationsTab from './VariationsTab';

type FilterMode = 'all' | 'draft' | 'sent' | 'paid' | 'overdue' | 'voided';

const TABS: { key: string; label: string; view: string }[] = [
  { key: 'open',       label: 'Open',       view: '' },
  { key: 'overdue',    label: 'Overdue',    view: 'overdue' },
  { key: 'paid',       label: 'Paid',       view: 'paid' },
  { key: 'draft',      label: 'Draft',      view: 'draft' },
  { key: 'variations', label: 'Variations', view: 'variations' },
];

// URL ?view= → InvoicesTab filter mode ("open" = sent, awaiting payment).
const FILTER_FOR: Record<string, FilterMode> = {
  '': 'sent', open: 'sent', overdue: 'overdue', paid: 'paid', draft: 'draft',
};

export default function InvoicesHub() {
  const { currentUser, currentProfile } = useAppStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const rawView = searchParams.get('view') ?? '';
  const customer = searchParams.get('customer');
  const newParam = searchParams.get('new');
  const newJob = searchParams.get('newJob');

  if (!canManageSales(currentProfile ?? currentUser)) return <Navigate to="/" replace />;

  const isVariations = rawView === 'variations';
  const activeKey = isVariations ? 'variations' : (rawView || 'open');

  const setView = (view: string) => {
    // Preserve customer scope; drop the one-shot ?new=.
    const next: Record<string, string> = {};
    if (view) next.view = view;
    if (customer) next.customer = customer;
    setSearchParams(next, { replace: true });
  };

  const openNew = newParam === 'blank' || newParam === 'from-quote' || newParam === 'from-job' ? newParam : null;
  const clearNew = () => {
    const next: Record<string, string> = {};
    if (rawView) next.view = rawView;
    if (customer) next.customer = customer;
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="flex min-h-full flex-col bg-[#F5F2E9]" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <div className="mx-auto w-full max-w-[1400px] px-4 py-5 sm:px-6">
        <div className="mb-5 overflow-hidden rounded-[14px] border border-[#E6E1D4] bg-white shadow-[0_1px_2px_rgba(20,20,20,0.04)]">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-4 px-5 py-5 sm:px-6">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-[14px] bg-linear-to-b from-[#242424] to-[#141414] text-white shadow-[0_2px_10px_rgba(20,20,20,0.16)] ring-1 ring-inset ring-white/10">
              <ReceiptText className="h-7 w-7" strokeWidth={1.75} />
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
                Invoices.
              </h1>
            </div>
            <nav className="ml-auto flex flex-wrap items-center gap-x-5 gap-y-1 sm:gap-x-6" aria-label="Invoice views">
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
                        layoutId="invoices-hub-underline"
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

        {isVariations ? (
          <VariationsTab
            onChanged={() => {}}
            initialJobId={newJob}
            onJobSeedConsumed={() => setSearchParams({ view: 'variations' }, { replace: true })}
          />
        ) : (
          <InvoicesTab
            key={rawView}
            initialCustomerFilter={customer}
            initialFilterMode={FILTER_FOR[rawView] ?? 'sent'}
            openNew={openNew}
            onNewConsumed={clearNew}
            hideStatusChips
            onChanged={() => {}}
          />
        )}
      </div>
    </div>
  );
}

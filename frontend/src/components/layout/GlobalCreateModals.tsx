// components/layout/GlobalCreateModals.tsx — one mount for every "Create New".
//
// Mounted once in App.tsx (inside the Router, after the routes) so the create
// wizards open from the sidebar mega-menus and sit OUTSIDE the per-route
// transform wrapper — the bare-`fixed` NewQuoteWizard would otherwise anchor to
// that wrapper instead of the viewport. Reads the createModal store; renders
// the quote wizard, the job modal, or navigates for invoice intents.

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCreateModalStore } from '../../store/createModal';
import NewQuoteWizard from '../../pages/sales/NewQuoteWizard';
import { NewWorkModal } from '../../pages/jobs/NewWorkModal';
import { listCustomers, type Customer } from '../../lib/api/customers';

export function GlobalCreateModals() {
  const intent = useCreateModalStore((s) => s.intent);
  const close = useCreateModalStore((s) => s.close);
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<Customer[]>([]);

  const isQuote = !!intent && intent.startsWith('quote:');
  const isJob = !!intent && intent.startsWith('job:');

  // The quote wizard needs the customer list — load it lazily on first open.
  useEffect(() => {
    if (isQuote && customers.length === 0) {
      listCustomers().then(setCustomers).catch(() => { /* wizard shows empty picker */ });
    }
  }, [isQuote, customers.length]);

  // Invoice intents don't mount a modal — they open the Invoices area with its
  // existing picker (the ?new= seed InvoicesTab consumes).
  useEffect(() => {
    if (intent && intent.startsWith('invoice:')) {
      const which = intent.slice('invoice:'.length); // blank | from-quote | from-job
      navigate(`/invoices?new=${which}`);
      close();
    }
  }, [intent, navigate, close]);

  if (isQuote) {
    return (
      <NewQuoteWizard
        customers={customers}
        initialType={intent === 'quote:project' ? 'project' : 'service'}
        onCancel={close}
        onCreated={(id, openEditor) => {
          close();
          navigate(openEditor ? `/quotes?quote=${id}` : '/quotes');
        }}
      />
    );
  }

  if (isJob) {
    return (
      <NewWorkModal
        open
        onClose={close}
        onServiceJobCreated={() => { close(); navigate('/jobs'); }}
        onProjectCreated={() => { close(); navigate('/jobs?view=projects'); }}
        initialTab={intent === 'job:gantt-project' ? 'project' : undefined}
        initialKind={intent === 'job:project' ? 'project' : undefined}
        initialPrepaid={intent === 'job:prepaid'}
      />
    );
  }

  return null;
}

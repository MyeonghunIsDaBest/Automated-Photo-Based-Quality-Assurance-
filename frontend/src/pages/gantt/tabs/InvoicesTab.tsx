import { useMemo, useState } from 'react';
import { Calendar, ChevronRight, Plus, Receipt } from 'lucide-react';
import { differenceInDays, format, parseISO } from 'date-fns';
import type { Project } from '../../../types';
import {
  LedgerHeader, StatusPill, TONE, FRAUNCES, cardShell, btnPrimary, type ToneKey,
} from '../components/ledger';
import { useInvoices, useOrdersForProject } from '../store';
import type { Invoice, InvoiceStatus, Order } from '../types';
import InvoiceDrawer from './InvoiceDrawer';
import NewInvoiceModal from './NewInvoiceModal';

interface InvoicesTabProps {
  project: Project;
  canEdit: boolean;
  canDelete: boolean;
  hideHeader?: boolean;
}

const STATUS_TONE: Record<InvoiceStatus, ToneKey> = {
  pending: 'amber', paid: 'sage', overdue: 'red', disputed: 'orange',
};

const STATUS_FILTERS: { id: InvoiceStatus | 'all' | 'open'; label: string }[] = [
  { id: 'all',      label: 'All' },
  { id: 'open',     label: 'Open' },
  { id: 'pending',  label: 'Pending' },
  { id: 'overdue',  label: 'Overdue' },
  { id: 'paid',     label: 'Paid' },
  { id: 'disputed', label: 'Disputed' },
];

const fmtUSD = (n: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n);

// Mark an invoice "overdue" on read if its due date passed and it isn't paid.
function effectiveStatus(inv: Invoice): InvoiceStatus {
  if (inv.status === 'paid' || inv.status === 'disputed') return inv.status;
  const dueMs = Date.parse(inv.dueDate);
  if (Number.isFinite(dueMs) && dueMs < Date.now()) return 'overdue';
  return inv.status;
}

export function InvoicesTab({ project, canEdit, canDelete, hideHeader = false }: InvoicesTabProps) {
  const invoices = useInvoices(project.id);
  const orders   = useOrdersForProject(project.id);

  const [filter, setFilter] = useState<InvoiceStatus | 'all' | 'open'>('all');
  const [search, setSearch] = useState('');
  const [drawerInvoice, setDrawerInvoice] = useState<Invoice | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return invoices.filter((inv) => {
      const eff = effectiveStatus(inv);
      if (filter === 'all') {
        // no-op
      } else if (filter === 'open') {
        if (eff === 'paid') return false;
      } else if (eff !== filter) {
        return false;
      }
      if (q) {
        const order = orders.find((o) => o.id === inv.orderId);
        const hay = [inv.invoiceNumber, order?.poNumber ?? '', order?.supplierName ?? '', inv.notes ?? '']
          .join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [invoices, orders, filter, search]);

  const sorted = useMemo(() => {
    const score = (inv: Invoice) => {
      const eff = effectiveStatus(inv);
      if (eff === 'overdue')  return 0;
      if (eff === 'pending')  return 1;
      if (eff === 'disputed') return 2;
      return 3;
    };
    return [...filtered].sort((a, b) => {
      const sa = score(a) - score(b);
      if (sa !== 0) return sa;
      return parseISO(a.dueDate).getTime() - parseISO(b.dueDate).getTime();
    });
  }, [filtered]);

  const openInvoice = (inv: Invoice) => { setDrawerInvoice(inv); setDrawerOpen(true); };

  return (
    <>
      {!hideHeader && (
        <LedgerHeader
          kicker="INV"
          icon={Receipt}
          eyebrow={`Invoices · ${project.name}`}
          title="The financial close-out."
          meta="Every invoice traces back to an order — mark one paid and its warranties spawn automatically."
          actions={canEdit
            ? <button type="button" onClick={() => setNewOpen(true)} disabled={orders.length === 0} className={btnPrimary}><Plus className="h-3.5 w-3.5" /> New invoice</button>
            : <StatusPill tone="slate" className="px-3 py-1.5"><Receipt className="h-3.5 w-3.5" /> Read-only</StatusPill>}
        />
      )}
      {hideHeader && canEdit && (
        <div className="mb-4 flex justify-end">
          <button type="button" onClick={() => setNewOpen(true)} disabled={orders.length === 0} className={btnPrimary}>
            <Plus className="h-3.5 w-3.5" /> New invoice
          </button>
        </div>
      )}

      {/* Filters + search */}
      <div className={`mb-4 flex flex-col gap-3 p-2.5 sm:flex-row sm:items-center sm:justify-between ${cardShell}`}>
        <div className="-mx-1 overflow-x-auto px-1">
          <div className="inline-flex items-center gap-1">
            {STATUS_FILTERS.map((f) => {
              const isOn = filter === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilter(f.id)}
                  className={`flex-shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
                    isOn ? 'bg-[#1A1A1A] text-white' : 'text-[#6B6B6B] hover:bg-[#FAF8F2] hover:text-[#1A1A1A]'
                  }`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search INV #, PO #, supplier…"
          className="h-9 w-full rounded-full border border-[#E6E1D4] bg-white px-3.5 text-[13px] text-[#3A3A3A] placeholder:text-[#A0A0A0] focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]/30 sm:w-64"
        />
      </div>

      {/* Body */}
      {invoices.length === 0 ? (
        <EmptyInvoices
          title={`No invoices on ${project.name}.`}
          body={orders.length === 0
            ? 'Place an order first — invoices generate against orders, not standalone.'
            : 'Add an invoice when one arrives. Marking it paid creates warranties for covered line items.'}
          action={canEdit && orders.length > 0 ? <button type="button" onClick={() => setNewOpen(true)} className={btnPrimary}><Plus className="h-3.5 w-3.5" /> First invoice</button> : null}
        />
      ) : sorted.length === 0 ? (
        <EmptyInvoices title="No invoices match your filter." body="Loosen the filter or clear the search." />
      ) : (
        <>
          {/* Mobile cards */}
          <ul className={`divide-y divide-[#EFEBE0] overflow-hidden md:hidden ${cardShell}`}>
            {sorted.map((inv) => (
              <InvoiceRowMobile key={inv.id} invoice={inv} order={orders.find((o) => o.id === inv.orderId)} onOpen={() => openInvoice(inv)} />
            ))}
          </ul>

          {/* Desktop table */}
          <div className={`hidden overflow-hidden md:block ${cardShell}`}>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className="border-b border-[#E6E1D4] bg-[#FAF8F2] text-[11px] font-semibold uppercase tracking-[0.1em] text-[#6B6B6B]">
                    <th className="px-5 py-3">Invoice</th>
                    <th className="px-5 py-3">Order</th>
                    <th className="px-5 py-3">Supplier</th>
                    <th className="px-5 py-3">Due</th>
                    <th className="px-5 py-3 text-right">Amount</th>
                    <th className="px-5 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((inv) => (
                    <InvoiceRowDesktop key={inv.id} invoice={inv} order={orders.find((o) => o.id === inv.orderId)} onOpen={() => openInvoice(inv)} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <InvoiceDrawer
        invoice={drawerInvoice}
        isOpen={drawerOpen}
        onClose={() => { setDrawerOpen(false); setDrawerInvoice(null); }}
        projectId={project.id}
        readOnly={!canEdit}
        canDelete={canDelete}
      />
      <NewInvoiceModal isOpen={newOpen} onClose={() => setNewOpen(false)} projectId={project.id} orders={orders} />
    </>
  );
}

// ─── Rows ─────────────────────────────────────────────────────────────────

function InvoiceRowMobile({ invoice, order, onOpen }: { invoice: Invoice; order: Order | undefined; onOpen: () => void }) {
  const eff = effectiveStatus(invoice);
  const dueInfo = dueLabel(invoice);
  return (
    <li>
      <button type="button" onClick={onOpen} className="flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-[#FAF8F2]">
        <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full" style={{ background: TONE[STATUS_TONE[eff]].dot }} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[11px] text-[#6B6B6B]">{invoice.invoiceNumber}</span>
            <StatusPill tone={STATUS_TONE[eff]} className="capitalize">{eff}</StatusPill>
          </div>
          <p className="mt-1 truncate text-[14px] font-semibold text-[#1A1A1A]">{order?.supplierName || 'Unknown supplier'}</p>
          <div className="mt-1 flex items-center justify-between text-[11.5px] text-[#6B6B6B]">
            <span>{order ? `PO ${order.poNumber}` : '(order missing)'}</span>
            <span className="tabular-nums font-semibold text-[#1A1A1A]">{fmtUSD(invoice.amount)}</span>
          </div>
          {dueInfo && <p className="mt-0.5 text-[11.5px]" style={{ color: dueInfo.color }}><Calendar className="mr-1 inline h-3 w-3" />{dueInfo.label}</p>}
        </div>
        <ChevronRight className="mt-1 h-4 w-4 flex-shrink-0 text-[#C9C3B4]" />
      </button>
    </li>
  );
}

function InvoiceRowDesktop({ invoice, order, onOpen }: { invoice: Invoice; order: Order | undefined; onOpen: () => void }) {
  const eff = effectiveStatus(invoice);
  const dueInfo = dueLabel(invoice);
  return (
    <tr onClick={onOpen} className="cursor-pointer border-b border-[#EFEBE0] transition-colors last:border-b-0 hover:bg-[#FAF8F2]">
      <td className="px-5 py-3.5">
        <p className="font-mono text-[11px] text-[#6B6B6B]">{invoice.invoiceNumber}</p>
        <p className="mt-0.5 text-[11px] text-[#A0A0A0]">{format(parseISO(invoice.invoiceDate), 'MMM d, yyyy')}</p>
      </td>
      <td className="px-5 py-3.5">
        {order ? <span className="font-mono text-[11px] text-[#6B6B6B]">{order.poNumber}</span> : <span className="text-[11px] italic text-[#A0A0A0]">(missing)</span>}
      </td>
      <td className="px-5 py-3.5 text-[#3A3A3A]">{order?.supplierName ?? '—'}</td>
      <td className="px-5 py-3.5">
        {dueInfo ? <span style={{ color: dueInfo.color }}>{dueInfo.label}</span> : <span className="text-[#A0A0A0]">—</span>}
      </td>
      <td className="px-5 py-3.5 text-right font-medium tabular-nums text-[#1A1A1A]">{fmtUSD(invoice.amount)}</td>
      <td className="px-5 py-3.5"><StatusPill tone={STATUS_TONE[eff]} className="capitalize">{eff}</StatusPill></td>
    </tr>
  );
}

function EmptyInvoices({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className={`px-6 py-16 text-center ${cardShell}`}>
      <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-[#FAF8F2] text-[#2F8F5C]">
        <Receipt className="h-7 w-7" strokeWidth={1.5} />
      </div>
      <h3 className="text-[22px] font-medium text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>{title}</h3>
      <p className="mx-auto mt-2 max-w-sm text-[13px] text-[#6B6B6B]">{body}</p>
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

// ─── Due-date helper ────────────────────────────────────────────────────────

function dueLabel(inv: Invoice): { label: string; color: string } | null {
  if (inv.status === 'paid' && inv.paidDate) {
    return { label: `Paid ${format(parseISO(inv.paidDate), 'MMM d')}`, color: '#246F47' };
  }
  const days = differenceInDays(parseISO(inv.dueDate), new Date());
  if (days < 0)   return { label: `${Math.abs(days)}d overdue`, color: '#C44545' };
  if (days === 0) return { label: 'Due today',                  color: '#C8841E' };
  if (days <= 7)  return { label: `Due in ${days}d`,            color: '#C8841E' };
  return { label: `Due ${format(parseISO(inv.dueDate), 'MMM d')}`, color: '#6B6B6B' };
}

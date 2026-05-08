import { useMemo, useState } from 'react';
import {
  AlertCircle, Calendar, ChevronRight, DollarSign, FileText, Plus,
  Receipt,
} from 'lucide-react';
import { differenceInDays, format, isThisMonth, parseISO } from 'date-fns';
import type { Project } from '../../../types';
import { Card, CardContent } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { Input } from '../../../components/ui/input';
import { TabHeader } from '../components/TabHeader';
import { EmptyState } from '../components/EmptyState';
import {
  useInvoices, useOrdersForProject,
} from '../store';
import type { Invoice, InvoiceStatus, Order } from '../types';
import InvoiceDrawer from './InvoiceDrawer';
import NewInvoiceModal from './NewInvoiceModal';

interface InvoicesTabProps {
  project: Project;
  canEdit: boolean;
  canDelete: boolean;
  // Skip the editorial TabHeader when nested inside SupplierTab.
  hideHeader?: boolean;
}

const STATUS_BADGE: Record<InvoiceStatus, string> = {
  pending:   'border-blue-200 bg-blue-50 text-blue-700',
  paid:      'border-emerald-200 bg-emerald-50 text-emerald-700',
  overdue:   'border-red-200 bg-red-50 text-red-700',
  disputed:  'border-amber-200 bg-amber-50 text-amber-700',
};

const STATUS_DOT: Record<InvoiceStatus, string> = {
  pending:   'bg-blue-500',
  paid:      'bg-emerald-500',
  overdue:   'bg-red-500',
  disputed:  'bg-amber-500',
};

const STATUS_FILTERS: { id: InvoiceStatus | 'all' | 'open'; label: string }[] = [
  { id: 'all',       label: 'All' },
  { id: 'open',      label: 'Open' },
  { id: 'pending',   label: 'Pending' },
  { id: 'overdue',   label: 'Overdue' },
  { id: 'paid',      label: 'Paid' },
  { id: 'disputed',  label: 'Disputed' },
];

const fmtUSD = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

// Mark an invoice "overdue" if its due date has passed and it isn't paid.
// We don't auto-write this back to the store — keeps the data clean — we
// just compute it on read for UI purposes.
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

  // ── KPIs ───────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    let outstanding = 0;
    let overdueCount = 0;
    let paidThisMonth = 0;
    let total = 0;

    for (const inv of invoices) {
      total += inv.amount;
      const eff = effectiveStatus(inv);
      if (eff === 'paid') {
        if (inv.paidDate && isThisMonth(parseISO(inv.paidDate))) {
          paidThisMonth += inv.amount;
        }
      } else {
        outstanding += inv.amount;
        if (eff === 'overdue') overdueCount += 1;
      }
    }
    return { outstanding, overdueCount, paidThisMonth, total };
  }, [invoices]);

  // ── Filter + search ────────────────────────────────────────────────────
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
        const hay = [
          inv.invoiceNumber, order?.poNumber ?? '', order?.supplierName ?? '',
          inv.notes ?? '',
        ].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [invoices, orders, filter, search]);

  // Open / overdue first; sort by due date asc inside each bucket.
  const sorted = useMemo(() => {
    const score = (inv: Invoice) => {
      const eff = effectiveStatus(inv);
      if (eff === 'overdue')  return 0;
      if (eff === 'pending')  return 1;
      if (eff === 'disputed') return 2;
      return 3; // paid
    };
    return [...filtered].sort((a, b) => {
      const sa = score(a) - score(b);
      if (sa !== 0) return sa;
      return parseISO(a.dueDate).getTime() - parseISO(b.dueDate).getTime();
    });
  }, [filtered]);

  const openInvoice = (inv: Invoice) => {
    setDrawerInvoice(inv);
    setDrawerOpen(true);
  };

  return (
    <>
      {!hideHeader && (
        <TabHeader
          eyebrow={`Workspace · Invoices · ${project.name}`}
          title="The financial close-out."
          description="Every invoice traces back to an order. Mark one paid and any line items with warranties spawn rows in the Warranties tab automatically."
          action={
            canEdit ? (
              <Button onClick={() => setNewOpen(true)} disabled={orders.length === 0}>
                <Plus className="mr-2 h-4 w-4" />
                New Invoice
              </Button>
            ) : (
              <Badge variant="secondary" className="gap-1.5 px-3 py-1.5">
                <Receipt className="h-3.5 w-3.5" />
                Read-only
              </Badge>
            )
          }
        />
      )}
      {hideHeader && canEdit && (
        <div className="mb-4 flex justify-end">
          <Button onClick={() => setNewOpen(true)} disabled={orders.length === 0}>
            <Plus className="mr-2 h-4 w-4" />
            New Invoice
          </Button>
        </div>
      )}

      {/* KPIs */}
      <div className="mb-4 -mx-4 overflow-x-auto px-4 pb-1 sm:-mx-0 sm:px-0">
        <div className="flex min-w-max gap-3 sm:grid sm:min-w-0 sm:grid-cols-4">
          <Kpi
            icon={DollarSign}
            label="Outstanding"
            value={fmtUSD(kpis.outstanding)}
            tone={kpis.outstanding > 0 ? 'amber' : 'slate'}
          />
          <Kpi
            icon={AlertCircle}
            label="Overdue"
            value={String(kpis.overdueCount)}
            tone={kpis.overdueCount > 0 ? 'red' : 'slate'}
          />
          <Kpi
            icon={Receipt}
            label="Paid this month"
            value={fmtUSD(kpis.paidThisMonth)}
            tone="emerald"
          />
          <Kpi
            icon={FileText}
            label="Total invoiced"
            value={fmtUSD(kpis.total)}
            tone="slate"
          />
        </div>
      </div>

      {/* Filters + search */}
      <Card className="mb-4">
        <CardContent className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="-mx-1 overflow-x-auto px-1">
            <div className="inline-flex items-center gap-1.5">
              {STATUS_FILTERS.map((f) => {
                const isOn = filter === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFilter(f.id)}
                    className={`flex-shrink-0 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                      isOn
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>
          </div>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search invoice #, PO, supplier…"
            className="h-9 w-full sm:w-64"
          />
        </CardContent>
      </Card>

      {/* Body */}
      {invoices.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              icon={Receipt}
              title={`No invoices on ${project.name}.`}
              description={
                orders.length === 0
                  ? 'Place an order first — invoices generate against orders, not standalone.'
                  : 'Add an invoice when one arrives. Marking it paid creates warranties for line items that carry coverage.'
              }
              action={
                canEdit && orders.length > 0 ? (
                  <Button onClick={() => setNewOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    First invoice
                  </Button>
                ) : null
              }
            />
          </CardContent>
        </Card>
      ) : sorted.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              icon={Receipt}
              title="No invoices match your filter."
              description="Loosen the filter or clear the search."
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            {/* Mobile cards */}
            <ul className="divide-y divide-slate-100 md:hidden">
              {sorted.map((inv) => (
                <InvoiceRowMobile
                  key={inv.id}
                  invoice={inv}
                  order={orders.find((o) => o.id === inv.orderId)}
                  onOpen={() => openInvoice(inv)}
                />
              ))}
            </ul>

            {/* Desktop table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/60 text-left text-[11px] font-medium uppercase tracking-wider text-slate-500">
                    <th className="px-4 py-3">Invoice</th>
                    <th className="px-4 py-3">Order</th>
                    <th className="px-4 py-3">Supplier</th>
                    <th className="px-4 py-3">Due</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sorted.map((inv) => (
                    <InvoiceRowDesktop
                      key={inv.id}
                      invoice={inv}
                      order={orders.find((o) => o.id === inv.orderId)}
                      onOpen={() => openInvoice(inv)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <InvoiceDrawer
        invoice={drawerInvoice}
        isOpen={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setDrawerInvoice(null);
        }}
        projectId={project.id}
        readOnly={!canEdit}
        canDelete={canDelete}
      />

      <NewInvoiceModal
        isOpen={newOpen}
        onClose={() => setNewOpen(false)}
        projectId={project.id}
        orders={orders}
      />
    </>
  );
}

// ─── Row renderers ──────────────────────────────────────────────────────────

function InvoiceRowMobile({
  invoice, order, onOpen,
}: { invoice: Invoice; order: Order | undefined; onOpen: () => void }) {
  const eff = effectiveStatus(invoice);
  const dueInfo = dueLabel(invoice);

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 active:bg-slate-100"
      >
        <span className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${STATUS_DOT[eff]}`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[11px] text-slate-700">{invoice.invoiceNumber}</span>
            <Badge variant="outline" className={`text-[10px] uppercase tracking-wider ${STATUS_BADGE[eff]}`}>
              {eff}
            </Badge>
          </div>
          <p className="mt-1 truncate text-sm font-medium text-slate-900">
            {order?.supplierName || 'Unknown supplier'}
          </p>
          <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
            <span>
              {order ? `PO ${order.poNumber}` : '(order missing)'}
            </span>
            <span className="tabular-nums font-semibold text-slate-900">
              {fmtUSD(invoice.amount)}
            </span>
          </div>
          {dueInfo && (
            <p className={`mt-0.5 text-[11px] ${dueInfo.tone}`}>
              <Calendar className="mr-1 inline h-3 w-3" />
              {dueInfo.label}
            </p>
          )}
        </div>
        <ChevronRight className="mt-1 h-4 w-4 flex-shrink-0 text-slate-300" />
      </button>
    </li>
  );
}

function InvoiceRowDesktop({
  invoice, order, onOpen,
}: { invoice: Invoice; order: Order | undefined; onOpen: () => void }) {
  const eff = effectiveStatus(invoice);
  const dueInfo = dueLabel(invoice);

  return (
    <tr onClick={onOpen} className="cursor-pointer transition-colors hover:bg-slate-50">
      <td className="px-4 py-3">
        <p className="font-mono text-[11px] text-slate-700">{invoice.invoiceNumber}</p>
        <p className="mt-0.5 text-[11px] text-slate-500">
          {format(parseISO(invoice.invoiceDate), 'MMM d, yyyy')}
        </p>
      </td>
      <td className="px-4 py-3">
        {order ? (
          <span className="font-mono text-[11px] text-slate-600">{order.poNumber}</span>
        ) : (
          <span className="text-[11px] italic text-slate-400">(missing)</span>
        )}
      </td>
      <td className="px-4 py-3 text-slate-700">{order?.supplierName ?? '—'}</td>
      <td className="px-4 py-3">
        {dueInfo ? (
          <span className={dueInfo.tone}>{dueInfo.label}</span>
        ) : (
          <span className="text-slate-400">—</span>
        )}
      </td>
      <td className="px-4 py-3 text-right tabular-nums font-medium text-slate-900">
        {fmtUSD(invoice.amount)}
      </td>
      <td className="px-4 py-3">
        <Badge variant="outline" className={`text-[10px] uppercase tracking-wider ${STATUS_BADGE[eff]}`}>
          {eff}
        </Badge>
      </td>
    </tr>
  );
}

// ─── KPI cell ───────────────────────────────────────────────────────────────

function Kpi({
  icon: Icon, label, value, tone,
}: {
  icon: typeof Receipt;
  label: string;
  value: string;
  tone: 'emerald' | 'amber' | 'red' | 'slate';
}) {
  const before = {
    emerald: 'before:bg-emerald-500',
    amber:   'before:bg-amber-500',
    red:     'before:bg-red-500',
    slate:   'before:bg-slate-400',
  }[tone];

  return (
    <div
      className={`relative flex w-44 flex-shrink-0 flex-col gap-1.5 overflow-hidden rounded-xl border border-slate-200 bg-white p-3 before:absolute before:left-0 before:top-0 before:h-1 before:w-10 sm:w-auto sm:p-4 ${before}`}
    >
      <div className="flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 text-slate-500" />
        <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{label}</p>
      </div>
      <p
        className="text-2xl font-semibold tabular-nums leading-none text-slate-900 sm:text-3xl"
        style={{ fontFamily: "'Fraunces', Georgia, serif" }}
      >
        {value}
      </p>
    </div>
  );
}

// ─── Due-date helper ────────────────────────────────────────────────────────

function dueLabel(inv: Invoice): { label: string; tone: string } | null {
  if (inv.status === 'paid' && inv.paidDate) {
    return {
      label: `Paid ${format(parseISO(inv.paidDate), 'MMM d')}`,
      tone: 'text-emerald-600',
    };
  }
  const days = differenceInDays(parseISO(inv.dueDate), new Date());
  if (days < 0)   return { label: `${Math.abs(days)}d overdue`,                tone: 'text-red-600' };
  if (days === 0) return { label: 'Due today',                                  tone: 'text-amber-600' };
  if (days <= 7)  return { label: `Due in ${days}d`,                            tone: 'text-amber-600' };
  return { label: `Due ${format(parseISO(inv.dueDate), 'MMM d')}`, tone: 'text-slate-600' };
}
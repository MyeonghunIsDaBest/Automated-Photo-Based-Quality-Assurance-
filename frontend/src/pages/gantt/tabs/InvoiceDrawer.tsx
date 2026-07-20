import { useEffect, useMemo, useState } from 'react';
import {
  Activity as ActivityIcon, Calendar, CheckCircle2,
  Receipt, ShieldCheck, ShoppingCart, Trash2, X,
} from 'lucide-react';
import { addMonths, format, parseISO } from 'date-fns';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Badge } from '../../../components/ui/badge';
import {
  useGanttSideStore, useOrdersForProject, orderTotal,
} from '../store';
import { useProjectActivity, ACTIVITY_VERBS } from '../lib/useProjectActivity';
import MotionDrawer from '../../../components/ui/MotionDrawer';
import { cn } from '../../../lib/cn';
import { inputField } from '../components/ledger';
import type { Invoice, InvoiceStatus, Order, Warranty } from '../types';

interface InvoiceDrawerProps {
  invoice: Invoice | null;
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  readOnly?: boolean;
  canDelete?: boolean;
}

const STATUS_OPTS: { value: InvoiceStatus; label: string }[] = [
  { value: 'pending',  label: 'Pending' },
  { value: 'paid',     label: 'Paid' },
  { value: 'disputed', label: 'Disputed' },
];

// Warm-ledger tone map — matches the same-domain precedent in
// ReportsTab.tsx STATUS_BADGE (paid=sage, pending=amber, overdue=red);
// disputed takes the orange tone to stay distinct from both.
const STATUS_BADGE: Record<InvoiceStatus, string> = {
  pending:   'border-[#F0D5A0] bg-[#F9EFD9] text-[#C8841E]',
  paid:      'border-[#A8D0B8] bg-[#E5F2EA] text-[#246F47]',
  overdue:   'border-[#F0BFBF] bg-[#FBE5E5] text-[#C44545]',
  disputed:  'border-[#E5C8A8] bg-[#F4E9DB] text-[#A35C2B]',
};

const fmtUSD = (n: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 2 }).format(n);

const today = () => new Date().toISOString().slice(0, 10);

type SubTab = 'details' | 'order' | 'warranties' | 'activity';

export default function InvoiceDrawer({
  invoice, isOpen, onClose, projectId, readOnly = false, canDelete = true,
}: InvoiceDrawerProps) {
  const updateInvoice    = useGanttSideStore((s) => s.updateInvoice);
  const setInvoiceStatus = useGanttSideStore((s) => s.setInvoiceStatus);
  const removeInvoice    = useGanttSideStore((s) => s.removeInvoice);
  const addWarranty      = useGanttSideStore((s) => s.addWarranty);
  // Subscribe to the whole warranties slice and derive the project-scoped
  // array in useMemo. The previous selector `s.warranties[projectId] ?? []`
  // allocated a fresh empty array on every render when the slice was empty,
  // which Zustand sees as a new value → re-render → loop ("Maximum update
  // depth exceeded"). The whole-slice reference is stable.
  const allWarranties    = useGanttSideStore((s) => s.warranties);
  const warranties       = useMemo(
    () => allWarranties?.[projectId] ?? [],
    [allWarranties, projectId],
  );
  const orders           = useOrdersForProject(projectId);

  const [draft, setDraft] = useState<Partial<Invoice>>({});
  const [activeTab, setActiveTab] = useState<SubTab>('details');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    if (!isOpen || !invoice) return;
    setDraft({
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate,
      dueDate: invoice.dueDate,
      amount: invoice.amount,
      paidDate: invoice.paidDate,
      fileRef: invoice.fileRef,
      notes: invoice.notes,
      status: invoice.status,
    });
    setActiveTab('details');
    setConfirmDelete(false);
    setPaying(false);
  }, [isOpen, invoice?.id]);

  // E8 busy-guard: closing is a no-op while the mark-paid write is in flight
  // (exemplar: MaterialsTab price dialog).
  const requestClose = () => {
    if (paying) return;
    onClose();
  };

  if (!isOpen || !invoice) return null;

  const order = orders.find((o) => o.id === invoice.orderId);
  const isPaid = invoice.status === 'paid';

  const commitField = <K extends keyof Invoice>(key: K, value: Invoice[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    if (invoice[key] === value) return;
    updateInvoice(projectId, invoice.id, { [key]: value } as Partial<Invoice>);
  };

  // ── Mark as paid — also generates warranties ──────────────────────────
  // For each line item on the parent order with `warrantyMonths > 0`, we
  // produce a Warranty row anchored at the paid date. If a warranty already
  // exists for that lineItemId we skip (idempotent re-pay).
  const handleMarkPaid = (paidDate: string) => {
    setPaying(true);
    try {
      setInvoiceStatus(projectId, invoice.id, 'paid', paidDate);

      if (order) {
        const existingByLine = new Set(
          warranties
            .filter((w) => w.invoiceId === invoice.id)
            .map((w) => w.lineItemId)
            .filter(Boolean) as string[],
        );

        for (const li of order.lineItems) {
          const months = li.warrantyMonths ?? 0;
          if (months <= 0) continue;
          if (existingByLine.has(li.id)) continue;
          addWarranty(projectId, {
            description: li.description,
            supplierName: order.supplierName,
            startDate: paidDate,
            expiryDate: addMonths(parseISO(paidDate), months).toISOString().slice(0, 10),
            invoiceId: invoice.id,
            orderId: order.id,
            lineItemId: li.id,
          });
        }
      }
    } finally {
      setPaying(false);
    }
  };

  return (
    <MotionDrawer
      open={isOpen}
      onClose={requestClose}
      sizeClass="sm:w-[520px] lg:w-[600px]"
      ariaLabel="Invoice"
    >
        {/* Mobile drag handle */}
        <div className="flex justify-center pt-2 sm:hidden">
          <span className="h-1 w-10 rounded-full bg-[#D8D2C4]" />
        </div>

        {/* Header */}
        <header className="flex items-start justify-between gap-3 border-b border-[#EFEBE0] px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-[#6B6B6B]">
              Invoice
            </p>
            <input
              value={draft.invoiceNumber ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, invoiceNumber: e.target.value }))}
              onBlur={() => commitField('invoiceNumber', (draft.invoiceNumber ?? '').trim() || invoice.invoiceNumber)}
              disabled={readOnly}
              placeholder="Invoice #"
              className="mt-1 w-full border-0 bg-transparent font-mono text-base font-semibold text-[#1A1A1A] placeholder:text-[#C0BAB0] focus:outline-none"
            />
            <p className="mt-1 text-sm text-[#3A3A3A]">
              {order?.supplierName || 'Unknown supplier'}
              {order && <span className="text-[#A0A0A0]"> · {order.poNumber}</span>}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <button
              type="button"
              onClick={requestClose}
              className="grid min-h-11 min-w-11 place-items-center rounded-md text-[#A0A0A0] hover:bg-[#F0EDE4] hover:text-[#3A3A3A]"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
            <Badge
              variant="outline"
              className={`text-[10px] uppercase tracking-wider ${STATUS_BADGE[invoice.status]}`}
            >
              {invoice.status}
            </Badge>
          </div>
        </header>

        {/* Sub-tab strip */}
        <nav className="flex-shrink-0 border-b border-[#EFEBE0] px-2 py-2">
          <div className="-mx-2 overflow-x-auto px-2">
            <div className="inline-flex items-center gap-1">
              {(['details', 'order', 'warranties', 'activity'] as SubTab[]).map((id) => {
                const isActive = activeTab === id;
                const Icon = id === 'details'    ? Receipt :
                             id === 'order'      ? ShoppingCart :
                             id === 'warranties' ? ShieldCheck :
                                                   ActivityIcon;
                const label = id === 'details'    ? 'Details' :
                              id === 'order'      ? 'Order' :
                              id === 'warranties' ? 'Warranties' :
                                                    'Activity';
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setActiveTab(id)}
                    className={`flex flex-shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                      isActive ? 'bg-[#1A1A1A] text-white' : 'text-[#3A3A3A] hover:bg-[#F0EDE4]'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </nav>

        {/* Body */}
        <div className="editorial-scrollbox flex-1 p-5">
          {activeTab === 'details' && (
            <DetailsPane
              draft={draft}
              setDraft={setDraft}
              commitField={commitField}
              invoice={invoice}
              order={order}
              onMarkPaid={handleMarkPaid}
              paying={paying}
              isPaid={isPaid}
              readOnly={readOnly}
            />
          )}
          {activeTab === 'order' && order && (
            <OrderPane order={order} />
          )}
          {activeTab === 'order' && !order && (
            <p className="rounded-lg border border-dashed border-[#E6E1D4] bg-[#FAF8F2]/60 px-4 py-6 text-center text-sm text-[#A0A0A0]">
              Original order is no longer available.
            </p>
          )}
          {activeTab === 'warranties' && (
            <WarrantiesPane
              invoiceId={invoice.id}
              warranties={warranties}
              order={order}
            />
          )}
          {activeTab === 'activity' && (
            <ActivityPane invoice={invoice} projectId={projectId} />
          )}
        </div>

        {/* Footer */}
        <footer className="flex flex-shrink-0 items-center justify-between gap-3 border-t border-[#EFEBE0] px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#A0A0A0]">Status</span>
            <select
              value={invoice.status === 'overdue' ? 'pending' : invoice.status}
              onChange={(e) => {
                const next = e.target.value as InvoiceStatus;
                if (next === 'paid' && !isPaid) handleMarkPaid(today());
                else if (next !== 'paid') setInvoiceStatus(projectId, invoice.id, next);
              }}
              disabled={readOnly || paying}
              className={cn(inputField, 'w-auto rounded-md px-2 py-1 text-xs')}
            >
              {STATUS_OPTS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          {!readOnly && canDelete && (
            confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#C44545]">Delete?</span>
                <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Button>
                <button
                  type="button"
                  onClick={() => { removeInvoice(projectId, invoice.id); onClose(); }}
                  className="inline-flex items-center gap-1.5 rounded-md bg-[#C44545] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#A93A3A]"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Confirm
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-[#6B6B6B] hover:bg-[#FBE5E5] hover:text-[#C44545]"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </button>
            )
          )}
        </footer>
    </MotionDrawer>
  );
}

// ─── Sub-tab panes ─────────────────────────────────────────────────────────

function DetailsPane({
  draft, setDraft, commitField, invoice, order, onMarkPaid, paying, isPaid, readOnly,
}: {
  draft: Partial<Invoice>;
  setDraft: (fn: (d: Partial<Invoice>) => Partial<Invoice>) => void;
  commitField: <K extends keyof Invoice>(k: K, v: Invoice[K]) => void;
  invoice: Invoice;
  order: Order | undefined;
  onMarkPaid: (paidDate: string) => void;
  paying: boolean;
  isPaid: boolean;
  readOnly: boolean;
}) {
  const [paidDateDraft, setPaidDateDraft] = useState(invoice.paidDate ?? today());

  // Auto-warranty preview — how many warranties will spawn on Mark Paid.
  const warrantiesToCreate = useMemo(() => {
    if (!order) return 0;
    return order.lineItems.filter((li) => (li.warrantyMonths ?? 0) > 0).length;
  }, [order]);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Invoice date">
          <Input
            type="date"
            value={draft.invoiceDate ?? ''}
            onChange={(e) => setDraft((d) => ({ ...d, invoiceDate: e.target.value }))}
            onBlur={(e) => commitField('invoiceDate', e.target.value)}
            disabled={readOnly}
          />
        </Field>
        <Field label="Due">
          <Input
            type="date"
            value={draft.dueDate ?? ''}
            onChange={(e) => setDraft((d) => ({ ...d, dueDate: e.target.value }))}
            onBlur={(e) => commitField('dueDate', e.target.value)}
            disabled={readOnly}
          />
        </Field>
      </div>

      <Field label="Amount (AUD)">
        <Input
          type="number"
          inputMode="decimal"
          step={0.01}
          min={0}
          value={draft.amount ?? 0}
          onChange={(e) => setDraft((d) => ({ ...d, amount: Number(e.target.value) || 0 }))}
          onBlur={(e) => commitField('amount', Number(e.target.value) || 0)}
          disabled={readOnly}
          className="tabular-nums"
        />
      </Field>

      <Field label="Document reference (optional)">
        <Input
          value={draft.fileRef ?? ''}
          onChange={(e) => setDraft((d) => ({ ...d, fileRef: e.target.value }))}
          onBlur={(e) => commitField('fileRef', e.target.value)}
          disabled={readOnly}
          placeholder="Drive link or filename for the PDF"
        />
      </Field>

      <Field label="Notes">
        <textarea
          value={draft.notes ?? ''}
          onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
          onBlur={(e) => commitField('notes', e.target.value)}
          disabled={readOnly}
          rows={2}
          placeholder="Anything to flag…"
          className={inputField}
        />
      </Field>

      {/* Mark-as-paid CTA */}
      {!isPaid && !readOnly && (
        <div className="rounded-xl border-2 border-[#C8E0D2] bg-[#E1F3EA] p-4">
          <div className="mb-3 flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#2F8F5C]" />
            <div>
              <p className="text-sm font-semibold text-[#246F47]">Mark as paid</p>
              <p className="mt-0.5 text-xs text-[#246F47]/80">
                Records the payment date and{' '}
                {warrantiesToCreate > 0 ? (
                  <>spawns <strong>{warrantiesToCreate}</strong> warrant{warrantiesToCreate === 1 ? 'y' : 'ies'} from line items with coverage.</>
                ) : (
                  <>(no line items on this order carry warranty months).</>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={paidDateDraft}
              onChange={(e) => setPaidDateDraft(e.target.value)}
              className="h-9 flex-1"
            />
            <Button
              onClick={() => onMarkPaid(paidDateDraft || today())}
              disabled={paying}
            >
              {paying ? 'Marking…' : 'Mark paid'}
            </Button>
          </div>
        </div>
      )}

      {isPaid && invoice.paidDate && (
        <div className="rounded-md bg-[#E1F3EA] px-3 py-2 text-sm text-[#246F47]">
          <CheckCircle2 className="mr-1.5 inline h-3.5 w-3.5" />
          Paid on <strong>{format(parseISO(invoice.paidDate), 'MMMM d, yyyy')}</strong>
        </div>
      )}
    </div>
  );
}

function OrderPane({ order }: { order: Order }) {
  const total = orderTotal(order);

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-[#E6E1D4] bg-white p-3">
        <div className="flex items-baseline justify-between">
          <span className="font-mono text-[11px] text-[#3A3A3A]">{order.poNumber}</span>
          <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
            {order.status}
          </Badge>
        </div>
        <p className="mt-1 font-medium text-[#1A1A1A]">{order.supplierName}</p>
        <p className="mt-1 text-[11px] text-[#6B6B6B]">
          Ordered {format(parseISO(order.orderedDate), 'MMM d, yyyy')}
          {order.expectedDelivery && (
            <> · ETA {format(parseISO(order.expectedDelivery), 'MMM d')}</>
          )}
        </p>
      </div>

      <div>
        <h4 className="mb-2 text-[11px] font-medium uppercase tracking-[0.2em] text-[#6B6B6B]">
          Line items ({order.lineItems.length})
        </h4>
        <ul className="divide-y divide-[#EFEBE0] rounded-lg border border-[#E6E1D4]">
          {order.lineItems.map((li) => (
            <li key={li.id} className="flex items-start gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[#1A1A1A]">{li.description}</p>
                <p className="text-[11px] text-[#6B6B6B]">
                  {li.qty} {li.unit}
                  {(li.warrantyMonths ?? 0) > 0 && (
                    <> · <span className="text-[#246F47]">{li.warrantyMonths}mo warranty</span></>
                  )}
                </p>
              </div>
              <span className="flex-shrink-0 tabular-nums text-sm text-[#3A3A3A]">
                {fmtUSD(li.qty * li.unitCost)}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex items-baseline justify-between rounded-lg bg-[#FAF8F2] px-3 py-2">
          <span className="text-xs text-[#6B6B6B]">Order total</span>
          <span
            className="tabular-nums text-base font-semibold text-[#1A1A1A]"
            style={{ fontFamily: "'Fraunces', Georgia, serif" }}
          >
            {fmtUSD(total)}
          </span>
        </div>
      </div>
    </div>
  );
}

function WarrantiesPane({
  invoiceId, warranties, order,
}: {
  invoiceId: string;
  warranties: Warranty[];
  order: Order | undefined;
}) {
  const linked = warranties.filter((w) => w.invoiceId === invoiceId);

  if (linked.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[#E6E1D4] bg-[#FAF8F2]/60 px-4 py-6 text-center">
        <ShieldCheck className="mx-auto mb-2 h-5 w-5 text-[#A0A0A0]" />
        <p className="text-sm font-medium text-[#3A3A3A]">No warranties spawned yet</p>
        <p className="mt-1 text-xs text-[#6B6B6B]">
          Marking this invoice paid creates warranty rows for any line items
          on the parent order with coverage months.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {linked.map((w) => {
        const li = order?.lineItems.find((l) => l.id === w.lineItemId);
        return (
          <li key={w.id} className="rounded-lg border border-[#E6E1D4] p-3">
            <div className="flex items-baseline justify-between gap-2">
              <p className="font-medium text-[#1A1A1A]">{w.description}</p>
              <span className="text-[11px] tabular-nums text-[#6B6B6B]">
                {format(parseISO(w.startDate), 'MMM yyyy')} → {format(parseISO(w.expiryDate), 'MMM yyyy')}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-[#6B6B6B]">
              {w.supplierName}
              {li && <> · {li.qty} {li.unit}</>}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

function ActivityPane({ invoice, projectId }: { invoice: Invoice; projectId: string }) {
  const events = useProjectActivity(projectId, { limit: 30 });
  const invoiceEvents = useMemo(
    () => events.filter((e) => e.targetEntityId === invoice.id),
    [events, invoice.id],
  );

  if (invoiceEvents.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-[#E6E1D4] bg-[#FAF8F2]/60 px-4 py-6 text-center text-sm text-[#A0A0A0]">
        No activity recorded yet. Mark paid → it logs here.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {invoiceEvents.map((e) => (
        <li key={e.id} className="flex items-start gap-3">
          <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-[#F0EDE4]">
            <Calendar className="h-3.5 w-3.5 text-[#6B6B6B]" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-[#3A3A3A]">
              <span className="font-medium">{e.actorName}</span>{' '}
              <span className="text-[#6B6B6B]">{ACTIVITY_VERBS[e.kind]}</span>{' '}
              {e.targetLabel}
            </p>
            <p className="text-[10px] text-[#A0A0A0]">
              {format(parseISO(e.timestamp), 'MMM d, h:mm a')}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-[#6B6B6B]">{label}</span>
      {children}
    </label>
  );
}
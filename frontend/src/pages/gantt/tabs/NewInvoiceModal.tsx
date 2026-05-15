import { useEffect, useMemo, useState } from 'react';
import { Receipt, X } from 'lucide-react';
import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Badge } from '../../../components/ui/badge';
import { useGanttSideStore, orderTotal } from '../store';
import type { Order } from '../types';

// Net-terms presets — the four most common contractor terms. Tapping a chip
// sets the due date to (invoice date + N days).
const NET_TERMS: { days: number; label: string }[] = [
  { days: 7,  label: 'Net 7' },
  { days: 14, label: 'Net 14' },
  { days: 30, label: 'Net 30' },
  { days: 45, label: 'Net 45' },
  { days: 60, label: 'Net 60' },
];

// Common notes for trade billing — appended to the textarea on tap.
const NOTE_QUICK_FLAGS: string[] = [
  'Progress claim · stage 1',
  'Material delivery (electrical)',
  'Excavation works — variation',
  'Conduit rough-in — labour only',
  'Switchgear partial billing',
  'Retention release',
];

interface NewInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  orders: Order[];
}

const today = () => new Date().toISOString().slice(0, 10);
const inDays = (n: number) =>
  new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

const fmtUSD = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n);

export default function NewInvoiceModal({
  isOpen, onClose, projectId, orders,
}: NewInvoiceModalProps) {
  const addInvoice = useGanttSideStore((s) => s.addInvoice);

  const [orderId, setOrderId] = useState<string>('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(today());
  const [dueDate, setDueDate] = useState(inDays(30));
  const [amount, setAmount] = useState('0');
  const [fileRef, setFileRef] = useState('');
  const [notes, setNotes] = useState('');

  const order = useMemo(() => orders.find((o) => o.id === orderId), [orders, orderId]);

  useEffect(() => {
    if (!isOpen) return;
    setOrderId(orders[0]?.id ?? '');
    // Year-prefixed invoice number matches typical contractor numbering
    // (INV-2026-0145 etc.) rather than a bare random 5-digit string.
    const year = new Date().getFullYear();
    setInvoiceNumber(`INV-${year}-${String(Math.floor(Math.random() * 9000 + 1000))}`);
    setInvoiceDate(today());
    setDueDate(inDays(30));
    setAmount('0');
    setFileRef('');
    setNotes('');
  }, [isOpen, orders]);

  // Helper for the "due in N days" caption + the active state on the net-terms
  // chips. Recomputes whenever either date changes.
  const daysToDue = useMemo(() => {
    try {
      return differenceInCalendarDays(parseISO(dueDate), parseISO(invoiceDate));
    } catch {
      return null;
    }
  }, [dueDate, invoiceDate]);

  const appendNote = (snippet: string) => {
    setNotes((cur) => (cur.trim() ? `${cur.trim()}\n${snippet}` : snippet));
  };

  // Pre-fill amount with the order total once an order is picked.
  useEffect(() => {
    if (!order) return;
    setAmount(String(orderTotal(order).toFixed(2)));
  }, [order?.id]);

  if (!isOpen) return null;

  const canSubmit = !!orderId && invoiceNumber.trim().length > 0 && Number(amount) > 0;

  const handleSubmit = () => {
    if (!canSubmit) return;
    addInvoice(projectId, {
      orderId,
      invoiceNumber: invoiceNumber.trim(),
      invoiceDate,
      dueDate,
      amount: Number(amount) || 0,
      status: 'pending',
      fileRef: fileRef.trim() || undefined,
      notes: notes.trim() || undefined,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-2 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl sm:max-h-none"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-slate-500">
              New invoice
            </p>
            <h3
              className="mt-1 text-lg font-semibold text-slate-900"
              style={{ fontFamily: "'Fraunces', Georgia, serif" }}
            >
              Add an invoice
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="editorial-scrollbox flex-1 px-5 py-4">
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Against order
              </label>
              <select
                value={orderId}
                onChange={(e) => setOrderId(e.target.value)}
                className="block w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                {orders.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.poNumber} — {o.supplierName || 'Unknown'} — {fmtUSD(orderTotal(o))}
                  </option>
                ))}
              </select>
              {order && (
                <p className="mt-1 text-[11px] text-slate-500">
                  {order.lineItems.length} line item{order.lineItems.length === 1 ? '' : 's'}
                  {' · '}
                  ordered {format(parseISO(order.orderedDate), 'MMM d, yyyy')}
                </p>
              )}
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Invoice #</label>
              <Input
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="INV-2026-0145"
                className="font-mono"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Invoice date</label>
                <Input
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Due date</label>
                <Input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
                {daysToDue !== null && (
                  <p className="mt-1 text-[11px] tabular-nums text-slate-500">
                    {daysToDue < 0
                      ? `Already ${Math.abs(daysToDue)}d overdue`
                      : daysToDue === 0
                        ? 'Due same day'
                        : `Due in ${daysToDue}d`}
                  </p>
                )}
              </div>
            </div>

            {/* Net-terms quick-picks */}
            <div className="flex flex-wrap gap-1.5">
              <span className="self-center text-[10px] font-medium uppercase tracking-wider text-slate-400">
                Terms
              </span>
              {NET_TERMS.map((t) => {
                const active = daysToDue === t.days;
                return (
                  <button
                    key={t.days}
                    type="button"
                    onClick={() => setDueDate(
                      new Date(parseISO(invoiceDate).getTime() + t.days * 86_400_000)
                        .toISOString().slice(0, 10),
                    )}
                    className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                      active
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Amount (USD)</label>
              <Input
                type="number"
                inputMode="decimal"
                step={0.01}
                min={0}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="tabular-nums"
              />
              {order && (
                <p className="mt-1 text-[11px] text-slate-500">
                  Order total {fmtUSD(orderTotal(order))} · pre-filled
                </p>
              )}
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Document reference (optional)
              </label>
              <Input
                value={fileRef}
                onChange={(e) => setFileRef(e.target.value)}
                placeholder="orders/2026/SP-L14-switchgear.pdf"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Notes (optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="e.g. Progress claim for L14 MEP rough-in; held back 5% retention."
                className="block w-full rounded-md border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
              <div className="mt-1.5 flex flex-wrap gap-1">
                {NOTE_QUICK_FLAGS.map((flag) => (
                  <button
                    key={flag}
                    type="button"
                    onClick={() => appendNote(flag)}
                    className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px] text-slate-600 transition-colors hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
                  >
                    + {flag}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <footer className="flex flex-shrink-0 items-center justify-between gap-3 border-t border-slate-100 px-5 py-3">
          <Badge variant="outline" className="border-blue-200 bg-blue-50 text-[10px] uppercase tracking-wider text-blue-700">
            Pending
          </Badge>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={!canSubmit}>
              <Receipt className="mr-1.5 h-4 w-4" />
              Add invoice
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}
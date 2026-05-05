import { useEffect, useMemo, useState } from 'react';
import { Plus, Receipt, X } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Badge } from '../../../components/ui/badge';
import { useGanttSideStore, orderTotal } from '../store';
import type { Order } from '../types';

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
    setInvoiceNumber(`INV-${Math.floor(Math.random() * 90000 + 10000)}`);
    setInvoiceDate(today());
    setDueDate(inDays(30));
    setAmount('0');
    setFileRef('');
    setNotes('');
  }, [isOpen, orders]);

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
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl sm:max-h-none"
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

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
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
                placeholder="INV-12345"
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
              </div>
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
                placeholder="Drive link / filename for the PDF"
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
                placeholder="Anything to flag…"
                className="block w-full rounded-md border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
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
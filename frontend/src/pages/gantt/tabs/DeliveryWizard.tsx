import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, ArrowLeft, ArrowRight, Box, Check,
  Package, Truck, X,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Badge } from '../../../components/ui/badge';
import { useGanttSideStore } from '../store';
import { useAppStore } from '../../../store';
import type { Order, OrderLineItem } from '../types';

interface DeliveryWizardProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  orders: Order[];                  // candidates the user can receive against
  presetOrderId: string | null;     // pre-selected order, e.g. from "Receive →" tap
}

type Step = 'pick_order' | 'check_items' | 'meta';

const today = () => new Date().toISOString().slice(0, 10);

export default function DeliveryWizard({
  isOpen, onClose, projectId, orders, presetOrderId,
}: DeliveryWizardProps) {
  const addDelivery = useGanttSideStore((s) => s.addDelivery);
  const currentUser = useAppStore((s) => s.currentUser);

  const [step, setStep] = useState<Step>(presetOrderId ? 'check_items' : 'pick_order');
  const [orderId, setOrderId] = useState<string | null>(presetOrderId);

  // Per-line received quantities, keyed by lineItemId.
  const [received, setReceived] = useState<Record<string, number>>({});

  // Meta step
  const [receivedDate, setReceivedDate] = useState(today());
  const [receivedBy, setReceivedBy] = useState(
    currentUser?.fullName ?? '',
  );
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Reset state every time the wizard opens.
  useEffect(() => {
    if (!isOpen) return;
    setOrderId(presetOrderId);
    setStep(presetOrderId ? 'check_items' : 'pick_order');
    setReceived({});
    setReceivedDate(today());
    setReceivedBy(currentUser?.fullName ?? '');
    setNotes('');
    setSubmitting(false);
  }, [isOpen, presetOrderId, currentUser?.fullName]);

  const order = useMemo(
    () => orders.find((o) => o.id === orderId) ?? null,
    [orders, orderId],
  );

  // Default the per-line "qty receiving" to the still-outstanding amount on
  // each line whenever a fresh order is selected.
  useEffect(() => {
    if (!order) return;
    const initial: Record<string, number> = {};
    for (const li of order.lineItems) {
      initial[li.id] = Math.max(0, li.qty - li.qtyReceived);
    }
    setReceived(initial);
  }, [order?.id]);

  if (!isOpen) return null;

  const totalReceiving = Object.values(received).reduce((s, n) => s + (Number(n) || 0), 0);
  const anyReceiving = totalReceiving > 0;

  const stepIndex = step === 'pick_order' ? 0 : step === 'check_items' ? 1 : 2;
  const totalSteps = presetOrderId ? 2 : 3;
  const visibleStepNum = presetOrderId ? stepIndex : stepIndex + 1;

  const handleBack = () => {
    if (step === 'meta') setStep('check_items');
    else if (step === 'check_items' && !presetOrderId) setStep('pick_order');
  };

  const handleNext = () => {
    if (step === 'pick_order' && order) setStep('check_items');
    else if (step === 'check_items' && anyReceiving) setStep('meta');
  };

  const handleSubmit = () => {
    if (!order || !anyReceiving) return;
    setSubmitting(true);
    try {
      addDelivery(projectId, {
        orderId: order.id,
        receivedDate,
        receivedBy: receivedBy.trim() || (currentUser?.fullName ?? 'Unknown'),
        items: Object.entries(received)
          .filter(([, qty]) => qty > 0)
          .map(([lineItemId, qtyReceived]) => ({ lineItemId, qtyReceived })),
        photoIds: [],
        notes: notes.trim() || undefined,
      });
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <aside
        className="fixed inset-x-0 bottom-0 z-50 flex max-h-[92vh] flex-col rounded-t-2xl bg-white shadow-2xl sm:inset-y-0 sm:right-0 sm:left-auto sm:max-h-none sm:w-[520px] sm:rounded-l-2xl sm:rounded-tr-none lg:w-[600px]"
        role="dialog"
        aria-modal="true"
      >
        {/* Mobile drag handle */}
        <div className="flex justify-center pt-2 sm:hidden">
          <span className="h-1 w-10 rounded-full bg-slate-300" />
        </div>

        {/* Header */}
        <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-slate-500">
              Step {visibleStepNum} of {totalSteps}
            </p>
            <h2
              className="mt-1 text-lg font-semibold text-slate-900"
              style={{ fontFamily: "'Fraunces', Georgia, serif" }}
            >
              {step === 'pick_order'  && 'Which order arrived?'}
              {step === 'check_items' && 'What came in the truck?'}
              {step === 'meta'        && 'A few details'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {/* Step indicator */}
        <div className="flex flex-shrink-0 gap-1.5 border-b border-slate-100 px-5 py-3">
          {Array.from({ length: totalSteps }).map((_, i) => {
            const ahead = i + 1 < visibleStepNum;
            const cur   = i + 1 === visibleStepNum;
            return (
              <span
                key={i}
                className={`h-1 flex-1 rounded-full transition-colors ${
                  cur ? 'bg-emerald-500' : ahead ? 'bg-emerald-300' : 'bg-slate-200'
                }`}
              />
            );
          })}
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {step === 'pick_order' && (
            <PickOrderStep
              orders={orders}
              selectedId={orderId}
              onSelect={setOrderId}
            />
          )}
          {step === 'check_items' && order && (
            <CheckItemsStep
              order={order}
              received={received}
              onChange={(lineId, qty) =>
                setReceived((r) => ({ ...r, [lineId]: qty }))
              }
            />
          )}
          {step === 'meta' && (
            <MetaStep
              receivedDate={receivedDate}
              setReceivedDate={setReceivedDate}
              receivedBy={receivedBy}
              setReceivedBy={setReceivedBy}
              notes={notes}
              setNotes={setNotes}
            />
          )}
        </div>

        {/* Footer */}
        <footer className="flex flex-shrink-0 items-center justify-between gap-3 border-t border-slate-100 px-5 py-3">
          {step === 'pick_order' || (step === 'check_items' && presetOrderId) ? (
            <Button variant="outline" onClick={onClose}>Cancel</Button>
          ) : (
            <Button variant="outline" onClick={handleBack}>
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Back
            </Button>
          )}

          {step === 'pick_order' && (
            <Button onClick={handleNext} disabled={!order}>
              Next
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          )}
          {step === 'check_items' && (
            <Button onClick={handleNext} disabled={!anyReceiving}>
              Next
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          )}
          {step === 'meta' && (
            <Button
              onClick={handleSubmit}
              disabled={submitting || !receivedBy.trim() || !anyReceiving}
            >
              {submitting ? 'Logging…' : (
                <>
                  <Check className="mr-1.5 h-4 w-4" />
                  Confirm delivery
                </>
              )}
            </Button>
          )}
        </footer>
      </aside>
    </>
  );
}

// ─── Step 1: Pick the order ─────────────────────────────────────────────────

function PickOrderStep({
  orders, selectedId, onSelect,
}: {
  orders: Order[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (orders.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-4 py-6 text-center">
        <Package className="mx-auto mb-2 h-5 w-5 text-slate-400" />
        <p className="text-sm font-medium text-slate-600">Nothing to receive yet</p>
        <p className="mt-1 text-xs text-slate-500">
          Place an order in the Orders tab — outstanding ones will show up here.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {orders.map((o) => {
        const totalQty = o.lineItems.reduce((s, li) => s + li.qty, 0);
        const recvQty  = o.lineItems.reduce((s, li) => s + li.qtyReceived, 0);
        const remaining = totalQty - recvQty;
        const isSel = selectedId === o.id;

        return (
          <li key={o.id}>
            <button
              type="button"
              onClick={() => onSelect(o.id)}
              className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-all ${
                isSel
                  ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-200'
                  : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <span
                className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 ${
                  isSel ? 'border-emerald-600 bg-emerald-600' : 'border-slate-300'
                }`}
              >
                {isSel && <Check className="h-3 w-3 text-white" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-[11px] text-slate-700">{o.poNumber}</span>
                  <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                    {o.status}
                  </Badge>
                </div>
                <p className="mt-0.5 truncate text-sm font-medium text-slate-900">
                  {o.supplierName || '—'}
                </p>
                <p className="text-[11px] text-slate-500">
                  {o.lineItems.length} line{o.lineItems.length === 1 ? '' : 's'}
                  {' · '}
                  <span className="tabular-nums">{remaining}</span> still outstanding
                </p>
              </div>
              {o.expectedDelivery && (
                <span className="flex-shrink-0 text-[11px] tabular-nums text-slate-500">
                  ETA {format(parseISO(o.expectedDelivery), 'MMM d')}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// ─── Step 2: Check off line items ───────────────────────────────────────────

function CheckItemsStep({
  order, received, onChange,
}: {
  order: Order;
  received: Record<string, number>;
  onChange: (lineId: string, qty: number) => void;
}) {
  return (
    <div className="space-y-4">
      <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
        Pre-filled with the still-outstanding amount on each line.
        Adjust to what physically arrived — set to 0 for items not in this delivery.
      </p>

      <ul className="space-y-2">
        {order.lineItems.map((li) => (
          <LineRow
            key={li.id}
            line={li}
            value={received[li.id] ?? 0}
            onChange={(v) => onChange(li.id, v)}
          />
        ))}
      </ul>

      <SummaryRow
        items={order.lineItems}
        received={received}
      />
    </div>
  );
}

function LineRow({
  line, value, onChange,
}: {
  line: OrderLineItem;
  value: number;
  onChange: (v: number) => void;
}) {
  const remaining = Math.max(0, line.qty - line.qtyReceived);
  const overReceiving = value > remaining;
  const fullReceive = value >= remaining && remaining > 0;

  return (
    <li
      className={`rounded-lg border p-3 ${
        value === 0 ? 'border-slate-200 bg-slate-50/40' :
        overReceiving ? 'border-amber-300 bg-amber-50' :
        fullReceive ? 'border-emerald-300 bg-emerald-50/40' :
                      'border-slate-200'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-900">{line.description}</p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            <Box className="mr-1 inline h-3 w-3" />
            <span className="tabular-nums">{line.qtyReceived}</span> of {line.qty} {line.unit} received to date
          </p>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onChange(Math.max(0, value - 1))}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 active:bg-slate-100"
            aria-label="Decrement"
          >
            −
          </button>
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            value={value}
            onChange={(e) => onChange(Number(e.target.value) || 0)}
            className="h-9 w-20 text-center tabular-nums"
          />
          <button
            type="button"
            onClick={() => onChange(value + 1)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 active:bg-slate-100"
            aria-label="Increment"
          >
            +
          </button>
          <span className="text-xs text-slate-500">{line.unit}</span>
        </div>

        {/* Quick-fill chips */}
        <div className="flex items-center gap-1">
          {remaining > 0 && (
            <button
              type="button"
              onClick={() => onChange(remaining)}
              className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px] text-slate-600 hover:border-slate-300 hover:bg-slate-50"
            >
              Full ({remaining})
            </button>
          )}
          <button
            type="button"
            onClick={() => onChange(0)}
            className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px] text-slate-600 hover:border-slate-300 hover:bg-slate-50"
          >
            None
          </button>
        </div>
      </div>

      {overReceiving && (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-amber-700">
          <AlertCircle className="h-3 w-3" />
          Receiving more than outstanding — over-delivery accepted but flagged.
        </p>
      )}
    </li>
  );
}

function SummaryRow({
  items, received,
}: {
  items: OrderLineItem[];
  received: Record<string, number>;
}) {
  const totalReceiving = items.reduce((s, li) => s + (received[li.id] ?? 0), 0);
  const totalRemaining = items.reduce((s, li) => s + Math.max(0, li.qty - li.qtyReceived), 0);

  // Will the order auto-flip to received after this delivery?
  const wouldComplete = items.every(
    (li) => li.qtyReceived + (received[li.id] ?? 0) >= li.qty,
  );

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-600">Receiving in this delivery</span>
        <span
          className="tabular-nums font-semibold text-slate-900"
          style={{ fontFamily: "'Fraunces', Georgia, serif" }}
        >
          {totalReceiving}
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
        <span>Outstanding before this</span>
        <span className="tabular-nums">{totalRemaining}</span>
      </div>
      {wouldComplete && totalReceiving > 0 && (
        <p className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700">
          <Truck className="h-3 w-3" />
          This delivery completes the order
        </p>
      )}
    </div>
  );
}

// ─── Step 3: Meta (date / receiver / notes) ─────────────────────────────────

function MetaStep({
  receivedDate, setReceivedDate, receivedBy, setReceivedBy, notes, setNotes,
}: {
  receivedDate: string;
  setReceivedDate: (s: string) => void;
  receivedBy: string;
  setReceivedBy: (s: string) => void;
  notes: string;
  setNotes: (s: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Received on</span>
          <Input
            type="date"
            value={receivedDate}
            onChange={(e) => setReceivedDate(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Received by</span>
          <Input
            value={receivedBy}
            onChange={(e) => setReceivedBy(e.target.value)}
            placeholder="Your name"
          />
        </label>
      </div>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-600">
          Notes (optional)
        </span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Anything to flag — damaged crate, missing piece, courier name…"
          className="block w-full rounded-md border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        />
      </label>

      <p className="rounded-md bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
        On confirm, the order's line items tick off and its status flips to
        <strong className="ml-1 text-slate-700">partial</strong> or
        <strong className="ml-1 text-slate-700">received</strong> automatically based on the totals.
      </p>
    </div>
  );
}
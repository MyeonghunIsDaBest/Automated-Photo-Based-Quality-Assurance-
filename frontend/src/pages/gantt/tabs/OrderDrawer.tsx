import { useEffect, useMemo, useState } from 'react';
import {
  Activity as ActivityIcon, Calendar, Copy,
  ListChecks, Package, Plus, ShoppingCart, Trash2, Truck, X,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import type { Task, Zone } from '../../../types';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Badge } from '../../../components/ui/badge';
import MotionDrawer from '../../../components/ui/MotionDrawer';
import { cn } from '../../../lib/cn';
import { inputField } from '../components/ledger';
import { useFeatureStore } from '../../../store/features';
import { useAppStore } from '../../../store';
import {
  useGanttSideStore, useDeliveries,
} from '../store';
import type { Order, OrderLineItem, OrderStatus } from '../types';
import { useProjectActivity, ACTIVITY_VERBS } from '../lib/useProjectActivity';

interface OrderDrawerProps {
  order: Order | null;             // null = create mode
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  readOnly?: boolean;
  canDelete?: boolean;
}

const STATUS_OPTS: { value: OrderStatus; label: string }[] = [
  { value: 'draft',     label: 'Draft' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'partial',   label: 'Partial' },
  { value: 'received',  label: 'Received' },
  { value: 'cancelled', label: 'Cancelled' },
];

// Warm-ledger tone map: draft=slate, submitted=sky, confirmed=violet,
// partial=amber, received=sage, cancelled=red. (draft stays slate to match the
// Orders list badge — OrdersTab renders draft in slate, so ink here would make
// the same order two colours across list and drawer.)
const STATUS_BADGE: Record<OrderStatus, string> = {
  draft:     'border-[#C8D3DA] bg-[#EEF1F4] text-[#5B6B7B]',
  submitted: 'border-[#B8D4E8] bg-[#E3F0FA] text-[#2A6F9E]',
  confirmed: 'border-[#D8C8EE] bg-[#EFE7FB] text-[#6B3FA0]',
  partial:   'border-[#F0D5A0] bg-[#F9EFD9] text-[#9A6B12]',
  received:  'border-[#A8D0B8] bg-[#E5F2EA] text-[#246F47]',
  cancelled: 'border-[#F0BFBF] bg-[#FBE5E5] text-[#C44545]',
};

const UNITS = ['ea', 'box', 'm', 'm²', 'm³', 'kg', 'lf', 'sf', 'pallet'] as const;

const fmtUSD = (n: number) =>
  n === 0 ? '$0' :
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 2 }).format(n);

const today = () => new Date().toISOString().slice(0, 10);

const uid = (prefix: string) =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

type SubTab = 'details' | 'lines' | 'receipts' | 'activity';

const TABS: { id: SubTab; label: string; icon: typeof ListChecks }[] = [
  { id: 'details',  label: 'Details',  icon: ShoppingCart },
  { id: 'lines',    label: 'Line items', icon: ListChecks },
  { id: 'receipts', label: 'Receipts', icon: Package },
  { id: 'activity', label: 'Activity', icon: ActivityIcon },
];

export default function OrderDrawer({
  order, isOpen, onClose, projectId, readOnly = false, canDelete = true,
}: OrderDrawerProps) {
  const isCreate = order === null;

  const addOrder    = useGanttSideStore((s) => s.addOrder);
  const updateOrder = useGanttSideStore((s) => s.updateOrder);
  const removeOrder = useGanttSideStore((s) => s.removeOrder);

  // Project tasks for the "link to task" dropdown.
  const tasks = useFeatureStore((s) => s.tasks);
  const zones = useAppStore((s) => s.zones);
  const projectTasks = useMemo(
    () => tasks.filter((t) => t.projectId === projectId),
    [tasks, projectId],
  );
  const projectZones = useMemo(
    () => zones.filter((z) => z.projectId === projectId),
    [zones, projectId],
  );

  const [draft, setDraft] = useState<Partial<Order>>({});
  const [activeTab, setActiveTab] = useState<SubTab>('details');
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Reset state when the drawer opens or the order identity changes.
  useEffect(() => {
    if (!isOpen) return;
    if (order) {
      setDraft({
        poNumber: order.poNumber,
        supplierName: order.supplierName,
        zoneId: order.zoneId ?? '',
        taskId: order.taskId ?? '',
        orderedDate: order.orderedDate,
        expectedDelivery: order.expectedDelivery ?? '',
        status: order.status,
        notes: order.notes ?? '',
        lineItems: [...order.lineItems],
      });
    } else {
      setDraft({
        poNumber: `PO-${Math.floor(Math.random() * 9000 + 1000)}`,
        supplierName: '',
        zoneId: '',
        taskId: '',
        orderedDate: today(),
        expectedDelivery: '',
        status: 'draft',
        notes: '',
        lineItems: [{
          id: uid('li'),
          description: '',
          qty: 1,
          unitCost: 0,
          unit: 'ea',
          qtyReceived: 0,
        }],
      });
    }
    setActiveTab('details');
    setConfirmDelete(false);
  }, [isOpen, order?.id]);

  // ── Header / details auto-save on blur ──────────────────────────────────
  const commitField = <K extends keyof Order>(key: K, value: Order[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    if (isCreate || !order) return;
    if (order[key] === value) return;
    updateOrder(projectId, order.id, { [key]: value } as Partial<Order>);
  };

  const commitLineItems = (lines: OrderLineItem[]) => {
    setDraft((d) => ({ ...d, lineItems: lines }));
    if (isCreate || !order) return;
    updateOrder(projectId, order.id, { lineItems: lines });
  };

  // Line item editors. Mutate the draft locally; commit on blur for edits to
  // strings/numbers, immediately for structural changes (add/remove/duplicate).
  const updateLine = (idx: number, patch: Partial<OrderLineItem>, commit: boolean) => {
    const lines = (draft.lineItems ?? []).map((li, i) => (i === idx ? { ...li, ...patch } : li));
    setDraft((d) => ({ ...d, lineItems: lines }));
    if (commit) commitLineItems(lines);
  };

  const addLine = () => {
    const lines = [
      ...(draft.lineItems ?? []),
      { id: uid('li'), description: '', qty: 1, unitCost: 0, unit: 'ea', qtyReceived: 0 } as OrderLineItem,
    ];
    commitLineItems(lines);
  };

  const duplicateLine = (idx: number) => {
    const target = (draft.lineItems ?? [])[idx];
    if (!target) return;
    const lines = [...(draft.lineItems ?? [])];
    lines.splice(idx + 1, 0, { ...target, id: uid('li'), qtyReceived: 0 });
    commitLineItems(lines);
  };

  const removeLine = (idx: number) => {
    const lines = (draft.lineItems ?? []).filter((_, i) => i !== idx);
    if (lines.length === 0) return; // keep at least one row
    commitLineItems(lines);
  };

  // ── Save / create ───────────────────────────────────────────────────────
  const handleCreate = () => {
    if (!draft.poNumber?.trim() || !(draft.lineItems?.length ?? 0)) return;
    addOrder(projectId, {
      poNumber: draft.poNumber.trim(),
      supplierName: draft.supplierName?.trim() ?? '',
      zoneId: draft.zoneId || undefined,
      taskId: draft.taskId || undefined,
      orderedDate: draft.orderedDate ?? today(),
      expectedDelivery: draft.expectedDelivery || undefined,
      status: (draft.status as OrderStatus) ?? 'draft',
      notes: draft.notes?.trim() || undefined,
      lineItems: (draft.lineItems ?? []).map((li) => ({
        ...li,
        description: li.description.trim(),
      })),
    });
    onClose();
  };

  const handleDelete = () => {
    if (!order) return;
    removeOrder(projectId, order.id);
    onClose();
  };

  const total = (draft.lineItems ?? []).reduce(
    (s, li) => s + (li.qty || 0) * (li.unitCost || 0), 0,
  );

  return (
    <MotionDrawer
      open={isOpen}
      onClose={onClose}
      sizeClass="sm:w-[520px] lg:w-[640px]"
      ariaLabel="Order"
    >
      {/* Mobile drag handle */}
        <div className="flex justify-center pt-2 sm:hidden">
          <span className="h-1 w-10 rounded-full bg-[#D8D2C4]" />
        </div>

        {/* Header */}
        <header className="flex items-start justify-between gap-3 border-b border-[#EFEBE0] px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-[#6B6B6B]">
              {isCreate ? 'New order' : 'Order'}
            </p>
            <input
              value={draft.poNumber ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, poNumber: e.target.value }))}
              onBlur={() => !isCreate && commitField('poNumber', (draft.poNumber ?? '').trim() || (order?.poNumber ?? ''))}
              disabled={readOnly}
              placeholder="PO #"
              className="mt-1 w-full border-0 bg-transparent font-mono text-base font-semibold text-[#1A1A1A] placeholder:text-[#C0BAB0] focus:outline-none"
              autoFocus={isCreate}
            />
            <input
              value={draft.supplierName ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, supplierName: e.target.value }))}
              onBlur={() => !isCreate && commitField('supplierName', (draft.supplierName ?? '').trim())}
              disabled={readOnly}
              placeholder="Supplier name…"
              className="mt-1 w-full border-0 bg-transparent text-sm text-[#3A3A3A] placeholder:text-[#C0BAB0] focus:outline-none"
            />
          </div>
          <div className="flex flex-col items-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="grid min-h-11 min-w-11 place-items-center rounded-md text-[#A0A0A0] hover:bg-[#F0EDE4] hover:text-[#3A3A3A]"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
            {!isCreate && draft.status && (
              <Badge variant="outline" className={`text-[10px] uppercase tracking-wider ${STATUS_BADGE[draft.status as OrderStatus]}`}>
                {draft.status}
              </Badge>
            )}
          </div>
        </header>

        {/* Sub-tab strip — only in edit mode */}
        {!isCreate && (
          <nav className="flex-shrink-0 border-b border-[#EFEBE0] px-2 py-2">
            <div className="-mx-2 overflow-x-auto px-2">
              <div className="inline-flex items-center gap-1">
                {TABS.map((t) => {
                  const Icon = t.icon;
                  const isActive = activeTab === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setActiveTab(t.id)}
                      className={`flex flex-shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                        isActive ? 'bg-[#1A1A1A] text-white' : 'text-[#3A3A3A] hover:bg-[#F0EDE4]'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </nav>
        )}

        {/* Body */}
        <div className="editorial-scrollbox flex-1 p-5">
          {(isCreate || activeTab === 'details') && (
            <DetailsPane
              draft={draft}
              setDraft={setDraft}
              commitField={commitField}
              tasks={projectTasks}
              zones={projectZones}
              isCreate={isCreate}
              readOnly={readOnly}
            />
          )}
          {(isCreate || activeTab === 'lines') && (
            <LineItemsPane
              draft={draft}
              updateLine={updateLine}
              addLine={addLine}
              duplicateLine={duplicateLine}
              removeLine={removeLine}
              total={total}
              readOnly={readOnly}
              isCreate={isCreate}
            />
          )}
          {!isCreate && order && activeTab === 'receipts' && (
            <ReceiptsPane order={order} projectId={projectId} />
          )}
          {!isCreate && order && activeTab === 'activity' && (
            <ActivityPane order={order} projectId={projectId} />
          )}
        </div>

        {/* Footer */}
        <footer className="flex flex-shrink-0 items-center justify-between gap-3 border-t border-[#EFEBE0] px-5 py-3">
          {isCreate ? (
            <>
              <span className="text-xs text-[#A0A0A0]">
                Total <strong className="tabular-nums text-[#3A3A3A]">{fmtUSD(total)}</strong>
              </span>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={onClose}>Cancel</Button>
                <Button
                  onClick={handleCreate}
                  disabled={!draft.poNumber?.trim() || (draft.lineItems ?? []).length === 0}
                >
                  Place order
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#A0A0A0]">Status</span>
                <select
                  value={(draft.status as OrderStatus) ?? 'draft'}
                  onChange={(e) => commitField('status', e.target.value as OrderStatus)}
                  disabled={readOnly}
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
                    <span className="text-xs text-[#C44545]">Delete this order?</span>
                    <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Button>
                    <button
                      type="button"
                      onClick={handleDelete}
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
                    Delete order
                  </button>
                )
              )}
            </>
          )}
        </footer>
    </MotionDrawer>
  );
}

// ─── Details pane ───────────────────────────────────────────────────────────

function DetailsPane({
  draft, setDraft, commitField, tasks, zones, isCreate, readOnly,
}: {
  draft: Partial<Order>;
  setDraft: (fn: (d: Partial<Order>) => Partial<Order>) => void;
  commitField: <K extends keyof Order>(k: K, v: Order[K]) => void;
  tasks: Task[];
  zones: Zone[];
  isCreate: boolean;
  readOnly: boolean;
}) {
  return (
    <section className={isCreate ? '' : 'mb-6'}>
      {!isCreate && (
        <h3 className="mb-3 text-[11px] font-medium uppercase tracking-[0.2em] text-[#6B6B6B]">
          Details
        </h3>
      )}
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Ordered">
            <Input
              type="date"
              value={draft.orderedDate ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, orderedDate: e.target.value }))}
              onBlur={(e) => !isCreate && commitField('orderedDate', e.target.value)}
              disabled={readOnly}
            />
          </Field>
          <Field label="Expected delivery">
            <Input
              type="date"
              value={draft.expectedDelivery ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, expectedDelivery: e.target.value }))}
              onBlur={(e) => !isCreate && commitField('expectedDelivery', e.target.value)}
              disabled={readOnly}
            />
          </Field>
        </div>

        <Field label="Linked task (optional)">
          <select
            value={draft.taskId ?? ''}
            onChange={(e) => commitField('taskId', e.target.value || undefined)}
            disabled={readOnly}
            className={inputField}
          >
            <option value="">— None —</option>
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </Field>

        <Field label="Zone (optional)">
          <select
            value={draft.zoneId ?? ''}
            onChange={(e) => commitField('zoneId', e.target.value || undefined)}
            disabled={readOnly}
            className={inputField}
          >
            <option value="">Project-wide</option>
            {zones.map((z) => (
              <option key={z.id} value={z.id}>{z.name}</option>
            ))}
          </select>
        </Field>

        <Field label="Notes">
          <textarea
            value={draft.notes ?? ''}
            onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
            onBlur={(e) => !isCreate && commitField('notes', e.target.value)}
            disabled={readOnly}
            rows={2}
            placeholder="Delivery instructions, terms, references…"
            className={inputField}
          />
        </Field>
      </div>
    </section>
  );
}

// ─── Line items pane ────────────────────────────────────────────────────────

function LineItemsPane({
  draft, updateLine, addLine, duplicateLine, removeLine, total, readOnly, isCreate,
}: {
  draft: Partial<Order>;
  updateLine: (idx: number, patch: Partial<OrderLineItem>, commit: boolean) => void;
  addLine: () => void;
  duplicateLine: (idx: number) => void;
  removeLine: (idx: number) => void;
  total: number;
  readOnly: boolean;
  isCreate: boolean;
}) {
  const items = draft.lineItems ?? [];

  return (
    <section className={isCreate ? 'mt-6 pt-6 border-t border-[#EFEBE0]' : ''}>
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-[11px] font-medium uppercase tracking-[0.2em] text-[#6B6B6B]">
          Line items ({items.length})
        </h3>
        <span className="tabular-nums text-sm font-semibold text-[#1A1A1A]">
          {fmtUSD(total)}
        </span>
      </div>

      <ul className="space-y-2">
        {items.map((li, idx) => {
          const lineTotal = (li.qty || 0) * (li.unitCost || 0);
          return (
            <li
              key={li.id}
              className="rounded-lg border border-[#E6E1D4] p-3"
            >
              {/* Description — full width */}
              <input
                value={li.description}
                onChange={(e) => updateLine(idx, { description: e.target.value }, false)}
                onBlur={(e) => updateLine(idx, { description: e.target.value }, true)}
                disabled={readOnly}
                placeholder="Item description"
                className="block w-full border-0 bg-transparent px-0 text-sm font-medium text-[#1A1A1A] placeholder:text-[#C0BAB0] focus:outline-none"
              />

              {/* Qty / unit / unit cost / warranty */}
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-[80px_80px_120px_120px]">
                <NumField
                  label="Qty"
                  value={li.qty}
                  onChange={(v) => updateLine(idx, { qty: v }, false)}
                  onCommit={(v) => updateLine(idx, { qty: v }, true)}
                  disabled={readOnly}
                  min={0}
                />
                <SelectField
                  label="Unit"
                  value={li.unit}
                  onChange={(v) => updateLine(idx, { unit: v }, true)}
                  options={UNITS as readonly string[]}
                  disabled={readOnly}
                />
                <NumField
                  label="Unit cost"
                  value={li.unitCost}
                  onChange={(v) => updateLine(idx, { unitCost: v }, false)}
                  onCommit={(v) => updateLine(idx, { unitCost: v }, true)}
                  disabled={readOnly}
                  min={0}
                  step={0.01}
                />
                <NumField
                  label="Warranty (mo)"
                  value={li.warrantyMonths ?? 0}
                  onChange={(v) => updateLine(idx, { warrantyMonths: v }, false)}
                  onCommit={(v) => updateLine(idx, { warrantyMonths: v }, true)}
                  disabled={readOnly}
                  min={0}
                />
              </div>

              {/* Footer — totals + receipt status + actions */}
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <div className="flex items-center gap-3 text-[#6B6B6B]">
                  <span className="tabular-nums">
                    Line total <strong className="text-[#1A1A1A]">{fmtUSD(lineTotal)}</strong>
                  </span>
                  {li.qtyReceived > 0 && (
                    <span className="inline-flex items-center gap-1 text-[#246F47]">
                      <Package className="h-3 w-3" />
                      {li.qtyReceived} of {li.qty} received
                    </span>
                  )}
                </div>
                {!readOnly && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => duplicateLine(idx)}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[#A0A0A0] hover:bg-[#F0EDE4] hover:text-[#3A3A3A]"
                      title="Duplicate line"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeLine(idx)}
                      disabled={items.length === 1}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[#A0A0A0] hover:bg-[#FBE5E5] hover:text-[#C44545] disabled:cursor-not-allowed disabled:opacity-30"
                      title="Remove line"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {!readOnly && (
        <button
          type="button"
          onClick={addLine}
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-[#3A3A3A] hover:text-[#2F8F5C]"
        >
          <Plus className="h-3.5 w-3.5" />
          Add line item
        </button>
      )}
    </section>
  );
}

// ─── Receipts pane ──────────────────────────────────────────────────────────

function ReceiptsPane({ order, projectId }: { order: Order; projectId: string }) {
  const allDeliveries = useDeliveries(projectId);
  const orderDeliveries = useMemo(
    () => allDeliveries.filter((d) => d.orderId === order.id),
    [allDeliveries, order.id],
  );

  if (orderDeliveries.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[#E6E1D4] bg-[#FAF8F2]/60 px-4 py-6 text-center">
        <Truck className="mx-auto mb-2 h-5 w-5 text-[#A0A0A0]" />
        <p className="text-sm font-medium text-[#3A3A3A]">No deliveries logged yet</p>
        <p className="mt-1 text-xs text-[#6B6B6B]">
          When deliveries arrive, log them in the Deliveries tab — line items
          tick off here automatically.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {orderDeliveries.map((d) => {
        const items = d.items
          .map((di) => {
            const li = order.lineItems.find((l) => l.id === di.lineItemId);
            return li ? { description: li.description, qty: di.qtyReceived, unit: li.unit } : null;
          })
          .filter(Boolean) as { description: string; qty: number; unit: string }[];

        return (
          <li key={d.id} className="rounded-lg border border-[#E6E1D4] p-3">
            <div className="mb-2 flex items-baseline justify-between">
              <p className="font-medium text-[#1A1A1A]">
                {format(parseISO(d.receivedDate), 'MMM d, yyyy')}
              </p>
              <span className="text-[11px] text-[#6B6B6B]">{d.receivedBy}</span>
            </div>
            <ul className="space-y-0.5 text-sm">
              {items.map((it, idx) => (
                <li key={idx} className="flex items-center justify-between text-[#3A3A3A]">
                  <span className="min-w-0 flex-1 truncate">{it.description}</span>
                  <span className="tabular-nums">{it.qty} {it.unit}</span>
                </li>
              ))}
            </ul>
            {d.notes && (
              <p className="mt-2 text-[11px] text-[#6B6B6B]">{d.notes}</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ─── Activity pane ──────────────────────────────────────────────────────────

function ActivityPane({ order, projectId }: { order: Order; projectId: string }) {
  const events = useProjectActivity(projectId, { limit: 30 });
  const orderEvents = useMemo(
    () => events.filter((e) => e.targetEntityId === order.id),
    [events, order.id],
  );

  if (orderEvents.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-[#E6E1D4] bg-[#FAF8F2]/60 px-4 py-6 text-center text-sm text-[#A0A0A0]">
        No activity recorded for this order yet.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {orderEvents.map((e) => (
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

// ─── Field helpers ──────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-[#6B6B6B]">{label}</span>
      {children}
    </label>
  );
}

function NumField({
  label, value, onChange, onCommit, disabled, min, step,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  onCommit: (v: number) => void;
  disabled: boolean;
  min?: number;
  step?: number;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-[#6B6B6B]">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        value={value}
        min={min}
        step={step ?? 1}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        onBlur={(e) => onCommit(Number(e.target.value) || 0)}
        disabled={disabled}
        className={cn(inputField, 'px-2 py-1.5 tabular-nums')}
      />
    </label>
  );
}

function SelectField({
  label, value, onChange, options, disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
  disabled: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-[#6B6B6B]">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={cn(inputField, 'px-2 py-1.5')}
      >
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}
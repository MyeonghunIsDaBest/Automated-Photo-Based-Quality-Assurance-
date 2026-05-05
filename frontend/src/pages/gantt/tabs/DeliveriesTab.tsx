import { useMemo, useState } from 'react';
import {
  Box, Calendar, ChevronRight, Package, Plus, Truck,
} from 'lucide-react';
import { differenceInDays, format, parseISO } from 'date-fns';
import type { Project } from '../../../types';
import { Card, CardContent } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { TabHeader } from '../components/TabHeader';
import { EmptyState } from '../components/EmptyState';
import {
  useOrdersForProject, useDeliveries,
} from '../store';
import type { Delivery, Order } from '../types';
import DeliveryWizard from './DeliveryWizard';

interface DeliveriesTabProps {
  project: Project;
  canEdit: boolean;
  // Skip the editorial TabHeader when nested inside SupplierTab.
  hideHeader?: boolean;
}

export function DeliveriesTab({ project, canEdit, hideHeader = false }: DeliveriesTabProps) {
  const orders     = useOrdersForProject(project.id);
  const deliveries = useDeliveries(project.id);

  const [wizardOpen, setWizardOpen] = useState(false);
  const [presetOrderId, setPresetOrderId] = useState<string | null>(null);

  // ── Outstanding orders — what the team should be expecting ────────────
  const outstanding = useMemo(
    () => orders.filter(
      (o) =>
        o.status === 'submitted' ||
        o.status === 'confirmed' ||
        o.status === 'partial',
    ),
    [orders],
  );

  // ── Sort deliveries newest-first for the log ──────────────────────────
  const sortedDeliveries = useMemo(
    () =>
      [...deliveries].sort(
        (a, b) => parseISO(b.receivedDate).getTime() - parseISO(a.receivedDate).getTime(),
      ),
    [deliveries],
  );

  const startWizard = (orderId?: string) => {
    setPresetOrderId(orderId ?? null);
    setWizardOpen(true);
  };

  return (
    <>
      {!hideHeader && (
        <TabHeader
          eyebrow={`Workspace · Deliveries · ${project.name}`}
          title="What arrived, when, in what state."
          description="Log each delivery against its PO. Line items tick off automatically — partial receipts move the order to 'partial'; full receipts close it out."
          action={
            canEdit ? (
              <Button onClick={() => startWizard()} disabled={orders.length === 0}>
                <Plus className="mr-2 h-4 w-4" />
                Log delivery
              </Button>
            ) : (
              <Badge variant="secondary" className="gap-1.5 px-3 py-1.5">
                <Truck className="h-3.5 w-3.5" />
                Read-only
              </Badge>
            )
          }
        />
      )}
      {hideHeader && canEdit && (
        <div className="mb-4 flex justify-end">
          <Button onClick={() => startWizard()} disabled={orders.length === 0}>
            <Plus className="mr-2 h-4 w-4" />
            Log delivery
          </Button>
        </div>
      )}

      {/* Outstanding orders strip — quick-tap to log against any of them */}
      {outstanding.length > 0 && (
        <Card className="mb-6">
          <CardContent className="p-4 sm:p-5">
            <div className="mb-3 flex items-baseline justify-between">
              <h3 className="text-[11px] font-medium uppercase tracking-[0.2em] text-slate-500">
                Outstanding ({outstanding.length})
              </h3>
              <span className="text-[11px] text-slate-400">
                Tap to log a delivery
              </span>
            </div>
            <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              {outstanding.map((o) => (
                <li key={o.id} className="flex-shrink-0">
                  <OutstandingCard
                    order={o}
                    onClick={() => canEdit && startWizard(o.id)}
                    canEdit={canEdit}
                  />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Log of past deliveries */}
      {sortedDeliveries.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              icon={Truck}
              title={
                orders.length === 0
                  ? 'No orders to receive yet.'
                  : 'No deliveries logged yet.'
              }
              description={
                orders.length === 0
                  ? 'Place an order in the Orders tab first — deliveries log against PO line items.'
                  : 'When the truck arrives, tap "Log delivery" or pick an outstanding order above.'
              }
              action={
                canEdit && orders.length > 0 ? (
                  <Button onClick={() => startWizard()}>
                    <Plus className="mr-2 h-4 w-4" />
                    Log first delivery
                  </Button>
                ) : null
              }
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="border-b border-slate-100 px-4 py-3 sm:px-5">
              <div className="flex items-baseline justify-between">
                <h3 className="text-sm font-medium text-slate-900">Delivery log</h3>
                <span className="text-xs text-slate-500">{sortedDeliveries.length} total</span>
              </div>
            </div>
            <ul className="divide-y divide-slate-100">
              {sortedDeliveries.map((d) => (
                <DeliveryRow
                  key={d.id}
                  delivery={d}
                  order={orders.find((o) => o.id === d.orderId)}
                />
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <DeliveryWizard
        isOpen={wizardOpen}
        onClose={() => {
          setWizardOpen(false);
          setPresetOrderId(null);
        }}
        projectId={project.id}
        orders={outstanding.length > 0 ? outstanding : orders.filter((o) => o.status !== 'cancelled')}
        presetOrderId={presetOrderId}
      />
    </>
  );
}

// ─── Outstanding card (horizontally scrolling strip) ────────────────────────

function OutstandingCard({
  order, onClick, canEdit,
}: { order: Order; onClick: () => void; canEdit: boolean }) {
  const totalQty = order.lineItems.reduce((s, li) => s + li.qty, 0);
  const recvQty  = order.lineItems.reduce((s, li) => s + li.qtyReceived, 0);
  const pct = totalQty === 0 ? 0 : Math.round((recvQty / totalQty) * 100);

  const eta = order.expectedDelivery
    ? differenceInDays(parseISO(order.expectedDelivery), new Date())
    : null;
  const etaTone =
    eta === null    ? 'text-slate-500' :
    eta < 0         ? 'text-red-600'   :
    eta <= 3        ? 'text-amber-600' :
                      'text-slate-500';
  const etaLabel =
    eta === null    ? '—' :
    eta < 0         ? `${Math.abs(eta)}d overdue` :
    eta === 0       ? 'Today' :
                      `in ${eta}d`;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!canEdit}
      className="group flex w-60 flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3 text-left transition-all hover:border-emerald-300 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-[11px] text-slate-700">{order.poNumber}</span>
        <Badge
          variant="outline"
          className={`text-[10px] uppercase tracking-wider ${
            order.status === 'partial'
              ? 'border-amber-200 bg-amber-50 text-amber-700'
              : order.status === 'confirmed'
                ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                : 'border-blue-200 bg-blue-50 text-blue-700'
          }`}
        >
          {order.status}
        </Badge>
      </div>
      <p className="truncate text-sm font-medium text-slate-900">
        {order.supplierName || '—'}
      </p>
      <div className="flex items-center gap-2">
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-slate-100">
          <div className="h-1 rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
        </div>
        <span className="tabular-nums text-[10px] text-slate-500">
          {recvQty}/{totalQty}
        </span>
      </div>
      <div className="flex items-center justify-between text-[11px]">
        <span className={etaTone}>
          <Calendar className="mr-1 inline h-3 w-3" />
          {etaLabel}
        </span>
        <span className="text-slate-400 group-hover:text-emerald-600">
          Receive →
        </span>
      </div>
    </button>
  );
}

// ─── Single delivery row in the log ─────────────────────────────────────────

function DeliveryRow({
  delivery, order,
}: { delivery: Delivery; order: Order | undefined }) {
  const totalQty = delivery.items.reduce((s, it) => s + it.qtyReceived, 0);
  const linesCount = delivery.items.length;

  // Map line items back to their descriptions (read-time join — order may
  // have edited line items since the delivery was logged, hence the
  // optional chain).
  const lineDescriptions = order
    ? delivery.items.map((di) => {
        const li = order.lineItems.find((l) => l.id === di.lineItemId);
        return li ? `${li.description} (${di.qtyReceived} ${li.unit})` : null;
      }).filter(Boolean) as string[]
    : [];

  return (
    <li className="flex items-start gap-4 px-4 py-3 sm:px-5">
      <div className="flex-shrink-0 rounded-lg bg-slate-50 px-3 py-2 text-center">
        <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
          {format(parseISO(delivery.receivedDate), 'MMM')}
        </p>
        <p
          className="text-2xl font-semibold tabular-nums leading-none text-slate-900"
          style={{ fontFamily: "'Fraunces', Georgia, serif" }}
        >
          {format(parseISO(delivery.receivedDate), 'd')}
        </p>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          {order && (
            <span className="font-mono text-[11px] text-slate-700">{order.poNumber}</span>
          )}
          <span className="text-sm font-medium text-slate-900">
            {order?.supplierName ?? 'Unknown supplier'}
          </span>
          <span className="text-[11px] text-slate-400">· received by {delivery.receivedBy}</span>
        </div>

        {lineDescriptions.length > 0 ? (
          <ul className="mt-1 space-y-0.5">
            {lineDescriptions.slice(0, 3).map((desc, idx) => (
              <li key={idx} className="truncate text-[12px] text-slate-600">
                <Box className="mr-1 inline h-3 w-3 text-slate-400" />
                {desc}
              </li>
            ))}
            {lineDescriptions.length > 3 && (
              <li className="text-[11px] text-slate-400">
                + {lineDescriptions.length - 3} more
              </li>
            )}
          </ul>
        ) : (
          <p className="mt-1 text-[12px] text-slate-500 italic">
            (Original order no longer available)
          </p>
        )}

        {delivery.notes && (
          <p className="mt-1.5 rounded-md bg-slate-50 px-2 py-1 text-[11px] text-slate-600">
            {delivery.notes}
          </p>
        )}
      </div>

      <div className="flex-shrink-0 text-right">
        <p className="tabular-nums text-sm font-semibold text-slate-900">
          {totalQty}
        </p>
        <p className="text-[10px] text-slate-500">
          {linesCount} line{linesCount === 1 ? '' : 's'}
        </p>
      </div>
    </li>
  );
}
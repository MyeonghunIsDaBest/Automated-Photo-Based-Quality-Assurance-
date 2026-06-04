import { useMemo, useState } from 'react';
import { Box, Calendar, Plus, Truck } from 'lucide-react';
import { differenceInDays, format, parseISO } from 'date-fns';
import type { Project } from '../../../types';
import {
  LedgerHeader, StatusPill, FRAUNCES, cardShell, btnPrimary, type ToneKey,
} from '../components/ledger';
import { useOrdersForProject, useDeliveries } from '../store';
import type { Delivery, Order } from '../types';
import DeliveryWizard from './DeliveryWizard';

interface DeliveriesTabProps {
  project: Project;
  canEdit: boolean;
  hideHeader?: boolean;
}

export function DeliveriesTab({ project, canEdit, hideHeader = false }: DeliveriesTabProps) {
  const orders     = useOrdersForProject(project.id);
  const deliveries = useDeliveries(project.id);

  const [wizardOpen, setWizardOpen] = useState(false);
  const [presetOrderId, setPresetOrderId] = useState<string | null>(null);

  const outstanding = useMemo(
    () => orders.filter((o) => o.status === 'submitted' || o.status === 'confirmed' || o.status === 'partial'),
    [orders],
  );
  const sortedDeliveries = useMemo(
    () => [...deliveries].sort((a, b) => parseISO(b.receivedDate).getTime() - parseISO(a.receivedDate).getTime()),
    [deliveries],
  );

  const startWizard = (orderId?: string) => { setPresetOrderId(orderId ?? null); setWizardOpen(true); };

  return (
    <>
      {!hideHeader && (
        <LedgerHeader
          kicker="DEL"
          icon={Truck}
          eyebrow={`Deliveries · ${project.name}`}
          title="What arrived, when, in what state."
          meta="Log each delivery against its PO — line items tick off automatically."
          actions={canEdit
            ? <button type="button" onClick={() => startWizard()} disabled={orders.length === 0} className={btnPrimary}><Plus className="h-3.5 w-3.5" /> Log delivery</button>
            : <StatusPill tone="slate" className="px-3 py-1.5"><Truck className="h-3.5 w-3.5" /> Read-only</StatusPill>}
        />
      )}
      {hideHeader && canEdit && (
        <div className="mb-4 flex justify-end">
          <button type="button" onClick={() => startWizard()} disabled={orders.length === 0} className={btnPrimary}>
            <Plus className="h-3.5 w-3.5" /> Log delivery
          </button>
        </div>
      )}

      {/* Outstanding orders — quick-tap to log against any of them */}
      {outstanding.length > 0 && (
        <div className={`mb-4 p-4 sm:p-5 ${cardShell}`}>
          <div className="mb-3 flex items-baseline justify-between">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#6B6B6B]">Outstanding ({outstanding.length})</h3>
            <span className="text-[11px] text-[#A0A0A0]">Tap to log a delivery</span>
          </div>
          <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {outstanding.map((o) => (
              <li key={o.id} className="flex-shrink-0">
                <OutstandingCard order={o} onClick={() => canEdit && startWizard(o.id)} canEdit={canEdit} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Delivery log */}
      {sortedDeliveries.length === 0 ? (
        <div className={`px-6 py-16 text-center ${cardShell}`}>
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-[#FAF8F2] text-[#2F8F5C]">
            <Truck className="h-7 w-7" strokeWidth={1.5} />
          </div>
          <h3 className="text-[22px] font-medium text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>
            {orders.length === 0 ? 'No orders to receive yet.' : 'No deliveries logged yet.'}
          </h3>
          <p className="mx-auto mt-2 max-w-sm text-[13px] text-[#6B6B6B]">
            {orders.length === 0
              ? 'Place an order first — deliveries log against PO line items.'
              : 'When the truck arrives, tap "Log delivery" or pick an outstanding order above.'}
          </p>
          {canEdit && orders.length > 0 && (
            <button type="button" onClick={() => startWizard()} className={`mt-5 ${btnPrimary}`}><Plus className="h-3.5 w-3.5" /> Log first delivery</button>
          )}
        </div>
      ) : (
        <div className={`overflow-hidden ${cardShell}`}>
          <div className="flex items-baseline justify-between border-b border-[#EFEBE0] px-5 py-3">
            <h3 className="text-[14px] font-semibold text-[#1A1A1A]">Delivery log</h3>
            <span className="text-[12px] text-[#6B6B6B]">{sortedDeliveries.length} total</span>
          </div>
          <ul className="divide-y divide-[#EFEBE0]">
            {sortedDeliveries.map((d) => (
              <DeliveryRow key={d.id} delivery={d} order={orders.find((o) => o.id === d.orderId)} />
            ))}
          </ul>
        </div>
      )}

      <DeliveryWizard
        isOpen={wizardOpen}
        onClose={() => { setWizardOpen(false); setPresetOrderId(null); }}
        projectId={project.id}
        orders={outstanding.length > 0 ? outstanding : orders.filter((o) => o.status !== 'cancelled')}
        presetOrderId={presetOrderId}
      />
    </>
  );
}

// ─── Outstanding card ───────────────────────────────────────────────────────

function OutstandingCard({ order, onClick, canEdit }: { order: Order; onClick: () => void; canEdit: boolean }) {
  const totalQty = order.lineItems.reduce((s, li) => s + li.qty, 0);
  const recvQty  = order.lineItems.reduce((s, li) => s + li.qtyReceived, 0);
  const pct = totalQty === 0 ? 0 : Math.round((recvQty / totalQty) * 100);

  const eta = order.expectedDelivery ? differenceInDays(parseISO(order.expectedDelivery), new Date()) : null;
  const etaColor = eta === null ? '#6B6B6B' : eta < 0 ? '#C44545' : eta <= 3 ? '#C8841E' : '#6B6B6B';
  const etaText = eta === null ? '—' : eta < 0 ? `${Math.abs(eta)}d overdue` : eta === 0 ? 'Today' : `in ${eta}d`;
  const tone: ToneKey = order.status === 'partial' ? 'amber' : order.status === 'confirmed' ? 'sage' : 'slate';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!canEdit}
      className="group flex w-60 flex-col gap-2 rounded-[12px] border border-[#E6E1D4] bg-white p-3 text-left transition-all hover:border-[#2F8F5C] hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-[11px] text-[#6B6B6B]">{order.poNumber}</span>
        <StatusPill tone={tone} className="capitalize">{order.status}</StatusPill>
      </div>
      <p className="truncate text-[14px] font-semibold text-[#1A1A1A]">{order.supplierName || '—'}</p>
      <div className="flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#F0EDE4]">
          <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #246F47, #2F8F5C)' }} />
        </div>
        <span className="tabular-nums text-[10px] text-[#6B6B6B]">{recvQty}/{totalQty}</span>
      </div>
      <div className="flex items-center justify-between text-[11px]">
        <span style={{ color: etaColor }}><Calendar className="mr-1 inline h-3 w-3" />{etaText}</span>
        <span className="text-[#A0A0A0] group-hover:text-[#246F47]">Receive →</span>
      </div>
    </button>
  );
}

// ─── Delivery row ─────────────────────────────────────────────────────────

function DeliveryRow({ delivery, order }: { delivery: Delivery; order: Order | undefined }) {
  const totalQty = delivery.items.reduce((s, it) => s + it.qtyReceived, 0);
  const linesCount = delivery.items.length;

  const lineDescriptions = order
    ? delivery.items.map((di) => {
        const li = order.lineItems.find((l) => l.id === di.lineItemId);
        return li ? `${li.description} (${di.qtyReceived} ${li.unit})` : null;
      }).filter(Boolean) as string[]
    : [];

  return (
    <li className="flex items-start gap-4 px-5 py-3.5">
      <div className="w-14 flex-shrink-0 overflow-hidden rounded-[10px] border border-[#E6E1D4] text-center">
        <div className="bg-[#FAF8F2] py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#6B6B6B]">
          {format(parseISO(delivery.receivedDate), 'MMM')}
        </div>
        <p className="py-1 text-[22px] font-medium leading-none text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>
          {format(parseISO(delivery.receivedDate), 'd')}
        </p>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          {order && <span className="font-mono text-[11px] text-[#6B6B6B]">{order.poNumber}</span>}
          <span className="text-[14px] font-semibold text-[#1A1A1A]">{order?.supplierName ?? 'Unknown supplier'}</span>
          <span className="text-[11px] text-[#A0A0A0]">· received by {delivery.receivedBy}</span>
        </div>

        {lineDescriptions.length > 0 ? (
          <ul className="mt-1 space-y-0.5">
            {lineDescriptions.slice(0, 3).map((desc, idx) => (
              <li key={idx} className="truncate text-[12px] text-[#3A3A3A]">
                <Box className="mr-1 inline h-3 w-3 text-[#A0A0A0]" />{desc}
              </li>
            ))}
            {lineDescriptions.length > 3 && <li className="text-[11px] text-[#A0A0A0]">+ {lineDescriptions.length - 3} more</li>}
          </ul>
        ) : (
          <p className="mt-1 text-[12px] italic text-[#A0A0A0]">(Original order no longer available)</p>
        )}

        {delivery.notes && (
          <p className="mt-1.5 rounded-[8px] bg-[#FAF8F2] px-2 py-1 text-[11px] text-[#3A3A3A]">{delivery.notes}</p>
        )}
      </div>

      <div className="flex-shrink-0 text-right">
        <p className="text-[16px] font-semibold tabular-nums text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>{totalQty}</p>
        <p className="text-[10px] text-[#A0A0A0]">{linesCount} line{linesCount === 1 ? '' : 's'}</p>
      </div>
    </li>
  );
}

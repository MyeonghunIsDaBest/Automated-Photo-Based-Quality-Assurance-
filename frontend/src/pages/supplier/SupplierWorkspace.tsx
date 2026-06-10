// SupplierWorkspace (/supplier) — the supplier's project-scoped cockpit
// (role-experiences, Phase 3). A vendor lands here (not the internal Gantt) and
// sees ONLY their own POs on the active invited project, with one-tap
// Accept / Hold / Decline, plus a business summary + the ROI value widget.
//
// Strict isolation: orders are filtered to `order.supplierId === profile.supplierId`.
// Project is the TopNav-selected active project (the switcher lives there). The
// Accept/Hold/Decline write is deploy-gated to migration 47 but the UI + local
// state work pre-deploy (the response just won't persist to the server yet).

import { useEffect, useMemo } from 'react';
import { ShoppingCart, Check, PauseCircle, XCircle, FolderKanban } from 'lucide-react';
import { format } from 'date-fns';
import { useAppStore } from '../../store';
import { useOrdersForProject, useGanttSideStore } from '../gantt/store';
import { listOrders, subscribeToProjectOrders } from '../../lib/api/orders';
import { supabaseConfigured } from '../../lib/supabase';
import { canRespondToOrders } from '../../lib/permissions';
import type { Order, OrderStatus, SupplierResponse } from '../gantt/types';
import {
  LedgerHeader, LedgerStatRow, StatusPill, cardShell, FRAUNCES, type ToneKey,
} from '../gantt/components/ledger';
import RoiCalculator from '../RoiCalculator';

const fmt = (n: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n);
const orderTotal = (o: Order) => o.lineItems.reduce((s, li) => s + li.qty * li.unitCost, 0);

const STATUS_TONE: Record<OrderStatus, ToneKey> = {
  draft: 'slate', submitted: 'amber', confirmed: 'sage', partial: 'amber', received: 'sage', cancelled: 'red',
};
const RESPONSE_TONE: Record<SupplierResponse, ToneKey> = {
  pending: 'amber', accepted: 'sage', held: 'orange', declined: 'red',
};
const awaitingResponse = (o: Order) =>
  o.status === 'submitted' && (!o.supplierResponse || o.supplierResponse === 'pending');

export default function SupplierWorkspace() {
  const project = useAppStore((s) => s.project);
  const currentProfile = useAppStore((s) => s.currentProfile);
  const respondToOrder = useGanttSideStore((s) => s.respondToOrder);

  const projectId = project?.id;
  const supplierId = currentProfile?.supplierId;
  const allOrders = useOrdersForProject(projectId ?? '');

  // Hydrate + keep orders live for the active project (same pattern as SupplierTab).
  useEffect(() => {
    if (!supabaseConfigured() || !projectId) return;
    const store = () => useGanttSideStore.getState();
    let cancelled = false;
    void listOrders(projectId).then((r) => { if (!cancelled) store().setOrdersForProject(projectId, r); }).catch(() => void 0);
    const unsub = subscribeToProjectOrders(projectId, {
      onUpsert: (o) => store().upsertOrderFromRemote(projectId, o),
      onDelete: (id) => store().setOrdersForProject(projectId, (store().orders[projectId] ?? []).filter((o) => o.id !== id)),
    });
    return () => { cancelled = true; unsub(); };
  }, [projectId]);

  // Strict per-supplier scope.
  const myOrders = useMemo(
    () => (supplierId ? allOrders.filter((o) => o.supplierId === supplierId) : []),
    [allOrders, supplierId],
  );
  const awaiting = useMemo(() => myOrders.filter(awaitingResponse), [myOrders]);
  const stats = useMemo(() => {
    const open = myOrders.filter((o) => o.status !== 'received' && o.status !== 'cancelled');
    const value = myOrders.reduce((s, o) => s + orderTotal(o), 0);
    const openValue = open.reduce((s, o) => s + orderTotal(o), 0);
    return { open: open.length, awaiting: awaiting.length, value, openValue, total: myOrders.length };
  }, [myOrders, awaiting]);

  const canRespond = canRespondToOrders(currentProfile);

  if (!projectId) {
    return (
      <div className="editorial-root min-h-full bg-[#FAF8F2] p-6">
        <BlankState icon={FolderKanban} title="No project selected." body="Pick a project from the switcher up top to see its orders." />
      </div>
    );
  }

  return (
    <div className="editorial-root min-h-full bg-[#FAF8F2]">
      <div className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-8 sm:py-8">
        <LedgerHeader
          kicker="SUP"
          icon={ShoppingCart}
          eyebrow={`Supplier · ${project.name}`}
          title="Your orders."
          meta={
            <>
              {stats.open} open · {stats.awaiting} awaiting your response
              <span className="mx-2 text-[#A0A0A0]">·</span>
              <span className="text-[#A0A0A0]">{fmt(stats.value)} total value</span>
            </>
          }
        />

        {!supplierId ? (
          <BlankState
            icon={ShoppingCart}
            title="Account not linked to a supplier yet."
            body="Your login isn't connected to a supplier record, so we can't show your purchase orders. Ask the project admin to link your account."
          />
        ) : (
          <>
            <LedgerStatRow
              stats={[
                { value: stats.open,             label: 'Open orders',      sub: 'in progress',       tone: 'slate' },
                { value: stats.awaiting,         label: 'Awaiting you',     sub: 'need a response',   tone: stats.awaiting > 0 ? 'amber' : 'sage' },
                { value: fmt(stats.openValue),   label: 'Open value',       sub: 'not yet received',  tone: 'ink' },
                { value: stats.total,            label: 'All-time POs',     sub: 'on this project',   tone: 'sage' },
              ]}
            />

            {/* Orders awaiting your response — the signature action. */}
            {awaiting.length > 0 && (
              <section className={`mb-4 overflow-hidden ${cardShell}`}>
                <div className="border-b border-[#EFEBE0] px-5 py-3">
                  <h2 className="text-[16px] font-medium text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>Awaiting your response</h2>
                  <p className="text-[12px] text-[#6B6B6B]">Accept, hold, or decline each PO sent to you.</p>
                </div>
                <ul className="divide-y divide-[#EFEBE0]">
                  {awaiting.map((o) => (
                    <li key={o.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-[14px] font-semibold text-[#1A1A1A]">{o.poNumber} · {fmt(orderTotal(o))}</p>
                        <p className="truncate text-[12px] text-[#6B6B6B]">
                          {o.lineItems.length} line item{o.lineItems.length === 1 ? '' : 's'}
                          {o.expectedDelivery ? ` · ETA ${format(new Date(o.expectedDelivery), 'MMM d')}` : ''}
                        </p>
                      </div>
                      {canRespond ? (
                        <div className="flex flex-shrink-0 gap-2">
                          <button type="button" onClick={() => respondToOrder(projectId, o.id, 'accepted')}
                            className="inline-flex items-center gap-1.5 rounded-full bg-[#2F8F5C] px-3.5 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-[#246F47]">
                            <Check className="h-3.5 w-3.5" /> Accept
                          </button>
                          <button type="button" onClick={() => respondToOrder(projectId, o.id, 'held')}
                            className="inline-flex items-center gap-1.5 rounded-full border border-[#F0D5A0] bg-[#F9EFD9] px-3.5 py-1.5 text-[12px] font-semibold text-[#C8841E] transition-colors hover:bg-[#F3E4C4]">
                            <PauseCircle className="h-3.5 w-3.5" /> Hold
                          </button>
                          <button type="button" onClick={() => respondToOrder(projectId, o.id, 'declined')}
                            className="inline-flex items-center gap-1.5 rounded-full border border-[#F0BFBF] bg-[#FBE5E5] px-3.5 py-1.5 text-[12px] font-semibold text-[#C44545] transition-colors hover:bg-[#F6D5D5]">
                            <XCircle className="h-3.5 w-3.5" /> Decline
                          </button>
                        </div>
                      ) : (
                        <StatusPill tone="slate">View only</StatusPill>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Your orders — full scoped list. */}
            <section className={`mb-4 overflow-hidden ${cardShell}`}>
              <div className="border-b border-[#EFEBE0] px-5 py-3">
                <h2 className="text-[16px] font-medium text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>Your purchase orders</h2>
              </div>
              {myOrders.length === 0 ? (
                <div className="px-5 py-10 text-center text-[13px] text-[#6B6B6B]">No POs addressed to you on this project yet.</div>
              ) : (
                <ul className="divide-y divide-[#EFEBE0]">
                  {myOrders.map((o) => (
                    <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                      <div className="min-w-0">
                        <p className="text-[14px] font-medium text-[#1A1A1A]">{o.poNumber}</p>
                        <p className="text-[12px] text-[#6B6B6B]">{fmt(orderTotal(o))} · {o.lineItems.length} items</p>
                      </div>
                      <div className="flex flex-shrink-0 items-center gap-2">
                        {o.supplierResponse && o.supplierResponse !== 'pending' && (
                          <StatusPill tone={RESPONSE_TONE[o.supplierResponse]} className="capitalize">{o.supplierResponse}</StatusPill>
                        )}
                        <StatusPill tone={STATUS_TONE[o.status]} className="capitalize">{o.status}</StatusPill>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Business panel — value summary + the ROI/value widget. */}
            <section className={`overflow-hidden ${cardShell}`}>
              <div className="border-b border-[#EFEBE0] px-5 py-3">
                <h2 className="text-[16px] font-medium text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>Your business on this project</h2>
                <p className="text-[12px] text-[#6B6B6B]">{fmt(stats.value)} across {stats.total} order{stats.total === 1 ? '' : 's'} · {fmt(stats.openValue)} still open</p>
              </div>
              <div className="p-5">
                <RoiCalculator />
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function BlankState({ icon: Icon, title, body }: { icon: typeof ShoppingCart; title: string; body: string }) {
  return (
    <div className={`px-6 py-16 text-center ${cardShell}`}>
      <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-[#FAF8F2] text-[#A0A0A0]"><Icon className="h-7 w-7" strokeWidth={1.5} /></div>
      <h3 className="text-[22px] font-medium text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-[13px] text-[#6B6B6B]">{body}</p>
    </div>
  );
}

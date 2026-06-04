import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronRight, Clock, Plus, ShoppingCart } from 'lucide-react';
import { differenceInDays, parseISO } from 'date-fns';
import type { Project } from '../../../types';
import {
  LedgerHeader, StatusPill, TONE, FRAUNCES, cardShell, btnPrimary, type ToneKey,
} from '../components/ledger';
import { useOrdersForProject, orderTotal } from '../store';
import type { Order, OrderStatus } from '../types';
import OrderDrawer from './OrderDrawer';
import NewOrderModal from './NewOrderModal';

interface OrdersTabProps {
  project: Project;
  canEdit: boolean;
  canDelete: boolean;
  // Set when rendered inside the merged Supplier tab — the parent owns the
  // header + unified stat strip, so we drop ours.
  hideHeader?: boolean;
}

const STATUS_TONE: Record<OrderStatus, ToneKey> = {
  draft: 'slate', submitted: 'slate', confirmed: 'sage', partial: 'amber', received: 'sage', cancelled: 'red',
};

// Visible label changes only — the underlying OrderStatus enum stays the same.
const STATUS_FILTERS: { id: OrderStatus | 'all' | 'open'; label: string }[] = [
  { id: 'all',       label: 'All' },
  { id: 'open',      label: 'Open' },
  { id: 'draft',     label: 'Draft' },
  { id: 'submitted', label: 'Pending' },
  { id: 'confirmed', label: 'Confirmed' },
  { id: 'partial',   label: 'Partial' },
  { id: 'received',  label: 'Received' },
  { id: 'cancelled', label: 'Cancelled' },
];

const fmtUSD = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

export function OrdersTab({ project, canEdit, canDelete, hideHeader = false }: OrdersTabProps) {
  const orders = useOrdersForProject(project.id);

  const [filter, setFilter] = useState<OrderStatus | 'all' | 'open'>('all');
  const [search, setSearch] = useState('');
  const [drawerOrder, setDrawerOrder] = useState<Order | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'edit' | 'create'>('edit');
  const [newOrderOpen, setNewOrderOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      if (filter === 'all') {
        // no-op
      } else if (filter === 'open') {
        if (o.status === 'received' || o.status === 'cancelled') return false;
      } else if (o.status !== filter) {
        return false;
      }
      if (q) {
        const hay = [o.poNumber, o.supplierName, o.notes ?? '', ...o.lineItems.map((li) => li.description)]
          .join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [orders, filter, search]);

  const sorted = useMemo(() => {
    const order: Record<OrderStatus, number> = {
      partial: 0, confirmed: 1, submitted: 2, draft: 3, received: 4, cancelled: 5,
    };
    return [...filtered].sort((a, b) => {
      const so = order[a.status] - order[b.status];
      if (so !== 0) return so;
      return parseISO(b.orderedDate).getTime() - parseISO(a.orderedDate).getTime();
    });
  }, [filtered]);

  const openOrder = (o: Order) => { setDrawerOrder(o); setDrawerMode('edit'); setDrawerOpen(true); };
  const openCreate = () => setNewOrderOpen(true);

  return (
    <>
      {!hideHeader && (
        <LedgerHeader
          kicker="ORD"
          icon={ShoppingCart}
          eyebrow={`Orders · ${project.name}`}
          title="Procurement, line by line."
          meta="Every PO from submission to receipt — supplier, line items, costs, ETA."
          actions={canEdit
            ? <button type="button" onClick={openCreate} className={btnPrimary}><Plus className="h-3.5 w-3.5" /> New order</button>
            : <StatusPill tone="slate" className="px-3 py-1.5"><ShoppingCart className="h-3.5 w-3.5" /> Read-only</StatusPill>}
        />
      )}
      {hideHeader && canEdit && (
        <div className="mb-4 flex justify-end">
          <button type="button" onClick={openCreate} className={btnPrimary}><Plus className="h-3.5 w-3.5" /> New order</button>
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
          placeholder="Search PO #, supplier, items…"
          className="h-9 w-full rounded-full border border-[#E6E1D4] bg-white px-3.5 text-[13px] text-[#3A3A3A] placeholder:text-[#A0A0A0] focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]/30 sm:w-64"
        />
      </div>

      {/* Body */}
      {orders.length === 0 ? (
        <EmptyOrders
          title={`No orders on ${project.name}.`}
          body="Place your first order to start tracking supplies. Each PO links to a supplier and produces a line for Deliveries."
          action={canEdit ? <button type="button" onClick={openCreate} className={btnPrimary}><Plus className="h-3.5 w-3.5" /> Place first order</button> : null}
        />
      ) : sorted.length === 0 ? (
        <EmptyOrders title="No orders match your filter." body="Loosen the filter or clear the search to see the rest." />
      ) : (
        <>
          {/* Mobile cards */}
          <ul className={`divide-y divide-[#EFEBE0] overflow-hidden md:hidden ${cardShell}`}>
            <AnimatePresence initial={false}>
              {sorted.map((o) => (
                <motion.div
                  key={o.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                >
                  <OrderRowMobile order={o} onOpen={() => openOrder(o)} />
                </motion.div>
              ))}
            </AnimatePresence>
          </ul>

          {/* Desktop table */}
          <div className={`hidden overflow-hidden md:block ${cardShell}`}>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className="border-b border-[#E6E1D4] bg-[#FAF8F2] text-[11px] font-semibold uppercase tracking-[0.1em] text-[#6B6B6B]">
                    <th className="px-5 py-3">PO #</th>
                    <th className="px-5 py-3">Supplier</th>
                    <th className="px-5 py-3">Lines</th>
                    <th className="px-5 py-3 text-right">Total</th>
                    <th className="px-5 py-3">ETA</th>
                    <th className="px-5 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((o) => <OrderRowDesktop key={o.id} order={o} onOpen={() => openOrder(o)} />)}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <OrderDrawer
        order={drawerMode === 'edit' ? drawerOrder : null}
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        projectId={project.id}
        readOnly={!canEdit}
        canDelete={canDelete}
      />
      <NewOrderModal open={newOrderOpen} onClose={() => setNewOrderOpen(false)} projectId={project.id} />
    </>
  );
}

// ─── Rows ─────────────────────────────────────────────────────────────────

function OrderRowMobile({ order, onOpen }: { order: Order; onOpen: () => void }) {
  const total = orderTotal(order);
  const etaInfo = etaLabel(order);
  return (
    <li>
      <button type="button" onClick={onOpen} className="flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-[#FAF8F2]">
        <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full" style={{ background: TONE[STATUS_TONE[order.status]].dot }} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[11px] text-[#6B6B6B]">{order.poNumber}</span>
            <StatusPill tone={STATUS_TONE[order.status]} className="capitalize">{order.status}</StatusPill>
          </div>
          <p className="mt-1 truncate text-[14px] font-semibold text-[#1A1A1A]">{order.supplierName || '—'}</p>
          <div className="mt-1 flex items-center justify-between text-[11.5px] text-[#6B6B6B]">
            <span>{order.lineItems.length} line{order.lineItems.length === 1 ? '' : 's'}</span>
            <span className="tabular-nums">{fmtUSD(total)}</span>
          </div>
          {etaInfo && (
            <p className="mt-1 text-[11.5px]" style={{ color: etaInfo.color }}>
              <Clock className="mr-1 inline h-3 w-3" />{etaInfo.label}
            </p>
          )}
        </div>
        <ChevronRight className="mt-1 h-4 w-4 flex-shrink-0 text-[#C9C3B4]" />
      </button>
    </li>
  );
}

function OrderRowDesktop({ order, onOpen }: { order: Order; onOpen: () => void }) {
  const total = orderTotal(order);
  const etaInfo = etaLabel(order);
  return (
    <tr onClick={onOpen} className="cursor-pointer border-b border-[#EFEBE0] transition-colors last:border-b-0 hover:bg-[#FAF8F2]">
      <td className="px-5 py-3.5"><span className="font-mono text-[11px] text-[#6B6B6B]">{order.poNumber}</span></td>
      <td className="px-5 py-3.5">
        <p className="font-semibold text-[#1A1A1A]">{order.supplierName || '—'}</p>
        {order.notes && <p className="mt-0.5 max-w-xs truncate text-[11px] text-[#A0A0A0]">{order.notes}</p>}
      </td>
      <td className="px-5 py-3.5 text-[#6B6B6B]">
        {order.lineItems.length}<span className="ml-1 text-[10px] text-[#A0A0A0]">{order.lineItems.length === 1 ? 'item' : 'items'}</span>
      </td>
      <td className="px-5 py-3.5 text-right tabular-nums text-[#1A1A1A]">{fmtUSD(total)}</td>
      <td className="px-5 py-3.5">
        {etaInfo ? <span style={{ color: etaInfo.color }}>{etaInfo.label}</span> : <span className="text-[#A0A0A0]">—</span>}
      </td>
      <td className="px-5 py-3.5">
        <StatusPill tone={STATUS_TONE[order.status]} className="capitalize">{order.status}</StatusPill>
      </td>
    </tr>
  );
}

function EmptyOrders({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className={`px-6 py-16 text-center ${cardShell}`}>
      <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-[#FAF8F2] text-[#2F8F5C]">
        <ShoppingCart className="h-7 w-7" strokeWidth={1.5} />
      </div>
      <h3 className="text-[22px] font-medium text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>{title}</h3>
      <p className="mx-auto mt-2 max-w-sm text-[13px] text-[#6B6B6B]">{body}</p>
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

// ─── ETA helper ─────────────────────────────────────────────────────────────

function etaLabel(o: Order): { label: string; color: string } | null {
  if (o.status === 'received' || o.status === 'cancelled') return null;
  if (!o.expectedDelivery) return null;
  const days = differenceInDays(parseISO(o.expectedDelivery), new Date());
  if (days < 0)  return { label: `${Math.abs(days)}d overdue`, color: '#C44545' };
  if (days === 0) return { label: 'Today',                     color: '#C8841E' };
  if (days <= 3)  return { label: `in ${days}d`,               color: '#C8841E' };
  return { label: `in ${days}d`, color: '#6B6B6B' };
}

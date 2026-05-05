import { useMemo, useState } from 'react';
import {
  AlertTriangle, Calendar, CheckCircle2, ChevronRight, Clock,
  DollarSign, Package, Plus, ShoppingCart, Truck,
} from 'lucide-react';
import { differenceInDays, format, parseISO } from 'date-fns';
import type { Project } from '../../../types';
import { Card, CardContent } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { Input } from '../../../components/ui/input';
import { TabHeader } from '../components/TabHeader';
import { EmptyState } from '../components/EmptyState';
import {
  useOrdersForProject, useDeliveries, orderTotal,
} from '../store';
import type { Order, OrderStatus } from '../types';
import OrderDrawer from './OrderDrawer';

interface OrdersTabProps {
  project: Project;
  canEdit: boolean;
  canDelete: boolean;
  // Set when this tab is rendered inside the merged Supplier tab — the
  // parent owns the editorial header, so we drop our own to avoid stacking.
  hideHeader?: boolean;
}

const STATUS_BADGE: Record<OrderStatus, string> = {
  draft:     'border-slate-200 bg-slate-50 text-slate-600',
  submitted: 'border-blue-200 bg-blue-50 text-blue-700',
  confirmed: 'border-indigo-200 bg-indigo-50 text-indigo-700',
  partial:   'border-amber-200 bg-amber-50 text-amber-700',
  received:  'border-emerald-200 bg-emerald-50 text-emerald-700',
  cancelled: 'border-red-200 bg-red-50 text-red-700',
};

const STATUS_DOT: Record<OrderStatus, string> = {
  draft:     'bg-slate-400',
  submitted: 'bg-blue-500',
  confirmed: 'bg-indigo-500',
  partial:   'bg-amber-500',
  received:  'bg-emerald-500',
  cancelled: 'bg-red-500',
};

const STATUS_FILTERS: { id: OrderStatus | 'all' | 'open'; label: string }[] = [
  { id: 'all',       label: 'All' },
  { id: 'open',      label: 'Open' },
  { id: 'draft',     label: 'Draft' },
  { id: 'submitted', label: 'Submitted' },
  { id: 'confirmed', label: 'Confirmed' },
  { id: 'partial',   label: 'Partial' },
  { id: 'received',  label: 'Received' },
  { id: 'cancelled', label: 'Cancelled' },
];

const fmtUSD = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

export function OrdersTab({ project, canEdit, canDelete, hideHeader = false }: OrdersTabProps) {
  const orders     = useOrdersForProject(project.id);
  const deliveries = useDeliveries(project.id);

  const [filter, setFilter] = useState<OrderStatus | 'all' | 'open'>('all');
  const [search, setSearch] = useState('');
  const [drawerOrder, setDrawerOrder] = useState<Order | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'edit' | 'create'>('edit');

  // ── KPIs ───────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const sevenDaysAgo = Date.now() - 7 * 86_400_000;

    const open = orders.filter(
      (o) => o.status !== 'received' && o.status !== 'cancelled',
    );
    const awaiting = orders.filter(
      (o) => o.status === 'submitted' || o.status === 'confirmed' || o.status === 'partial',
    );
    const receivedThisWeek = deliveries.filter(
      (d) => Date.parse(d.receivedDate) > sevenDaysAgo,
    ).length;
    const committed = orders
      .filter((o) => o.status !== 'cancelled')
      .reduce((sum, o) => sum + orderTotal(o), 0);

    return { open: open.length, awaiting: awaiting.length, receivedThisWeek, committed };
  }, [orders, deliveries]);

  // ── Filter + search ────────────────────────────────────────────────────
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
        const hay = [
          o.poNumber, o.supplierName, o.notes ?? '',
          ...o.lineItems.map((li) => li.description),
        ].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [orders, filter, search]);

  // Most recent first; received/cancelled sink below open ones.
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

  const openOrder = (o: Order) => {
    setDrawerOrder(o);
    setDrawerMode('edit');
    setDrawerOpen(true);
  };

  const openCreate = () => {
    setDrawerOrder(null);
    setDrawerMode('create');
    setDrawerOpen(true);
  };

  return (
    <>
      {!hideHeader && (
        <TabHeader
          eyebrow={`Workspace · Orders · ${project.name}`}
          title="Procurement, line by line."
          description="Every PO from submission to receipt — supplier, line items, costs, delivery ETA. Tap an order to manage line items; deliveries tick off against this list."
          action={
            canEdit ? (
              <Button onClick={openCreate}>
                <Plus className="mr-2 h-4 w-4" />
                New Order
              </Button>
            ) : (
              <Badge variant="secondary" className="gap-1.5 px-3 py-1.5">
                <ShoppingCart className="h-3.5 w-3.5" />
                Read-only
              </Badge>
            )
          }
        />
      )}
      {/* When mounted under SupplierTab, the parent renders the action button. */}
      {hideHeader && canEdit && (
        <div className="mb-4 flex justify-end">
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            New Order
          </Button>
        </div>
      )}

      {/* KPIs — horizontal scroll on phones */}
      <div className="mb-4 -mx-4 overflow-x-auto px-4 pb-1 sm:-mx-0 sm:px-0">
        <div className="flex min-w-max gap-3 sm:grid sm:min-w-0 sm:grid-cols-4">
          <Kpi
            icon={ShoppingCart}
            label="Open orders"
            value={String(kpis.open)}
            tone="slate"
          />
          <Kpi
            icon={Truck}
            label="Awaiting delivery"
            value={String(kpis.awaiting)}
            tone={kpis.awaiting > 0 ? 'amber' : 'slate'}
          />
          <Kpi
            icon={Package}
            label="Received (7d)"
            value={String(kpis.receivedThisWeek)}
            tone="emerald"
          />
          <Kpi
            icon={DollarSign}
            label="Committed"
            value={fmtUSD(kpis.committed)}
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
            placeholder="Search PO #, supplier, items…"
            className="h-9 w-full sm:w-64"
          />
        </CardContent>
      </Card>

      {/* Body */}
      {orders.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              icon={ShoppingCart}
              title={`No orders on ${project.name}.`}
              description="Place your first order to start tracking supplies. Each PO links to a supplier, optional task, and produces a line for the Deliveries tab."
              action={
                canEdit ? (
                  <Button onClick={openCreate}>
                    <Plus className="mr-2 h-4 w-4" />
                    Place first order
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
              icon={ShoppingCart}
              title="No orders match your filter."
              description="Loosen the filter or clear the search to see the rest."
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            {/* Mobile cards */}
            <ul className="divide-y divide-slate-100 md:hidden">
              {sorted.map((o) => (
                <OrderRowMobile key={o.id} order={o} onOpen={() => openOrder(o)} />
              ))}
            </ul>

            {/* Desktop table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/60 text-left text-[11px] font-medium uppercase tracking-wider text-slate-500">
                    <th className="px-4 py-3">PO #</th>
                    <th className="px-4 py-3">Supplier</th>
                    <th className="px-4 py-3">Lines</th>
                    <th className="px-4 py-3">Total</th>
                    <th className="px-4 py-3">ETA</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sorted.map((o) => (
                    <OrderRowDesktop key={o.id} order={o} onOpen={() => openOrder(o)} />
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <OrderDrawer
        order={drawerMode === 'edit' ? drawerOrder : null}
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        projectId={project.id}
        readOnly={!canEdit}
        canDelete={canDelete}
      />
    </>
  );
}

// ─── Row renderers ──────────────────────────────────────────────────────────

function OrderRowMobile({ order, onOpen }: { order: Order; onOpen: () => void }) {
  const total = orderTotal(order);
  const etaInfo = etaLabel(order);

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 active:bg-slate-100"
      >
        <span className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${STATUS_DOT[order.status]}`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[11px] text-slate-700">{order.poNumber}</span>
            <Badge variant="outline" className={`text-[10px] uppercase tracking-wider ${STATUS_BADGE[order.status]}`}>
              {order.status}
            </Badge>
          </div>
          <p className="mt-1 truncate text-sm font-medium text-slate-900">{order.supplierName || '—'}</p>
          <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
            <span>{order.lineItems.length} line{order.lineItems.length === 1 ? '' : 's'}</span>
            <span className="tabular-nums">{fmtUSD(total)}</span>
          </div>
          {etaInfo && (
            <p className={`mt-1 text-[11px] ${etaInfo.tone}`}>
              <Clock className="mr-1 inline h-3 w-3" />
              {etaInfo.label}
            </p>
          )}
        </div>
        <ChevronRight className="mt-1 h-4 w-4 flex-shrink-0 text-slate-300" />
      </button>
    </li>
  );
}

function OrderRowDesktop({ order, onOpen }: { order: Order; onOpen: () => void }) {
  const total = orderTotal(order);
  const etaInfo = etaLabel(order);

  return (
    <tr onClick={onOpen} className="cursor-pointer transition-colors hover:bg-slate-50">
      <td className="px-4 py-3">
        <span className="font-mono text-[11px] text-slate-700">{order.poNumber}</span>
      </td>
      <td className="px-4 py-3">
        <p className="font-medium text-slate-900">{order.supplierName || '—'}</p>
        {order.notes && (
          <p className="mt-0.5 max-w-xs truncate text-[11px] text-slate-500">{order.notes}</p>
        )}
      </td>
      <td className="px-4 py-3 text-slate-600">
        {order.lineItems.length}
        <span className="ml-1 text-[10px] text-slate-400">
          {order.lineItems.length === 1 ? 'item' : 'items'}
        </span>
      </td>
      <td className="px-4 py-3 tabular-nums text-slate-900">{fmtUSD(total)}</td>
      <td className="px-4 py-3 text-slate-600">
        {etaInfo ? (
          <span className={etaInfo.tone}>{etaInfo.label}</span>
        ) : (
          <span className="text-slate-400">—</span>
        )}
      </td>
      <td className="px-4 py-3">
        <Badge variant="outline" className={`text-[10px] uppercase tracking-wider ${STATUS_BADGE[order.status]}`}>
          {order.status}
        </Badge>
      </td>
    </tr>
  );
}

// ─── KPI cell ───────────────────────────────────────────────────────────────

function Kpi({
  icon: Icon, label, value, tone,
}: {
  icon: typeof ShoppingCart;
  label: string;
  value: string;
  tone: 'emerald' | 'amber' | 'slate';
}) {
  const before = {
    emerald: 'before:bg-emerald-500',
    amber:   'before:bg-amber-500',
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

// ─── ETA helper ─────────────────────────────────────────────────────────────
// Pretty-print expectedDelivery as "Today" / "in 3d" / "2d overdue" / "—"
// with a colour tone for the desktop ETA column.

function etaLabel(o: Order): { label: string; tone: string } | null {
  if (o.status === 'received' || o.status === 'cancelled') return null;
  if (!o.expectedDelivery) return null;
  const days = differenceInDays(parseISO(o.expectedDelivery), new Date());
  if (days < 0) return { label: `${Math.abs(days)}d overdue`, tone: 'text-red-600' };
  if (days === 0) return { label: 'Today',                      tone: 'text-amber-600' };
  if (days <= 3)  return { label: `in ${days}d`,                tone: 'text-amber-600' };
  return { label: `in ${days}d`, tone: 'text-slate-600' };
}
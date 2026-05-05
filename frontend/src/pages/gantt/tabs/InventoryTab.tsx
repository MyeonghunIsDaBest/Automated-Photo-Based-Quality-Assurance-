import { useMemo, useState } from 'react';
import { Layers, Search, ShoppingCart } from 'lucide-react';
import type { Project, Zone } from '../../../types';
import { Card, CardContent } from '../../../components/ui/card';
import { Input } from '../../../components/ui/input';
import { Badge } from '../../../components/ui/badge';
import { TabHeader } from '../components/TabHeader';
import { EmptyState } from '../components/EmptyState';
import { useOrdersForProject } from '../store';
import type { Order, OrderLineItem, OrderStatus } from '../types';

interface InventoryTabProps {
  project: Project;
  zones: Zone[];
  canEdit: boolean;
  onJumpToOrders?: () => void;
}

// One inventory row per order line item. The fields that actually matter to
// "what's on site" come from the line item; the supplier / order / zone /
// status come from its parent order.
interface InventoryRow {
  key: string;        // `${orderId}:${lineItemId}` — stable
  description: string;
  qtyOrdered: number;
  qtyReceived: number;
  unit: string;
  unitCost: number;
  supplierName: string;
  zoneId?: string;
  zoneName?: string;
  orderStatus: OrderStatus;
  orderId: string;
  poNumber: string;
}

type StockFilter = 'all' | 'on_order' | 'partial' | 'on_site';

const STOCK_FILTERS: { id: StockFilter; label: string }[] = [
  { id: 'all',       label: 'All items' },
  { id: 'on_order',  label: 'On order' },
  { id: 'partial',   label: 'Partial' },
  { id: 'on_site',   label: 'On site' },
];

const STATUS_BADGE: Record<OrderStatus, string> = {
  draft:     'border-slate-200 bg-slate-50 text-slate-600',
  submitted: 'border-blue-200 bg-blue-50 text-blue-700',
  confirmed: 'border-indigo-200 bg-indigo-50 text-indigo-700',
  partial:   'border-amber-200 bg-amber-50 text-amber-700',
  received:  'border-emerald-200 bg-emerald-50 text-emerald-700',
  cancelled: 'border-red-200 bg-red-50 text-red-700',
};

const fmtUSD = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

// Derived inventory from procurement data. Each order's line items become
// one row; the state machine on the parent order tells us whether the row
// is on order, partially received, or fully on site.
//
// Read-only by design. To add or edit an item, the user goes to Orders —
// this prevents accidentally creating phantom stock that isn't tied to a
// PO and a supplier. Future work: add manual on-site adjustments for
// shrinkage / damage when a real warehouse module lands.
export function InventoryTab({ project, zones, canEdit, onJumpToOrders }: InventoryTabProps) {
  const orders = useOrdersForProject(project.id);

  const zoneById = useMemo(
    () => new Map(zones.map((z) => [z.id, z.name])),
    [zones],
  );

  const rows = useMemo<InventoryRow[]>(() => {
    const out: InventoryRow[] = [];
    for (const order of orders as Order[]) {
      if (order.status === 'cancelled') continue;  // skip cancelled POs
      for (const li of order.lineItems as OrderLineItem[]) {
        out.push({
          key: `${order.id}:${li.id}`,
          description: li.description,
          qtyOrdered: li.qty,
          qtyReceived: li.qtyReceived,
          unit: li.unit,
          unitCost: li.unitCost,
          supplierName: order.supplierName,
          zoneId: order.zoneId,
          zoneName: order.zoneId ? zoneById.get(order.zoneId) : undefined,
          orderStatus: order.status,
          orderId: order.id,
          poNumber: order.poNumber,
        });
      }
    }
    return out;
  }, [orders, zoneById]);

  const [search, setSearch] = useState('');
  const [zoneFilter, setZoneFilter] = useState('');
  const [stock, setStock] = useState<StockFilter>('all');

  const filtered = useMemo(() => rows.filter((r) => {
    if (zoneFilter && r.zoneId !== zoneFilter) return false;
    if (stock === 'on_order' && r.qtyReceived > 0) return false;
    if (stock === 'partial'  && (r.qtyReceived === 0 || r.qtyReceived >= r.qtyOrdered)) return false;
    if (stock === 'on_site'  && r.qtyReceived < r.qtyOrdered) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !r.description.toLowerCase().includes(q) &&
        !r.supplierName.toLowerCase().includes(q) &&
        !r.poNumber.toLowerCase().includes(q)
      ) return false;
    }
    return true;
  }), [rows, zoneFilter, stock, search]);

  // Headline stats — what's actually here vs. what's on its way.
  const totals = useMemo(() => {
    const onOrder = rows.filter((r) => r.qtyReceived === 0).length;
    const partial = rows.filter((r) => r.qtyReceived > 0 && r.qtyReceived < r.qtyOrdered).length;
    const onSite  = rows.filter((r) => r.qtyReceived >= r.qtyOrdered).length;
    const valueOnOrder = rows
      .filter((r) => r.qtyReceived < r.qtyOrdered)
      .reduce((sum, r) => sum + (r.qtyOrdered - r.qtyReceived) * r.unitCost, 0);
    return { onOrder, partial, onSite, valueOnOrder };
  }, [rows]);

  return (
    <>
      <TabHeader
        eyebrow={`Workspace · Inventory · ${project.name}`}
        title="What's on order, what's on site."
        description="Every line item from every PO, rolled up by supplier and zone. Read-only — to add or change items, go through Orders so the procurement chain stays intact."
        action={
          canEdit && onJumpToOrders ? (
            <button
              type="button"
              onClick={onJumpToOrders}
              className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 active:bg-emerald-800"
            >
              <ShoppingCart className="h-3.5 w-3.5" />
              Manage in Orders
            </button>
          ) : null
        }
      />

      {/* KPI strip */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="On order"     value={String(totals.onOrder)} accent="bg-blue-500" />
        <Stat label="Partial"      value={String(totals.partial)} accent="bg-amber-500" />
        <Stat label="On site"      value={String(totals.onSite)}  accent="bg-emerald-500" />
        <Stat label="Open value"   value={fmtUSD(totals.valueOnOrder)} accent="bg-slate-400" />
      </div>

      {/* Filter row */}
      <Card className="mb-4">
        <CardContent className="flex flex-col gap-3 p-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="-mx-1 overflow-x-auto px-1">
            <div className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white p-1 shadow-sm">
              {STOCK_FILTERS.map((f) => {
                const isActive = stock === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setStock(f.id)}
                    className={`flex flex-shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {zones.length > 0 && (
              <select
                value={zoneFilter}
                onChange={(e) => setZoneFilter(e.target.value)}
                className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm focus:border-emerald-500 focus:outline-none"
              >
                <option value="">All zones</option>
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>{z.name}</option>
                ))}
              </select>
            )}
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Item, supplier, PO…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 w-full pl-9"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Inventory table */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={Layers}
          title={rows.length === 0 ? 'Nothing on order yet.' : 'No items match your filters.'}
          description={
            rows.length === 0
              ? canEdit
                ? 'Create an order under Supplier → Orders to start tracking inventory.'
                : 'Once orders are placed, line items will roll up here automatically.'
              : 'Try a different filter or clear the search.'
          }
        />
      ) : (
        <>
          {/* Mobile cards */}
          <ul className="space-y-2 md:hidden">
            {filtered.map((r) => (
              <li
                key={r.key}
                className="rounded-xl border border-slate-200 bg-white p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">{r.description}</p>
                    <p className="truncate text-[11px] text-slate-500">
                      {r.supplierName}
                      {r.zoneName && <> · {r.zoneName}</>}
                      <> · PO {r.poNumber}</>
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={`flex-shrink-0 text-[10px] uppercase tracking-wider ${STATUS_BADGE[r.orderStatus]}`}
                  >
                    {r.orderStatus.replace('_', ' ')}
                  </Badge>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-slate-600">
                  <span className="tabular-nums">
                    <span className="font-medium text-slate-900">{r.qtyReceived}</span>
                    /{r.qtyOrdered} {r.unit}
                  </span>
                  <span className="tabular-nums text-slate-500">{fmtUSD(r.qtyOrdered * r.unitCost)}</span>
                </div>
              </li>
            ))}
          </ul>

          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white md:block">
            <div className="-mx-px overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50/60 text-[11px] font-medium uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Item</th>
                    <th className="px-4 py-3">Supplier</th>
                    <th className="px-4 py-3">Zone</th>
                    <th className="px-4 py-3 text-right">Received</th>
                    <th className="px-4 py-3 text-right">Ordered</th>
                    <th className="px-4 py-3 text-right">Value</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((r) => (
                    <tr key={r.key} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">{r.description}</p>
                        <p className="text-[11px] text-slate-500">PO {r.poNumber}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{r.supplierName}</td>
                      <td className="px-4 py-3 text-slate-700">{r.zoneName ?? '—'}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-900">
                        {r.qtyReceived} {r.unit}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                        {r.qtyOrdered} {r.unit}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                        {fmtUSD(r.qtyOrdered * r.unitCost)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant="outline"
                          className={`text-[10px] uppercase tracking-wider ${STATUS_BADGE[r.orderStatus]}`}
                        >
                          {r.orderStatus.replace('_', ' ')}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
      <div className={`absolute left-0 top-0 h-1 w-10 ${accent}`} aria-hidden="true" />
      <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{label}</p>
      <p
        className="mt-1 truncate text-2xl font-semibold tabular-nums leading-none text-slate-900 sm:text-3xl"
        style={{ fontFamily: "'Fraunces', Georgia, serif" }}
        title={value}
      >
        {value}
      </p>
    </div>
  );
}

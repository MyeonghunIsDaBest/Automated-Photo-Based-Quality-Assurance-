import { Fragment, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Boxes, Bug, CheckCircle2, Layers, Plus, Search, ShoppingCart, X } from 'lucide-react';
import type { Project, Zone } from '../../../types';
import { DefectsBoard } from './DefectsBoard';
import {
  LedgerHeader, LedgerStatRow, StatusPill,
  TONE, FRAUNCES, cardShell, btnPrimary, btnGhost, type ToneKey,
} from '../components/ledger';
import { useOrdersForProject } from '../store';
import { useAppStore } from '../../../store';
import {
  listDefects, createDefect, subscribeToProjectDefects,
  type Defect, type DefectSeverity,
} from '../../../lib/api/defects';
import type { Order, OrderLineItem, OrderStatus } from '../types';

interface InventoryTabProps {
  project: Project;
  zones: Zone[];
  canEdit: boolean;
  canDelete: boolean;
  onJumpToOrders?: () => void;
}

// One inventory row per order line item. The fields that matter to "what's on
// site" come from the line item; supplier / order / zone / status come from the
// parent order. `key` doubles as the defect lookup key (`orderId:lineItemId`).
interface InventoryRow {
  key: string;
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
  lineItemId: string;
  poNumber: string;
}

type StockFilter = 'all' | 'on_order' | 'partial' | 'on_site';
const STOCK_FILTERS: { id: StockFilter; label: string }[] = [
  { id: 'all',      label: 'All items' },
  { id: 'on_order', label: 'On order' },
  { id: 'partial',  label: 'Partial' },
  { id: 'on_site',  label: 'On site' },
];

// Order + defect statuses mapped onto the shared warm tone scale.
const STATUS_TONE: Record<OrderStatus, ToneKey> = {
  draft: 'slate', submitted: 'slate', confirmed: 'sage', partial: 'amber', received: 'sage', cancelled: 'red',
};
const SEVERITY_TONE: Record<DefectSeverity, ToneKey> = {
  critical: 'red', high: 'orange', medium: 'amber', low: 'slate',
};
const SEVERITY_RANK: Record<DefectSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 };

const fmtUSD = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

const outstandingOf = (ds: Defect[]) => ds.filter((d) => d.status !== 'verified');
function topSeverity(ds: Defect[]): DefectSeverity {
  return ds.reduce<DefectSeverity>(
    (acc, d) => (SEVERITY_RANK[d.severity] < SEVERITY_RANK[acc] ? d.severity : acc),
    'low',
  );
}

// The Materials ledger. Inventory rows derive from procurement (orders) and are
// read-only here; the one write is raising a QA defect against a material
// (migration 43). Presented as a register in the same warm logbook as the Site
// Diary, with the Defect register one tab over.
export function InventoryTab({ project, zones, canEdit, canDelete, onJumpToOrders }: InventoryTabProps) {
  const orders = useOrdersForProject(project.id);
  const currentUser = useAppStore((s) => s.currentUser);
  const setNotification = useAppStore((s) => s.setNotification);

  // Defects linked to this project's materials — loaded + kept live here,
  // independently of the Defect register (same hydrate + realtime pattern).
  const [defects, setDefects] = useState<Defect[]>([]);
  useEffect(() => {
    let cancelled = false;
    void listDefects(project.id)
      .then((d) => { if (!cancelled) setDefects(d); })
      .catch(() => { /* empty in mock mode / on error */ });
    const unsub = subscribeToProjectDefects(project.id, {
      onInsert: (d) => setDefects((p) => (p.some((x) => x.id === d.id) ? p : [d, ...p])),
      onUpdate: (d) => setDefects((p) => p.map((x) => (x.id === d.id ? d : x))),
      onDelete: (id) => setDefects((p) => p.filter((x) => x.id !== id)),
    });
    return () => { cancelled = true; unsub(); };
  }, [project.id]);

  const defectsByKey = useMemo(() => {
    const m = new Map<string, Defect[]>();
    for (const d of defects) {
      if (!d.orderId || !d.lineItemId) continue;
      const k = `${d.orderId}:${d.lineItemId}`;
      const arr = m.get(k);
      if (arr) arr.push(d); else m.set(k, [d]);
    }
    return m;
  }, [defects]);

  const zoneById = useMemo(() => new Map(zones.map((z) => [z.id, z.name])), [zones]);

  const rows = useMemo<InventoryRow[]>(() => {
    const out: InventoryRow[] = [];
    for (const order of orders as Order[]) {
      if (order.status === 'cancelled') continue;
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
          lineItemId: li.id,
          poNumber: order.poNumber,
        });
      }
    }
    return out;
  }, [orders, zoneById]);

  const [search, setSearch] = useState('');
  const [zoneFilter, setZoneFilter] = useState('');
  const [stock, setStock] = useState<StockFilter>('all');
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [reportTarget, setReportTarget] = useState<InventoryRow | null>(null);
  const [view, setView] = useState<'stock' | 'defects'>('stock');

  const toggleExpand = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });

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

  const totals = useMemo(() => {
    const onOrder = rows.filter((r) => r.qtyReceived === 0).length;
    const partial = rows.filter((r) => r.qtyReceived > 0 && r.qtyReceived < r.qtyOrdered).length;
    const onSite  = rows.filter((r) => r.qtyReceived >= r.qtyOrdered).length;
    const valueOnOrder = rows
      .filter((r) => r.qtyReceived < r.qtyOrdered)
      .reduce((sum, r) => sum + (r.qtyOrdered - r.qtyReceived) * r.unitCost, 0);
    return { onOrder, partial, onSite, valueOnOrder };
  }, [rows]);

  const supplierCount = useMemo(() => new Set(rows.map((r) => r.supplierName)).size, [rows]);
  const defectiveCount = useMemo(
    () => rows.filter((r) => outstandingOf(defectsByKey.get(r.key) ?? []).length > 0).length,
    [rows, defectsByKey],
  );
  const openDefects = useMemo(() => defects.filter((d) => d.status !== 'verified').length, [defects]);

  const handleReport = async (input: { title: string; description?: string; severity: DefectSeverity }) => {
    if (!reportTarget) return;
    const target = reportTarget;
    const created = await createDefect(project.id, {
      ...input,
      orderId: target.orderId,
      lineItemId: target.lineItemId,
      createdBy: currentUser?.id ?? 'system',
    });
    setDefects((p) => (p.some((x) => x.id === created.id) ? p : [created, ...p]));
    setExpanded((prev) => new Set(prev).add(target.key));
    setNotification({ message: `Defect logged against “${target.description}”.`, type: 'success' });
    setReportTarget(null);
  };

  return (
    <div className="editorial-root">
      {/* Register switcher — Stock vs the Defect register (folded in from the old top-level tab). */}
      <div className="mb-4 inline-flex items-center gap-1 rounded-full border border-[#E6E1D4] bg-white p-1 shadow-[0_1px_2px_rgba(20,20,20,0.04)]">
        {([['stock', 'Stock', Boxes], ['defects', 'Defects', Bug]] as const).map(([id, label, Icon]) => {
          const isActive = view === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setView(id)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
                isActive ? 'bg-[#1A1A1A] text-white' : 'text-[#6B6B6B] hover:bg-[#FAF8F2] hover:text-[#1A1A1A]'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
              {id === 'defects' && openDefects > 0 && (
                <span className={`ml-0.5 rounded-full px-1.5 text-[10px] font-bold tabular-nums ${
                  isActive ? 'bg-white/20 text-white' : 'bg-[#FBE5E5] text-[#C44545]'
                }`}>
                  {openDefects}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {view === 'defects' && (
        <DefectsBoard project={project} canEdit={canEdit} canDelete={canDelete} />
      )}

      {view === 'stock' && (
      <>
        <LedgerHeader
          kicker="INV"
          icon={Layers}
          eyebrow={`Materials ledger · ${project.name}`}
          title="On order, on site."
          meta={
            <>
              {rows.length} line item{rows.length === 1 ? '' : 's'} · {supplierCount} supplier{supplierCount === 1 ? '' : 's'}
              <span className="mx-2 text-[#A0A0A0]">·</span>
              <span className="font-medium text-[#246F47]">read-only — manage in Orders</span>
            </>
          }
          actions={
            canEdit && onJumpToOrders ? (
              <button type="button" onClick={onJumpToOrders} className={btnGhost}>
                <ShoppingCart className="h-3.5 w-3.5" />
                Manage in Orders
              </button>
            ) : null
          }
        />

        <LedgerStatRow
          stats={[
            { value: totals.onOrder, label: 'On order', sub: 'awaiting delivery', tone: 'slate' },
            { value: totals.partial, label: 'Partial',  sub: 'part-received',     tone: 'amber' },
            { value: totals.onSite,  label: 'On site',   sub: 'fully received',    tone: 'sage' },
            { value: fmtUSD(totals.valueOnOrder), label: 'Open value', sub: 'not yet on site', tone: 'ink' },
            { value: defectiveCount, label: 'Defective', sub: 'materials w/ open defects', tone: 'red' },
          ]}
        />

        {/* Filter row */}
        <div className={`mb-4 flex flex-col gap-3 p-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between ${cardShell}`}>
          <div className="-mx-1 overflow-x-auto px-1">
            <div className="inline-flex items-center gap-1">
              {STOCK_FILTERS.map((f) => {
                const active = stock === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setStock(f.id)}
                    className={`flex-shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
                      active ? 'bg-[#1A1A1A] text-white' : 'text-[#6B6B6B] hover:bg-[#FAF8F2] hover:text-[#1A1A1A]'
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
                className="h-9 rounded-full border border-[#E6E1D4] bg-white px-3.5 text-[13px] text-[#3A3A3A] focus:border-[#2F8F5C] focus:outline-none"
              >
                <option value="">All zones</option>
                {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
              </select>
            )}
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A0A0A0]" />
              <input
                placeholder="Item, supplier, PO…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 w-full rounded-full border border-[#E6E1D4] bg-white pl-10 pr-3 text-[13px] text-[#3A3A3A] placeholder:text-[#A0A0A0] focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]/30"
              />
            </div>
          </div>
        </div>

        {/* The ledger */}
        {filtered.length === 0 ? (
          <EmptyLedger
            title={rows.length === 0 ? 'Nothing on order yet.' : 'No items match your filters.'}
            body={
              rows.length === 0
                ? (canEdit ? 'Create an order under Supplier → Orders to start tracking inventory.'
                           : 'Once orders are placed, line items roll up here automatically.')
                : 'Try a different filter or clear the search.'
            }
          />
        ) : (
          <>
            {/* Mobile cards */}
            <ul className="space-y-2.5 md:hidden">
              {filtered.map((r) => {
                const rowDefects = defectsByKey.get(r.key) ?? [];
                const isOpen = expanded.has(r.key);
                return (
                  <li key={r.key} className={`px-4 py-3.5 ${cardShell}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] font-semibold text-[#1A1A1A]">{r.description}</p>
                        <p className="truncate text-[12px] text-[#6B6B6B]">
                          {r.supplierName}{r.zoneName && <> · {r.zoneName}</>} · PO {r.poNumber}
                        </p>
                      </div>
                      <StatusPill tone={STATUS_TONE[r.orderStatus]} className="flex-shrink-0 capitalize">
                        {r.orderStatus.replace('_', ' ')}
                      </StatusPill>
                    </div>
                    <div className="mt-2.5 flex items-center justify-between text-[12.5px] text-[#3A3A3A]">
                      <span className="tabular-nums">
                        <span className="font-semibold text-[#1A1A1A]">{r.qtyReceived}</span>/{r.qtyOrdered} {r.unit}
                      </span>
                      <span className="tabular-nums text-[#6B6B6B]">{fmtUSD(r.qtyOrdered * r.unitCost)}</span>
                    </div>
                    <div className="mt-2.5 flex items-center justify-between border-t border-[#EFEBE0] pt-2.5">
                      <DefectChip defects={rowDefects} open={isOpen} onClick={() => toggleExpand(r.key)} />
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => setReportTarget(r)}
                          className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#6B6B6B] hover:text-[#C44545]"
                        >
                          <Plus className="h-3 w-3" /> Report defect
                        </button>
                      )}
                    </div>
                    {isOpen && rowDefects.length > 0 && (
                      <div className="mt-2.5 rounded-[10px] bg-[#FAF8F2] p-2.5">
                        <DefectList defects={rowDefects} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>

            {/* Desktop register */}
            <div className={`hidden overflow-hidden md:block ${cardShell}`}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-left text-[13px]">
                  <thead>
                    <tr className="border-b border-[#E6E1D4] bg-[#FAF8F2] text-[11px] font-semibold uppercase tracking-[0.1em] text-[#6B6B6B]">
                      <th className="px-5 py-3">Item</th>
                      <th className="px-5 py-3">Supplier</th>
                      <th className="px-5 py-3">Zone</th>
                      <th className="px-5 py-3 text-right">Received</th>
                      <th className="px-5 py-3 text-right">Ordered</th>
                      <th className="px-5 py-3 text-right">Value</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3">Quality</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r) => {
                      const rowDefects = defectsByKey.get(r.key) ?? [];
                      const isOpen = expanded.has(r.key);
                      return (
                        <Fragment key={r.key}>
                          <tr className="border-b border-[#EFEBE0] transition-colors last:border-b-0 hover:bg-[#FAF8F2]">
                            <td className="px-5 py-3.5">
                              <p className="font-semibold text-[#1A1A1A]">{r.description}</p>
                              <p className="text-[11.5px] text-[#A0A0A0]">PO {r.poNumber}</p>
                            </td>
                            <td className="px-5 py-3.5 text-[#3A3A3A]">{r.supplierName}</td>
                            <td className="px-5 py-3.5 text-[#3A3A3A]">{r.zoneName ?? '—'}</td>
                            <td className="px-5 py-3.5 text-right tabular-nums text-[#1A1A1A]">{r.qtyReceived} {r.unit}</td>
                            <td className="px-5 py-3.5 text-right tabular-nums text-[#3A3A3A]">{r.qtyOrdered} {r.unit}</td>
                            <td className="px-5 py-3.5 text-right tabular-nums text-[#3A3A3A]">{fmtUSD(r.qtyOrdered * r.unitCost)}</td>
                            <td className="px-5 py-3.5">
                              <StatusPill tone={STATUS_TONE[r.orderStatus]} className="capitalize">
                                {r.orderStatus.replace('_', ' ')}
                              </StatusPill>
                            </td>
                            <td className="px-5 py-3.5">
                              <div className="flex items-center gap-2">
                                <DefectChip defects={rowDefects} open={isOpen} onClick={() => toggleExpand(r.key)} />
                                {canEdit && (
                                  <button
                                    type="button"
                                    onClick={() => setReportTarget(r)}
                                    className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[#A0A0A0] transition-colors hover:bg-[#FBE5E5] hover:text-[#C44545]"
                                    aria-label={`Report a defect on ${r.description}`}
                                    title="Report defect"
                                  >
                                    <Plus className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                          {isOpen && rowDefects.length > 0 && (
                            <tr className="border-b border-[#EFEBE0] bg-[#FAF8F2]">
                              <td colSpan={8} className="px-5 py-3"><DefectList defects={rowDefects} /></td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </>
      )}

      {reportTarget && (
        <ReportDefectModal material={reportTarget} onClose={() => setReportTarget(null)} onCreate={handleReport} />
      )}
    </div>
  );
}

// ─── Inline defect UI (warm register language) ──────────────────────────────

function DefectChip({ defects, open, onClick }: { defects: Defect[]; open: boolean; onClick: () => void }) {
  if (defects.length === 0) return <span className="text-[12px] text-[#C9C3B4]">—</span>;
  const outstanding = outstandingOf(defects);
  if (outstanding.length === 0) {
    return (
      <button type="button" onClick={onClick} aria-expanded={open} className="inline-flex">
        <StatusPill tone="sage"><CheckCircle2 className="h-3 w-3" /> Resolved</StatusPill>
      </button>
    );
  }
  const t = TONE[SEVERITY_TONE[topSeverity(outstanding)]];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ backgroundColor: t.bg, color: t.fg }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: t.dot }} />
      {outstanding.length} {outstanding.length === 1 ? 'defect' : 'defects'}
    </button>
  );
}

function DefectList({ defects }: { defects: Defect[] }) {
  const sorted = [...defects].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
  return (
    <ul className="space-y-2">
      {sorted.map((d) => (
        <li key={d.id} className="flex items-start gap-2.5 text-[12.5px]">
          <StatusPill tone={SEVERITY_TONE[d.severity]} className="mt-0.5 flex-shrink-0 uppercase tracking-wider">
            {d.severity}
          </StatusPill>
          <span className="min-w-0 flex-1">
            <span className="font-semibold text-[#1A1A1A]">{d.title}</span>
            {d.description && <span className="mt-0.5 block text-[11.5px] leading-relaxed text-[#6B6B6B]">{d.description}</span>}
          </span>
          <span className="flex-shrink-0 text-[10px] uppercase tracking-wider text-[#A0A0A0]">{d.status}</span>
        </li>
      ))}
    </ul>
  );
}

function EmptyLedger({ title, body }: { title: string; body: string }) {
  return (
    <div className={`px-6 py-16 text-center ${cardShell}`}>
      <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-[#FAF8F2] text-[#2F8F5C]">
        <Layers className="h-7 w-7" strokeWidth={1.5} />
      </div>
      <h3 className="text-[22px] font-medium text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>{title}</h3>
      <p className="mx-auto mt-2 max-w-sm text-[13px] text-[#6B6B6B]">{body}</p>
    </div>
  );
}

function ReportDefectModal({
  material, onClose, onCreate,
}: {
  material: InventoryRow;
  onClose: () => void;
  onCreate: (input: { title: string; description?: string; severity: DefectSeverity }) => Promise<void>;
}) {
  const [title, setTitle] = useState(`Defect — ${material.description}`);
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<DefectSeverity>('medium');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return setError('A title is required.');
    setSaving(true);
    setError(null);
    try {
      await onCreate({ title: title.trim(), description: description.trim() || undefined, severity });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not log defect.');
      setSaving(false);
    }
  };

  return (
    <div className="editorial-root fixed inset-0 z-50 grid place-items-center bg-[#1A1A1A]/40 p-4 backdrop-blur-sm">
      <div className="flex w-full max-w-lg flex-col overflow-hidden rounded-[14px] border border-[#E6E1D4] bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-[#EFEBE0] px-6 py-5">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6B6B6B]">Quality · Materials ledger</p>
            <h2 className="mt-1 text-[22px] font-medium text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>Report a defect</h2>
            <p className="mt-1 truncate text-[12.5px] text-[#6B6B6B]">{material.supplierName} · PO {material.poNumber}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-2 text-[#6B6B6B] hover:bg-[#FAF8F2]">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4 px-6 py-5">
          <Field label="Title">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="block w-full rounded-[10px] border border-[#E6E1D4] bg-white px-3 py-2 text-[13.5px] text-[#1A1A1A] focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]/30"
              placeholder="e.g. 30% of drywall sheets water-damaged"
            />
          </Field>
          <Field label="Description" optional>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="block w-full rounded-[10px] border border-[#E6E1D4] bg-white px-3 py-2 text-[13.5px] text-[#3A3A3A] focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]/30"
              placeholder="What's wrong with this material, and what does 'fixed' look like?"
            />
          </Field>
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.1em] text-[#6B6B6B]">Severity</label>
            <div className="flex flex-wrap gap-2">
              {(['low', 'medium', 'high', 'critical'] as DefectSeverity[]).map((s) => {
                const active = severity === s;
                const t = TONE[SEVERITY_TONE[s]];
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSeverity(s)}
                    aria-pressed={active}
                    className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-semibold capitalize transition-colors"
                    style={active
                      ? { backgroundColor: t.bg, color: t.fg, borderColor: t.dot }
                      : { backgroundColor: '#fff', color: '#6B6B6B', borderColor: '#E6E1D4' }}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ background: t.dot }} />
                    {s}
                  </button>
                );
              })}
            </div>
          </div>

          {error && (
            <p className="flex items-center gap-1.5 rounded-[10px] border border-[#F3CFCF] bg-[#FBE5E5] px-3 py-2 text-[12px] text-[#C44545]">
              <AlertTriangle className="h-3.5 w-3.5" /> {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} disabled={saving} className={btnGhost}>Cancel</button>
            <button type="submit" disabled={saving || !title.trim()} className={btnPrimary}>
              {saving ? 'Logging…' : 'Log defect'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, optional, children }: { label: string; optional?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.1em] text-[#6B6B6B]">
        {label}{optional && <span className="ml-1 font-normal normal-case tracking-normal text-[#A0A0A0]">(optional)</span>}
      </label>
      {children}
    </div>
  );
}

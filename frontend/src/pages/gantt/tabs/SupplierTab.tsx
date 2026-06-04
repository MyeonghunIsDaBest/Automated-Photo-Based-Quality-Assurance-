import { useEffect, useMemo, useState } from 'react';
import { Receipt, ShieldCheck, ShoppingCart, Truck, type LucideIcon } from 'lucide-react';
import type { Project } from '../../../types';
import { LedgerHeader, LedgerStatRow } from '../components/ledger';
import { useGanttSideStore, useOrdersForProject } from '../store';
import { supabaseConfigured } from '../../../lib/supabase';
import { listOrders, subscribeToProjectOrders } from '../../../lib/api/orders';
import { listDeliveries, subscribeToProjectDeliveries } from '../../../lib/api/deliveries';
import { listInvoices, subscribeToProjectInvoices } from '../../../lib/api/invoices';
import { OrdersTab } from './OrdersTab';
import { DeliveriesTab } from './DeliveriesTab';
import { InvoicesTab } from './InvoicesTab';
import { WarrantiesTab } from './WarrantiesTab';

// Deep-link targets accepted from outside (e.g. Overview cards). The merged
// Invoices section also covers warranties, so 'warranties' resolves to the
// 'invoices' section with the warranty view pre-selected.
type InitialSection = 'orders' | 'deliveries' | 'invoices' | 'warranties';

interface SupplierTabProps {
  project: Project;
  canEdit: boolean;
  canDelete: boolean;
  initialSection?: InitialSection;
}

type SupplierSection = 'orders' | 'deliveries' | 'invoices';
type InvoiceView = 'invoices' | 'warranties';

const SECTIONS: { id: SupplierSection; label: string; icon: LucideIcon }[] = [
  { id: 'orders',     label: 'Orders',                 icon: ShoppingCart },
  { id: 'deliveries', label: 'Deliveries',             icon: Truck },
  { id: 'invoices',   label: 'Invoices & Warranties',  icon: Receipt },
];

// Pill-row class helpers — shared by the section nav and the invoice/warranty
// toggle so both read identically to the Inventory register's sub-nav.
const navPill = (active: boolean) =>
  `inline-flex flex-shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
    active ? 'bg-[#1A1A1A] text-white' : 'text-[#6B6B6B] hover:bg-[#FAF8F2] hover:text-[#1A1A1A]'
  }`;
const navCount = (active: boolean) =>
  `ml-0.5 rounded-full px-1.5 text-[10px] font-bold tabular-nums ${active ? 'bg-white/20 text-white' : 'bg-[#F0EDE4] text-[#6B6B6B]'}`;

// Merged Supplier tab — the procurement register: orders, deliveries, and the
// bills + warranties they generate, in one warm logbook surface that matches
// the Inventory and Defect registers. Each sub-section reuses its existing tab
// component (with `hideHeader`) so the underlying logic / drawers / wizards stay
// exactly as they were.
export function SupplierTab({
  project, canEdit, canDelete, initialSection = 'orders',
}: SupplierTabProps) {
  const [section, setSection] = useState<SupplierSection>(
    initialSection === 'warranties' ? 'invoices' : initialSection,
  );
  const [invoiceView, setInvoiceView] = useState<InvoiceView>(
    initialSection === 'warranties' ? 'warranties' : 'invoices',
  );

  // Whole-slice reads + useMemo project scoping (a `s.x?.[id] ?? []` selector
  // allocates a fresh array per render → infinite re-render loop).
  const orders        = useOrdersForProject(project.id);
  const allDeliveries = useGanttSideStore((s) => s.deliveries);
  const allInvoices   = useGanttSideStore((s) => s.invoices);
  const allWarranties = useGanttSideStore((s) => s.warranties);

  // Hydrate the procurement slices once at the merged-tab level + keep live —
  // covers every sub-tab AND the pill badge counts. (Warranties self-hydrate
  // in WarrantiesTab.)
  useEffect(() => {
    if (!supabaseConfigured()) return;
    const store = () => useGanttSideStore.getState();
    let cancelled = false;
    void listOrders(project.id).then((r) => { if (!cancelled) store().setOrdersForProject(project.id, r); }).catch(() => void 0);
    void listDeliveries(project.id).then((r) => { if (!cancelled) store().setDeliveriesForProject(project.id, r); }).catch(() => void 0);
    void listInvoices(project.id).then((r) => { if (!cancelled) store().setInvoicesForProject(project.id, r); }).catch(() => void 0);
    const unsubO = subscribeToProjectOrders(project.id, {
      onUpsert: (o) => store().upsertOrderFromRemote(project.id, o),
      onDelete: (id) => store().setOrdersForProject(project.id, (store().orders[project.id] ?? []).filter((o) => o.id !== id)),
    });
    const unsubD = subscribeToProjectDeliveries(project.id, {
      onUpsert: (d) => store().upsertDeliveryFromRemote(project.id, d),
      onDelete: (id) => store().setDeliveriesForProject(project.id, (store().deliveries[project.id] ?? []).filter((d) => d.id !== id)),
    });
    const unsubI = subscribeToProjectInvoices(project.id, {
      onUpsert: (i) => store().upsertInvoiceFromRemote(project.id, i),
      onDelete: (id) => store().setInvoicesForProject(project.id, (store().invoices[project.id] ?? []).filter((i) => i.id !== id)),
    });
    return () => { cancelled = true; unsubO(); unsubD(); unsubI(); };
  }, [project.id]);

  const deliveries = useMemo(() => allDeliveries?.[project.id] ?? [], [allDeliveries, project.id]);
  const invoices   = useMemo(() => allInvoices?.[project.id]   ?? [], [allInvoices,   project.id]);
  const warranties = useMemo(() => allWarranties?.[project.id] ?? [], [allWarranties, project.id]);

  const warrantiesSoon = useMemo(() => {
    const cutoff = Date.now() + 30 * 24 * 3600 * 1000;
    return warranties.filter((w) => {
      const exp = Date.parse(w.expiryDate);
      return Number.isFinite(exp) && exp <= cutoff;
    }).length;
  }, [warranties]);

  const ordersOpen     = useMemo(() => orders.filter((o) => o.status !== 'received' && o.status !== 'cancelled').length, [orders]);
  const invoicesUnpaid = useMemo(() => invoices.filter((i) => i.status !== 'paid').length, [invoices]);

  const counts = useMemo<Record<SupplierSection, number>>(() => ({
    orders:     ordersOpen,
    deliveries: deliveries.length,
    invoices:   invoicesUnpaid + warrantiesSoon,
  }), [ordersOpen, deliveries, invoicesUnpaid, warrantiesSoon]);

  return (
    <div className="editorial-root">
      <LedgerHeader
        kicker="SUP"
        icon={ShoppingCart}
        eyebrow={`Procurement register · ${project.name}`}
        title="The supply side."
        meta={
          <>
            {ordersOpen} open order{ordersOpen === 1 ? '' : 's'} · {invoicesUnpaid} unpaid
            <span className="mx-2 text-[#A0A0A0]">·</span>
            <span className="text-[#A0A0A0]">orders → deliveries → bills → warranties</span>
          </>
        }
      />

      <LedgerStatRow
        stats={[
          { value: ordersOpen,        label: 'Open orders', sub: 'in progress',          tone: 'slate' },
          { value: deliveries.length, label: 'Deliveries',  sub: 'logged',               tone: 'ink' },
          { value: invoicesUnpaid,    label: 'Unpaid',      sub: 'invoices outstanding', tone: 'amber' },
          { value: warrantiesSoon,    label: 'Warranties',  sub: 'expiring ≤ 30 days',   tone: 'sage' },
        ]}
      />

      {/* Section nav — horizontal-scrolls on phones. */}
      <div className="mb-4 -mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:overflow-visible sm:px-0">
        <div className="inline-flex items-center gap-1 rounded-full border border-[#E6E1D4] bg-white p-1 shadow-[0_1px_2px_rgba(20,20,20,0.04)]">
          {SECTIONS.map((sec) => {
            const Icon = sec.icon;
            const isActive = section === sec.id;
            const count = counts[sec.id];
            return (
              <button key={sec.id} type="button" onClick={() => setSection(sec.id)} className={navPill(isActive)}>
                <Icon className="h-3.5 w-3.5" />
                <span className="whitespace-nowrap">{sec.label}</span>
                {count > 0 && <span className={navCount(isActive)}>{count}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {section === 'orders' && (
        <OrdersTab project={project} canEdit={canEdit} canDelete={canDelete} hideHeader />
      )}
      {section === 'deliveries' && (
        <DeliveriesTab project={project} canEdit={canEdit} hideHeader />
      )}
      {section === 'invoices' && (
        <>
          {/* Inner toggle — bills vs the coverage they generate. */}
          <div className="mb-4 inline-flex items-center gap-1 rounded-full border border-[#E6E1D4] bg-white p-1 shadow-[0_1px_2px_rgba(20,20,20,0.04)]">
            {([
              { id: 'invoices',   label: 'Invoices',   icon: Receipt,     count: invoicesUnpaid },
              { id: 'warranties', label: 'Warranties', icon: ShieldCheck, count: warrantiesSoon },
            ] as const).map((view) => {
              const Icon = view.icon;
              const isActive = invoiceView === view.id;
              return (
                <button key={view.id} type="button" onClick={() => setInvoiceView(view.id)} className={navPill(isActive)}>
                  <Icon className="h-3.5 w-3.5" />
                  {view.label}
                  {view.count > 0 && <span className={navCount(isActive)}>{view.count}</span>}
                </button>
              );
            })}
          </div>

          {invoiceView === 'invoices' ? (
            <InvoicesTab project={project} canEdit={canEdit} canDelete={canDelete} hideHeader />
          ) : (
            <WarrantiesTab project={project} canEdit={canEdit} hideHeader />
          )}
        </>
      )}
    </div>
  );
}

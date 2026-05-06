import { useMemo, useState } from 'react';
import {
  DollarSign, Receipt, ShieldCheck, ShoppingCart, Truck,
  type LucideIcon,
} from 'lucide-react';
import type { Project } from '../../../types';
import { TabHeader } from '../components/TabHeader';
import { useGanttSideStore, useOrdersForProject } from '../store';
import { OrdersTab } from './OrdersTab';
import { DeliveriesTab } from './DeliveriesTab';
import { InvoicesTab } from './InvoicesTab';
import { WarrantiesTab } from './WarrantiesTab';

// Deep-link targets accepted from outside (e.g. Overview cards). Internally
// the merged Invoices section also covers warranties, so 'warranties' is
// allowed but resolves to the 'invoices' section with the warranty view
// pre-selected.
type InitialSection = 'orders' | 'deliveries' | 'invoices' | 'warranties';

interface SupplierTabProps {
  project: Project;
  canEdit: boolean;
  canDelete: boolean;
  // Optional pre-selected sub-section. Used by Overview's deep links so a
  // click on "Orders" → 3 open from the briefing lands on the Orders pane,
  // and "Invoices" → outstanding lands on the Invoices pane.
  initialSection?: InitialSection;
}

// Three top-level sub-pills now. Invoices and warranties merged because
// every warranty originates from a paid invoice — the bill carries the
// complete order details, and once an invoice is paid the order can
// progress through the delivery lifecycle. Keeping them in two pills was
// asking users to bounce back and forth for one workflow.
type SupplierSection = 'orders' | 'deliveries' | 'invoices';

// Internal toggle for the merged Invoices & Warranties section.
type InvoiceView = 'invoices' | 'warranties';

const SECTIONS: { id: SupplierSection; label: string; icon: LucideIcon }[] = [
  { id: 'orders',     label: 'Orders',                 icon: ShoppingCart },
  { id: 'deliveries', label: 'Deliveries',             icon: Truck },
  { id: 'invoices',   label: 'Invoices & Warranties',  icon: Receipt },
];

// Merged Supplier tab — every supplier-facing surface in one place. Each
// sub-section reuses its existing tab component (with `hideHeader` set so
// only this tab's editorial header renders) so the underlying logic / drawers
// / wizards stay exactly as the dedicated tabs had them. The merge is purely
// navigational; no behaviour change to the four feature areas.
export function SupplierTab({
  project, canEdit, canDelete, initialSection = 'orders',
}: SupplierTabProps) {
  // Resolve legacy 'warranties' deep-links onto the merged invoices section
  // and remember the requested view so the inner toggle opens correctly.
  const [section, setSection] = useState<SupplierSection>(
    initialSection === 'warranties' ? 'invoices' : initialSection,
  );
  const [invoiceView, setInvoiceView] = useState<InvoiceView>(
    initialSection === 'warranties' ? 'warranties' : 'invoices',
  );

  // Counts for the sub-pill badges. Read each whole side-store slice and
  // derive the project-scoped array via useMemo — selectors that return
  // `s.deliveries?.[id] ?? []` allocate a fresh `[]` per render when the
  // project has no deliveries yet, which Zustand sees as a new value,
  // re-renders, runs the selector again, infinite loop ("Maximum update
  // depth exceeded"). The whole-slice reference is stable until the
  // store mutates. (Same fix landed earlier in Gantt.tsx.)
  const orders        = useOrdersForProject(project.id);
  const allDeliveries = useGanttSideStore((s) => s.deliveries);
  const allInvoices   = useGanttSideStore((s) => s.invoices);
  const allWarranties = useGanttSideStore((s) => s.warranties);

  const deliveries = useMemo(() => allDeliveries?.[project.id] ?? [], [allDeliveries, project.id]);
  const invoices   = useMemo(() => allInvoices?.[project.id]   ?? [], [allInvoices,   project.id]);
  const warranties = useMemo(() => allWarranties?.[project.id] ?? [], [allWarranties, project.id]);

  // Warranties expiring within 30 days act as the warranty "needs attention"
  // signal, mirroring the Overview tile. Combined with unpaid invoices for
  // the merged section's badge so users see both bill and coverage pressure
  // in one number.
  const warrantiesSoon = useMemo(() => {
    const cutoff = Date.now() + 30 * 24 * 3600 * 1000;
    return warranties.filter((w) => {
      const exp = Date.parse(w.expiryDate);
      return Number.isFinite(exp) && exp <= cutoff;
    }).length;
  }, [warranties]);

  const counts = useMemo<Record<SupplierSection, number>>(() => ({
    orders:     orders.filter((o) => o.status !== 'received' && o.status !== 'cancelled').length,
    deliveries: deliveries.length,
    invoices:   invoices.filter((i) => i.status !== 'paid').length + warrantiesSoon,
  }), [orders, deliveries, invoices, warrantiesSoon]);

  // One-line briefing line that summarises the merged scope without
  // duplicating the inner tabs' descriptions.
  const description =
    `Procurement end-to-end: orders, deliveries, and the bills + warranties ` +
    `they generate — everything the supply side of this project produces.`;

  return (
    <>
      <TabHeader
        eyebrow={`Workspace · Supplier · ${project.name}`}
        title="The supply side."
        description={description}
        action={
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <DollarSign className="h-3.5 w-3.5" />
            <span className="whitespace-nowrap">
              {counts.orders} open · {counts.invoices} unpaid
            </span>
          </div>
        }
      />

      {/* Sub-pill nav. Horizontal-scrolls on phones (4 pills + counts won't */}
      {/* fit on a 360px viewport without scroll).                            */}
      <div className="mb-5 -mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:overflow-visible sm:px-0">
        <div className="inline-flex items-center gap-1 rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
          {SECTIONS.map((sec) => {
            const Icon = sec.icon;
            const isActive = section === sec.id;
            const count = counts[sec.id];
            return (
              <button
                key={sec.id}
                type="button"
                onClick={() => setSection(sec.id)}
                className={`flex flex-shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 active:bg-slate-100'
                }`}
              >
                <Icon className="h-4 w-4" />
                {sec.label}
                {count > 0 && (
                  <span
                    className={`tabular-nums rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                      isActive ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Active section — each existing tab carries its own state, modals,
          and drawers. `hideHeader` suppresses the per-tab editorial header
          so we don't double-stack with the SupplierTab's own header above. */}
      {section === 'orders' && (
        <OrdersTab
          project={project}
          canEdit={canEdit}
          canDelete={canDelete}
          hideHeader
        />
      )}
      {section === 'deliveries' && (
        <DeliveriesTab
          project={project}
          canEdit={canEdit}
          hideHeader
        />
      )}
      {section === 'invoices' && (
        <>
          {/* Inner segmented toggle — flip between the bills view and the
              coverage view without leaving the merged section. Warranties
              auto-spawn from paid invoices, so they live alongside their
              source documents rather than in a separate top-level tab. */}
          <div className="mb-4 inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
            {([
              { id: 'invoices',   label: 'Invoices',   icon: Receipt,      count: invoices.filter((i) => i.status !== 'paid').length },
              { id: 'warranties', label: 'Warranties', icon: ShieldCheck,  count: warrantiesSoon },
            ] as const).map((view) => {
              const Icon = view.icon;
              const isActive = invoiceView === view.id;
              return (
                <button
                  key={view.id}
                  type="button"
                  onClick={() => setInvoiceView(view.id)}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    isActive
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {view.label}
                  {view.count > 0 && (
                    <span
                      className={`tabular-nums rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                        isActive ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {view.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {invoiceView === 'invoices' ? (
            <InvoicesTab
              project={project}
              canEdit={canEdit}
              canDelete={canDelete}
              hideHeader
            />
          ) : (
            <WarrantiesTab
              project={project}
              canEdit={canEdit}
              hideHeader
            />
          )}
        </>
      )}
    </>
  );
}

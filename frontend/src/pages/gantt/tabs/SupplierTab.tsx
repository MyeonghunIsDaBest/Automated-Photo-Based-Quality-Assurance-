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

interface SupplierTabProps {
  project: Project;
  canEdit: boolean;
  canDelete: boolean;
  // Optional pre-selected sub-section. Used by Overview's deep links so a
  // click on "Orders" → 3 open from the briefing lands on the Orders pane,
  // and "Invoices" → outstanding lands on the Invoices pane.
  initialSection?: SupplierSection;
}

type SupplierSection = 'orders' | 'deliveries' | 'invoices' | 'warranties';

const SECTIONS: { id: SupplierSection; label: string; icon: LucideIcon }[] = [
  { id: 'orders',     label: 'Orders',     icon: ShoppingCart },
  { id: 'deliveries', label: 'Deliveries', icon: Truck },
  { id: 'invoices',   label: 'Invoices',   icon: Receipt },
  { id: 'warranties', label: 'Warranties', icon: ShieldCheck },
];

// Merged Supplier tab — every supplier-facing surface in one place. Each
// sub-section reuses its existing tab component (with `hideHeader` set so
// only this tab's editorial header renders) so the underlying logic / drawers
// / wizards stay exactly as the dedicated tabs had them. The merge is purely
// navigational; no behaviour change to the four feature areas.
export function SupplierTab({
  project, canEdit, canDelete, initialSection = 'orders',
}: SupplierTabProps) {
  const [section, setSection] = useState<SupplierSection>(initialSection);

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

  const counts = useMemo<Record<SupplierSection, number>>(() => ({
    orders:     orders.filter((o) => o.status !== 'received' && o.status !== 'cancelled').length,
    deliveries: deliveries.length,
    invoices:   invoices.filter((i) => i.status !== 'paid').length,
    warranties: warranties.length,
  }), [orders, deliveries, invoices, warranties]);

  // One-line briefing line that summarises the merged scope without
  // duplicating the inner tabs' descriptions.
  const description =
    `Procurement end-to-end: orders, deliveries, invoices, and warranties — ` +
    `everything the supply side of this project produces, in one tab.`;

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
        <InvoicesTab
          project={project}
          canEdit={canEdit}
          canDelete={canDelete}
          hideHeader
        />
      )}
      {section === 'warranties' && (
        <WarrantiesTab
          project={project}
          canEdit={canEdit}
          hideHeader
        />
      )}
    </>
  );
}

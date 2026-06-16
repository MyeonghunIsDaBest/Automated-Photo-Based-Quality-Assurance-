// CustomerDetail — shows customer header + properties + request queue for one customer.
// Props: customerId, handlers to navigate to request detail or back to list.

import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Building2,
  Pencil,
  Plus,
  UserPlus,
  AlertTriangle,
  ReceiptText,
} from 'lucide-react';
import { Skeleton, SkeletonLine, SkeletonCard } from '../../components/ui/skeleton';
import { Toaster } from '../../components/ui/Toaster';
import { getCustomer, type Customer } from '../../lib/api/customers';
import { listPropertiesForCustomer, type Property } from '../../lib/api/properties';
import { listAllRequests, type MaintenanceRequestWithContext } from '../../lib/api/maintenanceRequests';
import {
  FRAUNCES, cardShell, LedgerHeader, StatusPill, btnPrimary, btnGhost, TONE,
} from '../gantt/components/ledger';
import { listQuotes, listInvoices } from '../../lib/api/commercial';
import {
  EditCustomerModal,
  CreatePropertyModal,
  EditPropertyModal,
  InvitePortalUserModal,
} from './modals';
import SchedulesSection from './SchedulesSection';

// ─── urgency helpers ──────────────────────────────────────────────────────────

function urgencyTone(u: number) {
  if (u >= 4) return TONE.red;
  if (u === 3) return TONE.amber;
  return TONE.slate;
}

function UrgencyPill({ urgency }: { urgency: number }) {
  const tone = urgencyTone(urgency);
  return (
    <span
      style={{ color: tone.fg, background: tone.bg }}
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
    >
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: tone.dot }}
      />
      U{urgency}
    </span>
  );
}

// ─── status pill ──────────────────────────────────────────────────────────────

const STATUS_TONE: Record<string, keyof typeof TONE> = {
  new: 'amber',
  acknowledged: 'slate',
  scheduled: 'amber',
  completed: 'sage',
  cancelled: 'red',
};

function age(createdAt: string): string {
  const diffMs = Date.now() - new Date(createdAt).getTime();
  const days = Math.floor(diffMs / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return '1 day ago';
  return `${days}d ago`;
}

// ─── component ───────────────────────────────────────────────────────────────

interface CustomerDetailProps {
  customerId: string;
  onBack: () => void;
  onSelectRequest: (id: string) => void;
  /** Called when external realtime update requires a request list refresh. */
  refreshKey?: number;
}

export default function CustomerDetail({
  customerId,
  onBack,
  onSelectRequest,
  refreshKey,
}: CustomerDetailProps) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [requests, setRequests] = useState<MaintenanceRequestWithContext[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [commercialCounts, setCommercialCounts] = useState<{ quotes: number; invoices: number } | null>(null);

  // Modals
  const [showEditCustomer, setShowEditCustomer] = useState(false);
  const [showAddProperty, setShowAddProperty] = useState(false);
  const [editProperty, setEditProperty] = useState<Property | null>(null);
  const [showInvite, setShowInvite] = useState(false);

  const loadAll = () => {
    setLoading(true);
    setLoadError(null);
    Promise.all([
      getCustomer(customerId),
      listPropertiesForCustomer(customerId),
      listAllRequests({ customerId }),
    ])
      .then(([c, props, reqs]) => {
        setCustomer(c);
        setProperties(props);
        setRequests(reqs);
      })
      .catch((err) => {
        setLoadError(err instanceof Error ? err.message : 'Failed to load customer.');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadAll(); }, [customerId]);

  // Commercial counts — two cheap list calls, informational only
  useEffect(() => {
    Promise.all([
      listQuotes({ customerId }),
      listInvoices({ customerId }),
    ])
      .then(([qs, invs]) => setCommercialCounts({ quotes: qs.length, invoices: invs.length }))
      .catch(() => { /* informational — swallow */ });
  }, [customerId]);

  // Respond to realtime refresh triggers from parent
  useEffect(() => {
    if (refreshKey === undefined || refreshKey === 0) return;
    listAllRequests({ customerId })
      .then(setRequests)
      .catch(() => {/* swallow background refresh errors */});
  }, [refreshKey, customerId]);

  if (loadError) {
    return (
      <div
        className="min-h-full bg-[#FAF8F2]"
        style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}
      >
        <div className="mx-auto w-full max-w-[1100px] px-4 py-6 sm:px-8 sm:py-8">
          <div className={`${cardShell} flex flex-col items-center gap-3 px-6 py-16 text-center`}>
            <p className="text-[14px] text-[#C44545]">{loadError}</p>
            <button
              type="button"
              onClick={loadAll}
              className="rounded-md border border-[#E6E1D4] bg-white px-4 py-2 text-[13px] font-medium text-[#3A3A3A] hover:bg-[#FAF8F2]"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (loading || !customer) {
    return (
      <div
        className="min-h-full bg-[#FAF8F2]"
        style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}
      >
        <div className="mx-auto w-full max-w-[1100px] px-4 py-6 sm:px-8 sm:py-8">
          {/* Header block */}
          <div className={`mb-4 overflow-hidden ${cardShell} px-6 py-5`}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 space-y-2">
                <SkeletonLine className="w-16" />
                <Skeleton className="h-7 w-48" />
                <SkeletonLine className="mt-1 w-64" />
              </div>
              <div className="flex gap-2">
                <Skeleton className="h-8 w-28 rounded-full" />
                <Skeleton className="h-8 w-16 rounded-full" />
              </div>
            </div>
          </div>
          {/* Properties + schedules cards */}
          <div className="mb-4 space-y-3">
            <SkeletonCard />
            <SkeletonCard />
          </div>
          {/* Request list rows */}
          <div className={`overflow-hidden ${cardShell}`}>
            <div className="border-b border-[#EFEBE0] px-5 py-3">
              <SkeletonLine className="w-40" />
            </div>
            <div className="divide-y divide-[#EFEBE0]">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3 px-5 py-3">
                  <Skeleton className="h-5 w-10 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <SkeletonLine className="w-2/3" />
                    <SkeletonLine className="w-1/3" />
                  </div>
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-full bg-[#FAF8F2]"
      style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}
    >
      <div className="mx-auto w-full max-w-[1100px] px-4 py-6 sm:px-8 sm:py-8">

        {/* back + header */}
        <button
          type="button"
          onClick={onBack}
          className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-[#6B6B6B] hover:text-[#1A1A1A]"
        >
          <ArrowLeft className="h-4 w-4" /> Back to customers
        </button>

        <LedgerHeader
          kicker="MNT"
          icon={Building2}
          eyebrow="Maintenance · Customer"
          title={customer.name}
          meta={
            <>
              {customer.customerType && (
                <>
                  <span>{customer.customerType}</span>
                  {(customer.primaryContactName || customer.primaryContactEmail || customer.phone) && (
                    <span className="mx-1 text-[#A0A0A0]">·</span>
                  )}
                </>
              )}
              {customer.primaryContactName && (
                <span>{customer.primaryContactName}</span>
              )}
              {customer.primaryContactEmail && (
                <span className="mx-1 text-[#A0A0A0]">·</span>
              )}
              {customer.primaryContactEmail && (
                <span>{customer.primaryContactEmail}</span>
              )}
              {customer.phone && (
                <>
                  <span className="mx-1 text-[#A0A0A0]">·</span>
                  <span>{customer.phone}</span>
                </>
              )}
              {!customer.isActive && (
                <StatusPill tone="red" className="ml-2">Inactive</StatusPill>
              )}
            </>
          }
          actions={
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setShowInvite(true)}
                className={btnGhost}
              >
                <UserPlus className="h-4 w-4" />
                Invite portal user
              </button>
              <button
                type="button"
                onClick={() => setShowEditCustomer(true)}
                className={btnGhost}
              >
                <Pencil className="h-4 w-4" />
                Edit
              </button>
            </div>
          }
        />

        {/* Notes */}
        {customer.notes && (
          <div className={`mb-4 overflow-hidden ${cardShell}`}>
            <div className="px-5 py-3">
              <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[#6B6B6B]">Notes</p>
              <p className="mt-1 text-[13px] text-[#3A3A3A]">{customer.notes}</p>
            </div>
          </div>
        )}

        {/* Properties */}
        <section className={`mb-4 overflow-hidden ${cardShell}`}>
          <div className="flex items-center justify-between border-b border-[#EFEBE0] px-5 py-3">
            <div>
              <h2
                className="text-[16px] font-medium text-[#1A1A1A]"
                style={{ fontFamily: FRAUNCES }}
              >
                Properties
              </h2>
              <p className="text-[12px] text-[#6B6B6B]">{properties.length} registered</p>
            </div>
            <button
              type="button"
              onClick={() => setShowAddProperty(true)}
              className={btnPrimary}
            >
              <Plus className="h-3.5 w-3.5" />
              Add property
            </button>
          </div>

          {properties.length === 0 ? (
            <div className="px-5 py-8 text-center text-[13px] text-[#6B6B6B]">
              No properties yet — add one above.
            </div>
          ) : (
            <ul className="divide-y divide-[#EFEBE0]">
              {properties.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-4 px-5 py-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-[14px] font-medium text-[#1A1A1A]">{p.name}</p>
                      {!p.isActive && (
                        <StatusPill tone="slate">Inactive</StatusPill>
                      )}
                    </div>
                    {(p.address || p.suburb) && (
                      <p className="text-[12px] text-[#6B6B6B]">
                        {[p.address, p.suburb].filter(Boolean).join(', ')}
                      </p>
                    )}
                    {p.notes && (
                      <p className="text-[11px] text-[#A0A0A0]">{p.notes}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditProperty(p)}
                    className="flex-shrink-0 rounded p-1.5 text-[#A0A0A0] hover:bg-[#F0EDE4] hover:text-[#3A3A3A]"
                    title="Edit property"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Recurring maintenance schedules */}
        <SchedulesSection customerId={customerId} properties={properties} />

        {/* Commercial summary */}
        {commercialCounts !== null && (
          <section className={`mb-4 overflow-hidden ${cardShell}`}>
            <div className="flex items-center gap-3 px-5 py-3">
              <ReceiptText className="h-4 w-4 text-[#6B6B6B]" strokeWidth={1.5} />
              <p
                className="text-[15px] font-medium text-[#1A1A1A]"
                style={{ fontFamily: FRAUNCES }}
              >
                Commercial
              </p>
            </div>
            <div className="flex flex-wrap gap-0 divide-x divide-[#EFEBE0] border-t border-[#EFEBE0]">
              <a
                href={`/sales?tab=quotes&customer=${customerId}`}
                className="flex flex-1 flex-col items-center gap-0.5 px-5 py-3 text-center transition-colors hover:bg-[#FAF8F2]"
              >
                <span className="text-[22px] font-semibold tabular-nums text-[#1A1A1A]">
                  {commercialCounts.quotes}
                </span>
                <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-[#6B6B6B]">
                  Quotes
                </span>
              </a>
              <a
                href={`/sales?tab=invoices&customer=${customerId}`}
                className="flex flex-1 flex-col items-center gap-0.5 px-5 py-3 text-center transition-colors hover:bg-[#FAF8F2]"
              >
                <span className="text-[22px] font-semibold tabular-nums text-[#1A1A1A]">
                  {commercialCounts.invoices}
                </span>
                <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-[#6B6B6B]">
                  Invoices
                </span>
              </a>
            </div>
          </section>
        )}

        {/* Requests queue */}
        <section className={`mb-4 overflow-hidden ${cardShell}`}>
          <div className="border-b border-[#EFEBE0] px-5 py-3">
            <h2
              className="text-[16px] font-medium text-[#1A1A1A]"
              style={{ fontFamily: FRAUNCES }}
            >
              Maintenance requests
            </h2>
            <p className="text-[12px] text-[#6B6B6B]">
              {requests.length} total · ordered by urgency then age
            </p>
          </div>

          {requests.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <AlertTriangle className="mx-auto mb-2 h-6 w-6 text-[#A0A0A0]" strokeWidth={1.5} />
              <p className="text-[13px] text-[#6B6B6B]">No requests for this customer yet.</p>
            </div>
          ) : (
            <ul className="divide-y divide-[#EFEBE0]">
              {requests.map((r) => {
                const tone = STATUS_TONE[r.status] ?? 'slate';
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => onSelectRequest(r.id)}
                      className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-[#FAF8F2]"
                    >
                      <UrgencyPill urgency={r.urgency} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] font-medium text-[#1A1A1A]">
                          {r.title}
                        </p>
                        <p className="text-[12px] text-[#6B6B6B]">
                          {r.propertyName ?? 'Unknown property'} · {age(r.createdAt)}
                        </p>
                      </div>
                      <StatusPill tone={tone} className="flex-shrink-0 capitalize">
                        {r.status}
                      </StatusPill>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {/* Modals */}
      {showEditCustomer && (
        <EditCustomerModal
          open={showEditCustomer}
          customer={customer}
          onClose={() => setShowEditCustomer(false)}
          onUpdated={(c) => {
            setCustomer(c);
            setToast({ message: 'Customer updated.', type: 'success' });
            setShowEditCustomer(false);
          }}
          onError={(msg) => setToast({ message: msg, type: 'error' })}
        />
      )}

      <CreatePropertyModal
        open={showAddProperty}
        customerId={customerId}
        onClose={() => setShowAddProperty(false)}
        onCreated={(p) => {
          setProperties((prev) => [...prev, p].sort((a, b) => a.name.localeCompare(b.name)));
          setToast({ message: `Property "${p.name}" added.`, type: 'success' });
        }}
        onError={(msg) => setToast({ message: msg, type: 'error' })}
      />

      {editProperty && (
        <EditPropertyModal
          open={!!editProperty}
          property={editProperty}
          onClose={() => setEditProperty(null)}
          onUpdated={(p) => {
            setProperties((prev) => prev.map((x) => (x.id === p.id ? p : x)));
            setToast({ message: 'Property updated.', type: 'success' });
            setEditProperty(null);
          }}
          onError={(msg) => setToast({ message: msg, type: 'error' })}
        />
      )}

      <InvitePortalUserModal
        open={showInvite}
        customerId={customerId}
        customerName={customer.name}
        onClose={() => setShowInvite(false)}
        onSuccess={(msg) => setToast({ message: msg, type: 'success' })}
        onError={(msg) => setToast({ message: msg, type: 'error' })}
      />

      {toast && (
        <Toaster message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}

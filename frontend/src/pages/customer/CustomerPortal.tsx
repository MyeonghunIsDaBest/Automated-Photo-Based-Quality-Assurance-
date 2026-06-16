// CustomerPortal — the customer-facing self-service portal (/customer).
//
// Scope: scoped purely by customerId (NOT by TopNav project).
// Guard: securityGroup === 'customer' only.
// RLS: customers can SELECT their own data; INSERT requests (source='portal') +
//      photos for their own requests; NEVER update/delete.

import { useEffect, useState, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { Building2, PlusCircle, Wrench } from 'lucide-react';
import { SkeletonCard } from '../../components/ui/skeleton';
import { useAppStore } from '../../store';
import { getCustomer } from '../../lib/api/customers';
import { listPropertiesForCustomer, type Property } from '../../lib/api/properties';
import { listRequestsForCustomer, type MaintenanceRequestWithContext } from '../../lib/api/maintenanceRequests';
import { Toaster } from '../../components/ui/Toaster';
import {
  LedgerHeader, LedgerStatRow, cardShell, FRAUNCES, btnPrimary,
} from '../gantt/components/ledger';
import ReportProblemModal from './ReportProblemModal';
import MyRequests from './MyRequests';
import UpcomingMaintenance from './UpcomingMaintenance';
import InvoicesSection from './InvoicesSection';

export default function CustomerPortal() {
  const currentProfile = useAppStore((s) => s.currentProfile);
  const customerId = currentProfile?.customerId ?? null;

  // ── guard: not a customer ────────────────────────────────────────────────
  if (currentProfile?.securityGroup !== 'customer') {
    return <Navigate to="/" replace />;
  }

  // ── guard: account not linked ────────────────────────────────────────────
  if (!customerId) {
    return (
      <div className="editorial-root min-h-dvh bg-[#FAF8F2]">
        <div className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center px-6 py-16 text-center">
          <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-full bg-[#F0EDE4] text-[#6B6B6B]">
            <Building2 className="h-7 w-7" strokeWidth={1.5} />
          </div>
          <h2
            className="text-[26px] font-medium text-[#1A1A1A]"
            style={{ fontFamily: FRAUNCES, letterSpacing: '-0.015em' }}
          >
            Account not linked yet.
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-[#6B6B6B]">
            Your account isn't linked to a customer yet — contact Casone Electrical to get set up.
          </p>
        </div>
      </div>
    );
  }

  // All data loading is inside a child so the hooks only run when customerId is present.
  return <PortalContent customerId={customerId} />;
}

// ─── PortalContent ─────────────────────────────────────────────────────────
// Separated so hooks never fire with a null customerId.

function PortalContent({ customerId }: { customerId: string }) {
  const [customerName, setCustomerName] = useState<string | null>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [requests, setRequests] = useState<MaintenanceRequestWithContext[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [customer, props, reqs] = await Promise.all([
        getCustomer(customerId),
        listPropertiesForCustomer(customerId),
        listRequestsForCustomer(customerId),
      ]);
      setCustomerName(customer?.name ?? null);
      setProperties(props);
      setRequests(reqs);
    } catch {
      setToast({ message: 'Failed to load your details — please refresh.', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => { void load(); }, [load]);

  const activeProperties = properties.filter((p) => p.isActive);
  const openRequests = requests.filter(
    (r) => r.status === 'new' || r.status === 'acknowledged' || r.status === 'scheduled',
  );
  const pastRequests = requests.filter(
    (r) => r.status === 'completed' || r.status === 'cancelled',
  );

  // Per-property open-request counts.
  const openCountByProperty = (propId: string) =>
    openRequests.filter((r) => r.propertyId === propId).length;

  if (loading) {
    return (
      <div className="editorial-root min-h-dvh bg-[#FAF8F2]">
        <div className="mx-auto w-full max-w-[780px] px-4 py-6 sm:px-6 sm:py-8">
          <div className="space-y-3">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="editorial-root min-h-dvh bg-[#FAF8F2]">
      <div className="mx-auto w-full max-w-[780px] px-4 py-6 sm:px-6 sm:py-8">
        {/* Header */}
        <LedgerHeader
          kicker="CX"
          icon={Building2}
          eyebrow={customerName ? `Customer · ${customerName}` : 'Customer Portal'}
          title="Your properties."
          meta={
            <>
              {activeProperties.length} propert{activeProperties.length === 1 ? 'y' : 'ies'} ·{' '}
              {openRequests.length} open request{openRequests.length === 1 ? '' : 's'}
            </>
          }
          actions={
            <button
              type="button"
              className={btnPrimary}
              onClick={() => setModalOpen(true)}
            >
              <PlusCircle className="h-4 w-4" />
              Report a problem
            </button>
          }
        />

        {/* Stats */}
        <LedgerStatRow
          stats={[
            {
              value: activeProperties.length,
              label: 'Properties',
              sub: 'registered with us',
              tone: 'slate',
            },
            {
              value: openRequests.length,
              label: 'Open requests',
              sub: 'in progress',
              tone: openRequests.length > 0 ? 'amber' : 'sage',
            },
            {
              value: pastRequests.length,
              label: 'Completed',
              sub: 'all time',
              tone: 'sage',
            },
          ]}
        />

        {/* Properties summary */}
        {activeProperties.length > 0 && (
          <section className={`mb-4 overflow-hidden ${cardShell}`}>
            <div className="border-b border-[#EFEBE0] px-5 py-3">
              <h2
                className="text-[16px] font-medium text-[#1A1A1A]"
                style={{ fontFamily: FRAUNCES }}
              >
                Your properties
              </h2>
              <p className="text-[12px] text-[#6B6B6B]">
                Properties Casone Electrical services for you.
              </p>
            </div>
            <ul className="divide-y divide-[#EFEBE0]">
              {activeProperties.map((prop) => {
                const openCount = openCountByProperty(prop.id);
                return (
                  <li key={prop.id} className="flex items-center justify-between px-5 py-4">
                    <div className="min-w-0">
                      <p className="text-[14px] font-semibold text-[#1A1A1A]">{prop.name}</p>
                      {prop.suburb && (
                        <p className="text-[12px] text-[#6B6B6B]">{prop.suburb}</p>
                      )}
                    </div>
                    {openCount > 0 ? (
                      <span className="ml-3 flex-shrink-0 rounded-full bg-[#F9EFD9] px-2.5 py-0.5 text-[12px] font-semibold text-[#C8841E]">
                        {openCount} open
                      </span>
                    ) : (
                      <span className="ml-3 flex-shrink-0 rounded-full bg-[#E5F2EA] px-2.5 py-0.5 text-[12px] font-semibold text-[#246F47]">
                        All clear
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* Upcoming maintenance */}
        <UpcomingMaintenance customerId={customerId} properties={properties} />

        {/* Invoices and quotes */}
        <InvoicesSection customerId={customerId} />

        {/* Open requests */}
        <MyRequests
          requests={openRequests}
          title="Open requests"
          emptyMessage="No open requests — everything is up to date."
          emptyIcon={Wrench}
        />

        {/* Past requests — collapsed section */}
        {pastRequests.length > 0 && (
          <MyRequests
            requests={pastRequests}
            title="Past requests"
            emptyMessage=""
            emptyIcon={Wrench}
            collapsible
          />
        )}
      </div>

      {/* Report problem modal */}
      {modalOpen && (
        <ReportProblemModal
          properties={activeProperties}
          onClose={() => setModalOpen(false)}
          onCreated={(msg) => {
            setModalOpen(false);
            setToast({ message: msg, type: 'success' });
            void load();
          }}
        />
      )}

      {toast && (
        <Toaster
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}

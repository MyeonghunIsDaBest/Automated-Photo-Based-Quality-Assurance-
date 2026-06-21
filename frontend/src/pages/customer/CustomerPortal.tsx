// CustomerPortal — the customer-facing self-service portal (/customer).
//
// SaaS-grade "home" (C1): a ledger-styled dashboard shell — sidebar + topbar +
// hero + KPI row + two-column grid. Adapted from the casone-client-dashboard
// mockup into the house editorial palette (cream / Fraunces / sage), per the
// agreed direction. Sections with real data are live; the rest (projects &
// progress, budget chart, documents) show honest "coming soon" states until
// their customer-scoped backend access is built.
//
// Scope: scoped purely by customerId (NOT by TopNav project).
// Guard: securityGroup === 'customer' only.
// RLS: customers can SELECT their own data; INSERT requests (source='portal') +
//      photos for their own requests; NEVER update/delete.

import { useEffect, useState, useCallback } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import {
  Building2, PlusCircle, Wrench, LayoutGrid, CreditCard, FolderOpen,
  MessageSquare, CalendarClock, Bell, ChevronRight, Clock, BarChart3,
  Settings, LifeBuoy, LogOut,
} from 'lucide-react';
import { SkeletonCard } from '../../components/ui/skeleton';
import { useAppStore } from '../../store';
import { getCustomer } from '../../lib/api/customers';
import { listPropertiesForCustomer, type Property } from '../../lib/api/properties';
import { listRequestsForCustomer, type MaintenanceRequestWithContext } from '../../lib/api/maintenanceRequests';
import { listServiceJobsForCustomer, type ServiceJob } from '../../lib/api/serviceJobs';
import { Toaster } from '../../components/ui/Toaster';
import { cardShell, FRAUNCES, btnPrimary } from '../gantt/components/ledger';
import ReportProblemModal, { type ReportTargetJob } from './ReportProblemModal';
import MyRequests from './MyRequests';
import UpcomingMaintenance from './UpcomingMaintenance';
import InvoicesSection from './InvoicesSection';

/** Initials for the avatar coins (max 2 letters). */
function initialsOf(name: string | null): string {
  if (!name) return '—';
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '—';
}

/** Coarse "x ago" for the activity feed — good enough for a customer view. */
function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return 'Just now';
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'Yesterday' : `${d}d ago`;
}

/** Friendly label + tone for a maintenance-request status (customer-facing). */
const REQ_STATUS: Record<string, { label: string; cls: string }> = {
  new:          { label: 'Received',     cls: 'bg-[#EEF1F4] text-[#5B6B7B]' },
  acknowledged: { label: 'Acknowledged', cls: 'bg-[#F9EFD9] text-[#C8841E]' },
  scheduled:    { label: 'Scheduled',    cls: 'bg-[#F9EFD9] text-[#C8841E]' },
  completed:    { label: 'Resolved',     cls: 'bg-[#E5F2EA] text-[#246F47]' },
  cancelled:    { label: 'Closed',       cls: 'bg-[#F0EDE4] text-[#6B6B6B]' },
};

// A syntactically-valid UUID that matches no row — used for the dev's no-data UI
// preview so every section queries cleanly and renders its empty state (a literal
// '' would fail the uuid cast on customer_id columns).
const PREVIEW_CUSTOMER_ID = '00000000-0000-0000-0000-000000000000';

export default function CustomerPortal() {
  const currentProfile = useAppStore((s) => s.currentProfile);
  const sg = currentProfile?.securityGroup;
  const customerId = currentProfile?.customerId ?? null;
  // The dev superuser may PREVIEW any customer's portal (their own account has
  // no customer link). 'dev' is god-mode app-wide and is_manager_or_above() on
  // the backend already grants it read access to all customer data.
  const isDev = sg === 'dev';

  // ── guard: only customers + the dev superuser ────────────────────────────
  if (sg !== 'customer' && !isDev) {
    return <Navigate to="/" replace />;
  }

  // ── dev superuser, unlinked → render the portal UI itself with NO data,
  //    so the layout/styling can be inspected without seeding a customer ────
  if (isDev && !customerId) {
    return <PortalContent customerId={PREVIEW_CUSTOMER_ID} preview />;
  }

  // ── guard: customer account not linked ───────────────────────────────────
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

// ─── Sidebar nav config ──────────────────────────────────────────────────────
// Real sections scroll to their anchor; the rest land on a "coming soon" card.
const NAV_ITEMS: { label: string; Icon: typeof LayoutGrid; href: string }[] = [
  { label: 'Dashboard',   Icon: LayoutGrid,    href: '#portal-top' },
  { label: 'My Jobs',     Icon: Wrench,        href: '#jobs' },
  { label: 'Invoices',    Icon: CreditCard,    href: '#invoices' },
  { label: 'Schedule',    Icon: CalendarClock, href: '#schedule' },
  { label: 'Documents',   Icon: FolderOpen,    href: '#documents' },
  { label: 'Messages',    Icon: MessageSquare, href: '#messages' },
];

// ─── PortalContent ─────────────────────────────────────────────────────────
// Separated so hooks never fire with a null customerId.

function PortalContent({
  customerId,
  preview = false,
  onExitPreview,
}: {
  customerId: string;
  /** True when a dev is previewing this customer's portal (not the customer). */
  preview?: boolean;
  onExitPreview?: () => void;
}) {
  const [customerName, setCustomerName] = useState<string | null>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [requests, setRequests] = useState<MaintenanceRequestWithContext[]>([]);
  const [jobs, setJobs] = useState<ServiceJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  // When set, the report modal opens pre-linked to this job (else a plain request).
  const [reportJob, setReportJob] = useState<ReportTargetJob | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const navigate = useNavigate();
  const logout = useAppStore((s) => s.logout);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [customer, props, reqs, sjobs] = await Promise.all([
        getCustomer(customerId),
        listPropertiesForCustomer(customerId),
        listRequestsForCustomer(customerId),
        listServiceJobsForCustomer(customerId),
      ]);
      setCustomerName(customer?.name ?? null);
      setProperties(props);
      setRequests(reqs);
      setJobs(sjobs);
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
  // Newest few requests for the activity feed (real data).
  const recentRequests = [...requests]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 5);

  // Per-property open-request counts.
  const openCountByProperty = (propId: string) =>
    openRequests.filter((r) => r.propertyId === propId).length;

  // Jobs the customer can report an issue against (hide cancelled ones).
  const activeJobs = jobs.filter((j) => j.status !== 'cancelled');
  const JOB_STATUS: Record<string, { label: string; cls: string }> = {
    pending:     { label: 'Pending',     cls: 'bg-[#F0EDE4] text-[#6B6B6B]' },
    scheduled:   { label: 'Scheduled',   cls: 'bg-[#EEF1F4] text-[#5B6B7B]' },
    in_progress: { label: 'In progress', cls: 'bg-[#F9EFD9] text-[#C8841E]' },
    done:        { label: 'Completed',   cls: 'bg-[#E5F2EA] text-[#246F47]' },
  };

  const openReport = (job: ReportTargetJob | null) => {
    setReportJob(job);
    setModalOpen(true);
  };

  const initials = initialsOf(customerName);
  const todayLabel = new Date().toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });

  if (loading) {
    return (
      <div className="editorial-root min-h-dvh bg-[#FAF8F2]">
        <div className="mx-auto w-full max-w-[1180px] px-4 py-8 sm:px-8">
          <div className="space-y-4">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        </div>
      </div>
    );
  }

  // Shared section-card header.
  const sectionHead = (title: string, sub?: string) => (
    <div className="border-b border-[#EFEBE0] px-5 py-3">
      <h2 className="text-[16px] font-medium text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>{title}</h2>
      {sub && <p className="text-[12px] text-[#6B6B6B]">{sub}</p>}
    </div>
  );

  // Honest "coming soon" card for sections whose customer data isn't wired yet.
  const soonCard = (id: string, Icon: typeof LayoutGrid, title: string, body: string) => (
    <section id={id} className={`overflow-hidden ${cardShell}`}>
      {sectionHead(title)}
      <div className="flex items-start gap-3 px-5 py-5">
        <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-[10px] bg-[#F0EDE4] text-[#6B6B6B]">
          <Icon className="h-4 w-4" strokeWidth={1.6} />
        </div>
        <p className="text-[12.5px] leading-relaxed text-[#6B6B6B]">{body}</p>
      </div>
    </section>
  );

  return (
    <div className="editorial-root flex min-h-dvh bg-[#FAF8F2]" id="portal-top">
      {/* ── Sidebar (lg+) ─────────────────────────────────────────────────── */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] flex-col border-r border-[#E6E1D4] bg-white lg:flex">
        <div className="flex items-center gap-2.5 border-b border-[#EFEBE0] px-5 py-5">
          <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-[10px] bg-[#2F8F5C] text-white">
            <Building2 className="h-4 w-4" strokeWidth={2} />
          </div>
          <div className="leading-none">
            <div className="text-[16px] font-medium text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>Casone</div>
            <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#2F8F5C]">Client Portal</div>
          </div>
        </div>

        <div className="mx-3 mt-3 flex items-center gap-2.5 rounded-[12px] border border-[#E6E1D4] bg-[#FAF8F2] px-3 py-2.5">
          <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-[#E5F2EA] text-[12px] font-bold text-[#246F47]">{initials}</div>
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold text-[#1A1A1A]">{customerName ?? 'Your account'}</div>
            <div className="text-[11px] text-[#6B6B6B]">Client</div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-3">
          <p className="px-2 pb-1.5 pt-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#A0A0A0]">Overview</p>
          {NAV_ITEMS.map(({ label, Icon, href }, i) => (
            <a
              key={label}
              href={href}
              className={[
                'mb-0.5 flex items-center gap-2.5 rounded-[10px] px-3 py-2 text-[13px] font-medium transition-colors',
                i === 0 ? 'bg-[#1A1A1A] text-white' : 'text-[#6B6B6B] hover:bg-[#FAF8F2] hover:text-[#1A1A1A]',
              ].join(' ')}
              aria-current={i === 0 ? 'page' : undefined}
            >
              <Icon className="h-4 w-4 flex-shrink-0" strokeWidth={1.8} />
              {label}
            </a>
          ))}
        </nav>

        <div className="border-t border-[#EFEBE0] p-3">
          {preview && (
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="mb-1 flex w-full items-center gap-2.5 rounded-[10px] bg-[#1A1A1A] px-3 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-black"
            >
              <LayoutGrid className="h-4 w-4 flex-shrink-0" />
              Switch to staff app
            </button>
          )}
          <button
            type="button"
            onClick={() => navigate('/settings')}
            className="flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-[13px] font-medium text-[#6B6B6B] transition-colors hover:bg-[#FAF8F2] hover:text-[#1A1A1A]"
          >
            <Settings className="h-4 w-4 flex-shrink-0" />
            Account settings
          </button>
          <a
            href="mailto:support@casoneelectrical.com.au"
            className="flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-[13px] font-medium text-[#6B6B6B] transition-colors hover:bg-[#FAF8F2] hover:text-[#1A1A1A]"
          >
            <LifeBuoy className="h-4 w-4 flex-shrink-0" />
            Help &amp; support
          </a>
          <button
            type="button"
            onClick={() => void logout()}
            className="flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-[13px] font-medium text-[#C44545] transition-colors hover:bg-[#FBE5E5]"
          >
            <LogOut className="h-4 w-4 flex-shrink-0" />
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Main column ───────────────────────────────────────────────────── */}
      <div className="flex min-h-dvh flex-1 flex-col lg:ml-[248px]">
        {/* Dev preview banner */}
        {preview && (
          <div className="flex flex-wrap items-center justify-between gap-2 bg-[#1A1A1A] px-4 py-2 text-[12px] text-white sm:px-8">
            <span className="flex items-center gap-2">
              <span className="rounded-full bg-[#C8841E] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">Dev preview</span>
              {customerName ? `Viewing as ${customerName} — exactly as they see it.` : 'UI preview — no customer data loaded.'}
            </span>
            {onExitPreview && (
              <button
                type="button"
                onClick={onExitPreview}
                className="rounded-full border border-white/30 px-3 py-1 text-[11px] font-semibold transition-colors hover:bg-white/10"
              >
                Switch customer
              </button>
            )}
          </div>
        )}

        {/* Topbar */}
        <header className="sticky top-0 z-30 flex h-[60px] items-center justify-between border-b border-[#E6E1D4] bg-[#FAF8F2]/85 px-4 backdrop-blur sm:px-8">
          <div className="flex items-center gap-3 text-[13px] text-[#6B6B6B]">
            <span className="hidden sm:inline">Client Portal</span>
            <ChevronRight className="hidden h-3.5 w-3.5 text-[#A0A0A0] sm:inline" />
            <span className="font-semibold text-[#1A1A1A]">Dashboard</span>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="hidden items-center gap-1.5 rounded-full border border-[#E6E1D4] bg-white px-3 py-1 text-[11px] text-[#6B6B6B] sm:inline-flex">
              <Clock className="h-3 w-3" /> {todayLabel}
            </span>
            <button
              type="button"
              className="relative grid h-9 w-9 place-items-center rounded-full border border-[#E6E1D4] bg-white text-[#6B6B6B] transition-colors hover:bg-[#FAF8F2] hover:text-[#1A1A1A]"
              aria-label={`Notifications${openRequests.length ? ` — ${openRequests.length} open` : ''}`}
            >
              <Bell className="h-4 w-4" strokeWidth={1.8} />
              {openRequests.length > 0 && (
                <span className="absolute right-2 top-2 h-2 w-2 rounded-full border-2 border-white bg-[#C44545]" aria-hidden />
              )}
            </button>
            <div className="grid h-9 w-9 place-items-center rounded-full bg-[#E5F2EA] text-[12px] font-bold text-[#246F47]" aria-hidden>{initials}</div>
          </div>
        </header>

        {/* Content */}
        <main className="mx-auto w-full max-w-[1180px] flex-1 px-4 py-6 sm:px-8 sm:py-8">
          {/* Hero */}
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#6B6B6B]">Welcome back</p>
              <h1 className="text-[28px] font-medium leading-none text-[#1A1A1A] sm:text-[32px]" style={{ fontFamily: FRAUNCES, letterSpacing: '-0.02em' }}>
                Hello, <span className="italic text-[#2F8F5C]">{customerName ?? 'there'}.</span>
              </h1>
              <p className="mt-2 text-[13px] text-[#6B6B6B]">
                {activeProperties.length} site{activeProperties.length === 1 ? '' : 's'} ·{' '}
                {openRequests.length} open request{openRequests.length === 1 ? '' : 's'} ·{' '}
                {activeJobs.length} job{activeJobs.length === 1 ? '' : 's'} on the go
              </p>
            </div>
            <button type="button" className={btnPrimary} onClick={() => openReport(null)}>
              <PlusCircle className="h-4 w-4" />
              Report a problem
            </button>
          </div>

          {/* KPI row */}
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { v: activeProperties.length, l: 'Your sites', dot: '#5B6B7B' },
              { v: openRequests.length, l: 'Open requests', dot: openRequests.length > 0 ? '#C8841E' : '#2F8F5C' },
              { v: activeJobs.length, l: 'Active jobs', dot: '#2F8F5C' },
              { v: pastRequests.length, l: 'Resolved', dot: '#246F47' },
            ].map((k) => (
              <div key={k.l} className={`px-5 py-4 ${cardShell}`}>
                <div className="text-[28px] font-medium leading-none tabular-nums text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>{k.v}</div>
                <div className="mt-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.07em] text-[#6B6B6B]">
                  <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ background: k.dot }} aria-hidden />
                  {k.l}
                </div>
              </div>
            ))}
          </div>

          {/* Two-column grid */}
          <div className="grid items-start gap-5 lg:grid-cols-[1fr_340px]">
            {/* ── Left column ─────────────────────────────────────────────── */}
            <div className="flex flex-col gap-5">
              {/* Your jobs (real) */}
              {activeJobs.length > 0 && (
                <section id="jobs" className={`overflow-hidden ${cardShell}`}>
                  {sectionHead('Your jobs', "Work we have on for you. Spot a problem on one? Flag it and we're notified straight away.")}
                  <ul className="divide-y divide-[#EFEBE0]">
                    {activeJobs.map((job) => {
                      const st = JOB_STATUS[job.status] ?? { label: job.status, cls: 'bg-[#F0EDE4] text-[#6B6B6B]' };
                      return (
                        <li key={job.id} className="flex items-center justify-between gap-3 px-5 py-4">
                          <div className="min-w-0">
                            <p className="truncate text-[14px] font-semibold text-[#1A1A1A]">{job.title}</p>
                            <div className="mt-1 flex flex-wrap items-center gap-2">
                              <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${st.cls}`}>{st.label}</span>
                              {job.externalRef && <span className="font-mono text-[11px] text-[#A0A0A0]">#{job.externalRef}</span>}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => openReport({ id: job.id, title: job.title, externalRef: job.externalRef, propertyId: job.propertyId })}
                            className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-full border border-[#E6E1D4] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#3A3A3A] transition-colors hover:border-[#2F8F5C] hover:bg-[#F0FAF4] hover:text-[#2F8F5C]"
                          >
                            <Wrench className="h-3.5 w-3.5" />
                            Report an issue
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}

              {/* Recent activity (real — from your requests) */}
              <section className={`overflow-hidden ${cardShell}`}>
                {sectionHead('Recent activity', 'The latest on your requests.')}
                {recentRequests.length === 0 ? (
                  <p className="px-5 py-6 text-[13px] text-[#A0A0A0]">No activity yet.</p>
                ) : (
                  <ul className="divide-y divide-[#EFEBE0]">
                    {recentRequests.map((r) => {
                      const st = REQ_STATUS[r.status] ?? { label: r.status, cls: 'bg-[#F0EDE4] text-[#6B6B6B]' };
                      return (
                        <li key={r.id} className="flex items-center gap-3 px-5 py-3.5">
                          <div className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-[#FAF8F2] text-[#6B6B6B]">
                            <Wrench className="h-3.5 w-3.5" strokeWidth={1.8} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13px] font-medium text-[#1A1A1A]">{r.title}</p>
                            <p className="text-[11px] text-[#A0A0A0]">{r.propertyName ?? 'Your property'} · {timeAgo(r.createdAt)}</p>
                          </div>
                          <span className={`flex-shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${st.cls}`}>{st.label}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              {/* Invoices (real) */}
              <div id="invoices">
                <InvoicesSection customerId={customerId} />
              </div>

              {/* Upcoming maintenance (real) */}
              <div id="schedule">
                <UpcomingMaintenance customerId={customerId} properties={properties} />
              </div>

              {/* Open requests (real) */}
              <MyRequests
                requests={openRequests}
                title="Open requests"
                emptyMessage="No open requests — everything is up to date."
                emptyIcon={Wrench}
              />

              {/* Past requests — collapsed (real) */}
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

            {/* ── Right column ────────────────────────────────────────────── */}
            <div className="flex flex-col gap-5">
              {/* Quick actions (real) */}
              <section className={`overflow-hidden ${cardShell}`}>
                {sectionHead('Quick actions')}
                <div className="grid grid-cols-2 gap-2.5 p-4">
                  <button
                    type="button"
                    onClick={() => openReport(null)}
                    className="flex flex-col items-start gap-2 rounded-[12px] border border-[#E6E1D4] bg-[#FAF8F2] p-3.5 text-left transition-colors hover:border-[#2F8F5C] hover:bg-[#F0FAF4]"
                  >
                    <span className="grid h-8 w-8 place-items-center rounded-[8px] bg-[#E5F2EA] text-[#246F47]"><PlusCircle className="h-4 w-4" /></span>
                    <span className="text-[12px] font-semibold text-[#1A1A1A]">Report a problem</span>
                  </button>
                  <a
                    href="#invoices"
                    className="flex flex-col items-start gap-2 rounded-[12px] border border-[#E6E1D4] bg-[#FAF8F2] p-3.5 transition-colors hover:border-[#2F8F5C] hover:bg-[#F0FAF4]"
                  >
                    <span className="grid h-8 w-8 place-items-center rounded-[8px] bg-[#EEF1F4] text-[#5B6B7B]"><CreditCard className="h-4 w-4" /></span>
                    <span className="text-[12px] font-semibold text-[#1A1A1A]">View invoices</span>
                  </a>
                  <a
                    href="#schedule"
                    className="flex flex-col items-start gap-2 rounded-[12px] border border-[#E6E1D4] bg-[#FAF8F2] p-3.5 transition-colors hover:border-[#2F8F5C] hover:bg-[#F0FAF4]"
                  >
                    <span className="grid h-8 w-8 place-items-center rounded-[8px] bg-[#F9EFD9] text-[#C8841E]"><CalendarClock className="h-4 w-4" /></span>
                    <span className="text-[12px] font-semibold text-[#1A1A1A]">Upcoming work</span>
                  </a>
                  <a
                    href="#messages"
                    className="flex flex-col items-start gap-2 rounded-[12px] border border-[#E6E1D4] bg-[#FAF8F2] p-3.5 transition-colors hover:border-[#2F8F5C] hover:bg-[#F0FAF4]"
                  >
                    <span className="grid h-8 w-8 place-items-center rounded-[8px] bg-[#EDE9FE] text-[#7C3AED]"><MessageSquare className="h-4 w-4" /></span>
                    <span className="text-[12px] font-semibold text-[#1A1A1A]">Get in touch</span>
                  </a>
                </div>
              </section>

              {/* Your properties (real) */}
              {activeProperties.length > 0 && (
                <section className={`overflow-hidden ${cardShell}`}>
                  {sectionHead('Your properties', 'Sites we service for you.')}
                  <ul className="divide-y divide-[#EFEBE0]">
                    {activeProperties.map((prop) => {
                      const openCount = openCountByProperty(prop.id);
                      return (
                        <li key={prop.id} className="flex items-center justify-between px-5 py-3.5">
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-semibold text-[#1A1A1A]">{prop.name}</p>
                            {prop.suburb && <p className="text-[11px] text-[#6B6B6B]">{prop.suburb}</p>}
                          </div>
                          {openCount > 0 ? (
                            <span className="ml-3 flex-shrink-0 rounded-full bg-[#F9EFD9] px-2.5 py-0.5 text-[11px] font-semibold text-[#C8841E]">{openCount} open</span>
                          ) : (
                            <span className="ml-3 flex-shrink-0 rounded-full bg-[#E5F2EA] px-2.5 py-0.5 text-[11px] font-semibold text-[#246F47]">All clear</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}

              {/* Coming-soon sections (honest placeholders until backend access lands) */}
              {soonCard('progress', BarChart3, 'Progress & budget', 'Live project progress and budget tracking are coming to your portal soon.')}
              {soonCard('documents', FolderOpen, 'Document vault', 'Certificates, drawings and reports for your sites will appear here soon.')}
              {soonCard('messages', MessageSquare, 'Messages', 'A direct line to your Casone team is coming soon. For now, use "Report a problem" and we’ll be in touch.')}
            </div>
          </div>
        </main>
      </div>

      {/* Report problem modal — generic, or pre-linked to a job via reportJob */}
      {modalOpen && (
        <ReportProblemModal
          properties={activeProperties}
          serviceJob={reportJob}
          onClose={() => {
            setModalOpen(false);
            setReportJob(null);
          }}
          onCreated={(msg) => {
            setModalOpen(false);
            setReportJob(null);
            setToast({ message: msg, type: 'success' });
            void load();
          }}
        />
      )}

      {toast && (
        <Toaster message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}

// CustomersList — full-featured customer register with table, drawer, search,
// filter, sort, CSV export, and urgent strip.
//
// Data loads once: all customers (active + inactive), all properties, all requests.
// Per-customer stats are derived client-side; no extra round-trips after mount.

import { useEffect, useRef, useState } from 'react';
import { Users, Plus, Download, ChevronRight, AlertTriangle, Search, X } from 'lucide-react';
import { Toaster } from '../../components/ui/Toaster';
import { SkeletonCard } from '../../components/ui/skeleton';
import {
  listCustomers, type Customer,
} from '../../lib/api/customers';
import { listAllProperties, type Property } from '../../lib/api/properties';
import {
  listAllRequests, type MaintenanceRequestWithContext,
} from '../../lib/api/maintenanceRequests';
import { FRAUNCES, cardShell, LedgerHeader, TONE, btnPrimary } from '../gantt/components/ledger';
import { CreateCustomerModal } from './modals';
import CustomerDrawer from './CustomerDrawer';

// ─── types ────────────────────────────────────────────────────────────────────

type FilterTab = 'all' | 'active' | 'archived';
type SortKey = 'recent' | 'name' | 'open';

interface CustomerDrawerState {
  customer: Customer;
  properties: Property[];
  requests: MaintenanceRequestWithContext[];
}

// ─── helpers ─────────────────────────────────────────────────────────────────

const OPEN_STATUSES = new Set(['new', 'acknowledged', 'scheduled']);

/** Deterministic hue from customer name charCode sum. */
function nameHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h + name.charCodeAt(i) * (i + 1)) % 360;
  return h;
}

/** Initials: up to two chars from name words. */
function initials(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/**
 * lastActivity: max of customer.createdAt, and all request createdAt/completedAt
 * for that customer. Returns ISO string.
 */
function deriveLastActivity(
  customer: Customer,
  requests: MaintenanceRequestWithContext[],
): string {
  let max = customer.createdAt;
  for (const r of requests) {
    if (r.createdAt > max) max = r.createdAt;
    if (r.completedAt && r.completedAt > max) max = r.completedAt;
  }
  return max;
}

/** Relative time label. */
function relTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return mins <= 1 ? 'just now' : `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return new Date(iso).toLocaleDateString('en-AU', { month: 'short', year: 'numeric' });
}

/** CSV-safe: wrap in quotes, escape inner quotes. */
function csvCell(val: string | null | undefined): string {
  const s = String(val ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

// ─── sub-components ───────────────────────────────────────────────────────────

function Avatar({ name }: { name: string }) {
  const h = nameHue(name);
  return (
    <div
      className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-[13px] font-bold"
      style={{ background: `hsl(${h} 30% 90%)`, color: `hsl(${h} 42% 27%)` }}
    >
      {initials(name)}
    </div>
  );
}

function OpenCountPill({ count, urgent }: { count: number; urgent: boolean }) {
  if (count === 0) {
    return (
      <span className="inline-flex items-center rounded-full bg-[#F5F2E9] px-2.5 py-0.5 text-[12px] font-semibold text-[#A0A0A0]">
        0
      </span>
    );
  }
  if (urgent) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-semibold"
        style={{ background: TONE.red.bg, color: TONE.red.fg }}
      >
        {count}
        <span className="text-[10px] font-semibold uppercase tracking-wide">&#9679; URGENT</span>
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-semibold"
      style={{ background: TONE.sage.bg, color: TONE.sage.fg }}
    >
      {count}
    </span>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

interface CustomersListProps {
  onSelectCustomer: (id: string) => void;
}

export default function CustomersList({ onSelectCustomer }: CustomersListProps) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [allProperties, setAllProperties] = useState<Property[]>([]);
  const [allRequests, setAllRequests] = useState<MaintenanceRequestWithContext[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Drawer
  const [drawer, setDrawer] = useState<CustomerDrawerState | null>(null);

  // Toolbar state
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterTab>('all');
  const [sort, setSort] = useState<SortKey>('recent');
  const searchRef = useRef<HTMLInputElement>(null);

  // ── data load ───────────────────────────────────────────────────────────────

  const load = () => {
    setLoading(true);
    setLoadError(null);
    Promise.all([
      listCustomers(),
      listAllProperties(),
      listAllRequests(),
    ])
      .then(([cs, props, reqs]) => {
        setCustomers(cs);
        setAllProperties(props);
        setAllRequests(reqs);
      })
      .catch((err) => {
        setLoadError(err instanceof Error ? err.message : 'Failed to load customers.');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  // ── keyboard shortcut: "/" focuses search ──────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName.toLowerCase();
      const isEditable =
        tag === 'input' || tag === 'textarea' || tag === 'select' ||
        (e.target as HTMLElement).isContentEditable;
      if (isEditable) return;
      if (e.key === '/') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ── derived per-customer stats ─────────────────────────────────────────────

  const propsByCustomer = new Map<string, Property[]>();
  for (const p of allProperties) {
    if (!propsByCustomer.has(p.customerId)) propsByCustomer.set(p.customerId, []);
    propsByCustomer.get(p.customerId)!.push(p);
  }

  const requestsByCustomer = new Map<string, MaintenanceRequestWithContext[]>();
  for (const r of allRequests) {
    if (!r.customerId) continue;
    if (!requestsByCustomer.has(r.customerId)) requestsByCustomer.set(r.customerId, []);
    requestsByCustomer.get(r.customerId)!.push(r);
  }

  // ── filter + search + sort ─────────────────────────────────────────────────

  const q = search.trim().toLowerCase();

  const filtered = customers.filter((c) => {
    // status filter
    if (filter === 'active' && !c.isActive) return false;
    if (filter === 'archived' && c.isActive) return false;

    // text search: name, type, contact name, email, and property names/addresses
    if (q) {
      const props = propsByCustomer.get(c.id) ?? [];
      const propText = props
        .flatMap((p) => [p.name, p.address, p.suburb].filter(Boolean))
        .join(' ')
        .toLowerCase();
      const fields = [
        c.name,
        c.customerType ?? '',
        c.primaryContactName ?? '',
        c.primaryContactEmail ?? '',
        propText,
      ].join(' ').toLowerCase();
      if (!fields.includes(q)) return false;
    }

    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name);
    if (sort === 'open') {
      const ao = (requestsByCustomer.get(a.id) ?? []).filter((r) => OPEN_STATUSES.has(r.status)).length;
      const bo = (requestsByCustomer.get(b.id) ?? []).filter((r) => OPEN_STATUSES.has(r.status)).length;
      return bo - ao;
    }
    // 'recent' — by lastActivity desc
    const al = deriveLastActivity(a, requestsByCustomer.get(a.id) ?? []);
    const bl = deriveLastActivity(b, requestsByCustomer.get(b.id) ?? []);
    return bl.localeCompare(al);
  });

  // ── stats for masthead ─────────────────────────────────────────────────────

  const activeCount = customers.filter((c) => c.isActive).length;
  const totalPropertiesUnderCare = allProperties.length;

  // ── urgent strip ───────────────────────────────────────────────────────────

  const urgentCustomers = customers.filter((c) => {
    if (!c.isActive) return false;
    const reqs = requestsByCustomer.get(c.id) ?? [];
    return reqs.some((r) => OPEN_STATUSES.has(r.status) && r.urgency >= 4);
  });

  // Total count of urgent open requests (not customers) for the strip label.
  const urgentRequestCount = urgentCustomers.reduce((sum, c) => {
    const reqs = requestsByCustomer.get(c.id) ?? [];
    return sum + reqs.filter((r) => OPEN_STATUSES.has(r.status) && r.urgency >= 4).length;
  }, 0);

  // ── CSV export ─────────────────────────────────────────────────────────────

  const handleExport = () => {
    const header = 'Customer,Type,Status,Contact,Email,Phone,Properties,Open requests,Last activity';
    const rows = customers.map((c) => {
      const reqs = requestsByCustomer.get(c.id) ?? [];
      const open = reqs.filter((r) => OPEN_STATUSES.has(r.status)).length;
      const props = (propsByCustomer.get(c.id) ?? []).length;
      const last = relTime(deriveLastActivity(c, reqs));
      return [
        csvCell(c.name),
        csvCell(c.customerType),
        c.isActive ? 'Active' : 'Archived',
        csvCell(c.primaryContactName),
        csvCell(c.primaryContactEmail),
        csvCell(c.phone),
        String(props),
        String(open),
        csvCell(last),
      ].join(',');
    });
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'customers.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── drawer open ────────────────────────────────────────────────────────────

  const openDrawer = (c: Customer) => {
    const props = propsByCustomer.get(c.id) ?? [];
    // Pass ALL requests for this customer — the drawer filters to OPEN_STATUSES
    // internally for the "Open Requests" section, and needs the full history to
    // build the activity timeline.
    const reqs = requestsByCustomer.get(c.id) ?? [];
    setDrawer({ customer: c, properties: props, requests: reqs });
  };

  const closeDrawer = () => setDrawer(null);

  const handleDrawerCustomerChange = (updated: Customer) => {
    setCustomers((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    if (drawer) setDrawer((d) => (d ? { ...d, customer: updated } : null));
  };

  // ── counts for filter tabs ─────────────────────────────────────────────────

  const counts = {
    all: customers.length,
    active: customers.filter((c) => c.isActive).length,
    archived: customers.filter((c) => !c.isActive).length,
  };

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div
      className="min-h-full bg-[#FAF8F2]"
      style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}
    >
      <div className="mx-auto w-full max-w-[1100px] px-4 py-6 sm:px-8 sm:py-8">

        {/* Masthead */}
        <LedgerHeader
          kicker="MNT"
          icon={Users}
          eyebrow="Maintenance"
          title="Customers."
          meta={`${customers.length} total · ${activeCount} active · ${totalPropertiesUnderCare} properties under care`}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleExport}
                disabled={loading || customers.length === 0}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#E6E1D4] bg-white px-3.5 py-2 text-[13px] font-semibold text-[#3A3A3A] transition-colors hover:bg-[#FAF8F2] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Download className="h-4 w-4" />
                Export
              </button>
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className={btnPrimary}
              >
                <Plus className="h-4 w-4" />
                New customer
              </button>
            </div>
          }
        />

        {/* Urgent strip */}
        {!loading && urgentCustomers.length > 0 && (
          <div
            className="mb-4 flex items-center justify-between gap-3 rounded-[12px] border px-4 py-3"
            style={{ background: TONE.red.bg, borderColor: '#F0BFBF' }}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" style={{ color: TONE.red.fg }} />
              <p className="text-[13px] font-medium" style={{ color: TONE.red.fg }}>
                {urgentRequestCount} urgent request{urgentRequestCount !== 1 ? 's' : ''} across{' '}
                <span className="font-semibold">
                  {urgentCustomers.map((c) => c.name).join(', ')}
                </span>{' '}
                &mdash; worth a look first.
              </p>
            </div>
            <button
              type="button"
              onClick={() => openDrawer(urgentCustomers[0])}
              className="flex-shrink-0 inline-flex items-center gap-1 text-[13px] font-semibold underline underline-offset-2"
              style={{ color: TONE.red.fg }}
            >
              Review <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Toolbar */}
        {!loading && customers.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px] max-w-[360px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A0A0A0]" />
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') { setSearch(''); searchRef.current?.blur(); } }}
                placeholder="Search by name, contact or property…"
                className="w-full rounded-full border border-[#E6E1D4] bg-white py-2 pl-9 pr-8 text-[13px] placeholder-[#A0A0A0] focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#A0A0A0] hover:text-[#3A3A3A]"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Filter tabs */}
            <div className="flex rounded-full bg-[#F5F2E9] p-0.5 text-[12px] font-semibold">
              {(['all', 'active', 'archived'] as FilterTab[]).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setFilter(tab)}
                  className={[
                    'rounded-full px-3 py-1.5 transition-colors capitalize',
                    filter === tab
                      ? 'bg-white text-[#1A1A1A] shadow-[0_1px_3px_rgba(20,20,20,0.08)]'
                      : 'text-[#6B6B6B] hover:text-[#1A1A1A]',
                  ].join(' ')}
                >
                  {tab} ({counts[tab]})
                </button>
              ))}
            </div>

            {/* Sort */}
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="rounded-full border border-[#E6E1D4] bg-white px-3 py-2 text-[13px] font-medium text-[#3A3A3A] focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]"
            >
              <option value="recent">Recently active</option>
              <option value="name">Name A&ndash;Z</option>
              <option value="open">Most open requests</option>
            </select>

            <span className="ml-auto text-[12px] text-[#A0A0A0]">
              {sorted.length} of {customers.length} shown
            </span>
          </div>
        )}

        {/* Loading skeletons */}
        {loading && (
          <div className="space-y-3">
            {[0, 1, 2, 3].map((i) => <SkeletonCard key={i} />)}
          </div>
        )}

        {/* Error panel */}
        {!loading && loadError && (
          <div className={`${cardShell} flex flex-col items-center gap-3 px-6 py-16 text-center`}>
            <p className="text-[14px] text-[#C44545]">{loadError}</p>
            <button
              type="button"
              onClick={load}
              className="rounded-md border border-[#E6E1D4] bg-white px-4 py-2 text-[13px] font-medium text-[#3A3A3A] hover:bg-[#FAF8F2]"
            >
              Retry
            </button>
          </div>
        )}

        {/* Empty state — no customers at all */}
        {!loading && !loadError && customers.length === 0 && (
          <div className={`${cardShell} px-6 py-16 text-center`}>
            <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-[#FAF8F2] text-[#A0A0A0]">
              <Users className="h-7 w-7" strokeWidth={1.5} />
            </div>
            <h3
              className="text-[22px] font-medium text-[#1A1A1A]"
              style={{ fontFamily: FRAUNCES }}
            >
              No customers yet.
            </h3>
            <p className="mx-auto mt-2 max-w-md text-[13px] text-[#6B6B6B]">
              Add your first customer to start tracking properties and maintenance requests.
            </p>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className={`mt-6 ${btnPrimary}`}
            >
              <Plus className="h-4 w-4" />
              New customer
            </button>
          </div>
        )}

        {/* Search no-results */}
        {!loading && !loadError && customers.length > 0 && sorted.length === 0 && (
          <div className={`${cardShell} px-6 py-12 text-center`}>
            <p className="text-[15px] font-medium text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>
              Nothing matches.
            </p>
            <p className="mt-1 text-[13px] text-[#6B6B6B]">Try a different search or filter.</p>
            <button
              type="button"
              onClick={() => { setSearch(''); setFilter('all'); }}
              className="mt-4 text-[13px] font-medium text-[#246F47] hover:underline"
            >
              Clear filters
            </button>
          </div>
        )}

        {/* Table */}
        {!loading && !loadError && sorted.length > 0 && (
          <section className={`overflow-hidden ${cardShell}`}>
            {/* Table header row */}
            <div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)_100px_120px_110px_80px_32px] items-center gap-4 border-b border-[#EFEBE0] px-5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#A0A0A0] sm:grid">
              <span>Customer</span>
              <span>Contact</span>
              <span>Properties</span>
              <span>Open requests</span>
              <span>Last activity</span>
              <span>Status</span>
              <span />
            </div>

            <ul className="divide-y divide-[#EFEBE0]">
              {sorted.map((c) => {
                const reqs = requestsByCustomer.get(c.id) ?? [];
                const openReqs = reqs.filter((r) => OPEN_STATUSES.has(r.status));
                const urgent = openReqs.some((r) => r.urgency >= 4);
                const propCount = (propsByCustomer.get(c.id) ?? []).length;
                const lastActivity = deriveLastActivity(c, reqs);

                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => openDrawer(c)}
                      className="grid w-full grid-cols-1 gap-2 px-5 py-4 text-left transition-colors hover:bg-[#FAF8F2] sm:grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)_100px_120px_110px_80px_32px] sm:items-center sm:gap-4"
                    >
                      {/* Customer */}
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Avatar name={c.name} />
                        <div className="min-w-0">
                          <p className="truncate text-[14px] font-semibold text-[#1A1A1A]">{c.name}</p>
                          {c.customerType && (
                            <p className="text-[11px] text-[#6B6B6B]">{c.customerType}</p>
                          )}
                        </div>
                      </div>

                      {/* Contact */}
                      <div className="min-w-0 hidden sm:block">
                        {c.primaryContactName && (
                          <p className="truncate text-[13px] text-[#3A3A3A]">{c.primaryContactName}</p>
                        )}
                        {c.primaryContactEmail && (
                          <p className="truncate text-[12px] text-[#6B6B6B]">{c.primaryContactEmail}</p>
                        )}
                        {!c.primaryContactName && !c.primaryContactEmail && (
                          <p className="text-[12px] text-[#A0A0A0]">&mdash;</p>
                        )}
                      </div>

                      {/* Properties */}
                      <div className="hidden sm:block">
                        <p className="text-[13px] text-[#6B6B6B]">
                          {propCount} {propCount === 1 ? 'property' : 'properties'}
                        </p>
                      </div>

                      {/* Open requests */}
                      <div className="hidden sm:block">
                        <OpenCountPill count={openReqs.length} urgent={urgent} />
                      </div>

                      {/* Last activity */}
                      <div className="hidden sm:block">
                        <p className="text-[13px] text-[#6B6B6B]">{relTime(lastActivity)}</p>
                      </div>

                      {/* Status */}
                      <div className="hidden sm:block">
                        {c.isActive ? (
                          <span
                            className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
                            style={{ background: TONE.sage.bg, color: TONE.sage.fg }}
                          >
                            ACTIVE
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-[#EEF1F4] px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[#5B6B7B]">
                            ARCHIVED
                          </span>
                        )}
                      </div>

                      {/* Chevron */}
                      <div className="hidden sm:flex justify-end">
                        <ChevronRight className="h-4 w-4 text-[#A0A0A0]" />
                      </div>

                      {/* Mobile: compact summary below name */}
                      <div className="flex items-center justify-between sm:hidden">
                        <span className="text-[12px] text-[#6B6B6B]">
                          {openReqs.length} open &middot; {relTime(lastActivity)}
                        </span>
                        {c.isActive ? (
                          <span
                            className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase"
                            style={{ background: TONE.sage.bg, color: TONE.sage.fg }}
                          >
                            ACTIVE
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-[#EEF1F4] px-2 py-0.5 text-[10px] font-semibold uppercase text-[#5B6B7B]">
                            ARCHIVED
                          </span>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>

      {/* Create customer modal */}
      <CreateCustomerModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={(c, propertyAttached) => {
          setCustomers((prev) => [c, ...prev]);
          const msg = propertyAttached
            ? `${c.name} added — 1 property attached.`
            : `${c.name} added — add a property when ready.`;
          setToast({ message: msg, type: 'success' });
        }}
        onError={(msg) => setToast({ message: msg, type: 'error' })}
      />

      {/* Customer drawer */}
      {drawer && (
        <CustomerDrawer
          customer={drawer.customer}
          properties={drawer.properties}
          requests={drawer.requests}
          onClose={closeDrawer}
          onOpenFullProfile={(id) => { closeDrawer(); onSelectCustomer(id); }}
          onCustomerChange={handleDrawerCustomerChange}
          onToast={(msg, type) => setToast({ message: msg, type })}
        />
      )}

      {toast && (
        <Toaster message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}

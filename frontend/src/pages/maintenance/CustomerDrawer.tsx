// CustomerDrawer — right slide-over panel showing a customer summary.
// Opened from the customers table; does NOT replace CustomerDetail (full profile).
//
// Layout: fixed right-side panel ~480px, backdrop, translate-x animation.
// Escape key: closes drawer directly (modals only appear via flows that closed it).
// "Full profile →" calls onOpenFullProfile to navigate the view-stack.

import { useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Home, ChevronRight,
} from 'lucide-react';
import type { Customer } from '../../lib/api/customers';
import { setCustomerActive } from '../../lib/api/customers';
import type { Property } from '../../lib/api/properties';
import type { MaintenanceRequestWithContext } from '../../lib/api/maintenanceRequests';
import { FRAUNCES, TONE } from '../gantt/components/ledger';

// ─── helpers ────────────────────────────────────────────────────────────────

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

/** Relative time from ISO string. */
function relTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return mins <= 1 ? "just now" : `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return new Date(iso).toLocaleDateString("en-AU", { month: "short", year: "numeric" });
}

/** Format date as "12 Jan 2025". */
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

/** Customer since Mon YYYY. */
function customerSince(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", { month: "short", year: "numeric" });
}

/** Strip non-digit/plus chars for tel: links. */
function stripPhone(phone: string): string {
  return phone.replace(/[^\d+]/g, "");
}

const OPEN_STATUSES = new Set(["new", "acknowledged", "scheduled"]);

// ─── priority pill ────────────────────────────────────────────────────────────

function PriorityPill({ urgency }: { urgency: number }) {
  if (urgency >= 4) {
    return (
      <span
        className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
        style={{ background: TONE.red.bg, color: TONE.red.fg }}
      >
        URGENT
      </span>
    );
  }
  if (urgency === 3) {
    return (
      <span
        className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
        style={{ background: TONE.amber.bg, color: TONE.amber.fg }}
      >
        HIGH
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-[#EEF1F4] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#5B6B7B]">
      ROUTINE
    </span>
  );
}

/** Friendly status label for open requests. */
function friendlyStatus(status: string): string {
  if (status === "new" || status === "acknowledged") return "Open";
  if (status === "scheduled") return "Scheduled";
  return "In review";
}

// ─── timeline derivation ──────────────────────────────────────────────────────

interface TimelineEntry {
  iso: string;
  label: string;
}

function buildTimeline(
  customer: Customer,
  requests: MaintenanceRequestWithContext[],
): TimelineEntry[] {
  const entries: TimelineEntry[] = [];

  // Customer created
  entries.push({ iso: customer.createdAt, label: "Customer added" });

  for (const r of requests) {
    entries.push({ iso: r.createdAt, label: "Maintenance request logged" });
    if (r.completedAt) {
      entries.push({ iso: r.completedAt, label: `Request completed — ${r.title}` });
    }
  }

  // Sort descending, cap at 6
  return entries.sort((a, b) => b.iso.localeCompare(a.iso)).slice(0, 6);
}

// ─── component props ─────────────────────────────────────────────────────────

export interface CustomerDrawerProps {
  customer: Customer;
  properties: Property[];
  requests: MaintenanceRequestWithContext[];
  onClose: () => void;
  onOpenFullProfile: (id: string) => void;
  onCustomerChange: (updated: Customer) => void;
  onToast: (msg: string, type: "success" | "error") => void;
}

// ─── component ───────────────────────────────────────────────────────────────

export default function CustomerDrawer({
  customer,
  properties,
  requests,
  onClose,
  onOpenFullProfile,
  onCustomerChange,
  onToast,
}: CustomerDrawerProps) {
  // Escape key closes the drawer. Modals sit above the drawer only via user
  // flows that already closed it, so no guard is needed here.
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      onClose();
    },
    [onClose],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const h = nameHue(customer.name);
  const avatarBg = `hsl(${h} 30% 90%)`;
  const avatarFg = `hsl(${h} 42% 27%)`;

  const openRequests = requests.filter((r) => OPEN_STATUSES.has(r.status));
  const isUrgent = openRequests.some((r) => r.urgency >= 4);
  const timeline = buildTimeline(customer, requests);

  const handleArchiveToggle = async () => {
    try {
      await setCustomerActive(customer.id, !customer.isActive);
      onCustomerChange({ ...customer, isActive: !customer.isActive });
      onToast(
        customer.isActive ? "Customer archived." : "Customer reactivated.",
        "success",
      );
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Failed to update customer.", "error");
    }
  };

  return (
    <AnimatePresence>
      {/* Backdrop */}
      <motion.div
        key="drawer-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        className="fixed inset-0 z-40 bg-[#1A1A1A]/30"
        onClick={onClose}
        aria-hidden
      />

      {/* Panel */}
      <motion.aside
        key="drawer-panel"
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 28, stiffness: 300 }}
        className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[480px] flex-col overflow-hidden rounded-l-[16px] border-l border-[#E6E1D4] bg-white shadow-[0_8px_40px_rgba(20,20,20,0.14)]"
        style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}
        aria-label={`Customer details: ${customer.name}`}
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-[#EFEBE0] px-5 py-4">
          <div
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-[15px] font-bold"
            style={{ background: avatarBg, color: avatarFg }}
          >
            {initials(customer.name)}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2
                className="text-[20px] font-medium leading-tight text-[#1A1A1A]"
                style={{ fontFamily: FRAUNCES, letterSpacing: "-0.015em" }}
              >
                {customer.name}
              </h2>
              {customer.isActive ? (
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                  style={{ background: TONE.sage.bg, color: TONE.sage.fg }}
                >
                  ACTIVE
                </span>
              ) : (
                <span className="rounded-full bg-[#EEF1F4] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#5B6B7B]">
                  ARCHIVED
                </span>
              )}
            </div>
            <p className="mt-0.5 text-[12px] text-[#6B6B6B]">
              {[customer.customerType, `customer since ${customerSince(customer.createdAt)}`]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex-shrink-0 rounded-md p-1.5 text-[#A0A0A0] hover:bg-[#F0EDE4] hover:text-[#3A3A3A]"
            aria-label="Close drawer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          {/* Contact card */}
          {(customer.primaryContactName || customer.primaryContactEmail || customer.phone) && (
            <section>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#A0A0A0]">
                Contact
              </p>
              <div className="rounded-[10px] border border-[#EFEBE0] bg-[#FAFAF8] px-4 py-3 space-y-1.5">
                {customer.primaryContactName && (
                  <p className="text-[14px] font-medium text-[#1A1A1A]">{customer.primaryContactName}</p>
                )}
                <div className="flex flex-wrap gap-2">
                  {customer.primaryContactEmail && (
                    <a
                      href={`mailto:${customer.primaryContactEmail}`}
                      className="inline-flex items-center gap-1 rounded-full border border-[#E6E1D4] bg-white px-3 py-1 text-[12px] text-[#246F47] hover:bg-[#E5F2EA]"
                    >
                      {customer.primaryContactEmail}
                    </a>
                  )}
                  {customer.phone && (
                    <a
                      href={`tel:${stripPhone(customer.phone)}`}
                      className="inline-flex items-center gap-1 rounded-full border border-[#E6E1D4] bg-white px-3 py-1 text-[12px] text-[#3A3A3A] hover:bg-[#F0EDE4]"
                    >
                      {customer.phone}
                    </a>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* Properties */}
          <section>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#A0A0A0]">
              Properties &middot; {properties.length}
            </p>
            {properties.length === 0 ? (
              <p className="text-[13px] text-[#A0A0A0]">No properties on file.</p>
            ) : (
              <ul className="space-y-1.5">
                {properties.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-start gap-2.5 rounded-[8px] border border-[#EFEBE0] bg-white px-3 py-2.5"
                  >
                    <Home className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#A0A0A0]" strokeWidth={1.5} />
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-[#1A1A1A]">{p.name}</p>
                      {p.address && (
                        <p className="text-[12px] text-[#6B6B6B]">
                          {p.address}
                          {p.suburb && (
                            <span className="ml-1.5 rounded bg-[#F0EDE4] px-1 py-0.5 text-[10px] text-[#5B6B7B]">
                              {p.suburb}
                            </span>
                          )}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Open requests */}
          <section>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#A0A0A0]">
              Open Requests &middot; {openRequests.length}
            </p>
            {openRequests.length === 0 ? (
              <div className="rounded-[8px] border border-dashed border-[#EFEBE0] px-4 py-4 text-center text-[13px] text-[#A0A0A0]">
                No open requests &mdash; all clear.
              </div>
            ) : (
              <ul className="space-y-1.5">
                {openRequests.map((r) => (
                  <li
                    key={r.id}
                    className="rounded-[8px] border border-[#EFEBE0] bg-white px-3 py-2.5"
                  >
                    <div className="flex items-start gap-2 flex-wrap">
                      <PriorityPill urgency={r.urgency} />
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                        style={{ background: TONE.slate.bg, color: TONE.slate.fg }}
                      >
                        {friendlyStatus(r.status)}
                      </span>
                    </div>
                    <p className="mt-1.5 text-[13px] font-medium text-[#1A1A1A]">{r.title}</p>
                    <p className="text-[11px] text-[#6B6B6B]">
                      {r.propertyName ?? "Unknown property"}
                      {r.scheduledFor && (
                        <span className="ml-2 text-[#C8841E]">
                          scheduled {fmtDate(r.scheduledFor)}
                        </span>
                      )}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Recent activity */}
          <section>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#A0A0A0]">
              Recent Activity
            </p>
            {timeline.length === 0 ? (
              <p className="text-[13px] text-[#A0A0A0]">No activity yet.</p>
            ) : (
              <ul className="space-y-0">
                {timeline.map((entry, i) => (
                  <li key={i} className="flex gap-3 pb-3">
                    <div className="flex flex-col items-center">
                      <div className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-[#E6E1D4]" />
                      {i < timeline.length - 1 && (
                        <div className="w-px flex-1 bg-[#EFEBE0]" style={{ minHeight: "12px" }} />
                      )}
                    </div>
                    <div className="min-w-0 pb-0.5">
                      <p className="text-[13px] text-[#1A1A1A]">{entry.label}</p>
                      <p className="text-[11px] text-[#A0A0A0]">{relTime(entry.iso)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center gap-2 border-t border-[#EFEBE0] bg-[#FAFAF8] px-5 py-3">
          <button
            type="button"
            onClick={handleArchiveToggle}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#E6E1D4] bg-white px-3.5 py-2 text-[13px] font-semibold text-[#3A3A3A] transition-colors hover:bg-[#FAF8F2]"
          >
            {customer.isActive ? "Archive" : "Reactivate"}
          </button>

          <button
            type="button"
            onClick={() => onOpenFullProfile(customer.id)}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#E6E1D4] bg-white px-3.5 py-2 text-[13px] font-semibold text-[#1A1A1A] transition-colors hover:bg-[#F0EDE4]"
          >
            Full profile
            <ChevronRight className="h-4 w-4" />
          </button>

          {customer.primaryContactEmail && (
            <a
              href={`mailto:${customer.primaryContactEmail}`}
              className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-[#2F8F5C] px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-[#246F47]"
            >
              Message customer
            </a>
          )}
        </div>

        {/* Urgent flag indicator strip at top */}
        {isUrgent && (
          <div
            className="absolute top-0 left-0 right-0 h-[3px] rounded-tl-[16px]"
            style={{ background: TONE.red.dot }}
          />
        )}
      </motion.aside>
    </AnimatePresence>
  );
}

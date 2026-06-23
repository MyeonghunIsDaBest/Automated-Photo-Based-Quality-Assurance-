// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// pages/sales/QuotesTab.tsx â€” status-filter chips, table, new-quote modal.
//
// Props:
//   initialCustomerFilter â€” pre-selects a customer filter via ?customer= param.
//   onChanged              â€” called after any write so the masthead refreshes.
//
// Row click â†’ QuoteEditor (rendered inline via selectedId state so no route
// needed; the editor calls onClose which pops back to the list).
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, RefreshCw, X } from "lucide-react";

import { TONE, cardShell, btnPrimary, btnGhost } from "../gantt/components/ledger";
import { SkeletonLine } from "../../components/ui/skeleton";
import { Toaster } from "../../components/ui/Toaster";

import {
  listQuotes,
  type Quote,
  type QuoteStatus,
} from "../../lib/api/commercial";
import { listCustomers, type Customer } from "../../lib/api/customers";
import QuoteEditor from "./QuoteEditor";
import NewQuoteWizard from "./NewQuoteWizard";

// â”€â”€â”€ types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type ToastState = { message: string; type: "success" | "error" | "info" } | null;

interface Props {
  initialCustomerFilter?: string | null;
  onChanged: () => void;
  /** Manager-only: surface the internal cost/margin view in the quote editor. */
  canSeeCost?: boolean;
  /** Deep-link: open this quote in the editor on mount (e.g. from a job drawer). */
  initialQuoteId?: string | null;
}

// â”€â”€â”€ status pill tokens â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const STATUS_TONE: Record<QuoteStatus, keyof typeof TONE> = {
  draft:    "ink",
  sent:     "slate",
  viewed:   "amber",
  accepted: "sage",
  declined: "red",
  expired:  "orange",
};

const STATUS_LABELS: Record<QuoteStatus, string> = {
  draft:    "Draft",
  sent:     "Sent",
  viewed:   "Viewed",
  accepted: "Accepted",
  declined: "Declined",
  expired:  "Expired",
};

// â”€â”€â”€ helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function ageLabel(createdAt: string): string {
  const ms   = Date.now() - new Date(createdAt).getTime();
  const days = Math.floor(ms / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30)  return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function fmtMoney(n: number): string {
  return "$" + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// â”€â”€â”€ skeleton row â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function SkeletonRow() {
  return (
    <tr className="border-b border-[#EFEBE0]">
      {[120, 180, 140, 80, 60, 60].map((w, i) => (
        <td key={i} className="px-4 py-3">
          <SkeletonLine style={{ width: w }} />
        </td>
      ))}
    </tr>
  );
}


// â”€â”€â”€ component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const ALL_STATUSES: QuoteStatus[] = ["draft", "sent", "viewed", "accepted", "declined", "expired"];

export default function QuotesTab({ initialCustomerFilter, onChanged, canSeeCost = false, initialQuoteId = null }: Props) {
  const [quotes, setQuotes]       = useState<Quote[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<QuoteStatus | null>(null);
  const [customerFilter, setCustomerFilter] = useState<string | null>(
    initialCustomerFilter ?? null
  );

  const [showNewModal, setShowNewModal]   = useState(false);
  const [selectedId, setSelectedId]       = useState<string | null>(initialQuoteId);
  const [toast, setToast]                 = useState<ToastState>(null);

  // Deep-link: open the requested quote when the caller changes initialQuoteId.
  useEffect(() => {
    if (initialQuoteId) setSelectedId(initialQuoteId);
  }, [initialQuoteId]);

  const customersLoaded = useRef(false);

  const fetchQuotes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = await listQuotes(
        statusFilter || customerFilter
          ? { status: statusFilter ?? undefined, customerId: customerFilter ?? undefined }
          : undefined
      );
      setQuotes(qs);
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : "Failed to load quotes");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, customerFilter]);

  useEffect(() => {
    void fetchQuotes();
  }, [fetchQuotes]);

  useEffect(() => {
    if (customersLoaded.current) return;
    customersLoaded.current = true;
    listCustomers().then(setCustomers).catch(() => {});
  }, []);

  // Resolve display name for customerFilter chip
  const filterCustomerName = customerFilter
    ? (customers.find((c) => c.id === customerFilter)?.name ?? customerFilter)
    : null;

  function handleQuoteCreated(quoteId: string, openEditor: boolean) {
    setShowNewModal(false);
    setToast({ message: "Quote created", type: "success" });
    void fetchQuotes();
    onChanged();
    if (openEditor) setSelectedId(quoteId);
  }

  function handleEditorClose() {
    setSelectedId(null);
    void fetchQuotes();
    onChanged();
  }

  // If an editor is open, render it full-width instead of the table
  if (selectedId) {
    return (
      <QuoteEditor
        quoteId={selectedId}
        onClose={handleEditorClose}
        onChanged={() => { void fetchQuotes(); onChanged(); }}
        canSeeCost={canSeeCost}
      />
    );
  }

  return (
    <div className={`${cardShell} overflow-hidden`}>
      {/* â”€â”€ Toolbar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="flex flex-wrap items-center gap-3 border-b border-[#E6E1D4] px-4 py-3">
        {/* Status filter chips */}
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setStatusFilter(null)}
            className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
              statusFilter === null
                ? "border-[#1A1A1A] bg-[#1A1A1A] text-white"
                : "border-[#E6E1D4] bg-white text-[#6B6B6B] hover:border-[#D8D2C4]"
            }`}
          >
            All
          </button>
          {ALL_STATUSES.map((s) => {
            const t = TONE[STATUS_TONE[s]];
            const active = statusFilter === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(statusFilter === s ? null : s)}
                className="rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors"
                style={active
                  ? { borderColor: t.dot, backgroundColor: t.bg, color: t.fg }
                  : { borderColor: "#E6E1D4", backgroundColor: "white", color: "#6B6B6B" }
                }
              >
                {STATUS_LABELS[s]}
              </button>
            );
          })}
        </div>

        {/* Customer filter dismissible chip */}
        {filterCustomerName && (
          <span className="flex items-center gap-1 rounded-full border border-[#2F8F5C] bg-[#E5F2EA] px-2.5 py-0.5 text-xs font-medium text-[#246F47]">
            {filterCustomerName}
            <button
              type="button"
              onClick={() => setCustomerFilter(null)}
              className="ml-0.5 rounded-full hover:text-[#C44545]"
              aria-label="Clear customer filter"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        )}

        {/* New quote button */}
        <button
          type="button"
          onClick={() => setShowNewModal(true)}
          className={btnPrimary + " ml-auto"}
        >
          <Plus className="h-4 w-4" />
          New quote
        </button>
      </div>

      {/* â”€â”€ Error panel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {error && !loading && (
        <div className="flex items-center justify-between border-b border-[#F0BFBF] bg-[#FBE5E5] px-4 py-3">
          <p className="text-xs text-[#C44545]">{error}</p>
          <button
            type="button"
            onClick={() => void fetchQuotes()}
            className={btnGhost + " py-1 px-3 text-xs"}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </button>
        </div>
      )}

      {/* â”€â”€ Table â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-[#E6E1D4] bg-[#FAF8F2]">
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Number</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Title</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Customer / Client</th>
              <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Total inc GST</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Status</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Created</th>
            </tr>
          </thead>
          <tbody>
            {loading && [1, 2, 3, 4, 5].map((i) => <SkeletonRow key={i} />)}

            {!loading && quotes.length === 0 && !error && (
              <tr>
                <td colSpan={6} className="px-4 py-16 text-center text-[#A0A0A0]">
                  <p className="text-sm font-medium">No quotes yet</p>
                  <p className="mt-1 text-xs">
                    {statusFilter
                      ? "Try adjusting the status filter"
                      : "Your first one is a button away."}
                  </p>
                </td>
              </tr>
            )}

            {!loading && quotes.map((q) => {
              const tone = TONE[STATUS_TONE[q.status]];
              const isAccepted = q.status === "accepted";
              const clientDisplay =
                q.clientName ??
                (q.customerId
                  ? (customers.find((c) => c.id === q.customerId)?.name ?? q.customerId)
                  : "â€”");
              return (
                <tr
                  key={q.id}
                  className="border-b border-[#EFEBE0] transition-colors hover:bg-[#FAF8F2] cursor-pointer"
                  onClick={() => setSelectedId(q.id)}
                >
                  <td className="px-4 py-3 font-mono text-xs text-[#6B6B6B]">
                    {q.number ?? "â€”"}
                  </td>
                  <td className="px-4 py-3 font-medium text-[#1A1A1A]">
                    {q.title}
                  </td>
                  <td className="px-4 py-3 text-[#3A3A3A]">{clientDisplay}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium text-[#1A1A1A]">
                    {fmtMoney(q.totalIncGst)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
                      style={{
                        backgroundColor: tone.bg,
                        color: tone.fg,
                        transform: isAccepted ? "rotate(-2deg)" : undefined,
                        boxShadow: isAccepted ? `0 0 0 1px ${tone.dot}` : undefined,
                      }}
                    >
                      {STATUS_LABELS[q.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-[#6B6B6B]">
                    {ageLabel(q.createdAt)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* â”€â”€ New Quote Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {showNewModal && (
        <NewQuoteWizard
          customers={customers}
          onCancel={() => setShowNewModal(false)}
          onCreated={handleQuoteCreated}
        />
      )}

      {toast && (
        <Toaster message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// pages/sales/QuotesTab.tsx — the Quotes register, styled to match the Sim-Pro
// Jobs body: a slim section header (eyebrow + Fraunces title + summary + action),
// a cream toolbar band (status filter chips with count badges + search), then a
// roomy browse table (taller rows, shared StatusPill). Mounted under both the
// Jobs hub and the Sales masthead.
//
// Props:
//   initialCustomerFilter — pre-selects a customer filter via ?customer= param.
//   onChanged             — called after any write so the masthead refreshes.
//
// Row click → QuoteEditor (rendered inline via selectedId so no route needed).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, RefreshCw, X, Search, MoreVertical, Pencil, Trash2 } from "lucide-react";

import { FRAUNCES, TONE, cardShell, btnPrimary, btnGhost, StatusPill } from "../gantt/components/ledger";
import { SkeletonLine } from "../../components/ui/skeleton";
import { Toaster } from "../../components/ui/Toaster";

import {
  listQuotes,
  deleteQuote,
  type Quote,
  type QuoteStatus,
} from "../../lib/api/commercial";
import { listCustomers, type Customer } from "../../lib/api/customers";
import { QUOTE_STATUS_TONE } from "./quoteStatus";
import QuoteEditor from "./QuoteEditor";
import NewQuoteWizard from "./NewQuoteWizard";
import ConfirmDeleteDialog from "../catalogue/ConfirmDeleteDialog";

// ─── types ───────────────────────────────────────────────────────────────────

type ToastState = { message: string; type: "success" | "error" | "info" } | null;

interface Props {
  initialCustomerFilter?: string | null;
  onChanged: () => void;
  /** Manager-only: surface the internal cost/margin view in the quote editor. */
  canSeeCost?: boolean;
  /** Deep-link: open this quote in the editor on mount (e.g. from a job drawer). */
  initialQuoteId?: string | null;
  /** Deep-link: open the register on one of the two quote registers (?type=). */
  initialTypeFilter?: "service" | "project" | null;
}

type QuoteTypeFilter = "service" | "project" | null;

/** The two registers living inside the one Quotes tab. */
const TYPE_SEGMENTS: { key: QuoteTypeFilter; label: string }[] = [
  { key: null, label: "All quotes" },
  { key: "service", label: "Service" },
  { key: "project", label: "Project" },
];

const typeBadge = (t: "service" | "project") =>
  t === "project"
    ? "bg-[#F9EFD9] text-[#C8841E]"
    : "border border-[#E6E1D4] bg-white text-[#6B6B6B]";

// ─── status tokens ─────────────────────────────────────────────────────────────

// Status → tone comes from the shared map (./quoteStatus) so the register, the
// editor, and the wizard all colour status identically.
const STATUS_TONE = QUOTE_STATUS_TONE;

const STATUS_LABELS: Record<QuoteStatus, string> = {
  draft:    "Draft",
  sent:     "Sent",
  viewed:   "Viewed",
  accepted: "Accepted",
  declined: "Declined",
  expired:  "Expired",
};

const ALL_STATUSES: QuoteStatus[] = ["draft", "sent", "viewed", "accepted", "declined", "expired"];

// Statuses that count as "live" opportunities for the pipeline summary.
const PIPELINE_STATUSES: QuoteStatus[] = ["draft", "sent", "viewed"];

// ─── helpers ─────────────────────────────────────────────────────────────────

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

// ─── skeleton row (matches the roomy real rows) ──────────────────────────────

function SkeletonRow() {
  return (
    <tr className="border-b border-[#EFEBE0]">
      {[120, 64, 180, 140, 80, 70, 60, 24].map((w, i) => (
        <td key={i} className="px-4 py-4">
          <SkeletonLine style={{ width: w }} />
        </td>
      ))}
    </tr>
  );
}

// ─── component ───────────────────────────────────────────────────────────────

export default function QuotesTab({ initialCustomerFilter, onChanged, canSeeCost = false, initialQuoteId = null, initialTypeFilter = null }: Props) {
  const [quotes, setQuotes]       = useState<Quote[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<QuoteStatus | null>(null);
  const [customerFilter, setCustomerFilter] = useState<string | null>(initialCustomerFilter ?? null);
  const [typeFilter, setTypeFilter] = useState<QuoteTypeFilter>(initialTypeFilter ?? null);
  const [search, setSearch] = useState("");

  const [showNewModal, setShowNewModal] = useState(false);
  const [selectedId, setSelectedId]     = useState<string | null>(initialQuoteId);
  const [toast, setToast]               = useState<ToastState>(null);
  const [menuFor, setMenuFor]           = useState<string | null>(null);   // open row action menu
  const [confirmDelete, setConfirmDelete] = useState<Quote | null>(null);
  const [deleting, setDeleting]         = useState(false);

  // Deep-link: open the requested quote when the caller changes initialQuoteId.
  useEffect(() => {
    if (initialQuoteId) setSelectedId(initialQuoteId);
  }, [initialQuoteId]);

  const customersLoaded = useRef(false);

  // Fetch customer-scoped (status + search are filtered client-side so the chips
  // can show per-status counts; quote volumes are modest enough for this).
  const fetchQuotes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = await listQuotes(customerFilter ? { customerId: customerFilter } : undefined);
      setQuotes(qs);
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : "Failed to load quotes");
    } finally {
      setLoading(false);
    }
  }, [customerFilter]);

  useEffect(() => { void fetchQuotes(); }, [fetchQuotes]);

  useEffect(() => {
    if (customersLoaded.current) return;
    customersLoaded.current = true;
    listCustomers().then(setCustomers).catch(() => {});
  }, []);

  const filterCustomerName = customerFilter
    ? (customers.find((c) => c.id === customerFilter)?.name ?? customerFilter)
    : null;

  const customerName = useCallback(
    (q: Quote) =>
      q.clientName ??
      (q.customerId ? (customers.find((c) => c.id === q.customerId)?.name ?? q.customerId) : "—"),
    [customers],
  );

  // The active register: Service, Project, or both. Every count, chip badge,
  // pipeline figure and row below is scoped to it.
  const typeScoped = useMemo(
    () => (typeFilter ? quotes.filter((q) => q.quoteType === typeFilter) : quotes),
    [quotes, typeFilter],
  );
  const typeCounts = useMemo(() => ({
    all: quotes.length,
    service: quotes.filter((q) => q.quoteType === "service").length,
    project: quotes.filter((q) => q.quoteType === "project").length,
  }), [quotes]);

  // Per-status counts for the chip badges (off the register-scoped set).
  const statusCounts = useMemo(() => {
    const c: Record<QuoteStatus, number> = { draft: 0, sent: 0, viewed: 0, accepted: 0, declined: 0, expired: 0 };
    for (const q of typeScoped) c[q.status] += 1;
    return c;
  }, [typeScoped]);

  // Live-pipeline value for the summary line.
  const pipelineValue = useMemo(
    () => typeScoped.filter((q) => PIPELINE_STATUSES.includes(q.status)).reduce((s, q) => s + q.totalIncGst, 0),
    [typeScoped],
  );

  // Visible rows: status chip + search box, both client-side.
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return typeScoped.filter((q) => {
      if (statusFilter && q.status !== statusFilter) return false;
      if (!term) return true;
      return (
        (q.number ?? "").toLowerCase().includes(term) ||
        q.title.toLowerCase().includes(term) ||
        customerName(q).toLowerCase().includes(term)
      );
    });
  }, [typeScoped, statusFilter, search, customerName]);

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

  async function handleDelete() {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await deleteQuote(confirmDelete.id);
      if (selectedId === confirmDelete.id) setSelectedId(null);
      const label = confirmDelete.number ?? confirmDelete.title ?? "Quote";
      setConfirmDelete(null);
      await fetchQuotes();
      onChanged();
      setToast({ message: `${label} deleted`, type: "success" });
    } catch (ex) {
      setToast({ message: ex instanceof Error ? ex.message : "Failed to delete quote", type: "error" });
    } finally {
      setDeleting(false);
    }
  }

  // If an editor is open, render it full-width instead of the register.
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

  const total = typeScoped.length;
  const registerName = typeFilter === "project" ? "project quote" : typeFilter === "service" ? "service quote" : "quote";

  return (
    <div className="space-y-5">
      {/* ── Section header (mirrors the Sim-Pro Jobs body) ─────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="leading-tight">
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#6B6B6B]">
            {typeFilter === "project" ? "PROJECT QUOTES" : typeFilter === "service" ? "SERVICE QUOTES" : "SERVICE & PROJECT QUOTES"} · CASONE ELECTRICAL
          </div>
          <h1
            className="m-0 text-[28px] font-medium leading-none text-[#1A1A1A] sm:text-[32px]"
            style={{ fontFamily: FRAUNCES, letterSpacing: "-0.02em" }}
          >
            Quotes<span className="italic text-[#2F8F5C]">.</span>
          </h1>
          <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-[#6B6B6B]">
            {total > 0 ? (
              <>
                {total.toLocaleString("en-AU")} {registerName}{total === 1 ? "" : "s"} ·{" "}
                <span className="font-semibold text-[#3A3A3A]">{fmtMoney(pipelineValue)}</span> in the pipeline.
                Draft, send, and track them through to accepted.
              </>
            ) : (
              <>No {registerName}s yet. Spin one up — pick a customer, build the parts &amp; labour, and send it.</>
            )}
          </p>
        </div>

        <div className="flex flex-shrink-0 flex-col items-end gap-2">
          <button type="button" onClick={() => setShowNewModal(true)} className={btnPrimary + " flex-shrink-0"}>
            <Plus className="h-4 w-4" />
            {typeFilter === "project" ? "New project quote" : typeFilter === "service" ? "New service quote" : "New quote"}
          </button>
          {/* The two registers living inside the one tab */}
          <div className="flex gap-1 rounded-full border border-[#E6E1D4] bg-[#FAF8F2] p-0.5 text-[13px]">
            {TYPE_SEGMENTS.map((seg) => {
              const active = typeFilter === seg.key;
              const count = seg.key === null ? typeCounts.all : typeCounts[seg.key];
              return (
                <button
                  key={seg.label}
                  type="button"
                  onClick={() => { setTypeFilter(seg.key); setStatusFilter(null); }}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 font-medium transition-colors ${
                    active ? "bg-[#1A1A1A] text-white shadow-sm" : "text-[#6B6B6B] hover:text-[#1A1A1A]"
                  }`}
                >
                  {seg.label}
                  <span className={`rounded-full px-1.5 text-[11px] font-semibold tabular-nums ${
                    active ? "bg-white/20 text-white" : "bg-[#E6E1D4] text-[#6B6B6B]"
                  }`}>
                    {count.toLocaleString("en-AU")}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Register card ───────────────────────────────────────────────────── */}
      <div className={`overflow-hidden ${cardShell}`}>
        {/* Toolbar band: status chips (with counts) + customer chip + search */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E6E1D4] bg-[#FAF8F2] px-4 py-3">
          <div className="inline-flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={() => setStatusFilter(null)}
              className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors ${
                statusFilter === null ? "bg-[#1A1A1A] text-white shadow-sm" : "text-[#6B6B6B] hover:bg-[#EFEBE0] hover:text-[#1A1A1A]"
              }`}
            >
              All
              <span className={`rounded-full px-1.5 text-[11px] font-semibold tabular-nums ${
                statusFilter === null ? "bg-white/20 text-white" : "bg-[#E6E1D4] text-[#6B6B6B]"
              }`}>
                {total.toLocaleString("en-AU")}
              </span>
            </button>
            {ALL_STATUSES.map((s) => {
              const active = statusFilter === s;
              const t = TONE[STATUS_TONE[s]];
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatusFilter(active ? null : s)}
                  className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors ${
                    active ? "bg-[#1A1A1A] text-white shadow-sm" : "text-[#6B6B6B] hover:bg-[#EFEBE0] hover:text-[#1A1A1A]"
                  }`}
                >
                  {!active && (
                    <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ background: t.dot }} aria-hidden />
                  )}
                  {STATUS_LABELS[s]}
                  <span className={`rounded-full px-1.5 text-[11px] font-semibold tabular-nums ${
                    active ? "bg-white/20 text-white" : "bg-[#E6E1D4] text-[#6B6B6B]"
                  }`}>
                    {statusCounts[s].toLocaleString("en-AU")}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {filterCustomerName && (
              <span className="flex items-center gap-1 rounded-full border border-[#2F8F5C] bg-[#E5F2EA] px-2.5 py-1 text-xs font-medium text-[#246F47]">
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
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A0A0A0]" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search number, title, customer…"
                className="w-64 max-w-full rounded-full border border-[#E6E1D4] bg-white py-2 pl-9 pr-3 text-sm text-[#1A1A1A] placeholder:text-[#A0A0A0] focus:border-[#D8D2C4] focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Error panel */}
        {error && !loading && (
          <div className="flex items-center justify-between border-b border-[#F0BFBF] bg-[#FBE5E5] px-4 py-3">
            <p className="text-xs text-[#C44545]">{error}</p>
            <button type="button" onClick={() => void fetchQuotes()} className={btnGhost + " py-1 px-3 text-xs"}>
              <RefreshCw className="h-3.5 w-3.5" />
              Retry
            </button>
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="min-w-full text-[13px]">
            <thead className="border-b border-[#E6E1D4] bg-white">
              <tr>
                <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Number</th>
                <th className="w-24 px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Type</th>
                <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Title</th>
                <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Customer / Client</th>
                <th className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Total inc GST</th>
                <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Status</th>
                <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Created</th>
                <th className="w-10 px-2 py-3" aria-label="Actions" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EFEBE0]">
              {loading && [1, 2, 3, 4, 5].map((i) => <SkeletonRow key={i} />)}

              {!loading && visible.length === 0 && !error && (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center text-[#A0A0A0]">
                    <p className="text-sm font-medium">{total === 0 ? "No quotes yet" : "Nothing matches"}</p>
                    <p className="mt-1 text-xs">
                      {total === 0
                        ? "Your first one is a button away."
                        : "Try clearing the status filter or search."}
                    </p>
                  </td>
                </tr>
              )}

              {!loading && visible.map((q) => (
                <tr
                  key={q.id}
                  className="cursor-pointer transition-colors hover:bg-[#FAF8F2]"
                  onClick={() => setSelectedId(q.id)}
                >
                  <td className="px-4 py-4 font-mono text-xs text-[#6B6B6B]">{q.number ?? "—"}</td>
                  <td className="px-4 py-4">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${typeBadge(q.quoteType)}`}>
                      {q.quoteType}
                    </span>
                  </td>
                  <td className="px-4 py-4 font-medium text-[#1A1A1A]">{q.title}</td>
                  <td className="px-4 py-4 text-[#3A3A3A]">{customerName(q)}</td>
                  <td className="px-4 py-4 text-right tabular-nums font-medium text-[#1A1A1A]">{fmtMoney(q.totalIncGst)}</td>
                  <td className="px-4 py-4">
                    <StatusPill tone={STATUS_TONE[q.status]} className="uppercase tracking-wide">
                      {STATUS_LABELS[q.status]}
                    </StatusPill>
                  </td>
                  <td className="px-4 py-4 text-xs text-[#6B6B6B]">{ageLabel(q.createdAt)}</td>
                  <td className="px-2 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="relative inline-block">
                      <button
                        type="button"
                        aria-label={`Actions for ${q.number ?? q.title}`}
                        onClick={() => setMenuFor(menuFor === q.id ? null : q.id)}
                        className="rounded-md p-1.5 text-[#A0A0A0] transition-colors hover:bg-[#F0EDE4] hover:text-[#1A1A1A]"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </button>
                      {menuFor === q.id && (
                        <div className="absolute right-0 z-20 mt-1 w-40 overflow-hidden rounded-lg border border-[#E6E1D4] bg-white py-1 shadow-[0_8px_28px_rgba(20,20,20,0.12)]">
                          <button
                            type="button"
                            onClick={() => { setMenuFor(null); setSelectedId(q.id); }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[#3A3A3A] hover:bg-[#FAF8F2]"
                          >
                            <Pencil className="h-3.5 w-3.5" /> Open / edit
                          </button>
                          <button
                            type="button"
                            onClick={() => { setMenuFor(null); setConfirmDelete(q); }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[#C44545] hover:bg-[#FBE5E5]"
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Quote modal */}
      {showNewModal && (
        <NewQuoteWizard
          customers={customers}
          initialType={typeFilter ?? "service"}
          onCancel={() => setShowNewModal(false)}
          onCreated={handleQuoteCreated}
        />
      )}

      {/* Click-catcher: closes an open row menu when you click elsewhere. */}
      {menuFor && <button type="button" aria-hidden tabIndex={-1} className="fixed inset-0 z-10 cursor-default" onClick={() => setMenuFor(null)} />}

      {confirmDelete && (
        <ConfirmDeleteDialog
          name={confirmDelete.number ?? confirmDelete.title ?? "this quote"}
          noun="quote"
          busy={deleting}
          onConfirm={() => void handleDelete()}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {toast && <Toaster message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

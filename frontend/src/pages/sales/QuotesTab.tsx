// ─────────────────────────────────────────────────────────────────────────────
// pages/sales/QuotesTab.tsx — the Quotes register, styled to match the Sim-Pro
// Jobs body: a slim section header (eyebrow + Fraunces title + summary + action),
// a cream toolbar band (status filter chips with count badges + search), then
// the shared Register kit (responsive grid rows, portalled RowMenu, hand-authored
// phone summaries). Mounted under both the Jobs hub and the Sales masthead.
//
// Props:
//   initialCustomerFilter — pre-selects a customer filter via ?customer= param.
//   onChanged             — called after any write so the masthead refreshes.
//
// Row click → QuoteEditor (rendered inline via selectedId so no route needed).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, RefreshCw, X, Search } from "lucide-react";

import { FRAUNCES, TONE, cardShell, btnPrimary, btnGhost, StatusPill } from "../gantt/components/ledger";
import { Register, RegisterRow, RowMenu } from "../../components/ui/Register";
import { SkeletonLine } from "../../components/ui/skeleton";
import { Toaster, type ToastState } from "../../components/ui/Toaster";
import { fmtMoney } from "../../lib/format";

import {
  listQuotes,
  deleteQuote,
  type Quote,
  type QuoteStatus,
} from "../../lib/api/commercial";
import { listCustomers, type Customer } from "../../lib/api/customers";
import { QUOTE_STATUS_TONE } from "./quoteStatus";
import { matchesQuoteSubView, type QuoteSubView } from "../../lib/commercial/quoteSubViews";
import QuoteEditor from "./QuoteEditor";
import NewQuoteWizard from "./NewQuoteWizard";
import ConfirmDeleteDialog from "../catalogue/ConfirmDeleteDialog";

// ─── types ───────────────────────────────────────────────────────────────────

interface Props {
  initialCustomerFilter?: string | null;
  onChanged: () => void;
  /** Manager-only: surface the internal cost/margin view in the quote editor. */
  canSeeCost?: boolean;
  /** Deep-link: open this quote in the editor on mount (e.g. from a job drawer). */
  initialQuoteId?: string | null;
  /** Deep-link: open the register on one of the two quote registers (?type=). */
  initialTypeFilter?: "service" | "project" | null;
  /** SimPro status sub-view (from the Quotes hub tabs). When set, the register
   *  is filtered to that sub-view and the standalone status chips are hidden —
   *  the hub owns the status navigation. Service/Project segment stays. */
  subView?: QuoteSubView | null;
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

// ─── register layout ─────────────────────────────────────────────────────────

// One grid template shared by header + every row (Register passes it down via
// context). Fixed tracks keep columns aligned across rows (each row is its own
// grid, so content-sized `auto` tracks would drift); Title/Customer take the
// remaining space with minmax(0,…fr) so they can truncate.
const REGISTER_COLS =
  "100px 80px minmax(0,2.2fr) minmax(0,1.6fr) 110px 96px 80px 44px";

// ─── skeleton row (one Register row of shimmer lines) ────────────────────────

function SkeletonRow() {
  return (
    <RegisterRow
      mobile={
        <span className="flex flex-col gap-1.5 py-0.5">
          <SkeletonLine style={{ width: 140 }} />
          <SkeletonLine style={{ width: 200 }} />
        </span>
      }
    >
      {[72, 52, 180, 140, 80, 64, 52, 20].map((w, i) => (
        <SkeletonLine key={i} style={{ width: w }} />
      ))}
    </RegisterRow>
  );
}

// ─── component ───────────────────────────────────────────────────────────────

export default function QuotesTab({ initialCustomerFilter, onChanged, canSeeCost = false, initialQuoteId = null, initialTypeFilter = null, subView = null }: Props) {
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

  // Visible rows: hub sub-view (or standalone status chip) + search, client-side.
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return typeScoped.filter((q) => {
      if (subView) {
        if (!matchesQuoteSubView(q, subView)) return false;
      } else if (statusFilter && q.status !== statusFilter) {
        return false;
      }
      if (!term) return true;
      return (
        (q.number ?? "").toLowerCase().includes(term) ||
        q.title.toLowerCase().includes(term) ||
        customerName(q).toLowerCase().includes(term)
      );
    });
  }, [typeScoped, statusFilter, subView, search, customerName]);

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
  const isFiltered = statusFilter !== null || subView !== null || search.trim() !== "";
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
          {!subView && (
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
          )}

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

        {/* Register: grid rows at sm+, hand-authored summaries on phone. The
            outer card already draws the shell, so this instance strips its own. */}
        <Register
          cols={REGISTER_COLS}
          className="rounded-none border-0 shadow-none"
          header={
            <>
              <span>Number</span>
              <span>Type</span>
              <span>Title</span>
              <span>Customer / Client</span>
              <span className="text-right">Total inc GST</span>
              <span>Status</span>
              <span>Created</span>
              <span aria-hidden="true" />
            </>
          }
          footer={
            !loading && !error && isFiltered ? (
              <div className="border-t border-[#E6E1D4] bg-[#FAF8F2] px-4 py-2 text-xs text-[#6B6B6B]">
                Showing {visible.length.toLocaleString("en-AU")} of {total.toLocaleString("en-AU")}
              </div>
            ) : undefined
          }
        >
          {loading && [1, 2, 3, 4, 5].map((i) => <SkeletonRow key={i} />)}

          {!loading && visible.length === 0 && !error && (
            <div className="px-4 py-16 text-center text-[#A0A0A0]">
              <p className="text-sm font-medium">{total === 0 ? "No quotes yet" : "Nothing matches"}</p>
              <p className="mt-1 text-xs">
                {total === 0
                  ? "Your first one is a button away."
                  : "Try clearing the status filter or search."}
              </p>
            </div>
          )}

          {!loading && visible.map((q) => (
            <RegisterRow
              key={q.id}
              onClick={() => setSelectedId(q.id)}
              mobile={
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate font-semibold text-[#1A1A1A]">{q.number ?? "—"}</span>
                    <StatusPill tone={STATUS_TONE[q.status]} className="shrink-0 uppercase tracking-wide">
                      {STATUS_LABELS[q.status]}
                    </StatusPill>
                  </span>
                  <span className="truncate">{q.title}</span>
                  <span className="truncate text-[13px] text-[#6B6B6B]">
                    {customerName(q)} · {fmtMoney(q.totalIncGst)} · {ageLabel(q.createdAt)}
                  </span>
                </span>
              }
            >
              <span className="truncate font-mono text-xs text-[#6B6B6B]">{q.number ?? "—"}</span>
              <span className="min-w-0">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${typeBadge(q.quoteType)}`}>
                  {q.quoteType}
                </span>
              </span>
              <span className="truncate font-medium text-[#1A1A1A]">{q.title}</span>
              <span className="truncate text-[#3A3A3A]">{customerName(q)}</span>
              <span className="text-right font-medium tabular-nums text-[#1A1A1A]">{fmtMoney(q.totalIncGst)}</span>
              <span className="min-w-0">
                <StatusPill tone={STATUS_TONE[q.status]} className="uppercase tracking-wide">
                  {STATUS_LABELS[q.status]}
                </StatusPill>
              </span>
              <span className="text-xs text-[#6B6B6B]">{ageLabel(q.createdAt)}</span>
              <RowMenu
                label={`Actions for ${q.number ?? q.title}`}
                items={[
                  { label: "Open / edit", onSelect: () => setSelectedId(q.id) },
                  { label: "Delete", tone: "danger", onSelect: () => setConfirmDelete(q) },
                ]}
              />
            </RegisterRow>
          ))}
        </Register>
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

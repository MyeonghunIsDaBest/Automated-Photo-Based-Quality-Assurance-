// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// pages/sales/InvoicesTab.tsx â€” status-filter chips, table, new-invoice flows.
//
// Props:
//   initialCustomerFilter â€” pre-selects a customer filter via ?customer= param.
//   onChanged              â€” called after any write so the masthead refreshes.
//
// Status chips: All / Draft / Sent / Paid / Overdue / Voided
// Overdue is derived via isOverdue(); not a stored status.
// Row click â†’ InvoiceEditor inline (same pattern as QuotesTab â†’ QuoteEditor).
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, Download, Plus, RefreshCw, X } from "lucide-react";

import { TONE, cardShell, btnPrimary, btnGhost } from "../gantt/components/ledger";
import { SkeletonLine } from "../../components/ui/skeleton";
import { Toaster } from "../../components/ui/Toaster";

import {
  listInvoices,
  listQuotes,
  getInvoice,
  createInvoiceFromQuote,
  createInvoiceFromJob,
  createInvoice,
  isOverdue,
  exportInvoicesCsv,
  type Invoice,
  type InvoiceStatus,
  type InvoiceWithItemsForCsv,
} from "../../lib/api/commercial";
import { listCustomers, type Customer } from "../../lib/api/customers";
import { listServiceJobs, type ServiceJob } from "../../lib/api/serviceJobs";
import InvoiceEditor from "./InvoiceEditor";

// â”€â”€â”€ types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type ToastState = { message: string; type: "success" | "error" | "info" } | null;
type FilterMode = "all" | "draft" | "sent" | "paid" | "overdue" | "voided";

interface Props {
  initialCustomerFilter?: string | null;
  onChanged: () => void;
}

// â”€â”€â”€ helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function todayIso(): string {
  const n = new Date();
  return [
    n.getFullYear(),
    String(n.getMonth() + 1).padStart(2, "0"),
    String(n.getDate()).padStart(2, "0"),
  ].join("-");
}

function fmtMoney(n: number): string {
  return "$" + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function fmtDate(iso: string | null): string {
  if (!iso) return "â€”";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d} ${months[m - 1]} ${y}`;
}

// â”€â”€â”€ status presentation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const STATUS_TONE: Record<InvoiceStatus, keyof typeof TONE> = {
  draft:  "ink",
  sent:   "slate",
  paid:   "sage",
  overdue: "red",
  voided: "orange",
};

const STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft:   "Draft",
  sent:    "Sent",
  paid:    "Paid",
  overdue: "Overdue",
  voided:  "Voided",
};

// â”€â”€â”€ derived display status (adds overdue) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type DisplayStatus = InvoiceStatus | "overdue";

function displayStatus(inv: Invoice, today: string): DisplayStatus {
  if (isOverdue(inv, today)) return "overdue";
  return inv.status;
}

// â”€â”€â”€ skeleton row â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function SkeletonRow() {
  return (
    <tr className="border-b border-[#EFEBE0]">
      {[100, 180, 140, 80, 70, 80, 80].map((w, i) => (
        <td key={i} className="px-4 py-3">
          <SkeletonLine style={{ width: w }} />
        </td>
      ))}
    </tr>
  );
}

// â”€â”€â”€ "From quote" picker modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function FromQuoteModal({
  onConfirm,
  onClose,
}: {
  onConfirm: (quoteId: string) => Promise<void>;
  onClose: () => void;
}) {
  const [quotes, setQuotes] = useState<Array<{ id: string; number: string | null; title: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    listQuotes({ status: "accepted" })
      .then((qs) => setQuotes(qs.map((q) => ({ id: q.id, number: q.number, title: q.title }))))
      .catch(() => setErr("Failed to load quotes."))
      .finally(() => setLoading(false));
  }, []);

  async function handleConfirm() {
    if (!selected) return;
    setCreating(true);
    setErr(null);
    try {
      await onConfirm(selected);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Failed to create invoice.");
      setCreating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1A1A1A]/50 p-4">
      <div className="flex w-full max-w-md flex-col overflow-hidden rounded-[14px] border border-[#E6E1D4] bg-white shadow-[0_8px_28px_rgba(20,20,20,0.12)]">
        <div className="flex items-center justify-between border-b border-[#E6E1D4] px-6 py-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[#6B6B6B]">Sales &middot; Invoices</p>
            <h2 className="mt-1 text-lg font-medium text-[#1A1A1A]">From accepted quote</h2>
          </div>
          <button type="button" onClick={onClose} disabled={creating} className="rounded-md p-2 text-[#A0A0A0] hover:bg-[#F0EDE4]">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex flex-col gap-4 px-6 py-5">
          {loading && <p className="text-sm text-[#A0A0A0]">Loading accepted quotes...</p>}
          {!loading && quotes.length === 0 && (
            <p className="text-sm text-[#6B6B6B]">No accepted quotes available. Accept a quote first.</p>
          )}
          {!loading && quotes.length > 0 && (
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              disabled={creating}
              className="w-full rounded-md border border-[#E6E1D4] px-3 py-2 text-sm focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C] disabled:opacity-50"
            >
              <option value="">Select a quote...</option>
              {quotes.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.number ? q.number + " â€” " : ""}{q.title}
                </option>
              ))}
            </select>
          )}
          {err && (
            <p className="rounded-md border border-[#F0BFBF] bg-[#FBE5E5] px-3 py-2 text-xs text-[#C44545]">{err}</p>
          )}
          <div className="flex items-center justify-end gap-2 border-t border-[#E6E1D4] pt-4">
            <button type="button" onClick={onClose} disabled={creating} className={btnGhost}>Cancel</button>
            <button
              type="button"
              disabled={!selected || creating || loading}
              onClick={() => void handleConfirm()}
              className={btnPrimary}
            >
              {creating ? "Creating..." : "Create invoice"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// â”€â”€â”€ "From job" picker modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function FromJobModal({
  onConfirm,
  onClose,
}: {
  onConfirm: (jobId: string) => Promise<void>;
  onClose: () => void;
}) {
  const [jobs, setJobs] = useState<ServiceJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      listServiceJobs({ status: "done" }),
      listServiceJobs({ status: "in_progress" }),
    ])
      .then(([done, inProg]) => setJobs([...done, ...inProg]))
      .catch(() => setErr("Failed to load jobs."))
      .finally(() => setLoading(false));
  }, []);

  async function handleConfirm() {
    if (!selected) return;
    setCreating(true);
    setErr(null);
    try {
      await onConfirm(selected);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Failed to create invoice.");
      setCreating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1A1A1A]/50 p-4">
      <div className="flex w-full max-w-md flex-col overflow-hidden rounded-[14px] border border-[#E6E1D4] bg-white shadow-[0_8px_28px_rgba(20,20,20,0.12)]">
        <div className="flex items-center justify-between border-b border-[#E6E1D4] px-6 py-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[#6B6B6B]">Sales &middot; Invoices</p>
            <h2 className="mt-1 text-lg font-medium text-[#1A1A1A]">From service job</h2>
          </div>
          <button type="button" onClick={onClose} disabled={creating} className="rounded-md p-2 text-[#A0A0A0] hover:bg-[#F0EDE4]">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex flex-col gap-4 px-6 py-5">
          {loading && <p className="text-sm text-[#A0A0A0]">Loading jobs...</p>}
          {!loading && jobs.length === 0 && (
            <p className="text-sm text-[#6B6B6B]">No in-progress or completed jobs found.</p>
          )}
          {!loading && jobs.length > 0 && (
            <>
              <p className="text-xs text-[#6B6B6B]">
                Approved variations linked to the selected job will be included as variation-flagged lines.
              </p>
              <select
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
                disabled={creating}
                className="w-full rounded-md border border-[#E6E1D4] px-3 py-2 text-sm focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C] disabled:opacity-50"
              >
                <option value="">Select a job...</option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.title}{j.status === "done" ? " (done)" : " (in progress)"}
                  </option>
                ))}
              </select>
            </>
          )}
          {err && (
            <p className="rounded-md border border-[#F0BFBF] bg-[#FBE5E5] px-3 py-2 text-xs text-[#C44545]">{err}</p>
          )}
          <div className="flex items-center justify-end gap-2 border-t border-[#E6E1D4] pt-4">
            <button type="button" onClick={onClose} disabled={creating} className={btnGhost}>Cancel</button>
            <button
              type="button"
              disabled={!selected || creating || loading}
              onClick={() => void handleConfirm()}
              className={btnPrimary}
            >
              {creating ? "Creating..." : "Create invoice"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// â”€â”€â”€ CSV export modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function ExportCsvModal({
  onClose,
  onSkipped,
}: {
  onClose: () => void;
  onSkipped?: (numbers: string[]) => void;
}) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [exporting, setExporting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleExport(e: React.FormEvent) {
    e.preventDefault();
    if (!from || !to) { setErr("Both dates are required."); return; }
    if (from > to) { setErr("From date must be on or before To date."); return; }
    setExporting(true);
    setErr(null);
    try {
      const [all, allCustomers] = await Promise.all([listInvoices(), listCustomers()]);
      const inRange = all.filter((inv) => {
        const d = inv.issuedAt ? inv.issuedAt.slice(0, 10) : null;
        return d && d >= from && d <= to;
      });
      // Sequential fetch capped at 200
      const capped = inRange.slice(0, 200);
      const withItems: InvoiceWithItemsForCsv[] = [];
      for (const inv of capped) {
        const full = await getInvoice(inv.id);
        if (full) withItems.push(full as InvoiceWithItemsForCsv);
      }
      // Build id→name map for contact name resolution
      const customersById = new Map<string, string>(allCustomers.map((c) => [c.id, c.name]));
      const { csv, skippedNumbers } = exportInvoicesCsv(withItems, customersById);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `invoices-export-${from}-${to}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      onClose();
      if (skippedNumbers.length > 0) {
        onSkipped?.(skippedNumbers);
      }
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Export failed.");
      setExporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1A1A1A]/50 p-4">
      <div className="flex w-full max-w-sm flex-col overflow-hidden rounded-[14px] border border-[#E6E1D4] bg-white shadow-[0_8px_28px_rgba(20,20,20,0.12)]">
        <div className="flex items-center justify-between border-b border-[#E6E1D4] px-6 py-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[#6B6B6B]">Sales &middot; Invoices</p>
            <h2 className="mt-1 text-lg font-medium text-[#1A1A1A]">Export CSV</h2>
          </div>
          <button type="button" onClick={onClose} disabled={exporting} className="rounded-md p-2 text-[#A0A0A0] hover:bg-[#F0EDE4]">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={(e) => void handleExport(e)} className="flex flex-col gap-4 px-6 py-5">
          <p className="text-xs text-[#6B6B6B]">Exports invoices by issue date in Xero-compatible format. Capped at 200.</p>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[#6B6B6B]">From</label>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                disabled={exporting}
                required
                className="w-full rounded-md border border-[#E6E1D4] px-3 py-2 text-sm focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C] disabled:opacity-50"
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[#6B6B6B]">To</label>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                disabled={exporting}
                required
                className="w-full rounded-md border border-[#E6E1D4] px-3 py-2 text-sm focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C] disabled:opacity-50"
              />
            </div>
          </div>
          {err && (
            <p className="rounded-md border border-[#F0BFBF] bg-[#FBE5E5] px-3 py-2 text-xs text-[#C44545]">{err}</p>
          )}
          <div className="flex items-center justify-end gap-2 border-t border-[#E6E1D4] pt-4">
            <button type="button" onClick={onClose} disabled={exporting} className={btnGhost}>Cancel</button>
            <button type="submit" disabled={exporting} className={btnPrimary}>
              <Download className="h-4 w-4" />
              {exporting ? "Exporting..." : "Export"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// â”€â”€â”€ component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const FILTER_MODES: { key: FilterMode; label: string }[] = [
  { key: "all",     label: "All"     },
  { key: "draft",   label: "Draft"   },
  { key: "sent",    label: "Sent"    },
  { key: "paid",    label: "Paid"    },
  { key: "overdue", label: "Overdue" },
  { key: "voided",  label: "Voided"  },
];

export default function InvoicesTab({ initialCustomerFilter, onChanged }: Props) {
  const [invoices, setInvoices]   = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);

  const [filterMode, setFilterMode]       = useState<FilterMode>("all");
  const [customerFilter, setCustomerFilter] = useState<string | null>(
    initialCustomerFilter ?? null
  );
  const [selectedId, setSelectedId]       = useState<string | null>(null);
  const [toast, setToast]                 = useState<ToastState>(null);

  // Modal state
  const [newMenuOpen, setNewMenuOpen]     = useState(false);
  const [showFromQuote, setShowFromQuote] = useState(false);
  const [showFromJob, setShowFromJob]     = useState(false);
  const [showExport, setShowExport]       = useState(false);

  const customersLoaded = useRef(false);
  const today = todayIso();

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const filters: { status?: InvoiceStatus; customerId?: string } = {};
      if (customerFilter) filters.customerId = customerFilter;
      // For "overdue" we fetch "sent" and filter client-side
      if (filterMode === "overdue") {
        filters.status = "sent";
      } else if (filterMode !== "all") {
        filters.status = filterMode as InvoiceStatus;
      }
      const data = await listInvoices(Object.keys(filters).length > 0 ? filters : undefined);
      const filtered = filterMode === "overdue"
        ? data.filter((inv) => isOverdue(inv, today))
        : data;
      setInvoices(filtered);
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : "Failed to load invoices");
    } finally {
      setLoading(false);
    }
  }, [filterMode, customerFilter, today]);

  useEffect(() => { void fetchInvoices(); }, [fetchInvoices]);

  useEffect(() => {
    if (customersLoaded.current) return;
    customersLoaded.current = true;
    listCustomers().then(setCustomers).catch(() => {});
  }, []);

  const filterCustomerName = customerFilter
    ? (customers.find((c) => c.id === customerFilter)?.name ?? customerFilter)
    : null;

  async function handleCreateBlank() {
    setNewMenuOpen(false);
    try {
      const inv = await createInvoice({});
      setToast({ message: "Invoice created", type: "success" });
      void fetchInvoices();
      onChanged();
      setSelectedId(inv.id);
    } catch (ex) {
      setToast({ message: ex instanceof Error ? ex.message : "Failed to create invoice.", type: "error" });
    }
  }

  async function handleFromQuote(quoteId: string) {
    const inv = await createInvoiceFromQuote(quoteId);
    setShowFromQuote(false);
    setToast({ message: "Invoice created from quote", type: "success" });
    void fetchInvoices();
    onChanged();
    setSelectedId(inv.id);
  }

  async function handleFromJob(jobId: string) {
    const inv = await createInvoiceFromJob(jobId);
    setShowFromJob(false);
    setToast({ message: "Invoice created from job — original quote scope + accepted variations, grouped by cost centre.", type: "success" });
    void fetchInvoices();
    onChanged();
    setSelectedId(inv.id);
  }

  function handleEditorClose() {
    setSelectedId(null);
    void fetchInvoices();
    onChanged();
  }

  if (selectedId) {
    return (
      <InvoiceEditor
        invoiceId={selectedId}
        onClose={handleEditorClose}
        onChanged={() => { void fetchInvoices(); onChanged(); }}
      />
    );
  }

  return (
    <div className={`${cardShell} overflow-hidden`}>
      {/* â”€â”€ Toolbar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="flex flex-wrap items-center gap-3 border-b border-[#E6E1D4] px-4 py-3">
        {/* Status filter chips */}
        <div className="flex flex-wrap gap-1.5">
          {FILTER_MODES.map(({ key, label }) => {
            const active = filterMode === key;
            const toneKey = key !== "all" ? STATUS_TONE[key as InvoiceStatus] : null;
            const tone = toneKey ? TONE[toneKey] : null;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setFilterMode(active && key !== "all" ? "all" : key)}
                className="rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors"
                style={
                  active && tone
                    ? { borderColor: tone.dot, backgroundColor: tone.bg, color: tone.fg }
                    : active
                    ? { borderColor: "#1A1A1A", backgroundColor: "#1A1A1A", color: "#fff" }
                    : { borderColor: "#E6E1D4", backgroundColor: "white", color: "#6B6B6B" }
                }
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Customer filter chip */}
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

        {/* Right side actions */}
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowExport(true)}
            className={btnGhost}
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>

          {/* New invoice split button */}
          <div className="relative">
            <div className="flex">
              <button
                type="button"
                onClick={() => void handleCreateBlank()}
                className={btnPrimary + " rounded-r-none border-r border-white/20"}
              >
                <Plus className="h-4 w-4" />
                New invoice
              </button>
              <button
                type="button"
                onClick={() => setNewMenuOpen((v) => !v)}
                aria-label="More invoice options"
                className={btnPrimary + " rounded-l-none px-2"}
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>
            {newMenuOpen && (
              <div className="absolute right-0 top-full z-30 mt-1 w-44 overflow-hidden rounded-[10px] border border-[#E6E1D4] bg-white shadow-[0_4px_16px_rgba(20,20,20,0.10)]">
                <button
                  type="button"
                  className="flex w-full items-center px-4 py-2.5 text-left text-sm text-[#1A1A1A] hover:bg-[#FAF8F2]"
                  onClick={() => { setNewMenuOpen(false); void handleCreateBlank(); }}
                >
                  Blank
                </button>
                <button
                  type="button"
                  className="flex w-full items-center px-4 py-2.5 text-left text-sm text-[#1A1A1A] hover:bg-[#FAF8F2]"
                  onClick={() => { setNewMenuOpen(false); setShowFromQuote(true); }}
                >
                  From quote
                </button>
                <button
                  type="button"
                  className="flex w-full items-center px-4 py-2.5 text-left text-sm text-[#1A1A1A] hover:bg-[#FAF8F2]"
                  onClick={() => { setNewMenuOpen(false); setShowFromJob(true); }}
                >
                  From job
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* â”€â”€ Error panel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {error && !loading && (
        <div className="flex items-center justify-between border-b border-[#F0BFBF] bg-[#FBE5E5] px-4 py-3">
          <p className="text-xs text-[#C44545]">{error}</p>
          <button type="button" onClick={() => void fetchInvoices()} className={btnGhost + " py-1 px-3 text-xs"}>
            <RefreshCw className="h-3.5 w-3.5" /> Retry
          </button>
        </div>
      )}

      {/* â”€â”€ Table â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-[#E6E1D4] bg-[#FAF8F2]">
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Number</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Title / Ref</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Customer / Client</th>
              <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Total inc GST</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Status</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Issued</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Due</th>
            </tr>
          </thead>
          <tbody>
            {loading && [1, 2, 3, 4].map((i) => <SkeletonRow key={i} />)}

            {!loading && invoices.length === 0 && !error && (
              <tr>
                <td colSpan={7} className="px-4 py-16 text-center text-[#A0A0A0]">
                  <p className="text-sm font-medium">No invoices</p>
                  <p className="mt-1 text-xs">
                    {filterMode !== "all" ? "Try adjusting the status filter." : "Create your first invoice above."}
                  </p>
                </td>
              </tr>
            )}

            {!loading && invoices.map((inv) => {
              const ds = displayStatus(inv, today);
              const toneKey = STATUS_TONE[ds as InvoiceStatus] ?? STATUS_TONE.draft;
              const tone = TONE[toneKey];
              const isPaid = inv.status === "paid";
              const isDueOverdue = ds === "overdue";
              const clientDisplay =
                inv.clientName ??
                (inv.customerId
                  ? (customers.find((c) => c.id === inv.customerId)?.name ?? inv.customerId)
                  : "â€”");
              return (
                <tr
                  key={inv.id}
                  className="border-b border-[#EFEBE0] transition-colors hover:bg-[#FAF8F2] cursor-pointer"
                  onClick={() => setSelectedId(inv.id)}
                >
                  <td className="px-4 py-3 font-mono text-xs text-[#6B6B6B]">
                    {inv.number ?? "â€”"}
                  </td>
                  <td className="px-4 py-3 font-medium text-[#1A1A1A]">
                    {inv.jobRef ?? "â€”"}
                  </td>
                  <td className="px-4 py-3 text-[#3A3A3A]">{clientDisplay}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium text-[#1A1A1A]">
                    {fmtMoney(inv.totalIncGst)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
                      style={{
                        backgroundColor: tone.bg,
                        color: tone.fg,
                        transform: isPaid ? "rotate(-2deg)" : undefined,
                        boxShadow: isPaid ? `0 0 0 1px ${tone.dot}` : undefined,
                      }}
                    >
                      {STATUS_LABELS[ds as InvoiceStatus] ?? ds}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-[#6B6B6B]">
                    {fmtDate(inv.issuedAt)}
                  </td>
                  <td
                    className="px-4 py-3 text-xs"
                    style={{ color: isDueOverdue ? TONE.red.fg : "#6B6B6B" }}
                  >
                    {fmtDate(inv.dueDate)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modals */}
      {showFromQuote && <FromQuoteModal onConfirm={handleFromQuote} onClose={() => setShowFromQuote(false)} />}
      {showFromJob && <FromJobModal onConfirm={handleFromJob} onClose={() => setShowFromJob(false)} />}
      {showExport && (
        <ExportCsvModal
          onClose={() => setShowExport(false)}
          onSkipped={(nums) =>
            setToast({ message: `${nums.length} invoice${nums.length === 1 ? "" : "s"} skipped (no line items): ${nums.join(", ")}`, type: "info" })
          }
        />
      )}

      {toast && <Toaster message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

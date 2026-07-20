// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// pages/sales/InvoiceEditor.tsx â€” paper-document editor for a single invoice.
//
// Design mirrors QuoteEditor exactly:
//   - White sheet on cream desk, Fraunces headings, line table, totals footer.
//   - "TAX INVOICE" compliance label under the business header.
//   - INV-â€¦ number, issued/due dates row.
//   - Variation-flagged lines get a small amber "VARIATION" chip.
//   - Status actions: Issue / Record payment / Void.
//   - PAID stamp (rotated sage badge). VOIDED renders washed-out with stamp.
//   - Print styles identical to QuoteEditor.
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft, Printer, Plus, Trash2, RefreshCw, Search, Package,
} from "lucide-react";

import { TONE, cardShell, btnPrimary, btnGhost } from "../gantt/components/ledger";
import { PRINT, PRINT_EXACT } from "../../components/print/printTheme";
import PrintDocFooter from "../../components/print/PrintDocFooter";
import PrintLogo from "../../components/print/PrintLogo";
import { SkeletonLine } from "../../components/ui/skeleton";
import { Toaster, type ToastState } from "../../components/ui/Toaster";
import MotionDrawer from "../../components/ui/MotionDrawer";
import { lineTotal } from "../../lib/commercial/money";
import { fmtMoney } from "../../lib/format";

import {
  getInvoice,
  updateInvoice,
  issueInvoice,
  recordPayment,
  voidInvoice,
  addInvoiceItemFromMaterial,
  addInvoiceItemFromPrebuild,
  addInvoiceItemFree,
  updateInvoiceItem,
  removeInvoiceItem,
  getCommercialSettings,
  type Invoice,
  type InvoiceItem,
  type CommercialSettings,
} from "../../lib/api/commercial";
import { listMaterials, listPrebuilds, type Material, type Prebuild } from "../../lib/api/materials";

// â”€â”€â”€ types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type AddMode = "catalogue" | "prebuild" | "free" | null;

interface Props {
  invoiceId: string;
  onClose: () => void;
  onChanged: () => void;
}

// â”€â”€â”€ helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function fmtDate(iso: string | null): string {
  if (!iso) return "â€”";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d} ${months[m - 1]} ${y}`;
}

function stripSearchChars(s: string): string {
  return s.replace(/[*,()/]/g, "");
}

// â”€â”€â”€ inline-edit cell (mirrors QuoteEditor) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function NumCell({
  value,
  onCommit,
  disabled,
}: {
  value: number;
  onCommit: (v: number) => void;
  disabled: boolean;
}) {
  const [local, setLocal] = useState(String(value));
  useEffect(() => { setLocal(String(value)); }, [value]);
  return (
    <input
      type="number"
      value={local}
      min="0"
      step="any"
      disabled={disabled}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        const n = parseFloat(local);
        if (!isNaN(n) && n !== value) onCommit(n);
      }}
      className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-right tabular-nums text-sm focus:border-[#E6E1D4] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#2F8F5C] disabled:opacity-40"
    />
  );
}

// â”€â”€â”€ confirm modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function ConfirmModal({
  title,
  body,
  confirmLabel,
  danger,
  onConfirm,
  onClose,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <MotionDrawer open onClose={onClose} variant="modal" ariaLabel={title} sizeClass="max-w-sm">
      <div className="px-6 py-5">
        <h2 className="text-base font-semibold text-[#1A1A1A]">{title}</h2>
        <p className="mt-2 text-sm text-[#6B6B6B]">{body}</p>
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-[#E6E1D4] px-6 py-4">
        <button type="button" onClick={onClose} className={btnGhost}>Cancel</button>
        <button
          type="button"
          onClick={onConfirm}
          className={danger
            ? "inline-flex items-center gap-1.5 rounded-full bg-[#C44545] px-4 py-1.5 text-sm font-medium text-white hover:bg-[#A83535] transition-colors"
            : btnPrimary
          }
        >
          {confirmLabel}
        </button>
      </div>
    </MotionDrawer>
  );
}

// â”€â”€â”€ component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function InvoiceEditor({ invoiceId, onClose, onChanged }: Props) {
  const [invoice, setInvoice]     = useState<Invoice | null>(null);
  const [settings, setSettings]   = useState<CommercialSettings | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [saving, setSaving]       = useState(false);
  const [toast, setToast]         = useState<ToastState>(null);

  const [notes, setNotes]         = useState("");
  const notesDebRef               = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Dirty flag: set on user edit, cleared on successful save. Prevents loadInvoice
  // from clobbering in-flight notes when item ops trigger a refetch.
  const notesDirtyRef             = useRef(false);

  const [addMode, setAddMode]     = useState<AddMode>(null);
  const [confirmAction, setConfirmAction] = useState<"issue" | "pay" | "void" | null>(null);

  // Catalogue search
  const [catalogueSearch, setCatalogueSearch] = useState("");
  const [catalogueResults, setCatalogueResults] = useState<Material[]>([]);
  const catDebRef                 = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [addingMat, setAddingMat] = useState(false);

  // Prebuild picker
  const [prebuilds, setPrebuilds] = useState<Prebuild[]>([]);
  const [prebuildId, setPrebuildId] = useState("");
  const [addingPb, setAddingPb]   = useState(false);

  // Free line form
  const [freeDesc, setFreeDesc]   = useState("");
  const [freeQty, setFreeQty]     = useState("1");
  const [freeUnit, setFreeUnit]   = useState("ea");
  const [freePrice, setFreePrice] = useState("0");
  const [addingFree, setAddingFree] = useState(false);

  const loadInvoice = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [inv, s] = await Promise.all([getInvoice(invoiceId), getCommercialSettings()]);
      if (!inv) { setError("Invoice not found."); return; }
      setInvoice(inv);
      setSettings(s);
      // Only sync notes from server when the textarea is not dirty (no unsaved user edits)
      if (!notesDirtyRef.current) {
        setNotes(inv.notes ?? "");
      }
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : "Failed to load invoice");
    } finally {
      setLoading(false);
    }
  }, [invoiceId]);

  useEffect(() => { void loadInvoice(); }, [loadInvoice]);

  // Debounced notes save
  useEffect(() => {
    if (!invoice || notes === (invoice.notes ?? "")) return;
    notesDirtyRef.current = true;
    if (notesDebRef.current) clearTimeout(notesDebRef.current);
    notesDebRef.current = setTimeout(async () => {
      try {
        await updateInvoice(invoiceId, { notes });
        notesDirtyRef.current = false;
        void loadInvoice();
        onChanged();
      } catch { /* silent */ }
    }, 700);
    return () => { if (notesDebRef.current) clearTimeout(notesDebRef.current); };
  }, [notes, invoice, invoiceId, loadInvoice, onChanged]);

  // Debounced catalogue search
  useEffect(() => {
    if (addMode !== "catalogue") return;
    if (catDebRef.current) clearTimeout(catDebRef.current);
    catDebRef.current = setTimeout(async () => {
      const q = stripSearchChars(catalogueSearch.trim());
      try {
        const mats = await listMaterials({ search: q || undefined });
        // Stock-first ordering: stocked items surface before one-offs.
        setCatalogueResults([...mats].sort((a, b) => Number(b.isStockItem) - Number(a.isStockItem)).slice(0, 12));
      } catch { setCatalogueResults([]); }
    }, 300);
    return () => { if (catDebRef.current) clearTimeout(catDebRef.current); };
  }, [catalogueSearch, addMode]);

  // Load prebuilds once when mode opens
  useEffect(() => {
    if (addMode !== "prebuild" || prebuilds.length > 0) return;
    listPrebuilds().then(setPrebuilds).catch(() => {});
  }, [addMode, prebuilds.length]);

  async function handleItemUpdate(item: InvoiceItem, patch: { qty?: number; unitPriceExGst?: number }) {
    setSaving(true);
    try {
      await updateInvoiceItem(item.id, invoiceId, patch);
      await loadInvoice();
      onChanged();
    } catch (ex) {
      setToast({ message: ex instanceof Error ? ex.message : "Save failed", type: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveItem(item: InvoiceItem) {
    setSaving(true);
    try {
      await removeInvoiceItem(item.id, invoiceId);
      await loadInvoice();
      onChanged();
    } catch (ex) {
      setToast({ message: ex instanceof Error ? ex.message : "Remove failed", type: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function handleAddFromMaterial(mat: Material) {
    setAddingMat(true);
    try {
      await addInvoiceItemFromMaterial(invoiceId, mat.id, 1);
      setAddMode(null);
      setCatalogueSearch("");
      setCatalogueResults([]);
      await loadInvoice();
      onChanged();
    } catch (ex) {
      setToast({ message: ex instanceof Error ? ex.message : "Failed to add item", type: "error" });
    } finally {
      setAddingMat(false);
    }
  }

  async function handleAddPrebuild() {
    if (!prebuildId) return;
    setAddingPb(true);
    try {
      await addInvoiceItemFromPrebuild(invoiceId, prebuildId);
      setAddMode(null);
      setPrebuildId("");
      await loadInvoice();
      onChanged();
    } catch (ex) {
      setToast({ message: ex instanceof Error ? ex.message : "Failed to add prebuild", type: "error" });
    } finally {
      setAddingPb(false);
    }
  }

  async function handleAddFree(e: React.FormEvent) {
    e.preventDefault();
    setAddingFree(true);
    try {
      await addInvoiceItemFree(invoiceId, {
        description: freeDesc,
        qty: parseFloat(freeQty) || 1,
        unit: freeUnit,
        unitPriceExGst: parseFloat(freePrice) || 0,
      });
      setAddMode(null);
      setFreeDesc(""); setFreeQty("1"); setFreeUnit("ea"); setFreePrice("0");
      await loadInvoice();
      onChanged();
    } catch (ex) {
      setToast({ message: ex instanceof Error ? ex.message : "Failed to add line", type: "error" });
    } finally {
      setAddingFree(false);
    }
  }

  async function handleConfirmedAction() {
    if (!invoice || !confirmAction) return;
    setSaving(true);
    setConfirmAction(null);
    try {
      if (confirmAction === "issue") {
        await issueInvoice(invoiceId);
        setToast({ message: "Invoice issued â€” send it to the client.", type: "info" });
      } else if (confirmAction === "pay") {
        await recordPayment(invoiceId);
        setToast({ message: "Payment recorded.", type: "success" });
      } else if (confirmAction === "void") {
        await voidInvoice(invoiceId);
        setToast({ message: "Invoice voided.", type: "info" });
      }
      await loadInvoice();
      onChanged();
    } catch (ex) {
      setToast({ message: ex instanceof Error ? ex.message : "Action failed", type: "error" });
    } finally {
      setSaving(false);
    }
  }

  // â”€â”€ Loading / error states â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  if (loading) {
    return (
      <div className={`${cardShell} p-8`}>
        <div className="space-y-3">
          <SkeletonLine className="w-40" />
          <SkeletonLine className="w-64" />
          <SkeletonLine className="w-full" />
        </div>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className={`${cardShell} flex items-center justify-between p-6`}>
        <p className="text-sm text-[#C44545]">{error ?? "Invoice not found."}</p>
        <div className="flex gap-2">
          <button type="button" onClick={() => void loadInvoice()} className={btnGhost}>
            <RefreshCw className="h-4 w-4" /> Retry
          </button>
          <button type="button" onClick={onClose} className={btnGhost}>
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
        </div>
      </div>
    );
  }

  const items = invoice.items ?? [];
  const isVoided = invoice.status === "voided";
  const isPaid   = invoice.status === "paid";
  const isLocked = isPaid || isVoided;

  const statusTone = {
    draft:  TONE.ink,
    sent:   TONE.slate,
    paid:   TONE.sage,
    overdue: TONE.red,
    voided: TONE.orange,
  }[invoice.status] ?? TONE.ink;

  // Confirm modal text
  const confirmConfig = confirmAction === "issue"
    ? {
        title: "Issue invoice",
        body: invoice.dueDate
          ? `This will set the status to Sent and lock the issue date to today. Due date will be set automatically by your payment terms.`
          : "This will set the status to Sent, set the issue date to today, and calculate a due date from your payment terms.",
        confirmLabel: "Issue",
        danger: false,
      }
    : confirmAction === "pay"
    ? {
        title: "Record payment",
        body: "This marks the invoice as Paid. This cannot be undone.",
        confirmLabel: "Record payment",
        danger: false,
      }
    : confirmAction === "void"
    ? {
        title: "Void invoice",
        body: "Voiding cancels this invoice. This cannot be undone.",
        confirmLabel: "Void invoice",
        danger: true,
      }
    : null;

  return (
    <>
      {/* â”€â”€ Back bar (screen only) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="mb-4 flex items-center gap-3 print:hidden">
        <button type="button" onClick={onClose} className={btnGhost}>
          <ArrowLeft className="h-4 w-4" />
          All invoices
        </button>
        <span className="text-xs text-[#A0A0A0]">{saving ? "Saving..." : "All changes auto-saved"}</span>
        <button
          type="button"
          onClick={() => {
            document.body.classList.add("printing-commercial-doc");
            window.addEventListener("afterprint", () => {
              document.body.classList.remove("printing-commercial-doc");
            }, { once: true });
            window.print();
          }}
          className={btnGhost + " ml-auto"}
        >
          <Printer className="h-4 w-4" />
          Print / PDF
        </button>
      </div>

      {/* â”€â”€ Paper sheet â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div
        id="invoice-print-sheet"
        className="print-sheet rounded-[14px] border border-[#E6E1D4] bg-white p-8 shadow-[0_2px_12px_rgba(20,20,20,0.07)] sm:p-10"
        style={{
          fontFamily: "'DM Sans', system-ui, sans-serif",
          opacity: isVoided ? 0.55 : 1,
        }}
      >
        {/* Document header — designer print identity (P6-P), same anatomy as
            the quote sheet: logo/wordmark + tagline left, orange number right. */}
        <div className="mb-2 flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0 max-w-md">
            <PrintLogo logoUrl={settings?.logoUrl} businessName={settings?.businessName} />
            {settings?.printTagline && (
              <p className="mt-2 text-[11.5px] leading-relaxed" style={{ color: PRINT.grey }}>
                {settings.printTagline}
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="text-[32px] font-light tracking-tight" style={{ color: PRINT.orange }}>
              {invoice.number ?? "INV-??????"}
            </p>
            {/* Status stamp */}
            {(isPaid || isVoided) && (
              <span
                className="mt-2 inline-block rounded px-3 py-1 text-[12px] font-bold uppercase tracking-[0.18em]"
                style={{
                  backgroundColor: statusTone.bg,
                  color: statusTone.fg,
                  boxShadow: `0 0 0 1.5px ${statusTone.dot}`,
                  transform: "rotate(-2deg)",
                }}
              >
                {isPaid ? "PAID" : "VOIDED"}
              </span>
            )}
          </div>
        </div>

        {/* Thick brand rule under the header (designer artwork) */}
        <div aria-hidden className={`mb-4 h-[3px] w-full ${PRINT_EXACT}`} style={{ background: PRINT.orange }} />

        {/* TAX INVOICE compliance label */}
        <p
          className="mb-6 text-[13px] font-bold uppercase tracking-[0.22em]"
          style={{ color: PRINT.navy }}
        >
          TAX INVOICE
        </p>

        {/* Dates row */}
        <div className="mb-6 flex flex-wrap gap-6 border-b border-[#EFEBE0] pb-5 text-sm">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#A0A0A0]">Issue date</p>
            <p className="mt-0.5 text-[#1A1A1A]">{fmtDate(invoice.issuedAt)}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#A0A0A0]">Due date</p>
            <p className="mt-0.5 text-[#1A1A1A]">{fmtDate(invoice.dueDate)}</p>
          </div>
          {invoice.paidAt && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#A0A0A0]">Paid</p>
              <p className="mt-0.5 text-[#2F8F5C]">{fmtDate(invoice.paidAt)}</p>
            </div>
          )}
        </div>

        {/* Customer / client block */}
        <div className="mb-8 border-b border-[#EFEBE0] pb-6">
          <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: PRINT.navy }}>Invoice for</p>
          <p className="text-base font-semibold text-[#1A1A1A]">
            {invoice.clientName ?? (invoice.customerId ? "(customer linked)" : "â€”")}
          </p>
          {invoice.clientEmail && (
            <p className="text-sm text-[#6B6B6B]">{invoice.clientEmail}</p>
          )}
          {invoice.jobRef && (
            <p className="mt-1 text-xs text-[#A0A0A0]">Ref: {invoice.jobRef}</p>
          )}
        </div>

        {/* â”€â”€ Line items table â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <div className="mb-6 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className={`border-b border-[#E6E1D4] bg-[#FBE7D9] ${PRINT_EXACT}`}>
                <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Description</th>
                <th className="w-20 px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Qty</th>
                <th className="w-16 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Unit</th>
                <th className="w-28 px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Unit price</th>
                <th className="w-28 px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Line total</th>
                {!isLocked && <th className="w-10 px-3 py-2 print:hidden" aria-label="Actions" />}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-10 text-center text-xs text-[#A0A0A0]">
                    No line items yet. Add one below.
                  </td>
                </tr>
              )}
              {(() => {
                const renderRow = (item: (typeof items)[number]) => {
                const lt = lineTotal({ qty: item.qty, unitPriceExGst: item.unitPriceExGst });
                const isVariation = !!item.variationId;
                return (
                  <tr key={item.id} className="border-b border-[#EFEBE0] hover:bg-[#FAF8F2]">
                    <td className="px-3 py-2.5 text-[#1A1A1A]">
                      <span className="flex items-center gap-2">
                        {item.description}
                        {isVariation && (
                          <span
                            className="flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                            style={{
                              backgroundColor: TONE.amber.bg,
                              color: TONE.amber.fg,
                            }}
                          >
                            VARIATION
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {isLocked ? (
                        <span className="tabular-nums">{item.qty}</span>
                      ) : (
                        <NumCell
                          value={item.qty}
                          disabled={saving}
                          onCommit={(v) => void handleItemUpdate(item, { qty: v })}
                        />
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-[#6B6B6B]">{item.unit}</td>
                    <td className="px-3 py-2.5 text-right">
                      {isLocked ? (
                        <span className="tabular-nums">{fmtMoney(item.unitPriceExGst)}</span>
                      ) : (
                        <NumCell
                          value={item.unitPriceExGst}
                          disabled={saving}
                          onCommit={(v) => void handleItemUpdate(item, { unitPriceExGst: v })}
                        />
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-medium text-[#1A1A1A]">
                      {fmtMoney(lt)}
                    </td>
                    {!isLocked && (
                      <td className="px-3 py-2.5 print:hidden">
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void handleRemoveItem(item)}
                          className="text-[#C0BAB0] hover:text-[#C44545] disabled:opacity-40"
                          aria-label="Remove line"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                );
                };

                // Group by cost centre when any line carries one (quote sections +
                // accepted variations); blocks keep first-appearance order.
                const hasCentres = items.some((i) => i.costCentre);
                if (!hasCentres) return items.map(renderRow);
                const order: (string | null)[] = [];
                for (const i of items) {
                  const k = i.costCentre ?? null;
                  if (!order.includes(k)) order.push(k);
                }
                const cols = isLocked ? 5 : 6;
                return order.flatMap((k) => {
                  const rows = items.filter((i) => (i.costCentre ?? null) === k);
                  const sub = rows.reduce((s, i) => s + lineTotal({ qty: i.qty, unitPriceExGst: i.unitPriceExGst }), 0);
                  const label = k ?? "General";
                  return [
                    <tr key={`hdr-${label}`} className="bg-[#FAF8F2]">
                      <td colSpan={cols} className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">{label}</td>
                    </tr>,
                    ...rows.map(renderRow),
                    <tr key={`sub-${label}`}>
                      <td colSpan={cols} className="px-3 pb-2 pt-0.5 text-right text-[11px] text-[#6B6B6B]">
                        {label} subtotal: <span className="font-semibold tabular-nums text-[#3A3A3A]">{fmtMoney(sub)}</span>
                      </td>
                    </tr>,
                  ];
                });
              })()}
            </tbody>
          </table>
        </div>

        {/* â”€â”€ Add row controls â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        {!isLocked && (
          <div className="mb-8 print:hidden">
            {addMode === null && (
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setAddMode("catalogue")} className={btnGhost}>
                  <Search className="h-4 w-4" /> From catalogue
                </button>
                <button type="button" onClick={() => setAddMode("prebuild")} className={btnGhost}>
                  <Package className="h-4 w-4" /> From prebuild
                </button>
                <button type="button" onClick={() => setAddMode("free")} className={btnGhost}>
                  <Plus className="h-4 w-4" /> Free line
                </button>
              </div>
            )}

            {addMode === "catalogue" && (
              <div className="rounded-[10px] border border-[#E6E1D4] bg-[#FAF8F2] p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#6B6B6B]">Search catalogue</p>
                  <button type="button" onClick={() => { setAddMode(null); setCatalogueSearch(""); setCatalogueResults([]); }} className="text-xs text-[#A0A0A0] hover:text-[#C44545]">Cancel</button>
                </div>
                <input
                  autoFocus
                  value={catalogueSearch}
                  onChange={(e) => setCatalogueSearch(e.target.value)}
                  placeholder="Type to search materials..."
                  className="w-full rounded-md border border-[#E6E1D4] bg-white px-3 py-2 text-sm focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]"
                />
                {catalogueResults.length > 0 && (
                  <ul className="mt-2 divide-y divide-[#EFEBE0] rounded-md border border-[#E6E1D4] bg-white">
                    {catalogueResults.map((mat) => (
                      <li key={mat.id}>
                        <button
                          type="button"
                          disabled={addingMat}
                          onClick={() => void handleAddFromMaterial(mat)}
                          className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm hover:bg-[#FAF8F2] disabled:opacity-50"
                        >
                          <span className="font-medium text-[#1A1A1A]">{mat.name}</span>
                          <span className="ml-2 flex-shrink-0 tabular-nums text-[#6B6B6B]">
                            {mat.sellPrice != null ? fmtMoney(mat.sellPrice) : "â€”"} / {mat.unit}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {catalogueSearch.length > 0 && catalogueResults.length === 0 && (
                  <p className="mt-2 text-xs text-[#A0A0A0]">No materials match.</p>
                )}
              </div>
            )}

            {addMode === "prebuild" && (
              <div className="rounded-[10px] border border-[#E6E1D4] bg-[#FAF8F2] p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#6B6B6B]">Pick a prebuild bundle</p>
                  <button type="button" onClick={() => { setAddMode(null); setPrebuildId(""); }} className="text-xs text-[#A0A0A0] hover:text-[#C44545]">Cancel</button>
                </div>
                <div className="flex gap-2">
                  <select
                    value={prebuildId}
                    onChange={(e) => setPrebuildId(e.target.value)}
                    className="flex-1 rounded-md border border-[#E6E1D4] bg-white px-3 py-2 text-sm focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]"
                  >
                    <option value="">Select a prebuild...</option>
                    {prebuilds.map((pb) => (
                      <option key={pb.id} value={pb.id}>{pb.name}</option>
                    ))}
                  </select>
                  <button type="button" onClick={() => void handleAddPrebuild()} disabled={!prebuildId || addingPb} className={btnPrimary}>
                    {addingPb ? "Adding..." : "Add bundle"}
                  </button>
                </div>
              </div>
            )}

            {addMode === "free" && (
              <form
                onSubmit={(e) => void handleAddFree(e)}
                className="rounded-[10px] border border-[#E6E1D4] bg-[#FAF8F2] p-4"
              >
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#6B6B6B]">Free line item</p>
                  <button type="button" onClick={() => setAddMode(null)} className="text-xs text-[#A0A0A0] hover:text-[#C44545]">Cancel</button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <input
                    autoFocus
                    required
                    value={freeDesc}
                    onChange={(e) => setFreeDesc(e.target.value)}
                    placeholder="Description"
                    className="flex-[3] min-w-[160px] rounded-md border border-[#E6E1D4] bg-white px-3 py-2 text-sm focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]"
                  />
                  <input
                    type="number" min="0" step="any"
                    value={freeQty}
                    onChange={(e) => setFreeQty(e.target.value)}
                    placeholder="Qty"
                    className="w-20 rounded-md border border-[#E6E1D4] bg-white px-3 py-2 text-sm focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]"
                  />
                  <input
                    value={freeUnit}
                    onChange={(e) => setFreeUnit(e.target.value)}
                    placeholder="Unit"
                    className="w-20 rounded-md border border-[#E6E1D4] bg-white px-3 py-2 text-sm focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]"
                  />
                  <input
                    type="number" min="0" step="any"
                    value={freePrice}
                    onChange={(e) => setFreePrice(e.target.value)}
                    placeholder="Unit price (ex GST)"
                    className="w-36 rounded-md border border-[#E6E1D4] bg-white px-3 py-2 text-sm focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]"
                  />
                  <button type="submit" disabled={addingFree} className={btnPrimary}>
                    {addingFree ? "Adding..." : "Add line"}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* â”€â”€ Totals footer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <div className="mb-8 flex justify-end">
          <div className="w-full max-w-xs space-y-1" style={{ breakInside: "avoid" }}>
            <div className="flex items-center justify-between text-sm text-[#6B6B6B]">
              <span>Subtotal (ex GST)</span>
              <span className="tabular-nums">{fmtMoney(invoice.subtotalExGst)}</span>
            </div>
            <div className="flex items-center justify-between pb-2 text-sm text-[#6B6B6B]" style={{ borderBottom: `2px solid ${PRINT.navy}` }}>
              <span>GST ({((settings?.gstRate ?? 0.1) * 100).toFixed(0)}%)</span>
              <span className="tabular-nums">{fmtMoney(invoice.gstAmount)}</span>
            </div>
            {/* The designer's solid-orange total band */}
            <div
              className={`mt-2 flex items-center justify-between px-4 py-2.5 text-base font-bold text-white ${PRINT_EXACT}`}
              style={{ background: PRINT.orange }}
            >
              <span>Total (inc GST)</span>
              <span className="tabular-nums text-[18px]">
                {fmtMoney(invoice.totalIncGst)}
              </span>
            </div>
          </div>
        </div>

        {/* â”€â”€ Notes textarea â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <div className="mb-8">
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#A0A0A0]">
            Notes
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            disabled={isLocked}
            placeholder="Notes will appear on the printed invoice."
            className="w-full rounded-md border border-[#E6E1D4] px-3 py-2 text-sm focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C] disabled:opacity-50 print:border-0 print:px-0"
          />
        </div>

        {/* ── Branded document footer (designer artwork, P6-P) — shared with the quote ── */}
        <PrintDocFooter settings={settings} />

        {/* â”€â”€ Status action bar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-[#EFEBE0] pt-5 print:hidden">
          <span
            className="inline-flex rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em]"
            style={{ backgroundColor: statusTone.bg, color: statusTone.fg }}
          >
            {invoice.status}
          </span>

          <div className="ml-auto flex flex-wrap gap-2">
            {invoice.status === "draft" && (
              <button type="button" disabled={saving} onClick={() => setConfirmAction("issue")} className={btnPrimary}>
                Issue invoice
              </button>
            )}
            {invoice.status === "sent" && (
              <button type="button" disabled={saving} onClick={() => setConfirmAction("pay")} className={btnPrimary}>
                Record payment
              </button>
            )}
            {(invoice.status === "draft" || invoice.status === "sent") && (
              <button
                type="button"
                disabled={saving}
                onClick={() => setConfirmAction("void")}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#E6E1D4] bg-white px-4 py-1.5 text-sm font-medium text-[#C44545] hover:border-[#F0BFBF] hover:bg-[#FBE5E5] transition-colors"
              >
                Void
              </button>
            )}
          </div>
        </div>

      </div>

      {/* Confirm modal */}
      {confirmConfig && (
        <ConfirmModal
          title={confirmConfig.title}
          body={confirmConfig.body}
          confirmLabel={confirmConfig.confirmLabel}
          danger={confirmConfig.danger}
          onConfirm={() => void handleConfirmedAction()}
          onClose={() => { if (!saving) setConfirmAction(null); }}
        />
      )}

      {toast && (
        <Toaster message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </>
  );
}

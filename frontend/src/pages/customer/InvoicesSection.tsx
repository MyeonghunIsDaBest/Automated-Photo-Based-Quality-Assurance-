// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// pages/customer/InvoicesSection.tsx â€” customer portal section showing
// non-draft invoices and quotes awaiting reply.
//
// Props: { customerId: string }
// RLS scopes all data to the authenticated customer.
// Customers NEVER see status actions â€” read-only throughout.
// Viewed quote stamp: fire-and-forget RPC mark_quote_viewed on expand.
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { FRAUNCES, TONE, cardShell } from "../gantt/components/ledger";
import { SkeletonLine } from "../../components/ui/skeleton";
import { lineTotal } from "../../lib/commercial/money";

import {
  listInvoices,
  listQuotes,
  getInvoice,
  isOverdue,
  markQuoteViewed,
  type Invoice,
  type Quote,
} from "../../lib/api/commercial";

// â”€â”€â”€ types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface Props {
  customerId: string;
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

// â”€â”€â”€ Invoice status display (customer-friendly labels) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type DisplayStatus = "awaiting" | "overdue" | "paid";

function invoiceDisplayStatus(inv: Invoice, today: string): DisplayStatus | null {
  if (inv.status === "voided") return null; // hidden
  if (inv.status === "paid") return "paid";
  if (isOverdue(inv, today)) return "overdue";
  return "awaiting";
}

const DISPLAY_LABELS: Record<DisplayStatus, string> = {
  awaiting: "Awaiting payment",
  overdue:  "Overdue",
  paid:     "Paid",
};

const DISPLAY_TONE: Record<DisplayStatus, keyof typeof TONE> = {
  awaiting: "slate",
  overdue:  "red",
  paid:     "sage",
};

// â”€â”€â”€ Read-only paper invoice detail â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function InvoiceDetail({ invoiceId }: { invoiceId: string }) {
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getInvoice(invoiceId)
      .then(setInvoice)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [invoiceId]);

  if (loading) {
    return (
      <div className="space-y-2 px-5 py-4">
        <SkeletonLine className="w-40" />
        <SkeletonLine className="w-64" />
      </div>
    );
  }

  if (!invoice) return null;

  const items = invoice.items ?? [];

  return (
    <div className="border-t border-[#EFEBE0] bg-[#FAF8F2] px-5 py-4">
      {/* Mini header */}
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="font-mono text-xs text-[#A0A0A0]">{invoice.number ?? "â€”"}</p>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#6B6B6B]">TAX INVOICE</p>
        </div>
        <div className="text-right text-xs text-[#6B6B6B]">
          {invoice.issuedAt && <p>Issued {fmtDate(invoice.issuedAt)}</p>}
          {invoice.dueDate && <p>Due {fmtDate(invoice.dueDate)}</p>}
        </div>
      </div>

      {/* Line items */}
      {items.length > 0 && (
        <div className="mb-3 overflow-x-auto rounded-[8px] border border-[#E6E1D4] bg-white">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="border-b border-[#E6E1D4] bg-[#FAF8F2]">
                <th className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#A0A0A0]">Description</th>
                <th className="w-14 px-3 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-[#A0A0A0]">Qty</th>
                <th className="w-24 px-3 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-[#A0A0A0]">Unit price</th>
                <th className="w-24 px-3 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-[#A0A0A0]">Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const lt = lineTotal({ qty: item.qty, unitPriceExGst: item.unitPriceExGst });
                return (
                  <tr key={item.id} className="border-b border-[#EFEBE0] last:border-0">
                    <td className="px-3 py-2 text-[#1A1A1A]">{item.description}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#6B6B6B]">{item.qty}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#6B6B6B]">{fmtMoney(item.unitPriceExGst)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium text-[#1A1A1A]">{fmtMoney(lt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Totals */}
      <div className="flex justify-end">
        <div className="w-full max-w-[240px] space-y-0.5">
          <div className="flex items-center justify-between text-xs text-[#6B6B6B]">
            <span>Subtotal (ex GST)</span>
            <span className="tabular-nums">{fmtMoney(invoice.subtotalExGst)}</span>
          </div>
          <div className="flex items-center justify-between text-xs text-[#6B6B6B]">
            <span>GST</span>
            <span className="tabular-nums">{fmtMoney(invoice.gstAmount)}</span>
          </div>
          <div className="flex items-center justify-between border-t border-[#E6E1D4] pt-1 text-sm font-semibold text-[#1A1A1A]">
            <span>Total (inc GST)</span>
            <span className="tabular-nums" style={{ fontFamily: FRAUNCES }}>{fmtMoney(invoice.totalIncGst)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// â”€â”€â”€ Read-only quote detail â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function QuoteDetail({ quote }: { quote: Quote }) {
  return (
    <div className="border-t border-[#EFEBE0] bg-[#FAF8F2] px-5 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs text-[#6B6B6B]">
          {quote.number ?? "â€”"} &middot; Created {fmtDate(quote.createdAt)}
          {quote.validUntil ? ` Â· Valid until ${fmtDate(quote.validUntil)}` : ""}
        </p>
        <span
          className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
          style={{ backgroundColor: TONE.amber.bg, color: TONE.amber.fg }}
        >
          Awaiting your reply
        </span>
      </div>
      {quote.notes && (
        <p className="mt-2 text-xs text-[#6B6B6B]">{quote.notes}</p>
      )}
      <p className="mt-2 text-[13px] font-semibold text-[#1A1A1A]">
        Total: {fmtMoney(quote.totalIncGst)} inc GST
      </p>
      <p className="mt-1 text-xs text-[#A0A0A0]">
        Contact Casone Electrical to accept or discuss this quote.
      </p>
    </div>
  );
}

// â”€â”€â”€ component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function InvoicesSection({ customerId }: Props) {
  const [invoices, setInvoices]     = useState<Invoice[]>([]);
  const [quotes, setQuotes]         = useState<Quote[]>([]);
  const [loading, setLoading]       = useState(true);
  const [expandedInvId, setExpandedInvId] = useState<string | null>(null);
  const [expandedQteId, setExpandedQteId] = useState<string | null>(null);
  const viewedRef                   = useRef<Set<string>>(new Set());

  const today = todayIso();

  useEffect(() => {
    Promise.all([
      listInvoices({ customerId }),
      listQuotes({ customerId }),
    ])
      .then(([invs, qts]) => {
        setInvoices(invs.filter((i) => i.status !== "draft"));
        setQuotes(qts.filter((q) => q.status === "sent" || q.status === "viewed"));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [customerId]);

  function handleExpandQuote(quoteId: string) {
    const isOpening = expandedQteId !== quoteId;
    setExpandedQteId(isOpening ? quoteId : null);
    if (isOpening && !viewedRef.current.has(quoteId)) {
      viewedRef.current.add(quoteId);
      // fire-and-forget: stamp quote as viewed via RPC
      void markQuoteViewed(quoteId);
    }
  }

  // Filter out voided invoices for display
  const visibleInvoices = invoices.filter((inv) => {
    return invoiceDisplayStatus(inv, today) !== null;
  });

  if (loading) {
    return (
      <section className={`mb-4 overflow-hidden ${cardShell}`}>
        <div className="border-b border-[#EFEBE0] px-5 py-3">
          <h2 className="text-[16px] font-medium text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>
            Invoices &amp; Quotes
          </h2>
        </div>
        <div className="space-y-2 px-5 py-4">
          <SkeletonLine className="w-full" />
          <SkeletonLine className="w-3/4" />
        </div>
      </section>
    );
  }

  const hasContent = visibleInvoices.length > 0 || quotes.length > 0;

  if (!hasContent) return null;

  return (
    <section className={`mb-4 overflow-hidden ${cardShell}`}>
      <div className="border-b border-[#EFEBE0] px-5 py-3">
        <h2
          className="text-[16px] font-medium text-[#1A1A1A]"
          style={{ fontFamily: FRAUNCES }}
        >
          Invoices &amp; Quotes
        </h2>
        <p className="text-[12px] text-[#6B6B6B]">
          Your billing history and pending quotes.
        </p>
      </div>

      {/* Invoices list */}
      {visibleInvoices.length > 0 && (
        <>
          <div className="border-b border-[#EFEBE0] bg-[#FAF8F2] px-5 py-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#A0A0A0]">Invoices</p>
          </div>
          <ul className="divide-y divide-[#EFEBE0]">
            {visibleInvoices.map((inv) => {
              const ds = invoiceDisplayStatus(inv, today) as DisplayStatus;
              const toneKey = DISPLAY_TONE[ds];
              const tone = TONE[toneKey];
              const isExpanded = expandedInvId === inv.id;
              return (
                <li key={inv.id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left transition-colors hover:bg-[#FAF8F2]"
                    onClick={() => setExpandedInvId(isExpanded ? null : inv.id)}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-medium text-[#1A1A1A]">
                        {inv.number ?? "Invoice"}{inv.jobRef ? ` â€” ${inv.jobRef}` : ""}
                      </p>
                      <p className="text-[12px] text-[#6B6B6B]">
                        {fmtMoney(inv.totalIncGst)} inc GST
                        {inv.dueDate ? ` Â· Due ${fmtDate(inv.dueDate)}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-2">
                      <span
                        className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                        style={{
                          backgroundColor: tone.bg,
                          color: tone.fg,
                          ...(ds === "overdue"
                            ? { outline: `1px solid ${tone.dot}` }
                            : {}),
                        }}
                      >
                        {DISPLAY_LABELS[ds]}
                      </span>
                      {isExpanded
                        ? <ChevronDown className="h-4 w-4 text-[#A0A0A0]" />
                        : <ChevronRight className="h-4 w-4 text-[#A0A0A0]" />
                      }
                    </div>
                  </button>
                  {isExpanded && <InvoiceDetail invoiceId={inv.id} />}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {/* Quotes awaiting reply */}
      {quotes.length > 0 && (
        <>
          <div className="border-b border-t border-[#EFEBE0] bg-[#FAF8F2] px-5 py-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#A0A0A0]">Quotes awaiting your reply</p>
          </div>
          <ul className="divide-y divide-[#EFEBE0]">
            {quotes.map((q) => {
              const isExpanded = expandedQteId === q.id;
              return (
                <li key={q.id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left transition-colors hover:bg-[#FAF8F2]"
                    onClick={() => handleExpandQuote(q.id)}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-medium text-[#1A1A1A]">{q.title}</p>
                      <p className="text-[12px] text-[#6B6B6B]">
                        {fmtMoney(q.totalIncGst)} inc GST
                        {q.validUntil ? ` Â· Valid until ${fmtDate(q.validUntil)}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-2">
                      <span
                        className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                        style={{ backgroundColor: TONE.amber.bg, color: TONE.amber.fg }}
                      >
                        Awaiting reply
                      </span>
                      {isExpanded
                        ? <ChevronDown className="h-4 w-4 text-[#A0A0A0]" />
                        : <ChevronRight className="h-4 w-4 text-[#A0A0A0]" />
                      }
                    </div>
                  </button>
                  {isExpanded && <QuoteDetail quote={q} />}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

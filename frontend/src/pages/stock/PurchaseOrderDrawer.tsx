// ─────────────────────────────────────────────────────────────────────────────
// pages/stock/PurchaseOrderDrawer.tsx — the purchase-order lifecycle (Phase 3):
// review the lines, send to the wholesaler, receive stock into the factory, and
// match the wholesaler's invoice against the order.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { Loader2, Send, PackageCheck, Receipt, X, Check, AlertTriangle } from "lucide-react";

import { Toaster } from "../../components/ui/Toaster";
import MotionDrawer from "../../components/ui/MotionDrawer";
import { cardShell, btnPrimary, btnGhost, inputField, StatusPill, type ToneKey } from "../gantt/components/ledger";
import {
  getPurchaseOrderWithItems, updatePurchaseOrderStatus, receivePurchaseOrder,
  listSupplierInvoices, createSupplierInvoice, poOrderedTotal,
  type POWithItems, type SupplierInvoice, type POStatus,
} from "../../lib/api/purchasing";

type ToastState = { message: string; type: "success" | "error" | "info" } | null;

const PO_TONE: Record<POStatus, ToneKey> = {
  suggested: "amber", draft: "slate", sent: "sage", partial: "amber", received: "sage", cancelled: "red",
};
const fmtQty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
const fmtMoney = (n: number) => "$" + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

export default function PurchaseOrderDrawer({ poId, onClose, onChanged }: { poId: string | null; onClose: () => void; onChanged: () => void }) {
  const [po, setPo] = useState<POWithItems | null>(null);
  const [invoices, setInvoices] = useState<SupplierInvoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  const [recv, setRecv] = useState<Record<string, string>>({}); // itemId → receive-now qty
  const [inv, setInv] = useState({ number: "", date: "", amount: "" });

  async function reload(id: string) {
    const [p, invs] = await Promise.all([getPurchaseOrderWithItems(id), listSupplierInvoices(id).catch(() => [])]);
    setPo(p);
    setInvoices(invs);
  }

  useEffect(() => {
    if (!poId) { setPo(null); return; }
    setLoading(true);
    setRecv({}); setInv({ number: "", date: "", amount: "" });
    reload(poId).catch(() => {}).finally(() => setLoading(false));
  }, [poId]);

  async function setStatus(status: POStatus, msg: string) {
    if (!po) return;
    setBusy(true);
    try {
      await updatePurchaseOrderStatus(po.id, status);
      await reload(po.id);
      onChanged();
      setToast({ message: msg, type: "success" });
    } catch (ex) {
      setToast({ message: ex instanceof Error ? ex.message : "Failed", type: "error" });
    } finally { setBusy(false); }
  }

  async function handleReceive() {
    if (!po) return;
    const receipts = po.items
      .map((i) => ({ itemId: i.id, qtyNow: parseFloat(recv[i.id] ?? "") }))
      .filter((r) => Number.isFinite(r.qtyNow) && r.qtyNow > 0);
    if (receipts.length === 0) { setToast({ message: "Enter at least one received quantity.", type: "error" }); return; }
    setBusy(true);
    try {
      await receivePurchaseOrder(po.id, receipts);
      await reload(po.id);
      onChanged();
      setRecv({});
      setToast({ message: po.kind === "restock" ? "Received into the factory." : "Received.", type: "success" });
    } catch (ex) {
      setToast({ message: ex instanceof Error ? ex.message : "Failed to receive", type: "error" });
    } finally { setBusy(false); }
  }

  async function handleAddInvoice() {
    if (!po) return;
    const amount = parseFloat(inv.amount);
    setBusy(true);
    try {
      await createSupplierInvoice({
        poId: po.id, supplierId: po.supplierId,
        number: inv.number.trim() || null,
        invoiceDate: inv.date || null,
        amount: Number.isFinite(amount) ? amount : null,
        status: "matched",
      });
      await reload(po.id);
      setInv({ number: "", date: "", amount: "" });
      setToast({ message: "Invoice recorded.", type: "success" });
    } catch (ex) {
      setToast({ message: ex instanceof Error ? ex.message : "Failed to add invoice", type: "error" });
    } finally { setBusy(false); }
  }

  const ordered = po ? poOrderedTotal(po.items) : 0;
  const canSend = po && (po.status === "suggested" || po.status === "draft");
  const canReceive = po && (po.status === "sent" || po.status === "partial");
  const canCancel = po && !["received", "cancelled"].includes(po.status);

  return (
    <MotionDrawer open={!!poId} onClose={onClose} ariaLabel="Purchase order" sizeClass="sm:w-[560px] lg:w-[640px]">
      {loading || !po ? (
        <div className="flex flex-1 items-center justify-center gap-2 p-8 text-sm text-[#A0A0A0]"><Loader2 className="h-4 w-4 animate-spin" /> Loading order…</div>
      ) : (
        <>
          <div className="flex items-start justify-between border-b border-[#E6E1D4] px-5 py-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-[#1A1A1A]">{po.number}</h2>
                <StatusPill tone={PO_TONE[po.status]} className="uppercase tracking-wide">{po.status}</StatusPill>
                <span className="rounded-full bg-[#F0EDE4] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]">{po.kind}</span>
              </div>
              <p className="mt-0.5 text-[13px] text-[#6B6B6B]">{po.supplierName ?? "No wholesaler"}</p>
            </div>
            <button type="button" onClick={onClose} className="text-[#A0A0A0] hover:text-[#C44545]"><X className="h-4 w-4" /></button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            {/* Lines */}
            <div className={`mb-4 overflow-hidden ${cardShell}`}>
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-[#E6E1D4] bg-[#FAF8F2]">
                    <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Item</th>
                    <th className="w-20 px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Ordered</th>
                    <th className="w-20 px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Received</th>
                    {canReceive && <th className="w-24 px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Receive now</th>}
                    <th className="w-24 px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Unit cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EFEBE0]">
                  {po.items.map((i) => {
                    const remaining = Math.max(0, i.qtyOrdered - i.qtyReceived);
                    return (
                      <tr key={i.id}>
                        <td className="px-3 py-2 text-[#1A1A1A]">{i.description ?? "(item)"}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-[#3A3A3A]">{fmtQty(i.qtyOrdered)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-[#6B6B6B]">{fmtQty(i.qtyReceived)}</td>
                        {canReceive && (
                          <td className="px-3 py-2 text-right">
                            <input
                              type="number" min={0} step="any" inputMode="decimal"
                              value={recv[i.id] ?? ""}
                              placeholder={remaining > 0 ? String(remaining) : "0"}
                              onChange={(e) => setRecv((p) => ({ ...p, [i.id]: e.target.value }))}
                              className={`${inputField} w-20 text-right tabular-nums`}
                            />
                          </td>
                        )}
                        <td className="px-3 py-2 text-right tabular-nums text-[#6B6B6B]">{i.unitCost != null ? fmtMoney(i.unitCost) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-[#E6E1D4] bg-[#FAF8F2]">
                    <td className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]" colSpan={canReceive ? 4 : 3}>Order total</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-[#1A1A1A]">{fmtMoney(ordered)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Actions */}
            <div className="mb-4 flex flex-wrap gap-2">
              {canSend && <button type="button" onClick={() => void setStatus("sent", "Order marked sent — email it to the wholesaler.")} disabled={busy} className={btnPrimary}><Send className="h-4 w-4" /> Send to wholesaler</button>}
              {canReceive && <button type="button" onClick={() => void handleReceive()} disabled={busy} className={btnPrimary}><PackageCheck className="h-4 w-4" /> Receive</button>}
              {canCancel && <button type="button" onClick={() => void setStatus("cancelled", "Order cancelled.")} disabled={busy} className={btnGhost}>Cancel order</button>}
            </div>
            {canSend && <p className="mb-4 -mt-2 text-[11px] text-[#A0A0A0]">Sending marks the order sent. Emailing the wholesaler automatically comes later — for now, send it from your email{po.supplierName ? ` to ${po.supplierName}` : ""}.</p>}

            {/* Invoice match */}
            <div className={`overflow-hidden ${cardShell}`}>
              <div className="flex items-center gap-2 border-b border-[#EFEBE0] bg-[#FAF8F2] px-3 py-2">
                <Receipt className="h-4 w-4 text-[#2F8F5C]" />
                <span className="text-sm font-semibold text-[#1A1A1A]">Wholesaler invoice</span>
              </div>
              <div className="px-3 py-3">
                {invoices.length > 0 && (
                  <ul className="mb-3 space-y-1.5">
                    {invoices.map((iv) => {
                      const matches = iv.amount != null && Math.abs(iv.amount - ordered) < 0.01;
                      return (
                        <li key={iv.id} className="flex items-center gap-2 text-sm">
                          <span className="flex-1 text-[#1A1A1A]">{iv.number || "(no number)"} {iv.invoiceDate && <span className="text-[11px] text-[#A0A0A0]">· {iv.invoiceDate}</span>}</span>
                          <span className="tabular-nums text-[#3A3A3A]">{iv.amount != null ? fmtMoney(iv.amount) : "—"}</span>
                          {iv.amount != null && (
                            matches
                              ? <span className="inline-flex items-center gap-1 rounded-full bg-[#E5F2EA] px-2 py-0.5 text-[10px] font-semibold text-[#246F47]"><Check className="h-3 w-3" /> Matches</span>
                              : <span className="inline-flex items-center gap-1 rounded-full bg-[#F9EFD9] px-2 py-0.5 text-[10px] font-semibold text-[#C8841E]"><AlertTriangle className="h-3 w-3" /> Differs {fmtMoney(iv.amount - ordered)}</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
                <div className="flex flex-wrap items-end gap-2">
                  <label className="flex-1"><span className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-[#6B6B6B]">Invoice no.</span>
                    <input value={inv.number} onChange={(e) => setInv((p) => ({ ...p, number: e.target.value }))} className={inputField} /></label>
                  <label><span className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-[#6B6B6B]">Date</span>
                    <input type="date" value={inv.date} onChange={(e) => setInv((p) => ({ ...p, date: e.target.value }))} className={inputField} /></label>
                  <label className="w-28"><span className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-[#6B6B6B]">Amount</span>
                    <input type="number" min={0} step="any" inputMode="decimal" value={inv.amount} onChange={(e) => setInv((p) => ({ ...p, amount: e.target.value }))} className={`${inputField} text-right tabular-nums`} /></label>
                  <button type="button" onClick={() => void handleAddInvoice()} disabled={busy} className={btnGhost}>Match invoice</button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
      {toast && <Toaster message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </MotionDrawer>
  );
}

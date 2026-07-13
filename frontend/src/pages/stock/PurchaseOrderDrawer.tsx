// ─────────────────────────────────────────────────────────────────────────────
// pages/stock/PurchaseOrderDrawer.tsx — the purchase-order lifecycle: edit the
// lines while it's a draft, email/print it to the wholesaler, mark it sent,
// receive stock into the factory (with progress), and match the wholesaler's
// invoice against the order.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import { Loader2, Send, PackageCheck, Receipt, X, Check, AlertTriangle, Trash2, Plus, Mail, Printer } from "lucide-react";

import { Toaster, type ToastState } from "../../components/ui/Toaster";
import MotionDrawer from "../../components/ui/MotionDrawer";
import { cardShell, btnPrimary, btnGhost, inputField, StatusPill, type ToneKey } from "../gantt/components/ledger";
import {
  getPurchaseOrderWithItems, updatePurchaseOrderStatus, receivePurchaseOrder,
  addPOItem, updatePOItem, removePOItem,
  listSupplierInvoices, createSupplierInvoice, poOrderedTotal,
  type POWithItems, type SupplierInvoice, type POStatus,
} from "../../lib/api/purchasing";
import { listSuppliers, type Supplier } from "../../lib/api/suppliers";
import { listMaterials, type Material } from "../../lib/api/materials";
import { fmtMoney, fmtQty } from "../../lib/format";

const PO_TONE: Record<POStatus, ToneKey> = {
  suggested: "amber", draft: "slate", sent: "sage", partial: "amber", received: "sage", cancelled: "red",
};

export default function PurchaseOrderDrawer({ poId, onClose, onChanged }: { poId: string | null; onClose: () => void; onChanged: () => void }) {
  const [po, setPo] = useState<POWithItems | null>(null);
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [invoices, setInvoices] = useState<SupplierInvoice[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  const [recv, setRecv] = useState<Record<string, string>>({});           // itemId → receive-now qty
  const [edits, setEdits] = useState<Record<string, { qty?: string; cost?: string }>>({}); // itemId → draft edits
  const [addLine, setAddLine] = useState({ materialId: "", qty: "" });
  const [inv, setInv] = useState({ number: "", date: "", amount: "" });

  async function reload(id: string) {
    const [p, invs] = await Promise.all([getPurchaseOrderWithItems(id), listSupplierInvoices(id).catch(() => [])]);
    setPo(p);
    setInvoices(invs);
    if (p?.supplierId) {
      const sups = await listSuppliers().catch(() => [] as Supplier[]);
      setSupplier(sups.find((s) => s.id === p.supplierId) ?? null);
    } else {
      setSupplier(null);
    }
  }

  useEffect(() => {
    if (!poId) { setPo(null); setSupplier(null); return; }
    setLoading(true);
    setRecv({}); setEdits({}); setAddLine({ materialId: "", qty: "" }); setInv({ number: "", date: "", amount: "" });
    reload(poId).catch(() => {}).finally(() => setLoading(false));
    void listMaterials().then((m) => setMaterials(m.filter((x) => x.isStockItem))).catch(() => {});
  }, [poId]);

  const ordered = po ? poOrderedTotal(po.items) : 0;
  const canEdit = !!po && (po.status === "suggested" || po.status === "draft");
  const canSend = canEdit;
  const canReceive = !!po && (po.status === "sent" || po.status === "partial");
  const canCancel = !!po && !["received", "cancelled"].includes(po.status);

  const receiveProgress = useMemo(() => {
    if (!po) return null;
    const totalOrdered = po.items.reduce((s, i) => s + i.qtyOrdered, 0);
    const totalReceived = po.items.reduce((s, i) => s + Math.min(i.qtyReceived, i.qtyOrdered), 0);
    if (totalOrdered <= 0) return null;
    return { totalOrdered, totalReceived, pct: Math.min(100, Math.round((totalReceived / totalOrdered) * 100)) };
  }, [po]);

  const supplierEmail = supplier ? (supplier.accountsEmail || supplier.mainEmail || null) : null;

  const mailtoHref = useMemo(() => {
    if (!po) return null;
    const lines = po.items.map((i) => `• ${fmtQty(i.qtyOrdered)} × ${i.description ?? "item"}${i.unitCost != null ? ` @ ${fmtMoney(i.unitCost)}` : ""}`);
    const body = [
      `Hi${supplier?.name ? ` ${supplier.name}` : ""},`,
      "",
      `Please supply the following (order ${po.number}):`,
      "",
      ...lines,
      "",
      `Order total (ex GST): ${fmtMoney(ordered)}`,
      po.expectedDate ? `Needed by: ${po.expectedDate}` : "",
      "",
      "Thanks,",
      "Casone Electrical",
    ].filter((l) => l !== "").join("\n");
    const to = supplierEmail ?? "";
    return `mailto:${to}?subject=${encodeURIComponent(`Purchase order ${po.number} — Casone Electrical`)}&body=${encodeURIComponent(body)}`;
  }, [po, supplier, supplierEmail, ordered]);

  function printPO() {
    if (!po) return;
    const rows = po.items.map((i) => `
      <tr>
        <td>${(i.description ?? "item").replace(/</g, "&lt;")}</td>
        <td class="num">${fmtQty(i.qtyOrdered)}</td>
        <td class="num">${i.unitCost != null ? fmtMoney(i.unitCost) : "—"}</td>
        <td class="num">${i.unitCost != null ? fmtMoney(i.qtyOrdered * i.unitCost) : "—"}</td>
      </tr>`).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${po.number}</title>
      <style>
        body { font-family: Georgia, serif; color: #1A1A1A; margin: 40px; }
        h1 { font-size: 22px; margin: 0 0 2px; } .muted { color: #6B6B6B; font-size: 13px; }
        table { width: 100%; border-collapse: collapse; margin-top: 18px; font-size: 14px; }
        th { text-align: left; border-bottom: 1px solid #999; padding: 6px 8px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; }
        td { border-bottom: 1px solid #E6E1D4; padding: 7px 8px; }
        .num { text-align: right; font-variant-numeric: tabular-nums; }
        tfoot td { border-bottom: none; font-weight: bold; }
      </style></head><body>
      <h1>Purchase order ${po.number}</h1>
      <p class="muted">Casone Electrical${supplier?.name ? ` → ${supplier.name}` : ""}${po.expectedDate ? ` · needed by ${po.expectedDate}` : ""} · ${new Date(po.createdAt).toLocaleDateString()}</p>
      <table>
        <thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Unit cost</th><th class="num">Total</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td colspan="3" class="num">Order total (ex GST)</td><td class="num">${fmtMoney(ordered)}</td></tr></tfoot>
      </table>
      </body></html>`;
    const w = window.open("", "_blank", "width=800,height=900");
    if (!w) { setToast({ message: "Allow pop-ups to print the order.", type: "error" }); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  }

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

  async function saveLineEdit(itemId: string) {
    if (!po) return;
    const e = edits[itemId];
    if (!e) return;
    const patch: { qtyOrdered?: number; unitCost?: number | null } = {};
    if (e.qty !== undefined) { const n = parseFloat(e.qty); if (Number.isFinite(n) && n > 0) patch.qtyOrdered = n; }
    if (e.cost !== undefined) { const c = parseFloat(e.cost); patch.unitCost = Number.isFinite(c) ? c : null; }
    if (Object.keys(patch).length === 0) return;
    try {
      await updatePOItem(itemId, patch);
      await reload(po.id);
      onChanged();
    } catch (ex) {
      setToast({ message: ex instanceof Error ? ex.message : "Failed to update line", type: "error" });
    }
  }

  async function removeLine(itemId: string) {
    if (!po) return;
    try {
      await removePOItem(itemId);
      await reload(po.id);
      onChanged();
    } catch (ex) {
      setToast({ message: ex instanceof Error ? ex.message : "Failed to remove line", type: "error" });
    }
  }

  async function handleAddLine() {
    if (!po) return;
    const n = parseFloat(addLine.qty);
    const mat = materials.find((m) => m.id === addLine.materialId);
    if (!mat || !Number.isFinite(n) || n <= 0) { setToast({ message: "Pick an item and a quantity.", type: "error" }); return; }
    try {
      await addPOItem(po.id, { materialId: mat.id, description: mat.name, qtyOrdered: n, unitCost: mat.costPrice ?? null }, po.items.length);
      setAddLine({ materialId: "", qty: "" });
      await reload(po.id);
      onChanged();
    } catch (ex) {
      setToast({ message: ex instanceof Error ? ex.message : "Failed to add line", type: "error" });
    }
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

  return (
    <MotionDrawer open={!!poId} onClose={onClose} ariaLabel="Purchase order" sizeClass="sm:w-[560px] lg:w-[680px]">
      {loading || !po ? (
        <div className="flex flex-1 items-center justify-center gap-2 p-8 text-sm text-[#A0A0A0]"><Loader2 className="h-4 w-4 animate-spin" /> Loading order…</div>
      ) : (
        <>
          <div className="flex items-start justify-between border-b border-[#E6E1D4] px-5 py-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold text-[#1A1A1A]">{po.number}</h2>
                <StatusPill tone={PO_TONE[po.status]} className="uppercase tracking-wide">{po.status}</StatusPill>
                <span className="rounded-full bg-[#F0EDE4] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]">{po.kind}</span>
              </div>
              <p className="mt-0.5 truncate text-[13px] text-[#6B6B6B]">
                {supplier?.name ?? "No wholesaler"}
                {supplierEmail && <span className="text-[#A0A0A0]"> · {supplierEmail}</span>}
              </p>
            </div>
            <button type="button" onClick={onClose} className="ml-3 shrink-0 text-[#A0A0A0] hover:text-[#C44545]"><X className="h-4 w-4" /></button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            {/* Receive progress */}
            {receiveProgress && (po.status === "sent" || po.status === "partial" || po.status === "received") && (
              <div className="mb-3">
                <div className="mb-1 flex items-center justify-between text-[11px] text-[#6B6B6B]">
                  <span className="font-semibold uppercase tracking-wider">Received</span>
                  <span className="tabular-nums">{fmtQty(receiveProgress.totalReceived)} / {fmtQty(receiveProgress.totalOrdered)} units</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-[#EFEBE0]">
                  <div className="h-full rounded-full bg-[#2F8F5C] transition-all" style={{ width: `${receiveProgress.pct}%` }} />
                </div>
              </div>
            )}

            {/* Lines */}
            <div className={`mb-4 overflow-hidden ${cardShell}`}>
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-[#E6E1D4] bg-[#FAF8F2]">
                    <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Item</th>
                    <th className="w-24 px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Ordered</th>
                    {!canEdit && <th className="w-20 px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Received</th>}
                    {canReceive && <th className="w-24 px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Receive now</th>}
                    <th className="w-24 px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Unit cost</th>
                    {canEdit && <th className="w-10 px-2 py-2" aria-label="Remove" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EFEBE0]">
                  {po.items.length === 0 && (
                    <tr><td colSpan={canEdit ? 4 : canReceive ? 5 : 4} className="px-3 py-6 text-center text-xs text-[#A0A0A0]">No lines yet — add the items to order below.</td></tr>
                  )}
                  {po.items.map((i) => {
                    const remaining = Math.max(0, i.qtyOrdered - i.qtyReceived);
                    const e = edits[i.id] ?? {};
                    return (
                      <tr key={i.id}>
                        <td className="px-3 py-2 text-[#1A1A1A]">{i.description ?? "(item)"}</td>
                        <td className="px-3 py-2 text-right">
                          {canEdit ? (
                            <input
                              type="number" min={0} step="any" inputMode="decimal"
                              value={e.qty ?? String(i.qtyOrdered)}
                              onChange={(ev) => setEdits((p) => ({ ...p, [i.id]: { ...p[i.id], qty: ev.target.value } }))}
                              onBlur={() => void saveLineEdit(i.id)}
                              className={`${inputField} w-20 text-right tabular-nums`}
                            />
                          ) : (
                            <span className="tabular-nums text-[#3A3A3A]">{fmtQty(i.qtyOrdered)}</span>
                          )}
                        </td>
                        {!canEdit && <td className="px-3 py-2 text-right tabular-nums text-[#6B6B6B]">{fmtQty(i.qtyReceived)}</td>}
                        {canReceive && (
                          <td className="px-3 py-2 text-right">
                            <input
                              type="number" min={0} step="any" inputMode="decimal"
                              value={recv[i.id] ?? ""}
                              placeholder={remaining > 0 ? fmtQty(remaining) : "0"}
                              onChange={(ev) => setRecv((p) => ({ ...p, [i.id]: ev.target.value }))}
                              className={`${inputField} w-20 text-right tabular-nums`}
                            />
                          </td>
                        )}
                        <td className="px-3 py-2 text-right">
                          {canEdit ? (
                            <input
                              type="number" min={0} step="any" inputMode="decimal"
                              value={e.cost ?? (i.unitCost != null ? String(i.unitCost) : "")}
                              placeholder="—"
                              onChange={(ev) => setEdits((p) => ({ ...p, [i.id]: { ...p[i.id], cost: ev.target.value } }))}
                              onBlur={() => void saveLineEdit(i.id)}
                              className={`${inputField} w-20 text-right tabular-nums`}
                            />
                          ) : (
                            <span className="tabular-nums text-[#6B6B6B]">{i.unitCost != null ? fmtMoney(i.unitCost) : "—"}</span>
                          )}
                        </td>
                        {canEdit && (
                          <td className="px-2 py-2 text-right">
                            <button type="button" onClick={() => void removeLine(i.id)} className="rounded p-1 text-[#A0A0A0] hover:text-[#C44545]" aria-label="Remove line"><Trash2 className="h-4 w-4" /></button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-[#E6E1D4] bg-[#FAF8F2]">
                    <td className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]" colSpan={canEdit ? 2 : canReceive ? 4 : 3}>Order total</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-[#1A1A1A]">{fmtMoney(ordered)}</td>
                    {canEdit && <td />}
                  </tr>
                </tfoot>
              </table>
              {/* Add a line (draft only) */}
              {canEdit && (
                <div className="flex items-center gap-2 border-t border-[#EFEBE0] bg-[#FCFBF7] px-3 py-2.5">
                  <select value={addLine.materialId} onChange={(e) => setAddLine((p) => ({ ...p, materialId: e.target.value }))} className={`${inputField} flex-1`}>
                    <option value="">Add an item…</option>
                    {materials.map((m) => <option key={m.id} value={m.id}>{m.name}{m.sku ? ` (${m.sku})` : ""}</option>)}
                  </select>
                  <input type="number" min={0} step="any" inputMode="decimal" value={addLine.qty} onChange={(e) => setAddLine((p) => ({ ...p, qty: e.target.value }))} placeholder="Qty" className={`${inputField} w-24 text-right tabular-nums`} />
                  <button type="button" onClick={() => void handleAddLine()} className="inline-flex items-center gap-1 rounded-md border border-[#E6E1D4] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#2F8F5C] hover:bg-[#FAF8F2]"><Plus className="h-3.5 w-3.5" /> Add</button>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="mb-4 flex flex-wrap gap-2">
              {canSend && <button type="button" onClick={() => void setStatus("sent", "Order marked sent.")} disabled={busy} className={btnPrimary}><Send className="h-4 w-4" /> Mark sent</button>}
              {mailtoHref && (canSend || po.status === "sent") && (
                <a href={mailtoHref} className={btnGhost}><Mail className="h-4 w-4" /> Email order{supplierEmail ? "" : "…"}</a>
              )}
              <button type="button" onClick={printPO} className={btnGhost}><Printer className="h-4 w-4" /> Print</button>
              {canReceive && <button type="button" onClick={() => void handleReceive()} disabled={busy} className={btnPrimary}><PackageCheck className="h-4 w-4" /> Receive</button>}
              {canCancel && <button type="button" onClick={() => void setStatus("cancelled", "Order cancelled.")} disabled={busy} className={btnGhost}>Cancel order</button>}
            </div>
            {canSend && (
              <p className="mb-4 -mt-2 text-[11px] text-[#A0A0A0]">
                “Email order” opens a pre-filled email{supplierEmail ? ` to ${supplierEmail}` : " (no wholesaler email on file — add one in Admin → Suppliers)"}; “Mark sent” locks the lines and moves it to receiving.
              </p>
            )}

            {/* Invoice match */}
            <div className={`overflow-hidden ${cardShell}`}>
              <div className="flex items-center gap-2 border-b border-[#EFEBE0] bg-[#FAF8F2] px-3 py-2">
                <Receipt className="h-4 w-4 text-[#2F8F5C]" />
                <span className="text-sm font-semibold text-[#1A1A1A]">Wholesaler invoice</span>
              </div>
              <div className="px-3 py-3">
                {invoices.length > 0 && (
                  <ul className="mb-3 space-y-1.5">
                    {invoices.map((ivc) => {
                      const matches = ivc.amount != null && Math.abs(ivc.amount - ordered) < 0.01;
                      return (
                        <li key={ivc.id} className="flex items-center gap-2 text-sm">
                          <span className="flex-1 text-[#1A1A1A]">{ivc.number || "(no number)"} {ivc.invoiceDate && <span className="text-[11px] text-[#A0A0A0]">· {ivc.invoiceDate}</span>}</span>
                          <span className="tabular-nums text-[#3A3A3A]">{ivc.amount != null ? fmtMoney(ivc.amount) : "—"}</span>
                          {ivc.amount != null && (
                            matches
                              ? <span className="inline-flex items-center gap-1 rounded-full bg-[#E5F2EA] px-2 py-0.5 text-[10px] font-semibold text-[#246F47]"><Check className="h-3 w-3" /> Matches</span>
                              : <span className="inline-flex items-center gap-1 rounded-full bg-[#F9EFD9] px-2 py-0.5 text-[10px] font-semibold text-[#C8841E]"><AlertTriangle className="h-3 w-3" /> Differs {fmtMoney(ivc.amount - ordered)}</span>
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

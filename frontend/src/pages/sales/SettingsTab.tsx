// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// pages/sales/SettingsTab.tsx â€” commercial settings editor.
//
// Admin-tier gate INSIDE the tab: non-admin managers see a quiet
// "Settings are limited to admins" card. Admin+ get the full form.
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

import { useEffect, useState } from "react";

import { cardShell, btnPrimary } from "../gantt/components/ledger";
import { Toaster } from "../../components/ui/Toaster";
import { SkeletonLine } from "../../components/ui/skeleton";

import { canSeeAdminDashboard } from "../../lib/permissions";
import { useAppStore } from "../../store";
import {
  getCommercialSettings,
  updateCommercialSettings,
  type CommercialSettings,
} from "../../lib/api/commercial";

// â”€â”€â”€ types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type ToastState = { message: string; type: "success" | "error" | "info" } | null;

interface Props {
  onChanged: () => void;
}

// â”€â”€â”€ field helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6B6B6B]">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-[#A0A0A0]">{hint}</p>}
    </div>
  );
}

// â”€â”€â”€ component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function SettingsTab({ onChanged }: Props) {
  const currentProfile = useAppStore((s) => s.currentProfile);
  const currentUser    = useAppStore((s) => s.currentUser);
  const isAdmin        = canSeeAdminDashboard(currentProfile ?? currentUser);

  const [settings, setSettings] = useState<CommercialSettings | null>(null);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [toast, setToast]       = useState<ToastState>(null);

  // Form fields
  const [businessName, setBusinessName]   = useState("");
  const [abn, setAbn]                     = useState("");
  const [invoicePrefix, setInvoicePrefix] = useState("INV-");
  const [quotePrefix, setQuotePrefix]     = useState("QTE-");
  const [gstPercent, setGstPercent]       = useState("10");
  const [paymentDays, setPaymentDays]     = useState("14");
  const [threshold, setThreshold]         = useState("");

  useEffect(() => {
    if (!isAdmin) { setLoading(false); return; }
    getCommercialSettings()
      .then((s) => {
        if (s) {
          setSettings(s);
          setBusinessName(s.businessName ?? "");
          setAbn(s.abn ?? "");
          setInvoicePrefix(s.invoicePrefix);
          setQuotePrefix(s.quotePrefix);
          setGstPercent(String(Math.round(s.gstRate * 100)));
          setPaymentDays(String(s.paymentTermsDays));
          setThreshold(s.variationCustomerApprovalThreshold != null
            ? String(s.variationCustomerApprovalThreshold)
            : "");
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isAdmin]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const gstRate = parseFloat(gstPercent) / 100;
      const updated = await updateCommercialSettings({
        businessName: businessName.trim() || null,
        abn: abn.trim() || null,
        invoicePrefix: invoicePrefix.trim() || "INV-",
        quotePrefix: quotePrefix.trim() || "QTE-",
        gstRate: isNaN(gstRate) ? 0.1 : gstRate,
        paymentTermsDays: parseInt(paymentDays, 10) || 14,
        variationCustomerApprovalThreshold:
          threshold.trim() === "" ? null : parseFloat(threshold),
      });
      setSettings(updated);
      setToast({ message: "Settings saved.", type: "success" });
      onChanged();
    } catch (ex) {
      setToast({ message: ex instanceof Error ? ex.message : "Save failed.", type: "error" });
    } finally {
      setSaving(false);
    }
  }

  // Non-admin gate
  if (!isAdmin) {
    return (
      <div className={`${cardShell} px-6 py-12 text-center`}>
        <p className="text-sm font-medium text-[#3A3A3A]">Settings are limited to admins.</p>
        <p className="mt-1 text-xs text-[#A0A0A0]">
          Ask a Company Admin to adjust commercial settings.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={`${cardShell} space-y-4 p-6`}>
        {[1, 2, 3, 4].map((i) => <SkeletonLine key={i} className="w-64" />)}
      </div>
    );
  }

  const inputCls =
    "w-full rounded-md border border-[#E6E1D4] px-3 py-2 text-sm focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C] disabled:opacity-50";

  return (
    <div className={`${cardShell} overflow-hidden`}>
      <div className="border-b border-[#E6E1D4] px-6 py-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6B6B6B]">
          Commercial Settings
        </p>
        <p className="mt-0.5 text-xs text-[#A0A0A0]">
          These details appear on quotes and invoices.
          {settings == null && " No settings row found â€” defaults will be used."}
        </p>
      </div>

      <form onSubmit={(e) => void handleSave(e)} className="space-y-5 px-6 py-6">

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Business name">
            <input
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              disabled={saving}
              placeholder="Casone Electrical"
              className={inputCls}
            />
          </Field>
          <Field label="ABN">
            <input
              value={abn}
              onChange={(e) => setAbn(e.target.value)}
              disabled={saving}
              placeholder="XX XXX XXX XXX"
              className={inputCls}
            />
          </Field>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Quote number prefix">
            <input
              value={quotePrefix}
              onChange={(e) => setQuotePrefix(e.target.value)}
              disabled={saving}
              placeholder="QTE-"
              className={inputCls}
            />
          </Field>
          <Field label="Invoice number prefix">
            <input
              value={invoicePrefix}
              onChange={(e) => setInvoicePrefix(e.target.value)}
              disabled={saving}
              placeholder="INV-"
              className={inputCls}
            />
          </Field>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="GST rate (%)" hint="Enter a percentage, e.g. 10 for 10% (saved as 0.10).">
            <input
              type="number"
              min="0"
              max="100"
              step="any"
              value={gstPercent}
              onChange={(e) => setGstPercent(e.target.value)}
              disabled={saving}
              className={inputCls}
            />
          </Field>
          <Field label="Payment terms (days)" hint="Days from invoice date until due.">
            <input
              type="number"
              min="0"
              value={paymentDays}
              onChange={(e) => setPaymentDays(e.target.value)}
              disabled={saving}
              className={inputCls}
            />
          </Field>
        </div>

        <Field
          label="Variation customer-approval threshold ($)"
          hint="Leave empty until management sets the customer-approval threshold. When set, variations above this value require customer sign-off before approval."
        >
          <input
            type="number"
            min="0"
            step="any"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            disabled={saving}
            placeholder="e.g. 500 (leave empty to disable)"
            className={inputCls}
          />
        </Field>

        <div className="flex items-center justify-end border-t border-[#EFEBE0] pt-4">
          <button type="submit" disabled={saving} className={btnPrimary}>
            {saving ? "Saving..." : "Save settings"}
          </button>
        </div>
      </form>

      {toast && (
        <Toaster message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}

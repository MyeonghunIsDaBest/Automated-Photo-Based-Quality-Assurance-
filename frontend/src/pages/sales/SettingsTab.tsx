// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// pages/sales/SettingsTab.tsx â€” commercial settings editor.
//
// Admin-tier gate INSIDE the tab: non-admin managers see a quiet
// "Settings are limited to admins" card. Admin+ get the full form.
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

import { useEffect, useState } from "react";

import { cardShell, btnPrimary } from "../gantt/components/ledger";
import { Toaster, type ToastState } from "../../components/ui/Toaster";
import { SkeletonLine } from "../../components/ui/skeleton";

import { canSeeAdminDashboard } from "../../lib/permissions";
import { useAppStore } from "../../store";
import {
  getCommercialSettings,
  updateCommercialSettings,
  type CommercialSettings,
} from "../../lib/api/commercial";
import LabourRatesSettings from "./LabourRatesSettings";
import QuoteScriptsSettings from "./QuoteScriptsSettings";

// â”€â”€â”€ types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
  // Pricing defaults (Step 1 — markup %s + solar rebate unit figures)
  const [materialMarkupPct, setMaterialMarkupPct] = useState("25");
  const [labourMarkupPct, setLabourMarkupPct]     = useState("0");
  const [stcPrice, setStcPrice]                   = useState("0");
  const [veecValue, setVeecValue]                 = useState("0");
  const [labourOverhead, setLabourOverhead]       = useState("0");
  // The pricing floor (mig 94): minimum markup ON COST — sell never below cost × (1 + this).
  const [minMarkupPct, setMinMarkupPct]           = useState("25");
  // Proposal print blocks (mig 97): terms & conditions + one footer line.
  const [quoteTerms, setQuoteTerms]               = useState("");
  const [proposalFooter, setProposalFooter]       = useState("");
  // Print identity (mig 100) — the designer's branded template pulls these.
  const [printTagline, setPrintTagline]           = useState("");
  const [recLicence, setRecLicence]               = useState("");
  const [contactPhone, setContactPhone]           = useState("");
  const [contactPhoneAlt, setContactPhoneAlt]     = useState("");
  const [contactEmail, setContactEmail]           = useState("");
  const [website, setWebsite]                     = useState("");
  const [logoUrl, setLogoUrl]                     = useState("");

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
          setMaterialMarkupPct(String(Math.round((s.defaultMaterialMarkup ?? 0) * 100)));
          setLabourMarkupPct(String(Math.round((s.defaultLabourMarkup ?? 0) * 100)));
          setStcPrice(String(s.stcUnitPrice ?? 0));
          setVeecValue(String(s.veecUnitValue ?? 0));
          setLabourOverhead(String(s.defaultLabourOverhead ?? 0));
          setMinMarkupPct(String(Math.round((s.minMarkupPct ?? 0.25) * 100)));
          setQuoteTerms(s.quoteTerms ?? "");
          setProposalFooter(s.proposalFooter ?? "");
          setPrintTagline(s.printTagline ?? "");
          setRecLicence(s.recLicence ?? "");
          setContactPhone(s.contactPhone ?? "");
          setContactPhoneAlt(s.contactPhoneAlt ?? "");
          setContactEmail(s.contactEmail ?? "");
          setWebsite(s.website ?? "");
          setLogoUrl(s.logoUrl ?? "");
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
        defaultMaterialMarkup: (parseFloat(materialMarkupPct) || 0) / 100,
        defaultLabourMarkup: (parseFloat(labourMarkupPct) || 0) / 100,
        stcUnitPrice: parseFloat(stcPrice) || 0,
        veecUnitValue: parseFloat(veecValue) || 0,
        defaultLabourOverhead: parseFloat(labourOverhead) || 0,
        minMarkupPct: (parseFloat(minMarkupPct) || 0) / 100,
        quoteTerms: quoteTerms.trim() || null,
        proposalFooter: proposalFooter.trim() || null,
        printTagline: printTagline.trim() || null,
        recLicence: recLicence.trim() || null,
        contactPhone: contactPhone.trim() || null,
        contactPhoneAlt: contactPhoneAlt.trim() || null,
        contactEmail: contactEmail.trim() || null,
        website: website.trim() || null,
        logoUrl: logoUrl.trim() || null,
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
    <>
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

        <div className="border-t border-[#EFEBE0] pt-5">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6B6B6B]">
            Pricing &amp; solar rebates
          </p>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Material markup (%)" hint="Default sell margin for a material with no catalogue price (Sim-Pro uses 25).">
              <input
                type="number" min="0" step="any" value={materialMarkupPct}
                onChange={(e) => setMaterialMarkupPct(e.target.value)}
                disabled={saving} className={inputCls}
              />
            </Field>
            <Field label="Labour markup (%)" hint="Added to a labour line's prefill rate. 0 = bill at the loaded cost rate.">
              <input
                type="number" min="0" step="any" value={labourMarkupPct}
                onChange={(e) => setLabourMarkupPct(e.target.value)}
                disabled={saving} className={inputCls}
              />
            </Field>
            <Field label="Minimum markup — the floor (%)" hint="Sell prices never drop below cost + this. Flags below-floor prices and powers a quote's “Revert to minimum pricing”. Buy-price wins stay ours: a cheaper buy never lowers a set sell price.">
              <input
                type="number" min="0" step="any" value={minMarkupPct}
                onChange={(e) => setMinMarkupPct(e.target.value)}
                disabled={saving} className={inputCls}
              />
            </Field>
          </div>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <Field label="STC unit price ($)" hint="Current STC certificate price; prefilled into solar quotes.">
              <input
                type="number" min="0" step="any" value={stcPrice}
                onChange={(e) => setStcPrice(e.target.value)}
                disabled={saving} className={inputCls}
              />
            </Field>
            <Field label="VEEC unit value ($)" hint="Current VEEC certificate value; for reference when entering a quote's VEEC rebate.">
              <input
                type="number" min="0" step="any" value={veecValue}
                onChange={(e) => setVeecValue(e.target.value)}
                disabled={saving} className={inputCls}
              />
            </Field>
            <Field label="Default labour overhead ($/hr)" hint="Pre-fills the New Quote → Optional tab so it isn't entered each time (override per quote with “Use default”).">
              <input
                type="number" min="0" step="any" value={labourOverhead}
                onChange={(e) => setLabourOverhead(e.target.value)}
                disabled={saving} className={inputCls}
              />
            </Field>
          </div>
          {/* Proposal print blocks (mig 97) — set once, printed on every quote */}
          <div className="mt-5 grid gap-5">
            <Field label="Quote terms & conditions" hint="Printed at the end of every quote/proposal. Leave blank to hide the block.">
              <textarea
                rows={5} value={quoteTerms}
                onChange={(e) => setQuoteTerms(e.target.value)}
                placeholder={"e.g. Quote valid for 30 days. 50% deposit on acceptance…"}
                disabled={saving} className={`${inputCls} resize-y`}
              />
            </Field>
            <Field label="Proposal footer line" hint="One line under the proposal — licence number, thank-you, or both. Leave blank to hide.">
              <input
                value={proposalFooter}
                onChange={(e) => setProposalFooter(e.target.value)}
                placeholder="e.g. REC 12345 · Thank you for the opportunity to quote"
                disabled={saving} className={inputCls}
              />
            </Field>
          </div>

          {/* Print identity (mig 100) — everything the designer's branded quote/
              invoice template shows: tagline, licence, contacts, logo. Blank
              fields simply don't print; nothing is hard-coded in the template. */}
          <div className="mt-5">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6B6B6B]">
              Print identity — the branded quote &amp; invoice template
            </p>
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field label="Tagline" hint="The one-line positioning sentence under the logo on every printed document.">
                  <textarea
                    rows={2} value={printTagline}
                    onChange={(e) => setPrintTagline(e.target.value)}
                    disabled={saving} className={`${inputCls} resize-y`}
                  />
                </Field>
              </div>
              <Field label="REC licence" hint="Printed in the document footer beside the ABN.">
                <input value={recLicence} onChange={(e) => setRecLicence(e.target.value)} placeholder="REC 28177" disabled={saving} className={inputCls} />
              </Field>
              <Field label="Sales email" hint="The 'Email us' contact in the footer band.">
                <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} disabled={saving} className={inputCls} />
              </Field>
              <Field label="Phone" hint="The 'Call us today!' number.">
                <input type="tel" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} disabled={saving} className={inputCls} />
              </Field>
              <Field label="Second phone" hint="Optional — printed after the first, pipe-separated.">
                <input type="tel" value={contactPhoneAlt} onChange={(e) => setContactPhoneAlt(e.target.value)} disabled={saving} className={inputCls} />
              </Field>
              <Field label="Website" hint="The 'More information' contact in the footer band.">
                <input value={website} onChange={(e) => setWebsite(e.target.value)} disabled={saving} className={inputCls} />
              </Field>
              <Field label="Logo image URL" hint="Optional override — documents already print the built-in Casone logo. Paste a hosted SVG/PNG here only to use a different one (a re-brand, another business).">
                <input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="Leave blank for the built-in Casone logo" disabled={saving} className={inputCls} />
              </Field>
            </div>
          </div>
        </div>

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

    {/* Labour Rates — same admin gate as the tab; LabourRatesSettings has no
        internal role check because its host (this tab) is already admin-only. */}
    <LabourRatesSettings />

    {/* Quote scripts — same admin gate as the tab (host is already admin-only). */}
    <QuoteScriptsSettings />
    </>
  );
}

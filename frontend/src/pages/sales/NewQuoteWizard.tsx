// ─────────────────────────────────────────────────────────────────────────────
// pages/sales/NewQuoteWizard.tsx — Simpro-style "New Quote" creation wizard.
//
// Three tabs (Main / Optional / Custom Fields) + a header strip (Customer ·
// Quote Total · Status) and Cancel / Finish / Next. Quote types: Service /
// Project. Optional tab includes a discount-voucher control (generate a % code
// and/or apply an existing one). Finish creates + returns to the list; Next
// creates + opens the line-item editor (QuoteEditor). Backed by migration 79.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { X, Loader2, Ticket, Plus } from "lucide-react";

import { btnPrimary, btnGhost, FRAUNCES } from "../gantt/components/ledger";

import {
  createQuote,
  getCommercialSettings,
  type CreateQuoteInput,
} from "../../lib/api/commercial";
import { listPropertiesForCustomer, type Property } from "../../lib/api/properties";
import { listProfilesByRole } from "../../lib/api/profiles";
import { createVoucher, applyVoucherToQuote, getVoucherByCode } from "../../lib/api/vouchers";
import { createCustomer, type Customer } from "../../lib/api/customers";
import type { Profile, SecurityGroup } from "../../types";

// ─── role groups for the people pickers ─────────────────────────────────────
const MANAGER_GROUPS: SecurityGroup[] = ["company_admin", "construction_mgr", "project_manager", "dev"];
const INTERNAL_GROUPS: SecurityGroup[] = ["company_admin", "construction_mgr", "project_manager", "worker", "dev"];

const COST_CENTRES = ["Electrical", "Solar", "Air Conditioning", "Maintenance", "Other"];
const STAGES = ["Quote", "In Progress", "Won", "Lost"];
const PRICING_TIERS = ["Cost Price + 25% (Buy)", "Cost Price + 15%", "Trade Price", "Retail Price"];

// Custom Fields tab — flat bag persisted to quotes.custom_fields (JSONB).
const CUSTOM_FIELDS: { key: string; label: string; type: "text" | "number" | "date" | "select"; options?: string[] }[] = [
  { key: "total_budget",          label: "Total Budget",            type: "number" },
  { key: "mech_budget",           label: "Mech Budget",             type: "number" },
  { key: "mech_elec_budget",      label: "Mech Elec Budget",        type: "number" },
  { key: "job_lead_source",       label: "Job Lead Source",         type: "select", options: ["Not Selected", "Website", "Referral", "Repeat Customer", "Social Media", "Other"] },
  { key: "schedule_preferred_time", label: "Schedule Preferred Time", type: "select", options: ["Not Selected", "Morning", "Afternoon", "Anytime"] },
  { key: "possible_start_date",   label: "Possible Start Date",     type: "date" },
  { key: "est_hours",             label: "EST Hours",               type: "number" },
  { key: "solar_sub_total",       label: "Solar Sub-Total",         type: "number" },
  { key: "solar_gst",             label: "Solar GST",               type: "number" },
  { key: "stcs",                  label: "STCs",                    type: "number" },
  { key: "stc_price",             label: "STC Price",               type: "number" },
  { key: "stcs_price_total",      label: "STCs Price TOTAL",        type: "number" },
  { key: "stcs_price_total_gst",  label: "STCs Price Total GST",    type: "number" },
  { key: "solar_vic_pv_rebate",   label: "Solar Vic PV Rebate",     type: "number" },
];

type TabKey = "main" | "optional" | "custom";

const labelCls = "mb-1 block text-[11px] font-medium uppercase tracking-wider text-[#6B6B6B]";
const inputCls =
  "w-full rounded-md border border-[#E6E1D4] bg-white px-3 py-2 text-sm focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C] disabled:opacity-50";

const num = (s: string): number | null => {
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

const fullName = (p: Profile) => `${p.firstName} ${p.lastName}`.trim() || p.email;

interface Props {
  customers: Customer[];
  onCancel: () => void;
  /** Called after the quote is created. openEditor=true when the user hit Next. */
  onCreated: (quoteId: string, openEditor: boolean) => void;
}

export default function NewQuoteWizard({ customers, onCancel, onCreated }: Props) {
  const [tab, setTab] = useState<TabKey>("main");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // ── Main ──
  const [customerId, setCustomerId] = useState("");
  const [clientName, setClientName] = useState("");      // one-off (when no customer)
  const [siteId, setSiteId] = useState("");
  const [quoteName, setQuoteName] = useState("");
  const [costCentre, setCostCentre] = useState("Electrical");
  const [primaryContact, setPrimaryContact] = useState("");
  const [additionalContact, setAdditionalContact] = useState("");
  const [siteContact, setSiteContact] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [salespersonId, setSalespersonId] = useState("");
  const [projectManagerId, setProjectManagerId] = useState("");
  const [technicianIds, setTechnicianIds] = useState<string[]>([]);
  const [description, setDescription] = useState("");

  // Inline "create customer" (so a quote can be started without leaving the flow).
  const [createdCustomers, setCreatedCustomers] = useState<Customer[]>([]);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCustName, setNewCustName] = useState("");
  const [newCustEmail, setNewCustEmail] = useState("");
  const [newCustPhone, setNewCustPhone] = useState("");
  const [creatingCustomer, setCreatingCustomer] = useState(false);

  // ── Optional ──
  const [leaveDefault, setLeaveDefault] = useState(true);
  const [quoteType, setQuoteType] = useState<"service" | "project">("service");
  const [stage, setStage] = useState("Quote");
  const [pricingTier, setPricingTier] = useState(PRICING_TIERS[0]);
  const [labourOverhead, setLabourOverhead] = useState("");
  const [useDefaultMarkup, setUseDefaultMarkup] = useState(true);
  const [materialMarkup, setMaterialMarkup] = useState("");
  const [discountPct, setDiscountPct] = useState("");
  const [feePct, setFeePct] = useState("");
  const [stcValue, setStcValue] = useState("");
  const [veecValue, setVeecValue] = useState("");
  const [calloutFee, setCalloutFee] = useState("");
  const [costCentreName, setCostCentreName] = useState("");
  // "Use default" toggles (prefill from settings; uncheck to override) — boss ask.
  const [useDefaultOverhead, setUseDefaultOverhead] = useState(true);
  const [useDefaultStc, setUseDefaultStc] = useState(true);
  const [useDefaultVeec, setUseDefaultVeec] = useState(true);

  // ── voucher ──
  const [voucherCode, setVoucherCode] = useState("");
  const [voucherMsg, setVoucherMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [voucherBusy, setVoucherBusy] = useState(false);

  // ── Custom Fields ──
  const [custom, setCustom] = useState<Record<string, string>>({});

  // ── loaded data ──
  const [sites, setSites] = useState<Property[]>([]);
  const [managers, setManagers] = useState<Profile[]>([]);
  const [technicians, setTechnicians] = useState<Profile[]>([]);

  useEffect(() => {
    void getCommercialSettings().then((s) => {
      if (s) {
        setMaterialMarkup(String(Math.round(s.defaultMaterialMarkup * 100)));
        if (s.stcUnitPrice) setStcValue(String(s.stcUnitPrice));
        if (s.veecUnitValue) setVeecValue(String(s.veecUnitValue));
        if (s.defaultLabourOverhead) setLabourOverhead(String(s.defaultLabourOverhead));
      }
    }).catch(() => {});
    void listProfilesByRole(MANAGER_GROUPS).then(setManagers).catch(() => {});
    void listProfilesByRole(INTERNAL_GROUPS).then(setTechnicians).catch(() => {});
  }, []);

  // Cascade: load this customer's sites.
  useEffect(() => {
    setSiteId("");
    if (!customerId) { setSites([]); return; }
    void listPropertiesForCustomer(customerId).then(setSites).catch(() => setSites([]));
    // Prefill primary contact from the chosen customer.
    const c = customers.find((x) => x.id === customerId);
    if (c?.primaryContactName) setPrimaryContact(c.primaryContactName);
  }, [customerId, customers]);

  function toggleTech(id: string) {
    setTechnicianIds((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
  }

  async function handleApplyVoucher() {
    if (!voucherCode.trim()) return;
    setVoucherBusy(true);
    setVoucherMsg(null);
    try {
      const res = await getVoucherByCode(voucherCode);
      if (res.ok && res.voucher) {
        setDiscountPct(String(res.voucher.percent));
        setVoucherMsg({ ok: true, text: `Applied ${res.voucher.percent}% — “${res.voucher.code}”.` });
      } else {
        setVoucherMsg({ ok: false, text: res.reason ?? "Invalid voucher." });
      }
    } catch (ex) {
      setVoucherMsg({ ok: false, text: ex instanceof Error ? ex.message : "Couldn’t check that code." });
    } finally {
      setVoucherBusy(false);
    }
  }

  async function handleGenerateVoucher() {
    setVoucherBusy(true);
    setVoucherMsg(null);
    try {
      const pct = num(discountPct) ?? 5;
      const v = await createVoucher({ percent: pct, label: "Service voucher" });
      setVoucherCode(v.code);
      setDiscountPct(String(v.percent));
      setVoucherMsg({ ok: true, text: `Created ${v.percent}% voucher “${v.code}” — share or apply it.` });
    } catch (ex) {
      setVoucherMsg({ ok: false, text: ex instanceof Error ? ex.message : "Couldn’t generate a voucher." });
    } finally {
      setVoucherBusy(false);
    }
  }

  // Newly-created customers merged with the prop list (so they're selectable immediately).
  const allCustomers = createdCustomers.length > 0 ? [...customers, ...createdCustomers] : customers;

  async function handleCreateCustomer() {
    const name = newCustName.trim();
    if (!name) return;
    setCreatingCustomer(true);
    setErr(null);
    try {
      const c = await createCustomer({
        name,
        primaryContactEmail: newCustEmail.trim() || undefined,
        phone: newCustPhone.trim() || undefined,
      });
      setCreatedCustomers((prev) => [...prev, c]);
      setCustomerId(c.id);
      setShowNewCustomer(false);
      setNewCustName(""); setNewCustEmail(""); setNewCustPhone("");
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Failed to create customer.");
    } finally {
      setCreatingCustomer(false);
    }
  }

  function buildInput(): CreateQuoteInput {
    const title =
      quoteName.trim() ||
      (customerId ? (allCustomers.find((c) => c.id === customerId)?.name ?? "Quote") : clientName.trim()) ||
      "New quote";
    const tags = tagsText.split(",").map((t) => t.trim()).filter(Boolean);
    // Optional-tab extras that don't have dedicated columns ride in custom_fields.
    const customFields: Record<string, unknown> = { ...custom };
    if (stcValue.trim()) customFields.stc_value = stcValue.trim();
    if (veecValue.trim()) customFields.veec_value = veecValue.trim();
    if (calloutFee.trim()) customFields.callout_fee = calloutFee.trim();
    if (costCentreName.trim()) customFields.cost_centre_name = costCentreName.trim();
    if (primaryContact.trim()) customFields.primary_contact = primaryContact.trim();
    if (additionalContact.trim()) customFields.additional_contact = additionalContact.trim();
    if (siteContact.trim()) customFields.site_contact = siteContact.trim();

    return {
      title,
      customerId: customerId || null,
      clientName: !customerId && clientName.trim() ? clientName.trim() : null,
      propertyId: siteId || null,
      description: description.trim() || null,
      costCentre,
      orderNumber: orderNumber.trim() || null,
      dueDate: dueDate || null,
      salespersonId: salespersonId || null,
      projectManagerId: projectManagerId || null,
      technicianIds,
      tags,
      quoteType,
      ...(leaveDefault ? {} : {
        stage,
        pricingTier,
        labourOverhead: num(labourOverhead),
        materialMarkupPct: useDefaultMarkup ? null : num(materialMarkup),
        feePct: num(feePct) ?? 0,
      }),
      discountPct: num(discountPct) ?? 0,
      customFields,
    };
  }

  async function handleSubmit(openEditor: boolean) {
    setErr(null);
    if (!customerId && !clientName.trim() && !quoteName.trim()) {
      setErr("Pick a customer, or enter a one-off client / quote name.");
      setTab("main");
      return;
    }
    setSaving(true);
    try {
      const q = await createQuote(buildInput());
      // Apply the voucher (records the code + bumps its use count) if one is set.
      if (voucherCode.trim()) {
        try { await applyVoucherToQuote(q.id, voucherCode); } catch { /* discount_pct already set; non-fatal */ }
      }
      onCreated(q.id, openEditor);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Failed to create quote.");
      setSaving(false);
    }
  }

  const customerName = customerId ? (allCustomers.find((c) => c.id === customerId)?.name ?? "—") : (clientName.trim() || "—");

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#1A1A1A]/50 p-4">
      <div className="my-4 flex w-full max-w-5xl flex-col overflow-hidden rounded-[14px] border border-[#E6E1D4] bg-white shadow-[0_8px_28px_rgba(20,20,20,0.18)]">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#E6E1D4] px-6 py-4">
          <h2 className="text-lg font-medium text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>
            New {quoteType === "project" ? "Project" : "Service"} Quote
          </h2>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onCancel} disabled={saving} className={btnGhost}>Cancel</button>
            <button type="button" onClick={() => void handleSubmit(false)} disabled={saving} className={btnGhost}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Finish
            </button>
            <button type="button" onClick={() => void handleSubmit(true)} disabled={saving} className={btnPrimary}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Next
            </button>
            <button type="button" onClick={onCancel} disabled={saving} className="ml-1 rounded-md p-2 text-[#A0A0A0] hover:bg-[#F0EDE4] hover:text-[#3A3A3A]">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-[#E6E1D4] px-6">
          {([["main", "Main"], ["optional", "Optional"], ["custom", "Custom Fields"]] as [TabKey, string][]).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={`-mb-px border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                tab === k ? "border-[#1A1A1A] text-[#1A1A1A]" : "border-transparent text-[#6B6B6B] hover:text-[#1A1A1A]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Summary strip */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-b border-[#E6E1D4] bg-[#FAF8F2] px-6 py-2.5 text-sm">
          <span className="text-[#6B6B6B]">Customer: <span className="font-medium text-[#1A1A1A]">{customerName}</span></span>
          <span className="text-[#6B6B6B]">Quote Total: <span className="font-medium text-[#1A1A1A]">$0.00</span></span>
          <span className="flex items-center gap-1.5 text-[#6B6B6B]">
            Status: <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#E0A93B]" /> <span className="font-medium text-[#1A1A1A]">To Be Completed</span>
          </span>
        </div>

        {/* Body */}
        <div className="max-h-[64vh] overflow-y-auto px-6 py-5">
          {err && (
            <p className="mb-4 rounded-md border border-[#F0BFBF] bg-[#FBE5E5] px-3 py-2 text-xs text-[#C44545]">{err}</p>
          )}

          {/* ── MAIN ── */}
          {tab === "main" && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="text-[11px] font-medium uppercase tracking-wider text-[#6B6B6B]">Customer <span className="text-[#C44545]">*</span></label>
                  <button type="button" onClick={() => setShowNewCustomer((v) => !v)} disabled={saving} className="text-[11px] font-medium text-[#2F8F5C] hover:underline">
                    {showNewCustomer ? "Cancel" : "+ New customer"}
                  </button>
                </div>
                {showNewCustomer ? (
                  <div className="space-y-2 rounded-md border border-[#E6E1D4] bg-[#FAF8F2] p-2.5">
                    <input value={newCustName} onChange={(e) => setNewCustName(e.target.value)} disabled={creatingCustomer} placeholder="Customer / company name *" className={inputCls} />
                    <div className="flex gap-2">
                      <input value={newCustEmail} onChange={(e) => setNewCustEmail(e.target.value)} disabled={creatingCustomer} placeholder="Contact email" className={inputCls} />
                      <input value={newCustPhone} onChange={(e) => setNewCustPhone(e.target.value)} disabled={creatingCustomer} placeholder="Phone" className={inputCls} />
                    </div>
                    <button type="button" onClick={() => void handleCreateCustomer()} disabled={creatingCustomer || !newCustName.trim()} className={btnPrimary + " w-full justify-center"}>
                      {creatingCustomer ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Create customer
                    </button>
                  </div>
                ) : (
                  <>
                    <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} disabled={saving} className={inputCls}>
                      <option value="">One-off / no account…</option>
                      {allCustomers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    {!customerId && (
                      <input value={clientName} onChange={(e) => setClientName(e.target.value)} disabled={saving} placeholder="One-off client name" className={`${inputCls} mt-2`} />
                    )}
                  </>
                )}
              </div>
              <div>
                <label className={labelCls}>Site</label>
                <select value={siteId} onChange={(e) => setSiteId(e.target.value)} disabled={saving || !customerId} className={inputCls}>
                  <option value="">{customerId ? "Select site" : "Pick a customer first"}</option>
                  {sites.map((s) => <option key={s.id} value={s.id}>{s.name}{s.suburb ? ` — ${s.suburb}` : ""}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Quote Name <span className="font-normal text-[#A0A0A0]">(optional)</span></label>
                <input value={quoteName} onChange={(e) => setQuoteName(e.target.value)} disabled={saving} placeholder="e.g. 6.6kW Solar Install" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Cost Centre <span className="text-[#C44545]">*</span></label>
                <select value={costCentre} onChange={(e) => setCostCentre(e.target.value)} disabled={saving} className={inputCls}>
                  {COST_CENTRES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Primary Customer Contact</label>
                <input value={primaryContact} onChange={(e) => setPrimaryContact(e.target.value)} disabled={saving} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Additional Contact <span className="font-normal text-[#A0A0A0]">(optional)</span></label>
                <input value={additionalContact} onChange={(e) => setAdditionalContact(e.target.value)} disabled={saving} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Site Contact</label>
                <input value={siteContact} onChange={(e) => setSiteContact(e.target.value)} disabled={saving} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Tags <span className="font-normal text-[#A0A0A0]">(comma-separated)</span></label>
                <input value={tagsText} onChange={(e) => setTagsText(e.target.value)} disabled={saving} placeholder="solar, residential" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Order Number</label>
                <input value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} disabled={saving} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Due Date</label>
                <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} disabled={saving} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Salesperson</label>
                <select value={salespersonId} onChange={(e) => setSalespersonId(e.target.value)} disabled={saving} className={inputCls}>
                  <option value="">Select…</option>
                  {managers.map((p) => <option key={p.id} value={p.id}>{fullName(p)}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Project Manager</label>
                <select value={projectManagerId} onChange={(e) => setProjectManagerId(e.target.value)} disabled={saving} className={inputCls}>
                  <option value="">Select…</option>
                  {managers.map((p) => <option key={p.id} value={p.id}>{fullName(p)}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>Technicians</label>
                <div className="flex flex-wrap gap-1.5">
                  {technicians.length === 0 && <span className="text-xs text-[#A0A0A0]">No staff to assign yet.</span>}
                  {technicians.map((p) => {
                    const on = technicianIds.includes(p.id);
                    return (
                      <button key={p.id} type="button" onClick={() => toggleTech(p.id)} disabled={saving}
                        className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${on ? "border-[#2F8F5C] bg-[#E5F2EA] text-[#246F47]" : "border-[#E6E1D4] bg-white text-[#6B6B6B] hover:border-[#D8D2C4]"}`}>
                        {fullName(p)}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>Description</label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} disabled={saving} rows={4} className={`${inputCls} resize-y`} />
              </div>
            </div>
          )}

          {/* ── OPTIONAL ── */}
          {tab === "optional" && (
            <div className="space-y-5">
              <label className="flex items-center gap-2 text-sm font-medium text-[#1A1A1A]">
                <input type="checkbox" checked={leaveDefault} onChange={(e) => setLeaveDefault(e.target.checked)} disabled={saving} className="h-4 w-4 rounded border-[#E6E1D4] text-[#2F8F5C] focus:ring-[#2F8F5C]" />
                Leave as default rate
              </label>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className={labelCls}>Quote Type</label>
                  <select value={quoteType} onChange={(e) => setQuoteType(e.target.value as "service" | "project")} disabled={saving} className={inputCls}>
                    <option value="service">Service</option>
                    <option value="project">Project</option>
                  </select>
                </div>
                <div className={leaveDefault ? "opacity-50" : ""}>
                  <label className={labelCls}>Stage</label>
                  <select value={stage} onChange={(e) => setStage(e.target.value)} disabled={saving || leaveDefault} className={inputCls}>
                    {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className={leaveDefault ? "opacity-50" : ""}>
                  <label className={labelCls}>Pricing Tier</label>
                  <select value={pricingTier} onChange={(e) => setPricingTier(e.target.value)} disabled={saving || leaveDefault} className={inputCls}>
                    {PRICING_TIERS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className={leaveDefault ? "opacity-50" : ""}>
                  <label className={labelCls}>Labour Overhead ($/hr)</label>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1 text-xs text-[#6B6B6B]">
                      <input type="checkbox" checked={useDefaultOverhead} onChange={(e) => setUseDefaultOverhead(e.target.checked)} disabled={saving || leaveDefault} className="h-3.5 w-3.5" />
                      Use default
                    </label>
                    <input value={labourOverhead} onChange={(e) => setLabourOverhead(e.target.value)} disabled={saving || leaveDefault || useDefaultOverhead} inputMode="decimal" className={inputCls} />
                  </div>
                </div>
                <div className={leaveDefault ? "opacity-50" : ""}>
                  <label className={labelCls}>Default Material Markup (%)</label>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1 text-xs text-[#6B6B6B]">
                      <input type="checkbox" checked={useDefaultMarkup} onChange={(e) => setUseDefaultMarkup(e.target.checked)} disabled={saving || leaveDefault} className="h-3.5 w-3.5" />
                      Use default
                    </label>
                    <input value={materialMarkup} onChange={(e) => setMaterialMarkup(e.target.value)} disabled={saving || leaveDefault || useDefaultMarkup} inputMode="decimal" className={inputCls} />
                  </div>
                </div>
                <div className={leaveDefault ? "opacity-50" : ""}>
                  <label className={labelCls}>Fee (%)</label>
                  <input value={feePct} onChange={(e) => setFeePct(e.target.value)} disabled={saving || leaveDefault} inputMode="decimal" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Discount (%)</label>
                  <input value={discountPct} onChange={(e) => setDiscountPct(e.target.value)} disabled={saving} inputMode="decimal" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>STC Value ($)</label>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1 text-xs text-[#6B6B6B]">
                      <input type="checkbox" checked={useDefaultStc} onChange={(e) => setUseDefaultStc(e.target.checked)} disabled={saving} className="h-3.5 w-3.5" />
                      Use default
                    </label>
                    <input value={stcValue} onChange={(e) => setStcValue(e.target.value)} disabled={saving || useDefaultStc} inputMode="decimal" className={inputCls} />
                  </div>
                </div>
                <div>
                  <label className={labelCls}>VEEC Value ($)</label>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1 text-xs text-[#6B6B6B]">
                      <input type="checkbox" checked={useDefaultVeec} onChange={(e) => setUseDefaultVeec(e.target.checked)} disabled={saving} className="h-3.5 w-3.5" />
                      Use default
                    </label>
                    <input value={veecValue} onChange={(e) => setVeecValue(e.target.value)} disabled={saving || useDefaultVeec} inputMode="decimal" className={inputCls} />
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Call out / Service Fee ($)</label>
                  <input value={calloutFee} onChange={(e) => setCalloutFee(e.target.value)} disabled={saving} inputMode="decimal" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Cost Centre Name <span className="font-normal text-[#A0A0A0]">(optional)</span></label>
                  <input value={costCentreName} onChange={(e) => setCostCentreName(e.target.value)} disabled={saving} className={inputCls} />
                </div>
              </div>

              {/* Discount voucher */}
              <div className="rounded-[12px] border border-[#E6E1D4] bg-[#FAF8F2] p-4">
                <p className="flex items-center gap-2 text-[13px] font-semibold text-[#1A1A1A]">
                  <Ticket className="h-4 w-4 text-[#2F8F5C]" /> Discount voucher
                </p>
                <p className="mt-0.5 text-xs text-[#6B6B6B]">Generate a percentage voucher (e.g. a 5% service voucher) or apply an existing code — it fills the Discount % above.</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <input value={voucherCode} onChange={(e) => setVoucherCode(e.target.value.toUpperCase())} disabled={saving || voucherBusy} placeholder="Voucher code" className={`${inputCls} max-w-[200px]`} />
                  <button type="button" onClick={() => void handleApplyVoucher()} disabled={saving || voucherBusy || !voucherCode.trim()} className={btnGhost}>
                    {voucherBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Apply
                  </button>
                  <button type="button" onClick={() => void handleGenerateVoucher()} disabled={saving || voucherBusy} className={btnGhost}>
                    <Ticket className="h-3.5 w-3.5" /> Generate {num(discountPct) ?? 5}% voucher
                  </button>
                </div>
                {voucherMsg && (
                  <p className={`mt-2 text-xs ${voucherMsg.ok ? "text-[#246F47]" : "text-[#C44545]"}`}>{voucherMsg.text}</p>
                )}
              </div>
            </div>
          )}

          {/* ── CUSTOM FIELDS ── */}
          {tab === "custom" && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {CUSTOM_FIELDS.map((f) => (
                <div key={f.key}>
                  <label className={labelCls}>{f.label}</label>
                  {f.type === "select" ? (
                    <select value={custom[f.key] ?? (f.options?.[0] ?? "")} onChange={(e) => setCustom((p) => ({ ...p, [f.key]: e.target.value }))} disabled={saving} className={inputCls}>
                      {f.options?.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input
                      type={f.type === "date" ? "date" : "text"}
                      inputMode={f.type === "number" ? "decimal" : undefined}
                      value={custom[f.key] ?? ""}
                      onChange={(e) => setCustom((p) => ({ ...p, [f.key]: e.target.value }))}
                      disabled={saving}
                      className={inputCls}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

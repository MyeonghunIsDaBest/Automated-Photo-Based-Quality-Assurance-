// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// pages/sales/QuoteEditor.tsx â€” paper-document editor for a single quote.
//
// Design: white sheet card (rounded-[14px], hairline, shadow) on the cream
// desk. Header: business name + ABN left, quote number + dates right. Customer
// block. Line-items table with inline qty/price editing (blur â†’ save). Three
// ADD row modes: catalogue search / prebuild picker / free line. Totals footer.
// Notes textarea (debounced). Status action bar. Print styles.
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft, Printer, Plus, Trash2, RefreshCw, Search, Package, Clock, LayoutTemplate,
  ChevronUp, ChevronDown, Lock, RotateCcw, Pencil, X, ExternalLink,
} from "lucide-react";
import { Link } from "react-router-dom";

import { FRAUNCES, TONE, cardShell, btnPrimary, btnGhost } from "../gantt/components/ledger";
import { SkeletonLine } from "../../components/ui/skeleton";
import { Toaster, type ToastState } from "../../components/ui/Toaster";
import { lineTotal, quoteCostMargin, quoteFinancials, minSell, isBelowFloor } from "../../lib/commercial/money";
import { fmtMoney } from "../../lib/format";
import { pushRecentMaterial } from "../../lib/recentMaterials";

import {
  getQuote,
  updateQuote,
  setQuoteStatus,
  addQuoteItemFromMaterial,
  addQuoteItemFromPrebuild,
  addQuoteItemFree,
  addQuoteItemLabour,
  updateQuoteItem,
  removeQuoteItem,
  convertQuoteToJob,
  setQuoteDiscount,
  setQuoteRebates,
  deleteQuote,
  getCommercialSettings,
  revertQuoteToMinimum,
  listQuoteSections,
  createQuoteSection,
  renameQuoteSection,
  deleteQuoteSection,
  type Quote,
  type QuoteItem,
  type QuoteSection,
  type CommercialSettings,
} from "../../lib/api/commercial";
import { listCustomers, type Customer } from "../../lib/api/customers";
import { listMaterials, listPrebuilds, type Material, type Prebuild } from "../../lib/api/materials";
import { listLabourRates, formatRole, type LabourRate } from "../../lib/api/labourRates";
import { listTemplates, applyTemplateToQuote, type QuoteTemplate } from "../../lib/api/quoteTemplates";
import { listScripts, type QuoteScript } from "../../lib/api/quoteScripts";
import { listProfilesByRole } from "../../lib/api/profiles";
import QuoteTakeOff from "./QuoteTakeOff";
import QuotePreBuilds from "./QuotePreBuilds";
import QuoteCatalogue from "./QuoteCatalogue";
import QuoteStock from "./QuoteStock";
import QuoteOneOff from "./QuoteOneOff";
import QuoteSchedule from "./QuoteSchedule";
import QuoteCustomerAssets from "./QuoteCustomerAssets";
import { quoteStatusTone } from "./quoteStatus";
import type { Profile, SecurityGroup } from "../../types";

// â”€â”€â”€ types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type AddMode = "catalogue" | "prebuild" | "free" | "labour" | "template" | null;
// Top-level Simpro quote tabs (Details / Parts & Labour / Schedule / Customer Assets).
type QuoteTab = "details" | "parts" | "schedule" | "assets";
const QUOTE_TABS: { key: QuoteTab; label: string }[] = [
  { key: "details", label: "Details" },
  { key: "parts", label: "Parts & Labour" },
  { key: "schedule", label: "Schedule" },
  { key: "assets", label: "Customer Assets" },
];
// Parts & Labour sub-tabs (Simpro). Only "billable" is built; the rest are stubs.
type BillableTab = "billable" | "takeoff" | "prebuilds" | "catalogue" | "stock" | "oneoff";
// Stock sits ahead of Catalogue — Luke's stock-first rule: "what we keep in
// stock" is the everyday picker; the full catalogue is one tab further.
const BILLABLE_TABS: { key: BillableTab; label: string }[] = [
  { key: "billable", label: "Billable" },
  { key: "takeoff", label: "Take Off" },
  { key: "prebuilds", label: "Pre-Builds" },
  { key: "stock", label: "Stock" },
  { key: "catalogue", label: "Catalogue" },
  { key: "oneoff", label: "One Off Items" },
];

// Internal staff eligible to be assigned as technicians on a quote.
const INTERNAL_GROUPS: SecurityGroup[] = ["company_admin", "construction_mgr", "project_manager", "worker", "dev"];
const fullName = (p: Profile) => `${p.firstName} ${p.lastName}`.trim() || p.email;

interface Props {
  quoteId: string;
  onClose: () => void;
  onChanged: () => void;
  /** Manager-only: show the internal cost/margin view + labour cost. The /sales
   *  surface is already manager-gated, so this is true there; default false keeps
   *  cost hidden anywhere the editor is reused without the flag. */
  canSeeCost?: boolean;
}

// â”€â”€â”€ helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function stripSearchChars(s: string): string {
  return s.replace(/[*,()/]/g, "");
}

// â”€â”€â”€ inline-edit cell â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

/** Inline-editable text cell (line-item description); commits on blur if changed. */
function TextCell({
  value,
  onCommit,
  disabled,
}: {
  value: string;
  onCommit: (v: string) => void;
  disabled: boolean;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => { setLocal(value); }, [value]);
  return (
    <input
      type="text"
      value={local}
      disabled={disabled}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => { const t = local.trim(); if (t && t !== value) onCommit(t); }}
      className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-sm text-[#1A1A1A] focus:border-[#E6E1D4] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#2F8F5C] disabled:opacity-60"
    />
  );
}

// â”€â”€â”€ component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function QuoteEditor({ quoteId, onClose, onChanged, canSeeCost = false }: Props) {
  const [quote, setQuote]           = useState<Quote | null>(null);
  const [settings, setSettings]     = useState<CommercialSettings | null>(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [saving, setSaving]         = useState(false);
  const [toast, setToast]           = useState<ToastState>(null);

  const [notes, setNotes]           = useState("");
  const notesDebRef                 = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Dirty flag: set on user edit, cleared on successful save. Prevents loadQuote
  // from clobbering in-flight notes when item ops trigger a refetch.
  const notesDirtyRef               = useRef(false);

  // Customer-facing Description (debounced auto-save, mirror of notes) + the
  // "Insert script" scope-of-works templates.
  const [descDraft, setDescDraft]   = useState("");
  const descDebRef                  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const descDirtyRef                = useRef(false);
  const [scripts, setScripts]       = useState<QuoteScript[]>([]);

  // Technicians assigned to the quote (commit on toggle) + the staff to pick from.
  const [technicianIdsDraft, setTechnicianIdsDraft] = useState<string[]>([]);
  const [staff, setStaff]           = useState<Profile[]>([]);

  const [addMode, setAddMode]       = useState<AddMode>(null);
  const [quoteTab, setQuoteTab] = useState<QuoteTab>("details");
  const [billableTab, setBillableTabState] = useState<BillableTab>(() => {
    try {
      const saved = localStorage.getItem("casone.quote.billableTab");
      return saved && BILLABLE_TABS.some((t) => t.key === saved) ? (saved as BillableTab) : "billable";
    } catch { return "billable"; }
  });
  const setBillableTab = (t: BillableTab) => {
    try { localStorage.setItem("casone.quote.billableTab", t); } catch { /* ok */ }
    setBillableTabState(t);
  };

  // Cost centres (quote sections, mig 90). null active section = "General".
  const [sections, setSections] = useState<QuoteSection[]>([]);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [addingSection, setAddingSection] = useState(false);
  const [newSectionName, setNewSectionName] = useState("");
  const [renamingSectionId, setRenamingSectionId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Catalogue search
  const [catalogueSearch, setCatalogueSearch] = useState("");
  const [catalogueResults, setCatalogueResults] = useState<Material[]>([]);
  const catDebRef                   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [addingMat, setAddingMat]   = useState(false);

  // Prebuild picker
  const [prebuilds, setPrebuilds]   = useState<Prebuild[]>([]);
  const [prebuildId, setPrebuildId] = useState("");
  const [addingPb, setAddingPb]     = useState(false);

  // Free line form
  const [freeDesc, setFreeDesc]     = useState("");
  const [freeQty, setFreeQty]       = useState("1");
  const [freeUnit, setFreeUnit]     = useState("ea");
  const [freePrice, setFreePrice]   = useState("0");
  const [addingFree, setAddingFree] = useState(false);

  // Labour line form
  const [labourRates, setLabourRates] = useState<LabourRate[]>([]);
  const [labourRole, setLabourRole] = useState("");
  const [labourHours, setLabourHours] = useState("1");
  const [addingLabour, setAddingLabour] = useState(false);

  // Job-template picker
  const [templates, setTemplates] = useState<QuoteTemplate[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [applyingTemplate, setApplyingTemplate] = useState(false);

  // Discount + solar-rebate inputs (synced from the quote; commit on blur)
  const [discountStr, setDiscountStr] = useState("0");
  const [stcCountStr, setStcCountStr] = useState("0");
  const [stcPriceStr, setStcPriceStr] = useState("0");
  const [veecStr, setVeecStr] = useState("0");

  // Header / client edit (synced from the quote; commit on blur)
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [titleDraft, setTitleDraft] = useState("");
  const [validUntilDraft, setValidUntilDraft] = useState("");
  const [clientMode, setClientMode] = useState<"customer" | "freetext">("freetext");
  const [customerIdDraft, setCustomerIdDraft] = useState("");
  const [clientNameDraft, setClientNameDraft] = useState("");
  const [clientEmailDraft, setClientEmailDraft] = useState("");

  // Delete-quote confirm
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Reopen-locked-quote confirm (accepted/declined/expired → back to draft)
  const [confirmReopen, setConfirmReopen] = useState(false);

  // "Revert to minimum pricing" (mig 94 floor) — inline two-step confirm.
  const [revertConfirm, setRevertConfirm] = useState(false);
  const [reverting, setReverting] = useState(false);

  async function handleRevertToMinimum() {
    setReverting(true);
    try {
      const res = await revertQuoteToMinimum(quoteId);
      setRevertConfirm(false);
      await loadQuote();
      onChanged();
      setToast({
        message: `${res.repriced} material line${res.repriced === 1 ? "" : "s"} repriced to the floor; ${res.skipped} line${res.skipped === 1 ? "" : "s"} unchanged (labour, uncosted, or already at floor).`,
        type: "success",
      });
    } catch (ex) {
      setToast({ message: ex instanceof Error ? ex.message : "Failed to reprice", type: "error" });
      // Some lines may have repriced before the failure — show the real state.
      await loadQuote();
      onChanged();
    } finally {
      setReverting(false);
    }
  }

  const loadQuote = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [q, s] = await Promise.all([getQuote(quoteId), getCommercialSettings()]);
      if (!q) { setError("Quote not found."); return; }
      setQuote(q);
      setSettings(s);
      // Only sync notes/description from server when not dirty (no unsaved edits)
      if (!notesDirtyRef.current) {
        setNotes(q.notes ?? "");
      }
      if (!descDirtyRef.current) {
        setDescDraft(q.description ?? "");
      }
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : "Failed to load quote");
    } finally {
      setLoading(false);
    }
  }, [quoteId]);

  useEffect(() => { void loadQuote(); }, [loadQuote]);

  // Cost centres — load with the quote; reads swallow errors (pre-mig-90 DBs
  // simply behave as an unsectioned quote).
  const refreshSections = useCallback(async () => {
    const s = await listQuoteSections(quoteId).catch(() => [] as QuoteSection[]);
    setSections(s);
    return s;
  }, [quoteId]);
  useEffect(() => { void refreshSections(); }, [refreshSections]);

  // Guards the Enter-then-blur double fire on the add-section input (both
  // handlers call this; without the ref two identical sections get created).
  const addSectionBusyRef = useRef(false);
  async function handleAddSection() {
    const name = newSectionName.trim();
    if (!name || addSectionBusyRef.current) return;
    addSectionBusyRef.current = true;
    try {
      const created = await createQuoteSection(quoteId, name, sections.length);
      setNewSectionName("");
      setAddingSection(false);
      await refreshSections();
      setActiveSectionId(created.id); // new lines flow into the new cost centre
    } catch (ex) {
      setToast({ message: ex instanceof Error ? ex.message : "Failed to add cost centre", type: "error" });
    } finally {
      addSectionBusyRef.current = false;
    }
  }

  async function handleRenameSection() {
    const name = renameValue.trim();
    if (!renamingSectionId || !name) { setRenamingSectionId(null); return; }
    try {
      await renameQuoteSection(renamingSectionId, name);
      setRenamingSectionId(null);
      await refreshSections();
    } catch (ex) {
      setToast({ message: ex instanceof Error ? ex.message : "Failed to rename cost centre", type: "error" });
    }
  }

  async function handleDeleteSection(id: string) {
    try {
      await deleteQuoteSection(id);
      if (activeSectionId === id) setActiveSectionId(null);
      await refreshSections();
      await loadQuote(); // lines fell back to General
      setToast({ message: "Cost centre removed — its lines moved to General.", type: "success" });
    } catch (ex) {
      setToast({ message: ex instanceof Error ? ex.message : "Failed to remove cost centre", type: "error" });
    }
  }

  // Sync the discount/rebate inputs whenever the quote (re)loads. STC unit price
  // prefills from settings when the quote hasn't set its own yet.
  useEffect(() => {
    if (!quote) return;
    setDiscountStr(String(quote.discountExGst ?? 0));
    setStcCountStr(String(quote.stcCount ?? 0));
    setStcPriceStr(String(quote.stcUnitPriceExGst || settings?.stcUnitPrice || 0));
    setVeecStr(String(quote.veecRebateExGst || 0));
    setTitleDraft(quote.title);
    setValidUntilDraft((quote.validUntil ?? "").slice(0, 10));
    setClientMode(quote.customerId ? "customer" : "freetext");
    setCustomerIdDraft(quote.customerId ?? "");
    setClientNameDraft(quote.clientName ?? "");
    setClientEmailDraft(quote.clientEmail ?? "");
    setTechnicianIdsDraft(quote.technicianIds ?? []);
  }, [quote, settings]);

  // Load customers once (for the client picker)
  useEffect(() => { listCustomers().then(setCustomers).catch(() => {}); }, []);
  // Load scope-of-works scripts + assignable staff once.
  useEffect(() => { listScripts().then(setScripts).catch(() => {}); }, []);
  useEffect(() => { listProfilesByRole(INTERNAL_GROUPS).then(setStaff).catch(() => {}); }, []);

  // Debounced notes save
  useEffect(() => {
    if (!quote || notes === (quote.notes ?? "")) return;
    notesDirtyRef.current = true;
    if (notesDebRef.current) clearTimeout(notesDebRef.current);
    notesDebRef.current = setTimeout(async () => {
      try {
        await updateQuote(quoteId, { notes });
        notesDirtyRef.current = false;
        void loadQuote();
        onChanged();
      } catch { /* silent */ }
    }, 700);
    return () => { if (notesDebRef.current) clearTimeout(notesDebRef.current); };
  }, [notes, quote, quoteId, loadQuote, onChanged]);

  // Debounced description save (customer-facing scope of works)
  useEffect(() => {
    if (!quote || descDraft === (quote.description ?? "")) return;
    descDirtyRef.current = true;
    if (descDebRef.current) clearTimeout(descDebRef.current);
    descDebRef.current = setTimeout(async () => {
      try {
        await updateQuote(quoteId, { description: descDraft || null });
        descDirtyRef.current = false;
        void loadQuote();
        onChanged();
      } catch { /* silent */ }
    }, 700);
    return () => { if (descDebRef.current) clearTimeout(descDebRef.current); };
  }, [descDraft, quote, quoteId, loadQuote, onChanged]);

  // Insert a scope-of-works script into the Description (append; the debounce saves it).
  function insertScript(body: string) {
    setDescDraft((prev) => (prev.trim() ? prev.replace(/\s*$/, "") + "\n\n" + body : body));
  }

  // Toggle a technician on the quote and persist immediately.
  async function toggleTechnician(id: string) {
    if (!quote) return;
    const next = technicianIdsDraft.includes(id)
      ? technicianIdsDraft.filter((t) => t !== id)
      : [...technicianIdsDraft, id];
    setTechnicianIdsDraft(next);
    setSaving(true);
    try {
      await updateQuote(quoteId, { technicianIds: next });
      await loadQuote();
      onChanged();
    } catch (ex) {
      setToast({ message: ex instanceof Error ? ex.message : "Failed to save technicians", type: "error" });
    } finally {
      setSaving(false);
    }
  }

  // Scripts available for this quote's type (type-specific + 'any').
  const availableScripts = quote
    ? scripts.filter((s) => s.quoteType === "any" || s.quoteType === quote.quoteType)
    : [];

  // Debounced catalogue search
  useEffect(() => {
    if (addMode !== "catalogue") return;
    if (catDebRef.current) clearTimeout(catDebRef.current);
    catDebRef.current = setTimeout(async () => {
      const q = stripSearchChars(catalogueSearch.trim());
      try {
        const mats = await listMaterials({ search: q || undefined });
        // Stock-first ordering: what Casone keeps in stock surfaces first.
        const ordered = [...mats].sort((a, b) => Number(b.isStockItem) - Number(a.isStockItem));
        setCatalogueResults(ordered.slice(0, 12));
      } catch { setCatalogueResults([]); }
    }, 300);
    return () => { if (catDebRef.current) clearTimeout(catDebRef.current); };
  }, [catalogueSearch, addMode]);

  // Load prebuilds once when mode opens
  useEffect(() => {
    if (addMode !== "prebuild" || prebuilds.length > 0) return;
    listPrebuilds().then(setPrebuilds).catch(() => {});
  }, [addMode, prebuilds.length]);

  // Load active labour rates once when the labour mode opens
  useEffect(() => {
    if (addMode !== "labour" || labourRates.length > 0) return;
    listLabourRates(false).then(setLabourRates).catch(() => {});
  }, [addMode, labourRates.length]);

  // Load active templates once when the template mode opens
  useEffect(() => {
    if (addMode !== "template" || templates.length > 0) return;
    listTemplates().then(setTemplates).catch(() => {});
  }, [addMode, templates.length]);

  async function handleItemUpdate(
    item: QuoteItem,
    patch: { qty?: number; unitPriceExGst?: number; costPriceExGst?: number | null; description?: string },
  ) {
    setSaving(true);
    try {
      await updateQuoteItem(item.id, quoteId, patch);
      await loadQuote();
      onChanged();
    } catch (ex) {
      setToast({ message: ex instanceof Error ? ex.message : "Save failed", type: "error" });
    } finally {
      setSaving(false);
    }
  }

  // Markup% edit → derive Sell from Cost (Sell = Cost × (1 + markup/100)).
  // Needs a positive cost; otherwise the markup cell is read-only ("—").
  async function handleItemMarkup(item: QuoteItem, markupPct: number) {
    const cost = item.costPriceExGst ?? 0;
    if (cost <= 0) return;
    const sell = Math.round(cost * (1 + markupPct / 100) * 100) / 100;
    await handleItemUpdate(item, { unitPriceExGst: sell });
  }

  async function handleRemoveItem(item: QuoteItem) {
    setSaving(true);
    try {
      await removeQuoteItem(item.id, quoteId);
      await loadQuote();
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
      await addQuoteItemFromMaterial(quoteId, mat.id, 1, activeSectionId);
      pushRecentMaterial(mat.id);
      setAddMode(null);
      setCatalogueSearch("");
      setCatalogueResults([]);
      await loadQuote();
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
      await addQuoteItemFromPrebuild(quoteId, prebuildId, 1, activeSectionId);
      setAddMode(null);
      setPrebuildId("");
      await loadQuote();
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
      await addQuoteItemFree(quoteId, {
        description: freeDesc,
        qty: parseFloat(freeQty) || 1,
        unit: freeUnit,
        unitPriceExGst: parseFloat(freePrice) || 0,
        sectionId: activeSectionId,
      });
      setAddMode(null);
      setFreeDesc(""); setFreeQty("1"); setFreeUnit("ea"); setFreePrice("0");
      await loadQuote();
      onChanged();
    } catch (ex) {
      setToast({ message: ex instanceof Error ? ex.message : "Failed to add line", type: "error" });
    } finally {
      setAddingFree(false);
    }
  }

  async function handleAddLabour(e: React.FormEvent) {
    e.preventDefault();
    if (!labourRole) return;
    setAddingLabour(true);
    try {
      await addQuoteItemLabour(quoteId, labourRole, parseFloat(labourHours) || 0, undefined, activeSectionId);
      setAddMode(null);
      setLabourRole(""); setLabourHours("1");
      await loadQuote();
      onChanged();
    } catch (ex) {
      setToast({ message: ex instanceof Error ? ex.message : "Failed to add labour", type: "error" });
    } finally {
      setAddingLabour(false);
    }
  }

  async function commitDiscount() {
    if (!quote) return;
    const v = Math.max(0, parseFloat(discountStr) || 0);
    if (v === quote.discountExGst) return;
    setSaving(true);
    try {
      await setQuoteDiscount(quoteId, v);
      await loadQuote();
      onChanged();
    } catch (ex) {
      setToast({ message: ex instanceof Error ? ex.message : "Failed to save discount", type: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function commitRebates() {
    if (!quote) return;
    const stcCount = Math.max(0, parseInt(stcCountStr, 10) || 0);
    const stcUnitPriceExGst = Math.max(0, parseFloat(stcPriceStr) || 0);
    const veecRebateExGst = Math.max(0, parseFloat(veecStr) || 0);
    if (
      stcCount === quote.stcCount &&
      stcUnitPriceExGst === quote.stcUnitPriceExGst &&
      veecRebateExGst === quote.veecRebateExGst
    ) return;
    setSaving(true);
    try {
      await setQuoteRebates(quoteId, { stcCount, stcUnitPriceExGst, veecRebateExGst });
      await loadQuote();
      onChanged();
    } catch (ex) {
      setToast({ message: ex instanceof Error ? ex.message : "Failed to save rebates", type: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function commitTitle() {
    if (!quote) return;
    const t = titleDraft.trim();
    if (!t || t === quote.title) return;
    setSaving(true);
    try { await updateQuote(quoteId, { title: t }); await loadQuote(); onChanged(); }
    catch (ex) { setToast({ message: ex instanceof Error ? ex.message : "Failed to save title", type: "error" }); }
    finally { setSaving(false); }
  }

  async function commitValidUntil() {
    if (!quote) return;
    const v = validUntilDraft.trim() || null;
    if ((v ?? "") === (quote.validUntil ?? "").slice(0, 10)) return;
    setSaving(true);
    try { await updateQuote(quoteId, { validUntil: v }); await loadQuote(); onChanged(); }
    catch (ex) { setToast({ message: ex instanceof Error ? ex.message : "Failed to save validity", type: "error" }); }
    finally { setSaving(false); }
  }

  async function commitClient() {
    if (!quote) return;
    setSaving(true);
    try {
      if (clientMode === "customer") {
        await updateQuote(quoteId, { customerId: customerIdDraft || null, clientName: null, clientEmail: null });
      } else {
        await updateQuote(quoteId, {
          customerId: null,
          clientName: clientNameDraft.trim() || null,
          clientEmail: clientEmailDraft.trim() || null,
        });
      }
      await loadQuote();
      onChanged();
    } catch (ex) {
      setToast({ message: ex instanceof Error ? ex.message : "Failed to save client", type: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteQuote(quoteId);
      onChanged();
      onClose();
    } catch (ex) {
      setToast({ message: ex instanceof Error ? ex.message : "Failed to delete quote", type: "error" });
      setDeleting(false);
    }
  }

  // Reorder a line item: recompute 0..n-1 positions for the swapped order.
  async function moveItem(item: QuoteItem, dir: -1 | 1) {
    // Reorder within the item's DISPLAY group (same table + same cost centre) —
    // swapping with a neighbour from another section would silently reshuffle
    // sections. The swap exchanges the two lines' sort_order values.
    const sameTable = (a: QuoteItem) => (item.kind === "labour" ? a.kind === "labour" : a.kind !== "labour");
    const group = items.filter((a) => sameTable(a) && (a.sectionId ?? null) === (item.sectionId ?? null));
    const idx = group.findIndex((i) => i.id === item.id);
    const next = idx + dir;
    if (idx < 0 || next < 0 || next >= group.length) return;
    [group[idx], group[next]] = [group[next], group[idx]];
    setSaving(true);
    try {
      // Renumber the whole display group 0..n-1 — freshly added lines all share
      // sort_order 0, so a bare swap of tied values would jump rows to the ends.
      for (let i = 0; i < group.length; i++) {
        if (group[i].sortOrder !== i) await updateQuoteItem(group[i].id, quoteId, { sortOrder: i });
      }
      await loadQuote();
      onChanged();
    } catch (ex) {
      setToast({ message: ex instanceof Error ? ex.message : "Failed to reorder", type: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function moveItemToSection(item: QuoteItem, sectionId: string | null) {
    if ((item.sectionId ?? null) === sectionId) return;
    setSaving(true);
    try {
      await updateQuoteItem(item.id, quoteId, { sectionId });
      await loadQuote();
      onChanged();
    } catch (ex) {
      setToast({ message: ex instanceof Error ? ex.message : "Failed to move line", type: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function handleApplyTemplate() {
    if (!templateId) return;
    setApplyingTemplate(true);
    try {
      await applyTemplateToQuote(quoteId, templateId, 1, activeSectionId);
      setAddMode(null);
      setTemplateId("");
      await loadQuote();
      onChanged();
    } catch (ex) {
      setToast({ message: ex instanceof Error ? ex.message : "Failed to apply template", type: "error" });
    } finally {
      setApplyingTemplate(false);
    }
  }

  async function handleStatusAction(action: "send" | "accept" | "decline" | "convertJob" | "reopen") {
    if (!quote) return;
    setSaving(true);
    try {
      if (action === "send") {
        await setQuoteStatus(quoteId, "sent");
        setToast({ message: "Quote marked as sent. Send it manually to the client for now.", type: "info" });
      } else if (action === "accept") {
        await setQuoteStatus(quoteId, "accepted");
        setToast({ message: "Quote accepted.", type: "success" });
      } else if (action === "decline") {
        await setQuoteStatus(quoteId, "declined");
        setToast({ message: "Quote declined.", type: "info" });
      } else if (action === "reopen") {
        // Unlock a locked quote so it can be edited again. Reuses setQuoteStatus
        // — there's no backward-transition guard, so this just returns it to draft.
        setConfirmReopen(false);
        await setQuoteStatus(quoteId, "draft");
        setToast({ message: "Quote reopened — it's back to Draft and fully editable.", type: "success" });
      } else if (action === "convertJob") {
        const job = await convertQuoteToJob(quoteId);
        setToast({ message: `Job "${job.title}" created â€” find it on the Jobs board.`, type: "success" });
        onChanged();
      }
      await loadQuote();
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

  if (error || !quote) {
    return (
      <div className={`${cardShell} flex items-center justify-between p-6`}>
        <p className="text-sm text-[#C44545]">{error ?? "Quote not found."}</p>
        <div className="flex gap-2">
          <button type="button" onClick={() => void loadQuote()} className={btnGhost}>
            <RefreshCw className="h-4 w-4" /> Retry
          </button>
          <button type="button" onClick={onClose} className={btnGhost}>
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
        </div>
      </div>
    );
  }

  const items = quote.items ?? [];
  const statusTone = TONE[quoteStatusTone(quote.status)];

  const isLocked = quote.status === "accepted" || quote.status === "declined" || quote.status === "expired";

  const gstRate = settings?.gstRate ?? 0.1;
  // Customer-facing money: discount → GST → total → minus STC/VEEC rebates.
  const fin = quoteFinancials(items, gstRate, {
    discountExGst: quote.discountExGst,
    stcRebate: quote.stcCount * quote.stcUnitPriceExGst,
    veecRebate: quote.veecRebateExGst,
  });

  // Manager-only cost/margin rollup (never rendered when canSeeCost is false,
  // and always print:hidden so it can't leak onto the customer's PDF). Discount
  // folds into the net sell so the margin reflects the real revenue.
  const margin = canSeeCost ? quoteCostMargin(items, gstRate, quote.discountExGst) : null;
  const marginTone =
    margin === null
      ? TONE.ink
      : margin.profit.net < 0
        ? TONE.red
        : margin.profit.marginPct !== null && margin.profit.marginPct < 10
          ? TONE.amber
          : TONE.sage;

  // ── Billable (Parts & Labour) derived data ──
  const partsItems = items.filter((it) => it.kind === "material" || it.kind === "custom");
  const labourItems = items.filter((it) => it.kind === "labour");

  // Cost-centre display blocks: General (null) first when it has lines, then the
  // named sections in their order. With no sections defined, rendering falls back
  // to the flat (ungrouped) tables.
  const grouped = sections.length > 0;
  const sectionBlocks: { id: string | null; name: string }[] = grouped
    ? [
        ...(items.some((it) => (it.sectionId ?? null) === null) ? [{ id: null as string | null, name: "General" }] : []),
        ...sections.map((s) => ({ id: s.id as string | null, name: s.name })),
      ]
    : [{ id: null, name: "General" }];
  const inSection = (list: QuoteItem[], id: string | null) => list.filter((it) => (it.sectionId ?? null) === id);
  const sectionSell = (id: string | null) =>
    inSection(items, id).reduce((s, it) => s + lineTotal({ qty: it.qty, unitPriceExGst: it.unitPriceExGst }), 0);

  /** Rows for one table (Parts or Labour), grouped by cost centre when sections exist. */
  const groupedRows = (list: QuoteItem[]) => {
    if (!grouped) return list.map((item, i) => billableRow(item, i, list.length));
    return sectionBlocks.flatMap((b) => {
      const rows = inSection(list, b.id);
      if (rows.length === 0) return [];
      const subtotal = rows.reduce((s, it) => s + lineTotal({ qty: it.qty, unitPriceExGst: it.unitPriceExGst }), 0);
      return [
        <tr key={`hdr-${b.id ?? "general"}`} className="bg-[#FAF8F2]">
          <td colSpan={billableCols} className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">{b.name}</td>
        </tr>,
        ...rows.map((item, i) => billableRow(item, i, rows.length)),
        <tr key={`sub-${b.id ?? "general"}`}>
          <td colSpan={billableCols} className="px-3 pb-2 pt-0.5 text-right text-[11px] text-[#6B6B6B]">
            {b.name} subtotal: <span className="font-semibold tabular-nums text-[#3A3A3A]">{fmtMoney(subtotal)}</span>
          </td>
        </tr>,
      ];
    });
  };
  const partsSell = partsItems.reduce((s, it) => s + lineTotal({ qty: it.qty, unitPriceExGst: it.unitPriceExGst }), 0);
  const labourSell = labourItems.reduce((s, it) => s + lineTotal({ qty: it.qty, unitPriceExGst: it.unitPriceExGst }), 0);
  const estHours = labourItems.reduce((s, it) => s + it.qty, 0);
  // Empty-state colspan: Description + Sell + Qty + Total (4) + Cost+Markup (mgr) + Actions (unlocked).
  const billableCols = 4 + (canSeeCost ? 2 : 0) + (!isLocked ? 1 : 0);

  // One row for either the Parts or Labour table (same columns). Cost + Markup%
  // are manager-only (canSeeCost) and never printed; Sell/Qty/Total always show.
  const billableRow = (item: QuoteItem, idx: number, count: number) => {
    const lt = lineTotal({ qty: item.qty, unitPriceExGst: item.unitPriceExGst });
    const cost = item.costPriceExGst;
    const markupPct = cost && cost > 0 ? Math.round(((item.unitPriceExGst - cost) / cost) * 1000) / 10 : null;
    // Pricing floor (mig 94): tint the markup cell when a MATERIAL line sells
    // below cost × (1 + floor). Labour is outside the floor — billed-at-rate
    // labour (sell == cost) would otherwise flag on every normal row.
    const belowFloor = canSeeCost && item.kind === "material" && isBelowFloor(item.unitPriceExGst, cost, settings?.minMarkupPct ?? 0.25);
    return (
      <tr key={item.id} className="border-b border-[#EFEBE0] hover:bg-[#FAF8F2]">
        <td className="px-3 py-2.5 text-[#1A1A1A]">
          {isLocked ? (
            <span>{item.description}</span>
          ) : (
            <TextCell value={item.description} disabled={saving} onCommit={(v) => void handleItemUpdate(item, { description: v })} />
          )}
        </td>
        {canSeeCost && (
          <td className="px-3 py-2.5 text-right print:hidden">
            {isLocked ? (
              <span className="tabular-nums">{cost == null ? "—" : fmtMoney(cost)}</span>
            ) : (
              <NumCell value={cost ?? 0} disabled={saving} onCommit={(v) => void handleItemUpdate(item, { costPriceExGst: v })} />
            )}
          </td>
        )}
        {canSeeCost && (
          <td
            className={`px-3 py-2.5 text-right print:hidden ${belowFloor ? "bg-[#F9EFD9]" : ""}`}
            title={belowFloor ? "Below the minimum-markup floor" : undefined}
          >
            {markupPct === null ? (
              <span className="text-[#A0A0A0]">—</span>
            ) : isLocked ? (
              <span className="tabular-nums">{markupPct.toFixed(1)}%</span>
            ) : (
              <NumCell value={markupPct} disabled={saving} onCommit={(v) => void handleItemMarkup(item, v)} />
            )}
          </td>
        )}
        <td className="px-3 py-2.5 text-right">
          {isLocked ? (
            <span className="tabular-nums">{fmtMoney(item.unitPriceExGst)}</span>
          ) : (
            <NumCell value={item.unitPriceExGst} disabled={saving} onCommit={(v) => void handleItemUpdate(item, { unitPriceExGst: v })} />
          )}
        </td>
        <td className="px-3 py-2.5 text-right">
          {isLocked ? (
            <span className="tabular-nums">{item.qty}</span>
          ) : (
            <NumCell value={item.qty} disabled={saving} onCommit={(v) => void handleItemUpdate(item, { qty: v })} />
          )}
        </td>
        <td className="px-3 py-2.5 text-right tabular-nums font-medium text-[#1A1A1A]">{fmtMoney(lt)}</td>
        {!isLocked && (
          <td className="px-3 py-2.5 print:hidden">
            <div className="flex items-center gap-1.5">
              {sections.length > 0 && (
                <select
                  value={item.sectionId ?? ""}
                  disabled={saving}
                  onChange={(e) => void moveItemToSection(item, e.target.value || null)}
                  className="max-w-[90px] rounded border border-transparent bg-transparent py-0.5 text-[10px] text-[#A0A0A0] hover:border-[#E6E1D4] hover:text-[#6B6B6B] focus:outline-none"
                  aria-label="Move to cost centre"
                  title="Move to cost centre"
                >
                  <option value="">General</option>
                  {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              )}
              <div className="flex flex-col">
                <button type="button" disabled={saving || idx === 0} onClick={() => void moveItem(item, -1)} className="text-[#A0A0A0] hover:text-[#6B6B6B] disabled:opacity-30" aria-label="Move up"><ChevronUp className="h-3 w-3" /></button>
                <button type="button" disabled={saving || idx === count - 1} onClick={() => void moveItem(item, 1)} className="text-[#A0A0A0] hover:text-[#6B6B6B] disabled:opacity-30" aria-label="Move down"><ChevronDown className="h-3 w-3" /></button>
              </div>
              <button type="button" disabled={saving} onClick={() => void handleRemoveItem(item)} className="text-[#A0A0A0] hover:text-[#C44545] disabled:opacity-40" aria-label="Remove line"><Trash2 className="h-4 w-4" /></button>
            </div>
          </td>
        )}
      </tr>
    );
  };

  return (
    <>
      {/* â”€â”€ Back bar (screen only) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="mb-4 flex items-center gap-3 print:hidden">
        <button type="button" onClick={onClose} className={btnGhost}>
          <ArrowLeft className="h-4 w-4" />
          All quotes
        </button>
        <span className="text-xs text-[#A0A0A0]">
          {saving
            ? "Saving…"
            : isLocked
              ? "Locked — read only"
              : "Tap any field to edit · changes save automatically"}
        </span>
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
      {/* Locked banner (screen only) — explains the read-only state + offers Reopen */}
      {isLocked && (
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[12px] border border-[#D69A2E] bg-[#F9EFD9] px-4 py-3 print:hidden">
          <Lock className="h-4 w-4 shrink-0 text-[#C8841E]" />
          <p className="text-sm text-[#C8841E]">
            This quote is <strong className="font-semibold capitalize">{quote.status}</strong> and locked for editing.
          </p>
          {confirmReopen ? (
            <span className="ml-auto inline-flex flex-wrap items-center gap-2">
              <span className="text-xs text-[#C8841E]">
                Reopen to Draft so you can edit?{quote.convertedJobId ? " (the job already created won't change)" : ""}
              </span>
              <button
                type="button"
                onClick={() => setConfirmReopen(false)}
                disabled={saving}
                className="rounded-full border border-[#E6E1D4] bg-white px-3 py-1 text-[12px] font-medium text-[#6B6B6B] hover:bg-white/70 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleStatusAction("reopen")}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-full bg-[#1A1A1A] px-3 py-1 text-[12px] font-semibold text-white hover:bg-black disabled:opacity-50"
              >
                {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                Reopen
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmReopen(true)}
              className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-[#C8841E] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#C8841E] transition-colors hover:bg-[#C8841E] hover:text-white"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reopen for editing
            </button>
          )}
        </div>
      )}

      <div
        id="quote-print-sheet"
        className="print-sheet rounded-[14px] border border-[#E6E1D4] bg-white p-8 shadow-[0_2px_12px_rgba(20,20,20,0.07)] sm:p-10"
        style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}
      >

        {/* Document header */}
        <div className="mb-8 flex flex-wrap items-start justify-between gap-6">
          <div>
            <p
              className="text-[22px] font-semibold text-[#1A1A1A]"
              style={{ fontFamily: FRAUNCES }}
            >
              {settings?.businessName ?? "Your Business"}
            </p>
            {settings?.abn && (
              <p className="mt-0.5 text-sm text-[#6B6B6B]">ABN {settings.abn}</p>
            )}
          </div>
          <div className="text-right">
            <p
              className="text-[28px] font-medium text-[#1A1A1A]"
              style={{ fontFamily: FRAUNCES, letterSpacing: "-0.02em" }}
            >
              {quote.number ?? "QTE-??????"}
            </p>
            <p className="text-xs text-[#6B6B6B]">
              Created {new Date(quote.createdAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
            </p>
            {/* Valid until — editable on screen (unlocked); always printed as text */}
            {!isLocked && (
              <div className="mt-1 flex items-center justify-end gap-1.5 text-xs text-[#6B6B6B] print:hidden">
                <span>Valid until</span>
                <input
                  type="date"
                  value={validUntilDraft}
                  onChange={(e) => setValidUntilDraft(e.target.value)}
                  onBlur={() => void commitValidUntil()}
                  className="rounded border border-[#E6E1D4] bg-white px-2 py-0.5 text-xs focus:border-[#2F8F5C] focus:outline-none"
                />
              </div>
            )}
            {quote.validUntil && (
              <p className={`text-xs text-[#6B6B6B] ${isLocked ? "" : "hidden print:block"}`}>
                Valid until {new Date(quote.validUntil).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
              </p>
            )}
            {/* Status stamp */}
            {(quote.status === "accepted" || quote.status === "declined") && (
              <span
                className="mt-2 inline-block rounded px-3 py-1 text-[12px] font-bold uppercase tracking-[0.18em]"
                style={{
                  backgroundColor: statusTone.bg,
                  color: statusTone.fg,
                  boxShadow: `0 0 0 1.5px ${statusTone.dot}`,
                  transform: "rotate(-2deg)",
                }}
              >
                {quote.status === "accepted" ? "ACCEPTED" : "DECLINED"}
              </span>
            )}
          </div>
        </div>

        {/* Title + client block */}
        <div className="mb-8 border-t border-[#EFEBE0] pt-6">
          {/* Title */}
          <div className="mb-4">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#A0A0A0]">Title</p>
            {isLocked ? (
              <p className="text-base font-semibold text-[#1A1A1A]">{quote.title}</p>
            ) : (
              <input
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={() => void commitTitle()}
                placeholder="Quote title"
                className="w-full max-w-md rounded-md border border-[#E6E1D4] bg-white px-3 py-1.5 text-base font-semibold text-[#1A1A1A] focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C] print:border-0 print:px-0"
              />
            )}
          </div>

          {/* Quote meta — read-only summary of the wizard's header fields */}
          <div className="mb-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-[#6B6B6B] print:hidden">
            <span className="flex items-center gap-1">
              Type:
              {isLocked ? (
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${quote.quoteType === "project" ? "bg-[#F9EFD9] text-[#C8841E]" : "border border-[#E6E1D4] bg-white text-[#6B6B6B]"}`}>
                  {quote.quoteType}
                </span>
              ) : (
                <select
                  value={quote.quoteType}
                  disabled={saving}
                  onChange={async (e) => {
                    try {
                      await updateQuote(quoteId, { quoteType: e.target.value as "service" | "project" });
                      await loadQuote();
                      onChanged();
                    } catch (ex) {
                      setToast({ message: ex instanceof Error ? ex.message : "Failed to change type", type: "error" });
                    }
                  }}
                  className="rounded border border-transparent bg-transparent py-0 text-xs font-medium capitalize text-[#3A3A3A] hover:border-[#E6E1D4] focus:outline-none"
                  aria-label="Quote type"
                >
                  <option value="service">Service</option>
                  <option value="project">Project</option>
                </select>
              )}
            </span>
            {quote.costCentre && <span>Cost centre: <span className="font-medium text-[#3A3A3A]">{quote.costCentre}</span></span>}
            {quote.stage && <span>Stage: <span className="font-medium text-[#3A3A3A]">{quote.stage}</span></span>}
            {quote.orderNumber && <span>Order #: <span className="font-medium text-[#3A3A3A]">{quote.orderNumber}</span></span>}
            {quote.dueDate && <span>Due: <span className="font-medium text-[#3A3A3A]">{quote.dueDate}</span></span>}
            {quote.appliedVoucherCode && <span>Voucher: <span className="font-medium text-[#246F47]">{quote.appliedVoucherCode}</span></span>}
          </div>

          {/* Quote for */}
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#A0A0A0]">Quote for</p>
          {isLocked ? (
            <>
              <p className="text-base font-semibold text-[#1A1A1A]">
                {quote.clientName ?? (quote.customerId ? (customers.find((c) => c.id === quote.customerId)?.name ?? "(customer)") : "—")}
              </p>
              {quote.clientEmail && <p className="text-sm text-[#6B6B6B]">{quote.clientEmail}</p>}
            </>
          ) : (
            <>
              <div className="print:hidden">
                <div className="mb-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setClientMode("customer")}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${clientMode === "customer" ? "border-[#1A1A1A] bg-[#1A1A1A] text-white" : "border-[#E6E1D4] bg-white text-[#3A3A3A] hover:bg-[#FAF8F2]"}`}
                  >
                    Existing customer
                  </button>
                  <button
                    type="button"
                    onClick={() => setClientMode("freetext")}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${clientMode === "freetext" ? "border-[#1A1A1A] bg-[#1A1A1A] text-white" : "border-[#E6E1D4] bg-white text-[#3A3A3A] hover:bg-[#FAF8F2]"}`}
                  >
                    One-off client
                  </button>
                </div>
                {clientMode === "customer" ? (
                  <select
                    value={customerIdDraft}
                    onChange={(e) => setCustomerIdDraft(e.target.value)}
                    onBlur={() => void commitClient()}
                    className="w-full max-w-md rounded-md border border-[#E6E1D4] bg-white px-3 py-2 text-sm focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]"
                  >
                    <option value="">No customer (unassigned)</option>
                    {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <input
                      value={clientNameDraft}
                      onChange={(e) => setClientNameDraft(e.target.value)}
                      onBlur={() => void commitClient()}
                      placeholder="Client name or company"
                      className="min-w-[160px] flex-1 rounded-md border border-[#E6E1D4] bg-white px-3 py-2 text-sm focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]"
                    />
                    <input
                      type="email"
                      value={clientEmailDraft}
                      onChange={(e) => setClientEmailDraft(e.target.value)}
                      onBlur={() => void commitClient()}
                      placeholder="Email (optional)"
                      className="min-w-[160px] flex-1 rounded-md border border-[#E6E1D4] bg-white px-3 py-2 text-sm focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]"
                    />
                  </div>
                )}
              </div>
              {/* Print-only client display (the editor above is screen-only) */}
              <div className="hidden print:block">
                <p className="text-base font-semibold text-[#1A1A1A]">
                  {quote.clientName ?? (quote.customerId ? (customers.find((c) => c.id === quote.customerId)?.name ?? "") : "—")}
                </p>
                {quote.clientEmail && <p className="text-sm text-[#6B6B6B]">{quote.clientEmail}</p>}
              </div>
            </>
          )}
        </div>

        {/* ── Top-level tabs (Details / Parts & Labour / Schedule / Customer Assets) ── */}
        <div className="mb-5 flex flex-wrap gap-1 border-b border-[#E6E1D4] print:hidden">
          {QUOTE_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setQuoteTab(t.key)}
              className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
                quoteTab === t.key ? "border-[#2F8F5C] text-[#1A1A1A]" : "border-transparent text-[#6B6B6B] hover:border-[#E6E1D4] hover:text-[#1A1A1A]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Description (customer-facing scope of works) + Insert script */}
        <div className={`mb-6 ${quoteTab === "details" ? "" : "hidden print:block"}`}>
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
            <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#A0A0A0]">Description</label>
            {!isLocked && availableScripts.length > 0 && (
              <select
                value=""
                onChange={(e) => { const s = availableScripts.find((x) => x.id === e.target.value); if (s) insertScript(s.body); }}
                className="rounded-md border border-[#E6E1D4] bg-white px-2 py-1 text-xs text-[#3A3A3A] focus:border-[#2F8F5C] focus:outline-none print:hidden"
              >
                <option value="">Insert script…</option>
                {availableScripts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
          </div>
          {isLocked ? (
            <p className="whitespace-pre-wrap text-sm text-[#3A3A3A]">{quote.description || "—"}</p>
          ) : (
            <>
              <textarea
                value={descDraft}
                onChange={(e) => setDescDraft(e.target.value)}
                rows={6}
                placeholder="Scope of works / description shown to the customer. Use “Insert script” for a template."
                className="w-full rounded-md border border-[#E6E1D4] px-3 py-2 text-sm focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C] print:hidden"
              />
              <div className="hidden whitespace-pre-wrap text-sm text-[#3A3A3A] print:block">{descDraft}</div>
            </>
          )}
        </div>

        {/* Technicians (internal — screen only) */}
        <div className={`mb-6 print:hidden ${quoteTab === "details" ? "" : "hidden"}`}>
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#A0A0A0]">Technicians</label>
          {isLocked ? (
            <p className="text-sm text-[#3A3A3A]">
              {technicianIdsDraft.length === 0
                ? "—"
                : technicianIdsDraft.map((id) => { const p = staff.find((x) => x.id === id); return p ? fullName(p) : null; }).filter(Boolean).join(", ")}
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {staff.length === 0 && <span className="text-xs text-[#A0A0A0]">No staff to assign.</span>}
              {staff.map((p) => {
                const on = technicianIdsDraft.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => void toggleTechnician(p.id)}
                    disabled={saving}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${on ? "border-[#2F8F5C] bg-[#E5F2EA] text-[#246F47]" : "border-[#E6E1D4] bg-white text-[#6B6B6B] hover:border-[#D8D2C4]"}`}
                  >
                    {fullName(p)}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* â”€â”€ Line items table â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        {/* ── Parts & Labour top-tab body (prints regardless of active tab) ── */}
        <div className={quoteTab === "parts" ? "" : "hidden print:block"}>
        {/* Parts & Labour sub-tab strip (screen-only). Only Billable is built. */}
        <div className="mb-3 flex flex-wrap gap-1 border-b border-[#E6E1D4] print:hidden">
          {BILLABLE_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setBillableTab(t.key)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                billableTab === t.key ? "border-[#1A1A1A] text-[#1A1A1A]" : "border-transparent text-[#6B6B6B] hover:text-[#1A1A1A]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Cost centres bar (screen-only) — pick where new lines land; manage sections ── */}
        <div className="mb-4 flex flex-wrap items-center gap-1.5 print:hidden">
          <span className="mr-1 text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Cost centres</span>
          {/* General chip (implicit section) */}
          <button
            type="button"
            onClick={() => setActiveSectionId(null)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              activeSectionId === null ? "bg-[#1A1A1A] text-white shadow-sm" : "border border-[#E6E1D4] bg-white text-[#6B6B6B] hover:border-[#D8D2C4] hover:text-[#1A1A1A]"
            }`}
          >
            General
          </button>
          {sections.map((s) => (
            renamingSectionId === s.id ? (
              <span key={s.id} className="inline-flex items-center gap-1">
                <input
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") void handleRenameSection(); if (e.key === "Escape") setRenamingSectionId(null); }}
                  onBlur={() => void handleRenameSection()}
                  className="w-36 rounded-full border border-[#2F8F5C] bg-white px-3 py-1 text-xs focus:outline-none"
                />
              </span>
            ) : (
              <span key={s.id} className={`inline-flex items-center gap-1 rounded-full py-1 pl-3 pr-1.5 text-xs font-medium transition-colors ${
                activeSectionId === s.id ? "bg-[#1A1A1A] text-white shadow-sm" : "border border-[#E6E1D4] bg-white text-[#6B6B6B] hover:border-[#D8D2C4]"
              }`}>
                <button type="button" onClick={() => setActiveSectionId(s.id)} className="font-medium">{s.name}</button>
                {!isLocked && (
                  <>
                    <button type="button" onClick={() => { setRenamingSectionId(s.id); setRenameValue(s.name); }}
                      className={`rounded p-0.5 ${activeSectionId === s.id ? "text-white/60 hover:text-white" : "text-[#C4C0B4] hover:text-[#1A1A1A]"}`} aria-label={`Rename ${s.name}`}>
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button type="button" onClick={() => void handleDeleteSection(s.id)}
                      className={`rounded p-0.5 ${activeSectionId === s.id ? "text-white/60 hover:text-white" : "text-[#C4C0B4] hover:text-[#C44545]"}`} aria-label={`Remove ${s.name}`}>
                      <X className="h-3 w-3" />
                    </button>
                  </>
                )}
              </span>
            )
          ))}
          {!isLocked && (
            addingSection ? (
              <input
                autoFocus
                value={newSectionName}
                onChange={(e) => setNewSectionName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void handleAddSection(); if (e.key === "Escape") { setAddingSection(false); setNewSectionName(""); } }}
                onBlur={() => (newSectionName.trim() ? void handleAddSection() : setAddingSection(false))}
                placeholder="e.g. Switchboards"
                className="w-40 rounded-full border border-[#2F8F5C] bg-white px-3 py-1 text-xs focus:outline-none"
              />
            ) : (
              <button type="button" onClick={() => setAddingSection(true)}
                className="inline-flex items-center gap-1 rounded-full border border-dashed border-[#D8D2C4] bg-white px-3 py-1 text-xs font-medium text-[#2F8F5C] hover:border-[#2F8F5C]">
                <Plus className="h-3 w-3" /> Cost centre
              </button>
            )
          )}
          {sections.length > 0 && (
            <span className="ml-1 text-[11px] text-[#A0A0A0]">New lines go into <span className="font-semibold text-[#6B6B6B]">{sections.find((s) => s.id === activeSectionId)?.name ?? "General"}</span></span>
          )}
          {sections.length === 0 && quote?.quoteType === "project" && !isLocked && (
            <span className="ml-1 text-[11px] text-[#C8841E]">Tip: project quotes present best split into cost centres — add one (e.g. Switchboards, Lighting).</span>
          )}
        </div>

        {/* Take Off — a browsable, searchable library of pre-built take-off bundles. */}
        {billableTab === "takeoff" && (
          <QuoteTakeOff
            quoteId={quoteId}
            activeSectionId={activeSectionId}
            canSeeCost={!!canSeeCost}
            isLocked={isLocked}
            onAdded={() => { void loadQuote(); onChanged(); }}
            onToast={(message, type) => setToast({ message, type })}
          />
        )}

        {/* Pre-Builds — Group → Subgroup → parts browse-and-add over the prebuild library. */}
        {billableTab === "prebuilds" && (
          <QuotePreBuilds
            quoteId={quoteId}
            activeSectionId={activeSectionId}
            canSeeCost={!!canSeeCost}
            isLocked={isLocked}
            onAdded={() => { void loadQuote(); onChanged(); }}
            onToast={(message, type) => setToast({ message, type })}
          />
        )}

        {/* Catalogue — Group → Subgroup → materials browse-and-add over the catalogue. */}
        {billableTab === "catalogue" && (
          <QuoteCatalogue
            quoteId={quoteId}
            activeSectionId={activeSectionId}
            canSeeCost={!!canSeeCost}
            isLocked={isLocked}
            onAdded={() => { void loadQuote(); onChanged(); }}
            onToast={(message, type) => setToast({ message, type })}
          />
        )}

        {/* Stock — stocked materials with on-hand, browse-and-add (Group → Subgroup). */}
        {billableTab === "stock" && (
          <QuoteStock
            quoteId={quoteId}
            activeSectionId={activeSectionId}
            canSeeCost={!!canSeeCost}
            isLocked={isLocked}
            onAdded={() => { void loadQuote(); onChanged(); }}
            onToast={(message, type) => setToast({ message, type })}
          />
        )}

        {/* One Off Items — ad-hoc custom line, optionally saved to the catalogue. */}
        {billableTab === "oneoff" && (
          <QuoteOneOff
            quoteId={quoteId}
            activeSectionId={activeSectionId}
            canSeeCost={!!canSeeCost}
            isLocked={isLocked}
            onAdded={() => { void loadQuote(); onChanged(); }}
            onToast={(message, type) => setToast({ message, type })}
          />
        )}

        {/* Parts + Labour tables. Always rendered for print; hidden on screen when another sub-tab is active. */}
        <div className={billableTab === "billable" ? "" : "hidden print:block"}>
          {/* Parts */}
          <div className="mb-6 overflow-x-auto">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6B6B6B]">Parts</p>
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-[#E6E1D4] bg-[#FAF8F2]">
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Description</th>
                  {canSeeCost && <th className="w-24 px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B] print:hidden">Cost</th>}
                  {canSeeCost && <th className="w-20 px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B] print:hidden">Markup</th>}
                  <th className="w-28 px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Sell</th>
                  <th className="w-20 px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Qty</th>
                  <th className="w-28 px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Total</th>
                  {!isLocked && <th className="w-10 px-3 py-2 print:hidden" aria-label="Actions" />}
                </tr>
              </thead>
              <tbody>
                {partsItems.length === 0 && (
                  <tr>
                    <td colSpan={billableCols} className="px-3 py-6 text-center text-xs text-[#A0A0A0]">
                      No parts yet. Use &ldquo;Add a part&rdquo; below.
                    </td>
                  </tr>
                )}
                {groupedRows(partsItems)}
              </tbody>
            </table>
          </div>

          {/* Labour */}
          <div className="mb-6 overflow-x-auto">
            <div className="mb-1 flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6B6B6B]">Labour</p>
              <p className="text-[11px] text-[#A0A0A0] print:hidden">
                Estimated time: <span className="font-semibold tabular-nums text-[#3A3A3A]">{estHours.toFixed(2)} hrs</span>
              </p>
            </div>
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-[#E6E1D4] bg-[#FAF8F2]">
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Labour type</th>
                  {canSeeCost && <th className="w-24 px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B] print:hidden">Cost rate</th>}
                  {canSeeCost && <th className="w-20 px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B] print:hidden">Markup</th>}
                  <th className="w-28 px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Sell</th>
                  <th className="w-20 px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Time</th>
                  <th className="w-28 px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Total</th>
                  {!isLocked && <th className="w-10 px-3 py-2 print:hidden" aria-label="Actions" />}
                </tr>
              </thead>
              <tbody>
                {labourItems.length === 0 && (
                  <tr>
                    <td colSpan={billableCols} className="px-3 py-6 text-center text-xs text-[#A0A0A0]">
                      No labour yet. Add it from the labour picker below.
                    </td>
                  </tr>
                )}
                {groupedRows(labourItems)}
              </tbody>
            </table>
          </div>
        </div>

        {/* â”€â”€ Add row controls â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        {!isLocked && billableTab === "billable" && (
          <div className="mb-8 print:hidden">
            {addMode === null && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setAddMode("catalogue")}
                  className={btnGhost}
                >
                  <Search className="h-4 w-4" />
                  From catalogue
                </button>
                <button
                  type="button"
                  onClick={() => setAddMode("prebuild")}
                  className={btnGhost}
                >
                  <Package className="h-4 w-4" />
                  From prebuild
                </button>
                <button
                  type="button"
                  onClick={() => setAddMode("free")}
                  className={btnGhost}
                >
                  <Plus className="h-4 w-4" />
                  Custom line
                </button>
                <button
                  type="button"
                  onClick={() => setAddMode("labour")}
                  className={btnGhost}
                >
                  <Clock className="h-4 w-4" />
                  Labour
                </button>
                <button
                  type="button"
                  onClick={() => setAddMode("template")}
                  className={btnGhost}
                >
                  <LayoutTemplate className="h-4 w-4" />
                  Apply template
                </button>
              </div>
            )}

            {/* Catalogue search */}
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
                          <span className="font-medium text-[#1A1A1A]">
                            {mat.name}
                            {!mat.isStockItem && (
                              <span className="ml-2 rounded-full border border-[#E6E1D4] bg-[#FAF8F2] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#A0A0A0]">one-off</span>
                            )}
                          </span>
                          <span className="ml-2 flex-shrink-0 tabular-nums text-[#6B6B6B]">
                            {mat.sellPrice != null ? fmtMoney(mat.sellPrice) : "â€”"} / {mat.unit}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {catalogueResults.length === 0 && (
                  <p className="mt-2 text-xs text-[#A0A0A0]">
                    {catalogueSearch.trim()
                      ? "No materials match — add it in Catalogue → Materials, or use Custom line for a one-off."
                      : "No materials in the catalogue yet — add them in Catalogue → Materials (or Import), or use Custom line for a one-off."}
                  </p>
                )}
              </div>
            )}

            {/* Prebuild picker */}
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
                  <button
                    type="button"
                    onClick={() => void handleAddPrebuild()}
                    disabled={!prebuildId || addingPb}
                    className={btnPrimary}
                  >
                    {addingPb ? "Adding..." : "Add bundle"}
                  </button>
                </div>
                {prebuilds.length === 0 && (
                  <p className="mt-2 text-[11px] text-[#A0A0A0]">No prebuilds yet — create them in Catalogue → Prebuilds.</p>
                )}
              </div>
            )}

            {/* Custom (free-text) line form */}
            {addMode === "free" && (
              <form
                onSubmit={(e) => void handleAddFree(e)}
                className="rounded-[10px] border border-[#E6E1D4] bg-[#FAF8F2] p-4"
              >
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#6B6B6B]">Custom line</p>
                  <button type="button" onClick={() => setAddMode(null)} className="text-xs text-[#A0A0A0] hover:text-[#C44545]">Cancel</button>
                </div>
                <p className="mb-3 text-[11px] text-[#A0A0A0]">A one-off item you type in yourself — e.g. a callout fee or a part that isn&rsquo;t in the catalogue.</p>
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
                    type="number"
                    min="0"
                    step="any"
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
                    type="number"
                    min="0"
                    step="any"
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

            {/* Labour line form */}
            {addMode === "labour" && (
              <div className="rounded-[10px] border border-[#E6E1D4] bg-[#FAF8F2] p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#6B6B6B]">Labour line</p>
                  <button type="button" onClick={() => { setAddMode(null); setLabourRole(""); setLabourHours("1"); }} className="text-xs text-[#A0A0A0] hover:text-[#C44545]">Cancel</button>
                </div>
                <form onSubmit={(e) => void handleAddLabour(e)} className="flex flex-wrap items-center gap-2">
                  <select
                    autoFocus
                    required
                    value={labourRole}
                    onChange={(e) => setLabourRole(e.target.value)}
                    className="flex-1 min-w-[180px] rounded-md border border-[#E6E1D4] bg-white px-3 py-2 text-sm focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]"
                  >
                    <option value="">Select a role...</option>
                    {labourRates.map((r) => (
                      <option key={r.id} value={r.role}>
                        {formatRole(r.role)}{r.loadedRate != null ? ` - ${fmtMoney(r.loadedRate)}/hr` : " - no rate set"}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={labourHours}
                    onChange={(e) => setLabourHours(e.target.value)}
                    placeholder="Hours"
                    className="w-24 rounded-md border border-[#E6E1D4] bg-white px-3 py-2 text-sm focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]"
                  />
                  <button type="submit" disabled={!labourRole || addingLabour} className={btnPrimary}>
                    {addingLabour ? "Adding..." : "Add labour"}
                  </button>
                </form>
                {labourRates.length === 0 && (
                  <p className="mt-2 text-[11px] text-[#A0A0A0]">No labour roles configured yet — add rates in Sales settings.</p>
                )}
                {labourRole !== "" && labourRates.find((r) => r.role === labourRole)?.loadedRate == null && (
                  <p className="mt-2 text-[11px] text-[#C8841E]">
                    This role has no rate set — the line will be added uncosted (price 0); mark it up on the quote.
                  </p>
                )}
                <p className="mt-2 text-[11px] text-[#A0A0A0]">
                  The line prefills at the role&rsquo;s rate; edit the unit price to mark it up.
                </p>
              </div>
            )}

            {/* Apply-template picker */}
            {addMode === "template" && (
              <div className="rounded-[10px] border border-[#E6E1D4] bg-[#FAF8F2] p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#6B6B6B]">Apply a job template</p>
                  <button type="button" onClick={() => { setAddMode(null); setTemplateId(""); }} className="text-xs text-[#A0A0A0] hover:text-[#C44545]">Cancel</button>
                </div>
                <div className="flex gap-2">
                  <select
                    autoFocus
                    value={templateId}
                    onChange={(e) => setTemplateId(e.target.value)}
                    className="flex-1 rounded-md border border-[#E6E1D4] bg-white px-3 py-2 text-sm focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]"
                  >
                    <option value="">Select a template...</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>{t.category ? `${t.category} · ${t.name}` : t.name}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => void handleApplyTemplate()}
                    disabled={!templateId || applyingTemplate}
                    className={btnPrimary}
                  >
                    {applyingTemplate ? "Applying..." : "Apply"}
                  </button>
                </div>
                {templates.length === 0 && (
                  <p className="mt-2 text-[11px] text-[#A0A0A0]">No templates yet — create them in Catalogue → Templates.</p>
                )}
                <p className="mt-2 text-[11px] text-[#A0A0A0]">Drops all the template&rsquo;s materials, bundles, and labour onto this quote.</p>
              </div>
            )}
          </div>
        )}

        {/* â”€â”€ Totals footer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        {/* ── Discount & solar rebates (manager-only, screen-only) ────────── */}
        {canSeeCost && !isLocked && (
          <div className="mb-6 rounded-[10px] border border-[#E6E1D4] bg-[#FAF8F2] p-4 print:hidden">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-[#6B6B6B]">Discount &amp; solar rebates</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <label className="flex flex-col gap-1 text-[11px] font-medium text-[#6B6B6B]">
                Discount (ex GST)
                <input
                  type="number" min="0" step="any" value={discountStr}
                  onChange={(e) => setDiscountStr(e.target.value)}
                  onBlur={() => void commitDiscount()}
                  className="rounded-md border border-[#E6E1D4] bg-white px-2 py-1.5 text-sm tabular-nums text-[#1A1A1A] focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]"
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-medium text-[#6B6B6B]">
                STCs (count)
                <input
                  type="number" min="0" step="1" value={stcCountStr}
                  onChange={(e) => setStcCountStr(e.target.value)}
                  onBlur={() => void commitRebates()}
                  className="rounded-md border border-[#E6E1D4] bg-white px-2 py-1.5 text-sm tabular-nums text-[#1A1A1A] focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]"
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-medium text-[#6B6B6B]">
                STC price (ea)
                <input
                  type="number" min="0" step="any" value={stcPriceStr}
                  onChange={(e) => setStcPriceStr(e.target.value)}
                  onBlur={() => void commitRebates()}
                  className="rounded-md border border-[#E6E1D4] bg-white px-2 py-1.5 text-sm tabular-nums text-[#1A1A1A] focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]"
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-medium text-[#6B6B6B]">
                VEEC rebate
                <input
                  type="number" min="0" step="any" value={veecStr}
                  onChange={(e) => setVeecStr(e.target.value)}
                  onBlur={() => void commitRebates()}
                  className="rounded-md border border-[#E6E1D4] bg-white px-2 py-1.5 text-sm tabular-nums text-[#1A1A1A] focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]"
                />
              </label>
            </div>
            <p className="mt-2 text-[11px] text-[#A0A0A0]">
              Rebates reduce what the customer pays; they don&rsquo;t change your margin (you claim the certificate value).
            </p>
          </div>
        )}

        {/* ── Cost centre summary (customer-facing; prints) ───────────────── */}
        {grouped && (
          <div className="mb-4 flex justify-end">
            <div className="w-full max-w-xs space-y-1 border-b border-[#EFEBE0] pb-3">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#A0A0A0]">Cost centre summary</p>
              {sectionBlocks
                .filter((b) => inSection(items, b.id).length > 0)
                .map((b) => (
                  <div key={b.id ?? "general"} className="flex items-center justify-between text-sm text-[#6B6B6B]">
                    <span>{b.name}</span>
                    <span className="tabular-nums">{fmtMoney(sectionSell(b.id))}</span>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* ── Totals footer ───────────────────────────────────────────────── */}
        <div className="mb-8 flex justify-end">
          <div className="w-full max-w-xs space-y-1">
            <div className="flex items-center justify-between text-sm text-[#6B6B6B]">
              <span>Subtotal (ex GST)</span>
              <span className="tabular-nums">{fmtMoney(fin.subtotalExGst)}</span>
            </div>
            {fin.discountExGst > 0 && (
              <div className="flex items-center justify-between text-sm text-[#6B6B6B]">
                <span>Discount</span>
                <span className="tabular-nums">-{fmtMoney(fin.discountExGst)}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-sm text-[#6B6B6B]">
              <span>GST ({(gstRate * 100).toFixed(0)}%)</span>
              <span className="tabular-nums">{fmtMoney(fin.gstAmount)}</span>
            </div>
            <div className="flex items-center justify-between border-t border-[#E6E1D4] pt-2 text-base font-semibold text-[#1A1A1A]">
              <span>Total (inc GST)</span>
              <span className="tabular-nums text-[18px]" style={{ fontFamily: FRAUNCES }}>
                {fmtMoney(fin.totalIncGst)}
              </span>
            </div>
            {fin.rebatesTotal > 0 && (
              <>
                {quote.stcCount > 0 && quote.stcUnitPriceExGst > 0 && (
                  <div className="flex items-center justify-between pt-1 text-sm text-[#6B6B6B]">
                    <span>STC rebate ({quote.stcCount}&times;)</span>
                    <span className="tabular-nums">-{fmtMoney(quote.stcCount * quote.stcUnitPriceExGst)}</span>
                  </div>
                )}
                {quote.veecRebateExGst > 0 && (
                  <div className="flex items-center justify-between text-sm text-[#6B6B6B]">
                    <span>VEEC rebate</span>
                    <span className="tabular-nums">-{fmtMoney(quote.veecRebateExGst)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between border-t border-[#E6E1D4] pt-2 text-base font-semibold text-[#2F8F5C]">
                  <span>Customer pays</span>
                  <span className="tabular-nums text-[18px]" style={{ fontFamily: FRAUNCES }}>
                    {fmtMoney(fin.customerPays)}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* â”€â”€ Notes textarea â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        {/* ── Terms & conditions (settings-backed; customer-facing, prints) ── */}
        {settings?.quoteTerms && (
          <div className="mb-8 border-t border-[#EFEBE0] pt-5" style={{ breakInside: "avoid" }}>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#A0A0A0]">Terms &amp; Conditions</p>
            <p className="whitespace-pre-wrap text-xs leading-relaxed text-[#6B6B6B]">{settings.quoteTerms}</p>
          </div>
        )}

        {/* ── Acceptance / signature (prints while the quote is still open) ── */}
        {quote.status !== "accepted" && quote.status !== "declined" && (
          <div className="mb-8 hidden border-t border-[#EFEBE0] pt-5 print:block" style={{ breakInside: "avoid" }}>
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#A0A0A0]">Acceptance</p>
            <p className="mb-6 text-xs text-[#6B6B6B]">
              To accept this quote, sign below and return a copy to {settings?.businessName ?? "us"}.
            </p>
            <div className="grid grid-cols-2 gap-10">
              <div>
                <div className="h-10 border-b border-[#3A3A3A]" />
                <p className="mt-1 text-[11px] text-[#6B6B6B]">Name &amp; signature</p>
              </div>
              <div>
                <div className="h-10 border-b border-[#3A3A3A]" />
                <p className="mt-1 text-[11px] text-[#6B6B6B]">Date</p>
              </div>
            </div>
          </div>
        )}

        {/* ── Proposal footer line (settings-backed; prints) ────────────────── */}
        {settings?.proposalFooter && (
          <p className="hidden text-center text-[11px] text-[#A0A0A0] print:block">{settings.proposalFooter}</p>
        )}

        {/* ── Manager-only cost / margin (screen only; never printed) ───────── */}
        {canSeeCost && margin && (
          <div className="mb-8 print:hidden">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#A0A0A0]">
              Billable summary — internal, not shown to customer
            </p>
            <div className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-[1fr_1fr_auto]">
              {/* Costs */}
              <div className="space-y-1 text-[13px]">
                <div className="flex items-center justify-between text-[#6B6B6B]"><span>Material cost</span><span className="tabular-nums">{fmtMoney(margin.materialsCost + margin.otherCost)}</span></div>
                <div className="flex items-center justify-between text-[#6B6B6B]"><span>Labour cost</span><span className="tabular-nums">{fmtMoney(margin.labourCost)}</span></div>
                <div className="flex items-center justify-between text-[#A0A0A0]"><span>Plant &amp; equipment cost</span><span className="tabular-nums">{fmtMoney(0)}</span></div>
              </div>
              {/* Markups (markup $ = sell − cost) */}
              <div className="space-y-1 text-[13px]">
                <div className="flex items-center justify-between text-[#6B6B6B]"><span>Material markup</span><span className="tabular-nums">{fmtMoney(partsSell - (margin.materialsCost + margin.otherCost))}</span></div>
                <div className="flex items-center justify-between text-[#6B6B6B]"><span>Labour markup</span><span className="tabular-nums">{fmtMoney(labourSell - margin.labourCost)}</span></div>
                <div className="flex items-center justify-between text-[#A0A0A0]"><span>Plant &amp; equipment markup</span><span className="tabular-nums">{fmtMoney(0)}</span></div>
              </div>
              {/* Sub-total / GST / Total + nett margin */}
              <div className="min-w-[200px] space-y-1 rounded-[10px] border border-dashed border-[#D8D2C4] bg-[#FAF8F2] p-3 text-[13px]">
                <div className="flex items-center justify-between text-[#6B6B6B]"><span>Sub-total (ex GST)</span><span className="tabular-nums">{fmtMoney(fin.netSubtotalExGst)}</span></div>
                <div className="flex items-center justify-between text-[#6B6B6B]"><span>GST</span><span className="tabular-nums">{fmtMoney(fin.gstAmount)}</span></div>
                <div className="flex items-center justify-between border-t border-[#E6E1D4] pt-1.5 font-semibold text-[#1A1A1A]"><span>Total</span><span className="tabular-nums">{fmtMoney(fin.totalIncGst)}</span></div>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[#6B6B6B]">Nett margin</span>
                  <span
                    className="rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums"
                    style={{ backgroundColor: marginTone.bg, color: marginTone.fg }}
                  >
                    {margin.profit.marginPct === null ? "—" : `${margin.profit.marginPct.toFixed(1)}%`}
                  </span>
                </div>
              </div>
            </div>
            {margin.uncostedLabourLines > 0 && (
              <p className="mt-2 text-[11px] text-[#C8841E]">
                {margin.uncostedLabourLines} labour line{margin.uncostedLabourLines > 1 ? "s" : ""} uncosted — markup may be overstated.
              </p>
            )}
            {/* Revert to minimum pricing — Luke's win-the-job lever. Floor = cost × (1 + min markup). */}
            {!isLocked && (() => {
              const floorPct = settings?.minMarkupPct ?? 0.25;
              // Materials only — labour is outside the floor (see revertQuoteToMinimum).
              const repriceable = items.filter((i) => i.kind === "material" && minSell(i.costPriceExGst, floorPct) !== null).length;
              const untouched = items.length - repriceable;
              if (items.length === 0) return null;
              return (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {!revertConfirm ? (
                    <>
                      <button type="button" onClick={() => setRevertConfirm(true)} className={btnGhost}>
                        Revert to minimum pricing
                      </button>
                      <span className="text-[11px] text-[#A0A0A0]">
                        Floor: cost + {Math.round(floorPct * 100)}% on materials — sharpens the price without selling below the minimum.
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="text-[12px] text-[#3A3A3A]">
                        Reprice <span className="font-semibold">{repriceable}</span> costed material line{repriceable === 1 ? "" : "s"} to cost + {Math.round(floorPct * 100)}%
                        {untouched > 0 ? ` (${untouched} labour/uncosted line${untouched === 1 ? "" : "s"} untouched)` : ""}?
                      </span>
                      {quote.discountExGst > 0 && (
                        <span className="w-full text-[11px] font-medium text-[#C8841E]">
                          Heads up: the document discount ({fmtMoney(quote.discountExGst)}) still applies afterwards and takes the net below the floor — clear it if the floor must hold.
                        </span>
                      )}
                      <button type="button" disabled={reverting || repriceable === 0} onClick={() => void handleRevertToMinimum()} className={btnPrimary}>
                        {reverting ? <RefreshCw className="h-4 w-4 animate-spin" /> : null} Confirm
                      </button>
                      <button type="button" disabled={reverting} onClick={() => setRevertConfirm(false)} className={btnGhost}>
                        Cancel
                      </button>
                    </>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        </div>{/* end Parts & Labour top-tab body */}

        {/* ── Schedule top-tab body ── */}
        {quoteTab === "schedule" && (
          <QuoteSchedule
            quoteId={quoteId}
            propertyId={quote.propertyId}
            canSeeCost={!!canSeeCost}
            isLocked={isLocked}
            onToast={(message, type) => setToast({ message, type })}
          />
        )}

        {/* ── Customer Assets top-tab body ── */}
        {quoteTab === "assets" && (
          <div className="mb-8">
            <QuoteCustomerAssets
              quoteId={quoteId}
              customerId={quote.customerId}
              isLocked={isLocked}
              onToast={(message, type) => setToast({ message, type })}
            />
          </div>
        )}

        {/* ── Notes textarea (Details tab) ─────────────────────────────────── */}
        <div className={`mb-8 print:hidden ${quoteTab === "details" ? "" : "hidden"}`}>
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#A0A0A0]">
            Private notes (not visible to the customer)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            disabled={isLocked}
            placeholder="Internal notes for your team — never shown to the customer or printed."
            className="w-full rounded-md border border-[#E6E1D4] px-3 py-2 text-sm focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C] disabled:opacity-50 print:border-0 print:px-0"
          />
        </div>

        {/* â”€â”€ Status action bar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <div className="flex flex-wrap items-center gap-3 border-t border-[#EFEBE0] pt-5 print:hidden">
          <span
            className="inline-flex rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em]"
            style={{ backgroundColor: statusTone.bg, color: statusTone.fg }}
          >
            {quote.status}
          </span>

          {/* Delete (with confirm) */}
          {confirmDelete ? (
            <span className="inline-flex items-center gap-2">
              <span className="text-xs text-[#C44545]">Delete this quote?</span>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
                className="rounded-full border border-[#E6E1D4] bg-white px-3 py-1 text-[12px] font-medium text-[#6B6B6B] hover:bg-[#FAF8F2] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={deleting}
                className="inline-flex items-center gap-1.5 rounded-full bg-[#C44545] px-3 py-1 text-[12px] font-semibold text-white hover:bg-[#A53A3A] disabled:opacity-50"
              >
                {deleting ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                Delete
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="text-[12px] text-[#A0A0A0] hover:text-[#C44545]"
            >
              Delete quote
            </button>
          )}

          <div className="ml-auto flex flex-wrap gap-2">
            {quote.status === "draft" && (
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleStatusAction("send")}
                className={btnPrimary}
              >
                Mark sent
              </button>
            )}
            {(quote.status === "sent" || quote.status === "viewed") && (
              <>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleStatusAction("accept")}
                  className={btnPrimary}
                >
                  Mark accepted
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleStatusAction("decline")}
                  className={btnGhost}
                >
                  Mark declined
                </button>
              </>
            )}
            {quote.status === "accepted" && !quote.convertedJobId && (
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleStatusAction("convertJob")}
                className={btnPrimary}
              >
                Convert to job
              </button>
            )}
            {quote.status === "accepted" && quote.convertedJobId && (
              <Link to={`/jobs?job=${quote.convertedJobId}`} className={btnGhost}>
                <ExternalLink className="h-4 w-4" />
                View job
              </Link>
            )}
          </div>

          {quote.status === "draft" && (
            <p className="w-full text-[11px] text-[#A0A0A0]">
              Email sending arrives with the mail hookup â€” send manually for now.
            </p>
          )}
        </div>

      </div>

      {toast && (
        <Toaster message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}

      {/* â”€â”€ Print stylesheet â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <style>{`
        @media print {
          body.printing-commercial-doc * { visibility: hidden; }
          body.printing-commercial-doc .print-sheet,
          body.printing-commercial-doc .print-sheet * { visibility: visible; }
          body.printing-commercial-doc .print-sheet {
            position: absolute;
            inset: 0 auto auto 0;
            width: 100%;
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
          }
          body.printing-commercial-doc .print\\:hidden { visibility: hidden !important; }
          body.printing-commercial-doc .print\\:border-0 { border: none !important; }
          body.printing-commercial-doc .print\\:px-0 { padding-left: 0 !important; padding-right: 0 !important; }
        }
      `}</style>
    </>
  );
}

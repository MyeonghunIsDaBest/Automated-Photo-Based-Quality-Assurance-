// ─────────────────────────────────────────────────────────────────────────────
// pages/catalogue/MaterialsTab.tsx
//
// Materials list tab:
//   • debounced (300ms) search — strips * before calling listMaterials (avoids
//     the throw in escapeIlikePattern)
//   • tag filter chips from listTags
//   • include-inactive toggle
//   • Register (P9.A kit): name / sku / unit / tags (chips) / cost / sell /
//     status + RowMenu actions; phone rows get a hand-authored summary
//     (price cells always visible — page is manager-gated; plan note: P3 reuse
//     intent is to add a canViewPrices check here when field roles get access)
//   • rows past RENDER_CAP collapse behind a "Show all N" footer toggle
//   • add + row-edit via MaterialFormModal
//   • deactivate / reactivate inline
//   • skeleton initial load, error-retry panel, friendly empty state
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, RefreshCw, ToggleLeft, ToggleRight, Search } from "lucide-react";

import { cardShell, btnPrimary, btnGhost } from "../gantt/components/ledger";
import MotionDrawer from "../../components/ui/MotionDrawer";
import { Register, RegisterRow, RowMenu, type RowMenuItem } from "../../components/ui/Register";
import { SkeletonLine } from "../../components/ui/skeleton";
import { Toaster, type ToastState } from "../../components/ui/Toaster";

import {
  listMaterials,
  listTags,
  setMaterialActive,
  updateMaterial,
  deleteMaterial,
  type Material,
  type MaterialTag,
} from "../../lib/api/materials";
import { getCommercialSettings } from "../../lib/api/commercial";
import { isBelowFloor } from "../../lib/commercial/money";
import { canManageCatalogue } from "../../lib/permissions";
import { useAppStore } from "../../store";
import MaterialFormModal, { type MaterialFormInitial } from "./MaterialFormModal";
import ConfirmDeleteDialog from "./ConfirmDeleteDialog";

// ─── types ────────────────────────────────────────────────────────────────────

interface Props {
  onWritten: () => void;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function fmt(price: number | null): string {
  if (price == null) return "—";
  return "$" + price.toFixed(2);
}

// How many rows render before collapsing the rest behind a "Show all N" toggle
// (JobsBoard COLUMN_RENDER_CAP precedent). Post-CSV-import the catalogue holds
// 300+ rows — rendering them all thrashes layout. Counts stay honest: the
// filter chips + select-all keep using the full arrays; only the DOM is capped.
const RENDER_CAP = 60;

// ─── status chip (hand-rolled, kept verbatim from the old table) ──────────────

function ActiveChip({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
        active
          ? "border-[#B8DFC7] bg-[#E5F2EA] text-[#246F47]"
          : "border-[#E6E1D4] bg-[#F0EDE4] text-[#8A8378]"
      }`}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: active ? "#2F8F5C" : "#B6AE9F" }}
      />
      {active ? "Active" : "Archived"}
    </span>
  );
}

// ─── row skeleton ─────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <div className="flex min-h-11 items-center gap-4 px-4 py-3">
      <SkeletonLine className="w-36" />
      <SkeletonLine className="w-20" />
      <SkeletonLine className="hidden w-16 sm:block" />
      <SkeletonLine className="hidden w-24 sm:block" />
    </div>
  );
}

// ─── component ───────────────────────────────────────────────────────────────

export default function MaterialsTab({ onWritten }: Props) {
  const currentProfile = useAppStore((s) => s.currentProfile);
  const currentUser    = useAppStore((s) => s.currentUser);
  const showPrices     = canManageCatalogue(currentProfile ?? currentUser);
  const canManage      = showPrices;

  const [materials, setMaterials]         = useState<Material[]>([]);
  const [tags, setTags]                   = useState<MaterialTag[]>([]);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState<string | null>(null);

  const [search, setSearch]               = useState("");
  const [activeTag, setActiveTag]         = useState<string | null>(null);
  // Stock-first admin filters (Luke's tick-off workflow, master plan P2).
  const [stockFilter, setStockFilter]     = useState<"all" | "stocked" | "oneoff">("all");
  const [selected, setSelected]           = useState<Set<string>>(new Set());
  const [bulkMarking, setBulkMarking]     = useState(false);
  const [includeInactive, setIncludeInactive] = useState(false);
  // Rows past RENDER_CAP stay out of the DOM until the footer toggle expands.
  const [expanded, setExpanded]           = useState(false);

  const [modal, setModal]                 = useState<MaterialFormInitial | null>(null);

  useEffect(() => {
    getCommercialSettings().then((cs) => {
      if (cs) {
        setMinMarkup(cs.minMarkupPct ?? 0.25);
        setDefaultMarkup(cs.defaultMaterialMarkup ?? 0.25);
      }
    }).catch(() => {});
  }, []);
  const [showModal, setShowModal]         = useState(false);
  const [toast, setToast]                 = useState<ToastState>(null);
  // Pricing floor (mig 94) — flags sells below cost x (1 + floor). Managers only see prices anyway.
  const [minMarkup, setMinMarkup]         = useState(0.25);
  // Default material markup — what the quote pickers auto-derive with when a
  // material has no stored sell (cost-only CSV imports). Shown faintly in the
  // Sell column so formula-priced rows are distinguishable from Luke-priced ones.
  const [defaultMarkup, setDefaultMarkup] = useState(0.25);

  // Bulk "Price from cost" dialog (P9.BS A4) — writes stored sells for the
  // selection at a chosen markup; never touches stored sells unless opted in.
  const [priceDialogOpen, setPriceDialogOpen] = useState(false);
  const [priceMarkupPct, setPriceMarkupPct]   = useState("");
  const [priceOverwrite, setPriceOverwrite]   = useState(false);
  const [pricing, setPricing]                 = useState(false);

  // Permanent-delete confirm (distinct from the reversible archive/deactivate).
  const [confirmDelete, setConfirmDelete] = useState<Material | null>(null);
  const [deleting, setDeleting]           = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Debounce search input — 300ms
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      // Strip PostgREST .or() structural chars (* , ( ) ) before calling
      // listMaterials — they break the .or() filter string.
      setDebouncedSearch(search.replace(/[*,()/]/g, ""));
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search]);

  const stockedCount = materials.filter((m) => m.isStockItem).length;
  const shown =
    stockFilter === "stocked" ? materials.filter((m) => m.isStockItem)
    : stockFilter === "oneoff" ? materials.filter((m) => !m.isStockItem)
    : materials;

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const fetchMaterials = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [mats, tagList] = await Promise.all([
        listMaterials({
          search: debouncedSearch || undefined,
          tag: activeTag ?? undefined,
          includeInactive,
        }),
        listTags(),
      ]);
      setMaterials(mats);
      setTags(tagList);
      // Prune the bulk selection to rows that still exist — a search/tag/archive
      // refetch must never leave invisible ids inside a pending bulk action.
      setSelected((prev) => new Set(mats.filter((m) => prev.has(m.id)).map((m) => m.id)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load materials");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, activeTag, includeInactive]);

  useEffect(() => {
    void fetchMaterials();
  }, [fetchMaterials]);

  // Eligibility for the bulk pricing run — costed rows only; stored sells are
  // protected unless the overwrite box is ticked.
  const selectedRows = shown.filter((m) => selected.has(m.id));
  const priceEligible = selectedRows.filter((m) => m.costPrice != null && (priceOverwrite || m.sellPrice == null));
  const priceSkippedNoCost = selectedRows.filter((m) => m.costPrice == null).length;
  const priceSkippedStored = selectedRows.filter((m) => m.costPrice != null && !priceOverwrite && m.sellPrice != null).length;

  async function handleBulkPrice() {
    // A cleared field must never price: Number("") === 0, which would write
    // sell = cost (zero margin) across the whole selection in one click.
    if (priceMarkupPct.trim() === "") {
      setToast({ message: "Enter a markup percentage first.", type: "error" });
      return;
    }
    const pct = Number(priceMarkupPct);
    if (!isFinite(pct) || pct < 0) {
      setToast({ message: "Enter a valid markup percentage (0 or more).", type: "error" });
      return;
    }
    if (priceEligible.length === 0 || pricing) return;
    setPricing(true);
    const factor = 1 + pct / 100;
    const jobs = priceEligible.map((m) => ({ id: m.id, sell: Math.round((m.costPrice as number) * factor * 100) / 100 }));
    try {
      const results = await Promise.allSettled(jobs.map((j) => updateMaterial(j.id, { sellPrice: j.sell })));
      const failedIds = jobs.filter((_, i) => results[i].status === "rejected").map((j) => j.id);
      // Mirror the bulk-stocked contract: only failed rows stay selected for retry.
      setSelected(new Set(failedIds));
      const ok = jobs.length - failedIds.length;
      setToast({
        message: failedIds.length === 0
          ? `${ok} item${ok === 1 ? "" : "s"} priced at cost × ${(factor).toFixed(2)}.`
          : `${ok} of ${jobs.length} priced — ${failedIds.length} failed and stay selected for retry.`,
        type: failedIds.length === 0 ? "success" : "error",
      });
      setPriceDialogOpen(false);
      onWritten();
    } finally {
      await fetchMaterials();
      setPricing(false);
    }
  }

  async function handleBulkSetStocked(value: boolean) {
    if (selected.size === 0 || bulkMarking) return;
    setBulkMarking(true);
    const ids = [...selected];
    try {
      const results = await Promise.allSettled(ids.map((id) => updateMaterial(id, { isStockItem: value })));
      const okIds = ids.filter((_, i) => results[i].status === "fulfilled");
      const failed = ids.length - okIds.length;
      // Only failed ids stay selected — retry hits just what's left.
      setSelected(new Set(ids.filter((_, i) => results[i].status === "rejected")));
      setToast({
        message: failed === 0
          ? `${okIds.length} item${okIds.length === 1 ? "" : "s"} ${value ? "marked as held in stock" : "removed from the stock list"}.`
          : `${okIds.length} of ${ids.length} updated — ${failed} failed and stay selected for retry.`,
        type: failed === 0 ? "success" : "error",
      });
    } finally {
      // Refetch regardless — partial successes must show immediately.
      await fetchMaterials();
      setBulkMarking(false);
    }
  }

  // Esc clears the bulk selection (fast bail-out mid-sweep) — but NOT while a
  // dialog or row menu is up: that same Esc is closing the overlay (MotionDrawer
  // and RowMenu both listen document-wide), and wiping a 300-row selection as a
  // side effect of cancelling the pricing dialog would force the whole sweep
  // to be redone.
  useEffect(() => {
    if (selected.size === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (document.querySelector('[role="dialog"], [role="menu"]')) return;
      setSelected(new Set());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected.size]);

  function openAdd() {
    setModal(null);
    setShowModal(true);
  }

  function openEdit(m: Material) {
    setModal({
      id: m.id,
      name: m.name,
      sku: m.sku,
      unit: m.unit,
      costPrice: m.costPrice,
      sellPrice: m.sellPrice,
      tags: m.tags,
      category: m.category,
      subcategory: m.subcategory,
      isFavourite: m.isFavourite,
      isStockItem: m.isStockItem,
      description: m.description,
      supplierId: m.supplierId,
    });
    setShowModal(true);
  }

  async function handleToggleActive(m: Material) {
    try {
      await setMaterialActive(m.id, !m.isActive);
      setToast({
        message: m.isActive
          ? `"${m.name}" archived — hidden from pickers, restore anytime`
          : `"${m.name}" restored`,
        type: "success",
      });
      void fetchMaterials();
      onWritten();
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : "Failed to update",
        type: "error",
      });
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await deleteMaterial(confirmDelete.id);
      setToast({ message: `"${confirmDelete.name}" deleted`, type: "success" });
      setConfirmDelete(null);
      void fetchMaterials();
      onWritten();
    } catch (err) {
      // FK-protected (used by a prebuild) or other failure — keep the dialog
      // open so the message is visible next to the action that caused it.
      setToast({
        message: err instanceof Error ? err.message : "Delete failed",
        type: "error",
      });
    } finally {
      setDeleting(false);
    }
  }

  function handleSaved() {
    setShowModal(false);
    setModal(null);
    setToast({ message: "Material saved", type: "success" });
    void fetchMaterials();
    onWritten();
  }

  // Sell cell content — shared by the desktop cell and the phone summary line.
  const renderSell = (m: Material) =>
    m.sellPrice == null && m.costPrice != null ? (
      // No stored sell — show the price quotes will auto-derive,
      // faint + chipped so formula-priced rows are unmistakable.
      <span
        className="tabular-nums text-[#A0A0A0]"
        title={`No stored sell — quotes price this automatically at cost × ${(1 + defaultMarkup).toFixed(2)}. Use “Price from cost” to store a fixed sell.`}
      >
        <span className="italic">{fmt(Math.round(m.costPrice * (1 + defaultMarkup) * 100) / 100)}</span>
        <span className="ml-1.5 inline-block rounded-full border border-[#E6E1D4] bg-[#FAF8F2] px-1.5 py-px align-middle text-[9px] font-bold uppercase tracking-wide text-[#A0A0A0]">
          auto
        </span>
      </span>
    ) : (
      <span
        className={`tabular-nums ${isBelowFloor(m.sellPrice, m.costPrice, minMarkup) ? "font-medium text-[#C8841E]" : "text-[#3A3A3A]"}`}
        title={isBelowFloor(m.sellPrice, m.costPrice, minMarkup) ? "Below the minimum-markup floor" : undefined}
      >
        {fmt(m.sellPrice)}
      </span>
    );

  // Row overflow menu — Edit + Archive/Restore + Delete (was two icon buttons).
  const rowMenuItems = (m: Material): RowMenuItem[] => [
    { label: "Edit", onSelect: () => openEdit(m) },
    {
      label: m.isActive ? "Archive" : "Restore",
      onSelect: () => void handleToggleActive(m),
    },
    { label: "Delete permanently", onSelect: () => setConfirmDelete(m), tone: "danger" },
  ];

  // Grid template computed conditionally so column count always matches the
  // header (checkbox column for managers; Cost/Sell only when prices show).
  const registerCols = [
    ...(canManage ? ["36px"] : []),
    "minmax(0,2fr)",   // Name
    "minmax(0,1fr)",   // SKU
    "56px",            // Unit
    "minmax(0,1.4fr)", // Tags
    ...(showPrices ? ["84px", "116px"] : []), // Cost / Sell
    "104px",           // Status
    "44px",            // Actions
  ].join(" ");

  return (
    <div className={`${cardShell} overflow-hidden`}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 border-b border-[#E6E1D4] px-4 py-3">
        {/* Search */}
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A0A0A0]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or SKU..."
            className="w-full rounded-full border border-[#E6E1D4] bg-[#FAF8F2] py-1.5 pl-9 pr-3 text-sm text-[#1A1A1A] placeholder:text-[#C0BAB0] focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]"
          />
        </div>

        {/* Stock filter chips (Luke's tick-off workflow: All / Stocked / One-off) */}
        <div className="flex flex-wrap items-center gap-1.5">
          {([
            { key: "all", label: `All (${materials.length})` },
            { key: "stocked", label: `Stocked (${stockedCount})` },
            { key: "oneoff", label: `One-off (${materials.length - stockedCount})` },
          ] as { key: "all" | "stocked" | "oneoff"; label: string }[]).map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setStockFilter(c.key)}
              className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
                stockFilter === c.key
                  ? "border-[#1A1A1A] bg-[#1A1A1A] text-white"
                  : "border-[#E6E1D4] bg-white text-[#6B6B6B] hover:border-[#D8D2C4]"
              }`}
            >
              {c.label}
            </button>
          ))}
          {canManage && selected.size > 0 && (
            <button
              type="button"
              onClick={() => void handleBulkSetStocked(true)}
              disabled={bulkMarking}
              className="ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-full bg-[#2F8F5C] px-3 py-1 text-xs font-semibold text-white hover:bg-[#287a4e] disabled:opacity-60 sm:min-h-0"
            >
              {bulkMarking ? <RefreshCw className="h-3 w-3 animate-spin" /> : null}
              Mark held in stock ({selected.size})
            </button>
          )}
          {canManage && selected.size > 0 && (
            <button
              type="button"
              onClick={() => void handleBulkSetStocked(false)}
              disabled={bulkMarking}
              title="Take the selected items off the stock list — they stay in the catalogue as one-offs"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-[#E6E1D4] bg-white px-3 py-1 text-xs font-semibold text-[#6B6B6B] hover:border-[#D8D2C4] hover:text-[#1A1A1A] disabled:opacity-60 sm:min-h-0"
            >
              Remove from stock list
            </button>
          )}
          {canManage && selected.size > 0 && (
            <button
              type="button"
              onClick={() => {
                setPriceMarkupPct(String(Math.round(defaultMarkup * 10000) / 100));
                setPriceOverwrite(false);
                setPriceDialogOpen(true);
              }}
              disabled={bulkMarking || pricing}
              title="Set a stored sell price (cost × markup) for the selected items"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-[#E6E1D4] bg-white px-3 py-1 text-xs font-semibold text-[#246F47] hover:border-[#2F8F5C] hover:bg-[#E5F2EA] disabled:opacity-60 sm:min-h-0"
            >
              Price from cost ({selectedRows.length})
            </button>
          )}
        </div>

        {/* Tag filter chips */}
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setActiveTag(null)}
            className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
              activeTag === null
                ? "border-[#1A1A1A] bg-[#1A1A1A] text-white"
                : "border-[#E6E1D4] bg-white text-[#6B6B6B] hover:border-[#D8D2C4]"
            }`}
          >
            All
          </button>
          {tags.map((tag) => (
            <button
              key={tag.id}
              type="button"
              onClick={() => setActiveTag(activeTag === tag.name ? null : tag.name)}
              className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
                activeTag === tag.name
                  ? "border-[#2F8F5C] bg-[#E5F2EA] text-[#246F47]"
                  : "border-[#E6E1D4] bg-white text-[#6B6B6B] hover:border-[#D8D2C4]"
              }`}
            >
              {tag.name}
            </button>
          ))}
        </div>

        {/* Include inactive toggle */}
        <button
          type="button"
          onClick={() => setIncludeInactive((v) => !v)}
          className="flex items-center gap-1.5 text-xs font-medium text-[#6B6B6B] hover:text-[#1A1A1A]"
        >
          {includeInactive ? (
            <ToggleRight className="h-4 w-4 text-[#2F8F5C]" />
          ) : (
            <ToggleLeft className="h-4 w-4" />
          )}
          Inactive
        </button>

        <button
          type="button"
          onClick={openAdd}
          className={btnPrimary + " ml-auto"}
        >
          <Plus className="h-4 w-4" />
          Add material
        </button>
      </div>

      {/* Error panel */}
      {error && !loading && (
        <div className="flex items-center justify-between px-4 py-3 bg-[#FBE5E5] border-b border-[#F0BFBF]">
          <p className="text-xs text-[#C44545]">{error}</p>
          <button
            type="button"
            onClick={() => void fetchMaterials()}
            className={btnGhost + " py-1! px-3! text-xs!"}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </button>
        </div>
      )}

      {/* Register (P9.A kit) — desktop grid at sm+, hand-authored phone summary */}
      <Register
        className="rounded-none border-0 shadow-none"
        cols={registerCols}
        header={
          <>
            {canManage && (
              <span className="flex items-center">
                {/* 44px hit area around the 16px checkbox */}
                <label className="-m-3 flex h-11 w-11 cursor-pointer items-center justify-center">
                  <input
                    type="checkbox"
                    checked={shown.length > 0 && shown.every((m) => selected.has(m.id))}
                    onChange={(e) => setSelected(e.target.checked ? new Set(shown.map((m) => m.id)) : new Set())}
                    className="h-4 w-4 accent-[#2F8F5C]"
                    aria-label="Select all in view"
                    title="Select everything in the current view (Esc clears)"
                  />
                </label>
              </span>
            )}
            <span>Name</span>
            <span>SKU</span>
            <span>Unit</span>
            <span>Tags</span>
            {showPrices && <span className="text-right">Cost</span>}
            {showPrices && <span className="text-right">Sell</span>}
            <span>Status</span>
            <span className="text-right">Actions</span>
          </>
        }
        footer={
          !loading && shown.length > RENDER_CAP ? (
            <div className="flex justify-center border-t border-[#E6E1D4] px-4 py-2.5">
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="min-h-11 rounded-full border border-[#E6E1D4] bg-white px-4 py-1 text-[12px] font-semibold text-[#3A3A3A] transition-colors hover:bg-[#FAF8F2] sm:min-h-0"
              >
                {expanded ? "Show fewer" : `Show all ${shown.length}`}
              </button>
            </div>
          ) : undefined
        }
      >
        {loading && [1, 2, 3, 4, 5].map((i) => <SkeletonRow key={i} />)}

        {!loading && shown.length === 0 && !error && (
          <div className="px-4 py-12 text-center text-[#A0A0A0]">
            <p className="text-sm font-medium">No materials found</p>
            <p className="mt-1 text-xs">
              {stockFilter !== "all"
                ? `Nothing under the ${stockFilter === "stocked" ? "Stocked" : "One-off"} chip — try All, or bulk-mark items as held in stock.`
                : search || activeTag
                  ? "Try adjusting filters"
                  : "Add your first material to get started"}
            </p>
          </div>
        )}

        {!loading &&
          shown.slice(0, expanded ? undefined : RENDER_CAP).map((m) => (
            <RegisterRow
              key={m.id}
              className={!m.isActive ? "opacity-50" : undefined}
              mobile={
                <span className="flex items-center gap-1">
                  {canManage && (
                    <label className="-m-3 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center">
                      <input
                        type="checkbox"
                        checked={selected.has(m.id)}
                        onChange={() => toggleSelected(m.id)}
                        className="h-4 w-4 accent-[#2F8F5C]"
                        aria-label={`Select ${m.name}`}
                      />
                    </label>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span className="min-w-0 truncate font-semibold text-[#1A1A1A]">{m.name}</span>
                      {m.sku ? (
                        <span className="shrink-0 font-mono text-[11px] text-[#A0A0A0]">{m.sku}</span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
                      {showPrices && renderSell(m)}
                      <ActiveChip active={m.isActive} />
                    </span>
                  </span>
                  <span className="-my-2 shrink-0">
                    <RowMenu items={rowMenuItems(m)} label={`Actions for ${m.name}`} />
                  </span>
                </span>
              }
            >
              {canManage && (
                <span className="flex items-center">
                  <label className="-m-3 flex h-11 w-11 cursor-pointer items-center justify-center">
                    <input
                      type="checkbox"
                      checked={selected.has(m.id)}
                      onChange={() => toggleSelected(m.id)}
                      className="h-4 w-4 accent-[#2F8F5C]"
                      aria-label={`Select ${m.name}`}
                    />
                  </label>
                </span>
              )}
              <span className="min-w-0">
                <button
                  type="button"
                  onClick={() => openEdit(m)}
                  className="block max-w-full truncate text-left font-medium text-[#1A1A1A] hover:text-[#2F8F5C] hover:underline"
                >
                  {m.name}
                </button>
              </span>
              <span className="truncate font-mono text-xs text-[#6B6B6B]">{m.sku ?? "—"}</span>
              <span className="text-[#3A3A3A]">{m.unit}</span>
              <span className="flex min-w-0 flex-wrap gap-1">
                {m.tags.map((t) => (
                  <span
                    key={t}
                    className="rounded-full border border-[#E6E1D4] px-2 py-0.5 text-[10px] font-medium text-[#6B6B6B]"
                  >
                    {t}
                  </span>
                ))}
              </span>
              {showPrices && (
                <span className="text-right tabular-nums text-[#3A3A3A]">{fmt(m.costPrice)}</span>
              )}
              {showPrices && <span className="text-right">{renderSell(m)}</span>}
              <span>
                <ActiveChip active={m.isActive} />
              </span>
              <span className="-my-2 flex items-center justify-end">
                <RowMenu items={rowMenuItems(m)} label={`Actions for ${m.name}`} />
              </span>
            </RegisterRow>
          ))}
      </Register>

      {/* Modal */}
      {showModal && (
        <MaterialFormModal
          initial={modal ?? undefined}
          groupOptions={Array.from(new Set(materials.map((m) => m.category).filter((c): c is string => !!c && !!c.trim()))).sort()}
          subgroupOptions={Array.from(new Set(materials.map((m) => m.subcategory).filter((c): c is string => !!c && !!c.trim()))).sort()}
          onSaved={handleSaved}
          onClose={() => { setShowModal(false); setModal(null); }}
        />
      )}

      {/* Bulk "Price from cost" confirm */}
      <MotionDrawer open={priceDialogOpen} onClose={() => { if (!pricing) setPriceDialogOpen(false); }} variant="modal" ariaLabel="Price from cost" sizeClass="sm:w-[440px]">
        <div className="flex h-full flex-col">
          <div className="border-b border-[#E6E1D4] px-5 py-4">
            <h2 className="text-[17px] font-semibold text-[#1A1A1A]">Price from cost</h2>
            <p className="mt-0.5 text-xs text-[#6B6B6B]">Stores a fixed sell price (cost × markup) on the selected items.</p>
          </div>
          <div className="space-y-4 px-5 py-4">
            <label className="block">
              <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.08em] text-[#A0A0A0]">Markup %</span>
              <div className="flex items-center gap-3">
                <input
                  type="number" min={0} step="any" inputMode="decimal"
                  value={priceMarkupPct}
                  onChange={(e) => setPriceMarkupPct(e.target.value)}
                  className="w-28 rounded-[11px] border border-[#E6E1D4] bg-white px-3 py-2 text-sm tabular-nums focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]"
                />
                <span className="text-xs text-[#6B6B6B]">Floor is {Math.round(minMarkup * 10000) / 100}% — going below it will flag every row amber.</span>
              </div>
            </label>
            <label className="flex cursor-pointer items-start gap-2 text-[13px] text-[#3A3A3A]">
              <input
                type="checkbox"
                checked={priceOverwrite}
                onChange={(e) => setPriceOverwrite(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[#2F8F5C]"
              />
              <span>Also overwrite items that already have a stored sell <span className="text-[#A0A0A0]">(off = Luke’s existing prices are untouched)</span></span>
            </label>
            <div className="rounded-[10px] border border-[#E6E1D4] bg-[#FAF8F2] px-4 py-3 text-xs text-[#3A3A3A]">
              <p><b className="tabular-nums">{priceEligible.length}</b> item{priceEligible.length === 1 ? "" : "s"} will be priced.</p>
              {priceSkippedStored > 0 && <p className="mt-1 text-[#6B6B6B]">{priceSkippedStored} skipped — already have a stored sell.</p>}
              {priceSkippedNoCost > 0 && <p className="mt-1 text-[#6B6B6B]">{priceSkippedNoCost} skipped — no cost price to mark up from.</p>}
            </div>
          </div>
          <div className="mt-auto flex items-center justify-end gap-2 border-t border-[#E6E1D4] px-5 py-4">
            <button type="button" onClick={() => setPriceDialogOpen(false)} disabled={pricing} className={btnGhost}>Cancel</button>
            <button type="button" onClick={() => void handleBulkPrice()} disabled={pricing || priceEligible.length === 0 || priceMarkupPct.trim() === ""} className={btnPrimary}>
              {pricing && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
              Price {priceEligible.length} item{priceEligible.length === 1 ? "" : "s"}
            </button>
          </div>
        </div>
      </MotionDrawer>

      {/* Permanent-delete confirm */}
      {confirmDelete && (
        <ConfirmDeleteDialog
          name={confirmDelete.name}
          noun="material"
          busy={deleting}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => void handleDelete()}
          onArchiveInstead={
            confirmDelete.isActive
              ? () => { const m = confirmDelete; setConfirmDelete(null); void handleToggleActive(m); }
              : undefined
          }
        />
      )}

      {/* Toast */}
      {toast && (
        <Toaster
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}

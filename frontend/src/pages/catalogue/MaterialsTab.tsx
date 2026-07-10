// ─────────────────────────────────────────────────────────────────────────────
// pages/catalogue/MaterialsTab.tsx
//
// Materials list tab:
//   • debounced (300ms) search — strips * before calling listMaterials (avoids
//     the throw in escapeIlikePattern)
//   • tag filter chips from listTags
//   • include-inactive toggle
//   • table: name / sku / unit / tags (chips) / cost / sell / status
//     (price cells always visible — page is manager-gated; plan note: P3 reuse
//     intent is to add a canViewPrices check here when field roles get access)
//   • add + row-edit via MaterialFormModal
//   • deactivate / reactivate inline
//   • skeleton initial load, error-retry panel, friendly empty state
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, RefreshCw, ToggleLeft, ToggleRight, Search, Archive, ArchiveRestore, Trash2 } from "lucide-react";

import { cardShell, btnPrimary, btnGhost } from "../gantt/components/ledger";
import { SkeletonLine } from "../../components/ui/skeleton";
import { Toaster } from "../../components/ui/Toaster";

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

type ToastState = { message: string; type: "success" | "error" | "info" } | null;

interface Props {
  onWritten: () => void;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function fmt(price: number | null): string {
  if (price == null) return "—";
  return "$" + price.toFixed(2);
}

// ─── row skeleton ─────────────────────────────────────────────────────────────

function SkeletonRow({ colCount }: { colCount: number }) {
  return (
    <tr className="border-b border-[#EFEBE0]">
      {Array.from({ length: colCount }, (_, i) => (
        <td key={i} className="px-4 py-3">
          <SkeletonLine className={i === 0 ? "w-36" : "w-20"} />
        </td>
      ))}
    </tr>
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

  const [modal, setModal]                 = useState<MaterialFormInitial | null>(null);

  useEffect(() => {
    getCommercialSettings().then((cs) => { if (cs) setMinMarkup(cs.minMarkupPct ?? 0.25); }).catch(() => {});
  }, []);
  const [showModal, setShowModal]         = useState(false);
  const [toast, setToast]                 = useState<ToastState>(null);
  // Pricing floor (mig 94) — flags sells below cost x (1 + floor). Managers only see prices anyway.
  const [minMarkup, setMinMarkup]         = useState(0.25);

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

  // Esc clears the bulk selection (fast bail-out mid-sweep).
  useEffect(() => {
    if (selected.size === 0) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSelected(new Set()); };
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
              className="ml-2 inline-flex items-center gap-1.5 rounded-full bg-[#2F8F5C] px-3 py-1 text-xs font-semibold text-white hover:bg-[#287a4e] disabled:opacity-60"
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
              className="inline-flex items-center gap-1.5 rounded-full border border-[#E6E1D4] bg-white px-3 py-1 text-xs font-semibold text-[#6B6B6B] hover:border-[#D8D2C4] hover:text-[#1A1A1A] disabled:opacity-60"
            >
              Remove from stock list
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

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-[#E6E1D4] bg-[#FAF8F2]">
              {canManage && (
                <th className="w-8 px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={shown.length > 0 && shown.every((m) => selected.has(m.id))}
                    onChange={(e) => setSelected(e.target.checked ? new Set(shown.map((m) => m.id)) : new Set())}
                    className="h-4 w-4 accent-[#2F8F5C]"
                    aria-label="Select all in view"
                    title="Select everything in the current view (Esc clears)"
                  />
                </th>
              )}
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Name</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">SKU</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Unit</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Tags</th>
              {showPrices && (
                <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Cost</th>
              )}
              {showPrices && (
                <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Sell</th>
              )}
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Status</th>
              <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading &&
              [1, 2, 3, 4, 5].map((i) => <SkeletonRow key={i} colCount={showPrices ? 9 : 6} />)}

            {!loading && shown.length === 0 && !error && (
              <tr>
                <td colSpan={showPrices ? 9 : 6} className="px-4 py-12 text-center text-[#A0A0A0]">
                  <p className="text-sm font-medium">No materials found</p>
                  <p className="mt-1 text-xs">
                    {stockFilter !== "all"
                      ? `Nothing under the ${stockFilter === "stocked" ? "Stocked" : "One-off"} chip — try All, or bulk-mark items as held in stock.`
                      : search || activeTag
                        ? "Try adjusting filters"
                        : "Add your first material to get started"}
                  </p>
                </td>
              </tr>
            )}

            {!loading &&
              shown.map((m) => (
                <tr
                  key={m.id}
                  className={`border-b border-[#EFEBE0] transition-colors hover:bg-[#FAF8F2] ${
                    !m.isActive ? "opacity-50" : ""
                  }`}
                >
                  {canManage && (
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(m.id)}
                        onChange={() => toggleSelected(m.id)}
                        className="h-4 w-4 accent-[#2F8F5C]"
                        aria-label={`Select ${m.name}`}
                      />
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => openEdit(m)}
                      className="font-medium text-[#1A1A1A] hover:text-[#2F8F5C] hover:underline text-left"
                    >
                      {m.name}
                    </button>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-[#6B6B6B]">
                    {m.sku ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-[#3A3A3A]">{m.unit}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {m.tags.map((t) => (
                        <span
                          key={t}
                          className="rounded-full border border-[#E6E1D4] px-2 py-0.5 text-[10px] font-medium text-[#6B6B6B]"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </td>
                  {showPrices && (
                    <td className="px-4 py-3 text-right tabular-nums text-[#3A3A3A]">
                      {fmt(m.costPrice)}
                    </td>
                  )}
                  {showPrices && (
                    <td
                      className={`px-4 py-3 text-right tabular-nums ${isBelowFloor(m.sellPrice, m.costPrice, minMarkup) ? "font-medium text-[#C8841E]" : "text-[#3A3A3A]"}`}
                      title={isBelowFloor(m.sellPrice, m.costPrice, minMarkup) ? "Below the minimum-markup floor" : undefined}
                    >
                      {fmt(m.sellPrice)}
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                        m.isActive
                          ? "border-[#B8DFC7] bg-[#E5F2EA] text-[#246F47]"
                          : "border-[#E6E1D4] bg-[#F0EDE4] text-[#8A8378]"
                      }`}
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ background: m.isActive ? "#2F8F5C" : "#B6AE9F" }}
                      />
                      {m.isActive ? "Active" : "Archived"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {/* Archive / Restore — reversible. Keeps the item out of
                          pickers but it can always be brought back. */}
                      <button
                        type="button"
                        onClick={() => void handleToggleActive(m)}
                        title={m.isActive ? "Archive (hide from pickers — can be restored)" : "Restore"}
                        aria-label={m.isActive ? "Archive material" : "Restore material"}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[#E6E1D4] bg-white text-[#6B6B6B] transition-colors hover:bg-[#FAF8F2] hover:text-[#1A1A1A]"
                      >
                        {m.isActive ? <Archive className="h-3.5 w-3.5" /> : <ArchiveRestore className="h-3.5 w-3.5" />}
                      </button>
                      {/* Permanent delete — guarded by a confirm + an FK check. */}
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(m)}
                        title="Delete permanently"
                        aria-label="Delete material"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[#E6E1D4] bg-white text-[#C0BAB0] transition-colors hover:border-[#F0BFBF] hover:bg-[#FBE5E5] hover:text-[#C44545]"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

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

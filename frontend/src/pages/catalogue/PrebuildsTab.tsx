// ─────────────────────────────────────────────────────────────────────────────
// pages/catalogue/PrebuildsTab.tsx
//
// Prebuilds list + inline editor panel.
//
// List columns: name / category / items count / active status
//
// Inline editor (opens when row is selected):
//   • fields: name, description, category
//   • item rows: searchable material select (filtered dropdown over listMaterials),
//     qty number step 0.25 min 0.25, unit shown read-only from material
//   • add / remove / reorder (up/down buttons, persists sort_order via
//     updatePrebuildItem)
//   • "Tap-to-log preview" caption framing the bundle
//   • Save / Cancel / Deactivate
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import {
  Plus, ChevronUp, ChevronDown, Trash2, RefreshCw, Loader2, Archive, ArchiveRestore,
} from "lucide-react";

import { cardShell, btnPrimary, btnGhost, FRAUNCES } from "../gantt/components/ledger";
import { SkeletonLine } from "../../components/ui/skeleton";
import { Toaster, type ToastState } from "../../components/ui/Toaster";

import {
  listPrebuilds,
  getPrebuildWithItems,
  createPrebuild,
  updatePrebuild,
  setPrebuildActive,
  deletePrebuild,
  addPrebuildItem,
  updatePrebuildItem,
  removePrebuildItem,
  listMaterials,
  type Prebuild,
  type PrebuildWithItems,
  type PrebuildItem,
  type Material,
} from "../../lib/api/materials";
import ConfirmDeleteDialog from "./ConfirmDeleteDialog";

// ─── types ────────────────────────────────────────────────────────────────────

interface Props {
  onWritten: () => void;
}

interface LocalItem {
  id: string | null; // null = new (not yet persisted)
  materialId: string;
  materialName: string;
  unit: string;
  qty: number;
  sortOrder: number;
  // for unsaved new items
  tempKey: string;
}

let tempKeyCounter = 0;
function nextTempKey() {
  tempKeyCounter += 1;
  return `tmp-${tempKeyCounter}`;
}

// ─── material picker ──────────────────────────────────────────────────────────

function MaterialPicker({
  materials,
  value,
  onChange,
  disabled,
}: {
  materials: Material[];
  value: string;
  onChange: (id: string, name: string, unit: string) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen]   = useState(false);

  const selected = materials.find((m) => m.id === value);
  const filtered = query
    ? materials
        .filter(
          (m) =>
            m.name.toLowerCase().includes(query.toLowerCase()) ||
            (m.sku?.toLowerCase() ?? "").includes(query.toLowerCase()),
        )
        .sort((a, b) => Number(b.isStockItem) - Number(a.isStockItem)) // stock-first
    : [...materials].sort((a, b) => Number(b.isStockItem) - Number(a.isStockItem)).slice(0, 30);

  return (
    <div className="relative">
      <input
        type="text"
        value={open ? query : (selected?.name ?? "")}
        onFocus={() => { setOpen(true); setQuery(""); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        placeholder="Search material..."
        className="w-full rounded-[8px] border border-[#E6E1D4] bg-white px-3 py-1.5 text-sm text-[#1A1A1A] placeholder:text-[#C0BAB0] focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]"
        disabled={disabled}
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-30 mt-1 max-h-48 w-full overflow-y-auto rounded-[10px] border border-[#E6E1D4] bg-white shadow-[0_4px_16px_rgba(20,20,20,0.08)]">
          {filtered.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); onChange(m.id, m.name, m.unit); setOpen(false); setQuery(""); }}
                className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-[#F5F2E9]"
              >
                <span className="font-medium text-[#1A1A1A]">{m.name}</span>
                <span className="ml-2 text-xs text-[#A0A0A0]">{m.unit}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── component ───────────────────────────────────────────────────────────────

export default function PrebuildsTab({ onWritten }: Props) {
  const [prebuilds, setPrebuilds]   = useState<Prebuild[]>([]);
  const [allMaterials, setAllMaterials] = useState<Material[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);

  const [selected, setSelected]     = useState<PrebuildWithItems | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [isNew, setIsNew]           = useState(false);

  // Editor fields
  const [eName, setEName]           = useState("");
  const [eDesc, setEDesc]           = useState("");
  const [eCat, setECat]             = useState("");
  const [eSub, setESub]             = useState("");
  const [eFav, setEFav]             = useState(false);
  const [eItems, setEItems]         = useState<LocalItem[]>([]);
  const [busy, setBusy]             = useState(false);
  const [editErr, setEditErr]       = useState<string | null>(null);

  // Permanent-delete confirm (distinct from the reversible archive/deactivate).
  const [confirmDelete, setConfirmDelete] = useState<Prebuild | null>(null);
  const [deleting, setDeleting]     = useState(false);

  const [toast, setToast]           = useState<ToastState>(null);

  // Distinct existing Groups (category) + Subgroups (subcategory) for the editor
  // datalists — pick an existing one or type a new value, so the tree stays tidy.
  const catOptions = Array.from(new Set(prebuilds.map((p) => p.category).filter((c): c is string => !!c && !!c.trim()))).sort();
  const subOptions = Array.from(new Set(prebuilds.map((p) => p.subcategory).filter((c): c is string => !!c && !!c.trim()))).sort();

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [pbs, mats] = await Promise.all([
        listPrebuilds(true),
        listMaterials({ includeInactive: false }),
      ]);
      setPrebuilds(pbs);
      setAllMaterials(mats);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchAll(); }, [fetchAll]);

  function openNew() {
    setSelected(null);
    setIsNew(true);
    setEName(""); setEDesc(""); setECat(""); setESub(""); setEFav(false); setEItems([]);
    setEditErr(null);
    setEditorOpen(true);
  }

  async function openEdit(pb: Prebuild) {
    setBusy(true);
    try {
      const full = await getPrebuildWithItems(pb.id);
      if (!full) return;
      setSelected(full);
      setIsNew(false);
      setEName(full.name);
      setEDesc(full.description ?? "");
      setECat(full.category ?? "");
      setESub(full.subcategory ?? "");
      setEFav(full.isFavourite);
      // Build local items with material data
      const localItems: LocalItem[] = full.items.map((item: PrebuildItem) => {
        const mat = allMaterials.find((m) => m.id === item.materialId);
        return {
          id: item.id,
          materialId: item.materialId,
          materialName: mat?.name ?? "(unknown)",
          unit: mat?.unit ?? "",
          qty: item.qty,
          sortOrder: item.sortOrder,
          tempKey: nextTempKey(),
        };
      });
      setEItems(localItems);
      setEditErr(null);
      setEditorOpen(true);
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : "Failed to load prebuild", type: "error" });
    } finally {
      setBusy(false);
    }
  }

  function addItemRow() {
    setEItems((prev) => [
      ...prev,
      {
        id: null,
        materialId: "",
        materialName: "",
        unit: "",
        qty: 1,
        sortOrder: prev.length,
        tempKey: nextTempKey(),
      },
    ]);
  }

  function removeItemRow(key: string) {
    setEItems((prev) => prev.filter((i) => i.tempKey !== key));
  }

  function moveItem(key: string, dir: -1 | 1) {
    setEItems((prev) => {
      const idx = prev.findIndex((i) => i.tempKey === key);
      if (idx < 0) return prev;
      const next = idx + dir;
      if (next < 0 || next >= prev.length) return prev;
      const arr = [...prev];
      [arr[idx], arr[next]] = [arr[next], arr[idx]];
      return arr.map((item, i) => ({ ...item, sortOrder: i }));
    });
  }

  function updateItemField(key: string, field: "materialId" | "qty", value: string | number, extra?: { name: string; unit: string }) {
    setEItems((prev) =>
      prev.map((item) => {
        if (item.tempKey !== key) return item;
        if (field === "materialId" && extra) {
          return { ...item, materialId: value as string, materialName: extra.name, unit: extra.unit };
        }
        if (field === "qty") {
          return { ...item, qty: Math.max(0.25, Number(value)) };
        }
        return item;
      }),
    );
  }

  async function handleSave() {
    setEditErr(null);
    if (!eName.trim()) { setEditErr("Name is required."); return; }
    // Validate items
    for (const item of eItems) {
      if (!item.materialId) { setEditErr("All item rows must have a material selected."); return; }
    }
    setBusy(true);
    try {
      if (isNew) {
        const pb = await createPrebuild({
          name: eName.trim(),
          description: eDesc.trim() || null,
          category: eCat.trim() || null,
          subcategory: eSub.trim() || null,
          isFavourite: eFav,
        });
        // Add items
        for (let i = 0; i < eItems.length; i++) {
          const item = eItems[i];
          await addPrebuildItem({
            prebuildId: pb.id,
            materialId: item.materialId,
            qty: item.qty,
            sortOrder: i,
          });
        }
        setToast({ message: "Prebuild created", type: "success" });
      } else if (selected) {
        await updatePrebuild(selected.id, {
          name: eName.trim(),
          description: eDesc.trim() || null,
          category: eCat.trim() || null,
          subcategory: eSub.trim() || null,
          isFavourite: eFav,
        });
        // Reconcile items: remove deleted, add new, update sort+qty for existing
        const existingIds = new Set(selected.items.map((i) => i.id));
        const newIds = new Set(eItems.filter((i) => i.id !== null).map((i) => i.id!));
        // Remove deleted
        for (const oldItem of selected.items) {
          if (!newIds.has(oldItem.id)) {
            await removePrebuildItem(oldItem.id);
          }
        }
        // Update existing + add new
        for (let i = 0; i < eItems.length; i++) {
          const item = eItems[i];
          if (item.id && existingIds.has(item.id)) {
            await updatePrebuildItem(item.id, { qty: item.qty, sortOrder: i });
          } else if (!item.id) {
            await addPrebuildItem({
              prebuildId: selected.id,
              materialId: item.materialId,
              qty: item.qty,
              sortOrder: i,
            });
          }
        }
        setToast({ message: "Prebuild saved", type: "success" });
      }
      setEditorOpen(false);
      void fetchAll();
      onWritten();
    } catch (err) {
      setEditErr(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleActive(pb: Prebuild) {
    try {
      await setPrebuildActive(pb.id, !pb.isActive);
      setToast({
        message: pb.isActive
          ? `"${pb.name}" archived — restore anytime`
          : `"${pb.name}" restored`,
        type: "success",
      });
      void fetchAll();
      onWritten();
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : "Failed", type: "error" });
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await deletePrebuild(confirmDelete.id);
      setToast({ message: `"${confirmDelete.name}" deleted`, type: "success" });
      // If the deleted prebuild was open in the editor, close it.
      if (selected?.id === confirmDelete.id) { setEditorOpen(false); setSelected(null); }
      setConfirmDelete(null);
      void fetchAll();
      onWritten();
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : "Delete failed", type: "error" });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_420px]">
      {/* ── List ─────────────────────────────────────────────────────────── */}
      <div className={`${cardShell} overflow-hidden`}>
        <div className="flex items-center justify-between border-b border-[#E6E1D4] px-4 py-3">
          <h2 className="text-[13px] font-semibold text-[#1A1A1A]">Prebuilds</h2>
          <button type="button" onClick={openNew} className={btnPrimary}>
            <Plus className="h-4 w-4" />
            New prebuild
          </button>
        </div>

        {error && !loading && (
          <div className="flex items-center justify-between bg-[#FBE5E5] border-b border-[#F0BFBF] px-4 py-3">
            <p className="text-xs text-[#C44545]">{error}</p>
            <button type="button" onClick={() => void fetchAll()} className={btnGhost + " py-1! px-3! text-xs!"}>
              <RefreshCw className="h-3.5 w-3.5" />
              Retry
            </button>
          </div>
        )}

        <div className="divide-y divide-[#EFEBE0]">
          {loading &&
            [1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <SkeletonLine className="w-40" />
                <SkeletonLine className="w-16 ml-auto" />
              </div>
            ))}

          {!loading && prebuilds.length === 0 && !error && (
            <p className="px-4 py-10 text-center text-sm text-[#A0A0A0]">
              No prebuilds yet. Create one to define a bundle of materials.
            </p>
          )}

          {!loading &&
            prebuilds.map((pb) => (
              <div
                key={pb.id}
                className={`flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[#FAF8F2] ${
                  selected?.id === pb.id && editorOpen ? "bg-[#F0EDE4]" : ""
                } ${!pb.isActive ? "opacity-50" : ""}`}
              >
                <button
                  type="button"
                  onClick={() => void openEdit(pb)}
                  className="flex-1 text-left"
                  disabled={busy}
                >
                  <p className="font-medium text-[#1A1A1A]">{pb.name}</p>
                  {pb.category && (
                    <p className="text-xs text-[#6B6B6B]">{pb.category}</p>
                  )}
                </button>
                {pb.itemsCount !== undefined && (
                  <span
                    className="flex h-6 min-w-6 items-center justify-center rounded-full bg-[#EFEBE0] px-1.5 text-xs font-semibold tabular-nums text-[#6B6B6B]"
                    title={`${pb.itemsCount} item${pb.itemsCount !== 1 ? "s" : ""}`}
                  >
                    {pb.itemsCount}
                  </span>
                )}
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                    pb.isActive
                      ? "border-[#B8DFC7] bg-[#E5F2EA] text-[#246F47]"
                      : "border-[#E6E1D4] bg-[#F0EDE4] text-[#8A8378]"
                  }`}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: pb.isActive ? "#2F8F5C" : "#B6AE9F" }} />
                  {pb.isActive ? "Active" : "Archived"}
                </span>
                <button
                  type="button"
                  onClick={() => void handleToggleActive(pb)}
                  title={pb.isActive ? "Archive (can be restored)" : "Restore"}
                  aria-label={pb.isActive ? "Archive prebuild" : "Restore prebuild"}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[#E6E1D4] bg-white text-[#6B6B6B] transition-colors hover:bg-[#FAF8F2] hover:text-[#1A1A1A]"
                >
                  {pb.isActive ? <Archive className="h-3.5 w-3.5" /> : <ArchiveRestore className="h-3.5 w-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(pb)}
                  title="Delete permanently"
                  aria-label="Delete prebuild"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[#E6E1D4] bg-white text-[#C0BAB0] transition-colors hover:border-[#F0BFBF] hover:bg-[#FBE5E5] hover:text-[#C44545]"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
        </div>
      </div>

      {/* ── Editor panel ─────────────────────────────────────────────────── */}
      {editorOpen && (
        <div className={`${cardShell} overflow-hidden flex flex-col`}>
          <div className="border-b border-[#E6E1D4] px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#6B6B6B]">
              {isNew ? "NEW PREBUILD" : "EDIT PREBUILD"}
            </p>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {editErr && (
              <p className="rounded-md border border-[#F0BFBF] bg-[#FBE5E5] px-3 py-2 text-xs text-[#C44545]">
                {editErr}
              </p>
            )}

            {/* Name */}
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[#6B6B6B]">
                Name <span className="text-[#C44545]">*</span>
              </label>
              <input
                type="text"
                value={eName}
                onChange={(e) => setEName(e.target.value)}
                className="w-full rounded-[8px] border border-[#E6E1D4] bg-white px-3 py-2 text-sm text-[#1A1A1A] focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]"
                disabled={busy}
              />
            </div>

            {/* Group (category) + Subgroup (subcategory) — the Pre-Builds tab tree */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[#6B6B6B]">
                  Group
                </label>
                <input
                  type="text"
                  list="prebuild-group-options"
                  value={eCat}
                  onChange={(e) => setECat(e.target.value)}
                  placeholder="e.g. Solar, Switchboard"
                  className="w-full rounded-[8px] border border-[#E6E1D4] bg-white px-3 py-2 text-sm text-[#1A1A1A] focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]"
                  disabled={busy}
                />
                <datalist id="prebuild-group-options">
                  {catOptions.map((c) => <option key={c} value={c} />)}
                </datalist>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[#6B6B6B]">
                  Subgroup
                </label>
                <input
                  type="text"
                  list="prebuild-subgroup-options"
                  value={eSub}
                  onChange={(e) => setESub(e.target.value)}
                  placeholder="e.g. PV System, Power"
                  className="w-full rounded-[8px] border border-[#E6E1D4] bg-white px-3 py-2 text-sm text-[#1A1A1A] focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]"
                  disabled={busy}
                />
                <datalist id="prebuild-subgroup-options">
                  {subOptions.map((c) => <option key={c} value={c} />)}
                </datalist>
              </div>
            </div>

            {/* Favourite */}
            <label className="flex cursor-pointer items-center gap-2 text-sm text-[#3A3A3A]">
              <input
                type="checkbox"
                checked={eFav}
                onChange={(e) => setEFav(e.target.checked)}
                className="h-4 w-4 accent-[#2F8F5C]"
                disabled={busy}
              />
              Mark as a favourite (shows in the quote's Favourites group)
            </label>

            {/* Description */}
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[#6B6B6B]">
                Description
              </label>
              <textarea
                value={eDesc}
                onChange={(e) => setEDesc(e.target.value)}
                rows={2}
                className="w-full resize-none rounded-[8px] border border-[#E6E1D4] bg-white px-3 py-2 text-sm text-[#1A1A1A] focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]"
                disabled={busy}
              />
            </div>

            {/* Items */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="text-[11px] font-medium uppercase tracking-wider text-[#6B6B6B]">
                  Items
                </label>
                <button type="button" onClick={addItemRow} className={btnGhost + " py-1! px-2.5! text-xs!"} disabled={busy}>
                  <Plus className="h-3.5 w-3.5" />
                  Add item
                </button>
              </div>

              {eItems.length === 0 && (
                <p className="text-xs text-[#A0A0A0] py-2">No items yet. Add materials to this prebuild.</p>
              )}

              <div className="space-y-2">
                {eItems.map((item, idx) => (
                  <div key={item.tempKey} className="flex items-center gap-2 rounded-[8px] border border-[#E6E1D4] bg-[#FAF8F2] px-3 py-2">
                    <div className="flex flex-col gap-0.5">
                      <button
                        type="button"
                        onClick={() => moveItem(item.tempKey, -1)}
                        disabled={idx === 0 || busy}
                        className="text-[#C0BAB0] hover:text-[#6B6B6B] disabled:opacity-30"
                      >
                        <ChevronUp className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveItem(item.tempKey, 1)}
                        disabled={idx === eItems.length - 1 || busy}
                        className="text-[#C0BAB0] hover:text-[#6B6B6B] disabled:opacity-30"
                      >
                        <ChevronDown className="h-3 w-3" />
                      </button>
                    </div>

                    <div className="flex-1">
                      <MaterialPicker
                        materials={allMaterials}
                        value={item.materialId}
                        onChange={(id, name, unit) =>
                          updateItemField(item.tempKey, "materialId", id, { name, unit })
                        }
                        disabled={busy}
                      />
                    </div>

                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        step="0.25"
                        min="0.25"
                        value={item.qty}
                        onChange={(e) => updateItemField(item.tempKey, "qty", e.target.value)}
                        className="w-16 rounded-[8px] border border-[#E6E1D4] bg-white px-2 py-1.5 text-sm text-right text-[#1A1A1A] focus:border-[#2F8F5C] focus:outline-none"
                        disabled={busy}
                      />
                      <span className="text-xs text-[#A0A0A0] w-8">{item.unit || "ea"}</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => removeItemRow(item.tempKey)}
                      disabled={busy}
                      className="text-[#C0BAB0] hover:text-[#C44545] transition-colors disabled:opacity-30"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Tap-to-log caption */}
            {eItems.length > 0 && (
              <p
                className="rounded-[10px] border border-[#E6E1D4] bg-[#F9EFD9] px-3 py-2.5 text-xs text-[#C8841E]"
                style={{ fontFamily: FRAUNCES }}
              >
                This is exactly what gets logged when a tech taps this prebuild.
              </p>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center gap-2 border-t border-[#E6E1D4] px-4 py-3">
            <button
              type="button"
              onClick={() => { setEditorOpen(false); setSelected(null); }}
              disabled={busy}
              className={btnGhost}
            >
              Cancel
            </button>
            {!isNew && selected && (
              <button
                type="button"
                onClick={() => void handleToggleActive(selected)}
                disabled={busy}
                className="ml-auto rounded-full border border-[#E6E1D4] bg-white px-3 py-2 text-[13px] font-semibold text-[#6B6B6B] transition-colors hover:bg-[#FBE5E5] hover:text-[#C44545] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {selected.isActive ? "Deactivate" : "Reactivate"}
              </button>
            )}
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={busy}
              className={btnPrimary + (!isNew && selected ? "" : " ml-auto")}
            >
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Save
            </button>
          </div>
        </div>
      )}

      {confirmDelete && (
        <ConfirmDeleteDialog
          name={confirmDelete.name}
          noun="prebuild"
          busy={deleting}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => void handleDelete()}
          onArchiveInstead={
            confirmDelete.isActive
              ? () => { const pb = confirmDelete; setConfirmDelete(null); void handleToggleActive(pb); }
              : undefined
          }
        />
      )}

      {toast && (
        <Toaster message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}

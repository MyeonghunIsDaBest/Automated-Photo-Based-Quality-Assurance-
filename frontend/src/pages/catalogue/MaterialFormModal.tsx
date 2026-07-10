// ─────────────────────────────────────────────────────────────────────────────
// pages/catalogue/MaterialFormModal.tsx
//
// Shared create/edit modal for Material records.
// Used by: MaterialsTab (add / row-edit) and SuggestionsTab (approve candidate).
//
// Props:
//   initial  — pre-fill values (for edit or approval prefill)
//   source   — source tag written on createMaterial (default: "manual").
//              SuggestionsTab passes "mined" so the ONE create happens with the
//              correct source; approveCandidate only links the existing record.
//   onSaved  — called with the saved Material
//   onClose  — called to dismiss without saving
//
// Features:
//   • name (required), sku, unit (text input + datalist), cost + sell prices
//     (optional numeric, "ex-GST" hint), description
//   • tags: chip multi-select from library + free-add (calls createTag, then
//     selects the new tag)
//   • preferred supplier: select from listSuppliers (optional)
//   • busy states + required validation
//   • house modal grammar (from maintenance/modals.tsx)
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import { X, Plus, Loader2 } from "lucide-react";
import { FRAUNCES } from "../gantt/components/ledger";
import {
  createMaterial,
  updateMaterial,
  listTags,
  createTag,
  type Material,
  type CreateMaterialInput,
  type MaterialTag,
} from "../../lib/api/materials";
import { listSuppliers } from "../../lib/api/suppliers";
import { getCommercialSettings } from "../../lib/api/commercial";
import { minSell, isBelowFloor } from "../../lib/commercial/money";
import type { Supplier } from "../../types";

// ─── house modal shells ───────────────────────────────────────────────────────

const MODAL_SHELL =
  "fixed inset-0 z-50 flex items-center justify-center bg-[#1A1A1A]/50 p-4";
const DIALOG_SHELL =
  "flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-[14px] border border-[#E6E1D4] bg-white shadow-[0_8px_28px_rgba(20,20,20,0.12)]";

// ─── unit presets ─────────────────────────────────────────────────────────────

const UNIT_PRESETS = ["ea", "m", "box", "roll", "pack", "L", "kg"];

// ─── types ────────────────────────────────────────────────────────────────────

export interface MaterialFormInitial {
  id?: string;          // present → edit mode
  name?: string;
  sku?: string | null;
  unit?: string;
  costPrice?: number | null;
  sellPrice?: number | null;
  tags?: string[];
  category?: string | null;
  subcategory?: string | null;
  isFavourite?: boolean;
  isStockItem?: boolean;
  description?: string | null;
  supplierId?: string | null;
}

interface Props {
  initial?: MaterialFormInitial;
  /** Source tag to use when creating a new material. Defaults to "manual".
   *  Pass "mined" from the approval flow so the record is tagged correctly. */
  source?: 'manual' | 'csv' | 'mined';
  /** Existing distinct Groups / Subgroups for the editor datalists. */
  groupOptions?: string[];
  subgroupOptions?: string[];
  onSaved: (m: Material) => void;
  onClose: () => void;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function FieldLabel({
  children,
  required,
  hint,
}: {
  children: React.ReactNode;
  required?: boolean;
  hint?: string;
}) {
  return (
    <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[#6B6B6B]">
      {children}
      {required && <span className="ml-1 text-[#C44545]">*</span>}
      {hint && <span className="ml-1 normal-case tracking-normal text-[#A0A0A0]">({hint})</span>}
    </label>
  );
}

// ─── component ───────────────────────────────────────────────────────────────

export default function MaterialFormModal({ initial, source = 'manual', groupOptions = [], subgroupOptions = [], onSaved, onClose }: Props) {
  const isEdit = Boolean(initial?.id);

  // form state
  const [name, setName]             = useState(initial?.name ?? "");
  const [sku, setSku]               = useState(initial?.sku ?? "");
  const [unit, setUnit]             = useState(initial?.unit ?? "ea");
  const [category, setCategory]     = useState(initial?.category ?? "");
  const [subcategory, setSubcategory] = useState(initial?.subcategory ?? "");
  const [isFavourite, setIsFavourite] = useState(initial?.isFavourite ?? false);
  const [isStockItem, setIsStockItem] = useState(initial?.isStockItem ?? false);
  const [costStr, setCostStr]       = useState(
    initial?.costPrice != null ? String(initial.costPrice) : "",
  );
  const [sellStr, setSellStr]       = useState(
    initial?.sellPrice != null ? String(initial.sellPrice) : "",
  );
  // Pricing floor (mig 94) for the live “floor at this cost” hint under the sell input.
  const [minMarkup, setMinMarkup] = useState(0.25);
  const [description, setDescription] = useState(initial?.description ?? "");
  const [selectedTags, setSelectedTags] = useState<string[]>(initial?.tags ?? []);
  const [supplierId, setSupplierId] = useState(initial?.supplierId ?? "");

  // tag library
  const [tagLibrary, setTagLibrary] = useState<MaterialTag[]>([]);
  const [freeTagInput, setFreeTagInput] = useState("");
  const [addingTag, setAddingTag]   = useState(false);

  // suppliers
  const [suppliers, setSuppliers]   = useState<Supplier[]>([]);

  // ui state
  const [busy, setBusy]             = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const nameRef = useRef<HTMLInputElement>(null);

  // Load tag library + suppliers on mount
  useEffect(() => {
    getCommercialSettings().then((cs) => { if (cs) setMinMarkup(cs.minMarkupPct ?? 0.25); }).catch(() => {});
  }, []);

  useEffect(() => {
    void listTags().then(setTagLibrary);
    void listSuppliers().then(setSuppliers);
  }, []);

  // Auto-focus name
  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  function toggleTag(tagName: string) {
    setSelectedTags((prev) =>
      prev.includes(tagName)
        ? prev.filter((t) => t !== tagName)
        : [...prev, tagName],
    );
  }

  async function handleFreeAddTag() {
    const trimmed = freeTagInput.trim();
    if (!trimmed) return;
    setAddingTag(true);
    try {
      const newTag = await createTag(trimmed);
      setTagLibrary((prev) => [...prev, newTag].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedTags((prev) => [...prev, newTag.name]);
      setFreeTagInput("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create tag");
    } finally {
      setAddingTag(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Name is required.");
      nameRef.current?.focus();
      return;
    }

    const costPrice =
      costStr.trim() === "" ? null : Number(costStr.trim());
    const sellPrice =
      sellStr.trim() === "" ? null : Number(sellStr.trim());

    if (costStr.trim() !== "" && isNaN(costPrice as number)) {
      setError("Cost price must be a number.");
      return;
    }
    if (sellStr.trim() !== "" && isNaN(sellPrice as number)) {
      setError("Sell price must be a number.");
      return;
    }

    setBusy(true);
    try {
      let saved: Material;
      const input: CreateMaterialInput = {
        name: trimmedName,
        sku: sku.trim() || null,
        unit: unit.trim() || "ea",
        costPrice,
        sellPrice,
        tags: selectedTags,
        category: category.trim() || null,
        subcategory: subcategory.trim() || null,
        isFavourite,
        isStockItem,
        description: description.trim() || null,
        supplierId: supplierId || null,
        source,
      };

      if (isEdit && initial?.id) {
        saved = await updateMaterial(initial.id, input);
      } else {
        saved = await createMaterial(input);
      }
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={MODAL_SHELL} onClick={onClose}>
      <div
        className={DIALOG_SHELL}
        role="dialog"
        aria-modal="true"
        aria-label={isEdit ? "Edit material" : "Add material"}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-[#E6E1D4] px-6 py-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[#6B6B6B]">
              {isEdit ? "CATALOGUE · EDIT" : "CATALOGUE · NEW"}
            </p>
            <h2
              className="mt-1 text-xl font-medium text-[#1A1A1A]"
              style={{ fontFamily: FRAUNCES, letterSpacing: "-0.02em" }}
            >
              {isEdit ? "Edit Material" : "Add Material"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-2 text-[#A0A0A0] hover:bg-[#F0EDE4] hover:text-[#3A3A3A]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <form
          id="material-form"
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto px-6 py-5 space-y-4"
        >
          {error && (
            <p className="rounded-md border border-[#F0BFBF] bg-[#FBE5E5] px-3 py-2 text-xs text-[#C44545]">
              {error}
            </p>
          )}

          {/* Name */}
          <div>
            <FieldLabel required>Name</FieldLabel>
            <input
              ref={nameRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. 2.5mm TPS cable"
              className="w-full rounded-[8px] border border-[#E6E1D4] bg-white px-3 py-2 text-sm text-[#1A1A1A] placeholder:text-[#C0BAB0] focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]"
              disabled={busy}
            />
          </div>

          {/* SKU + Unit row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>SKU</FieldLabel>
              <input
                type="text"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="e.g. TPS25"
                className="w-full rounded-[8px] border border-[#E6E1D4] bg-white px-3 py-2 text-sm text-[#1A1A1A] placeholder:text-[#C0BAB0] focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]"
                disabled={busy}
              />
            </div>
            <div>
              <FieldLabel>Unit</FieldLabel>
              <input
                type="text"
                list="unit-presets"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="ea"
                className="w-full rounded-[8px] border border-[#E6E1D4] bg-white px-3 py-2 text-sm text-[#1A1A1A] placeholder:text-[#C0BAB0] focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]"
                disabled={busy}
              />
              <datalist id="unit-presets">
                {UNIT_PRESETS.map((u) => (
                  <option key={u} value={u} />
                ))}
              </datalist>
            </div>
          </div>

          {/* Cost + Sell row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel hint="ex-GST">Cost price</FieldLabel>
              <input
                type="number"
                step="0.01"
                min="0"
                value={costStr}
                onChange={(e) => setCostStr(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-[8px] border border-[#E6E1D4] bg-white px-3 py-2 text-sm text-[#1A1A1A] placeholder:text-[#C0BAB0] focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]"
                disabled={busy}
              />
            </div>
            <div>
              <FieldLabel hint="ex-GST">Sell price</FieldLabel>
              <input
                type="number"
                step="0.01"
                min="0"
                value={sellStr}
                onChange={(e) => setSellStr(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-[8px] border border-[#E6E1D4] bg-white px-3 py-2 text-sm text-[#1A1A1A] placeholder:text-[#C0BAB0] focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]"
                disabled={busy}
              />
              {(() => {
                const cost = costStr.trim() === "" ? null : Number(costStr);
                const floor = minSell(cost, minMarkup);
                if (floor === null) return null;
                const sell = sellStr.trim() === "" ? null : Number(sellStr);
                const below = isBelowFloor(sell, cost, minMarkup);
                return (
                  <p className={`mt-1 text-[11px] ${below ? "font-medium text-[#C8841E]" : "text-[#A0A0A0]"}`}>
                    Floor at this cost: ${floor.toFixed(2)}{below ? " — this sell price is below the minimum markup" : ""}
                  </p>
                );
              })()}
            </div>
          </div>

          {/* Group + Subgroup — the Catalogue tab tree */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>Group</FieldLabel>
              <input
                type="text"
                list="material-group-options"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g. Solar, Electrical"
                className="w-full rounded-[8px] border border-[#E6E1D4] bg-white px-3 py-2 text-sm text-[#1A1A1A] placeholder:text-[#C0BAB0] focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]"
                disabled={busy}
              />
              <datalist id="material-group-options">
                {groupOptions.map((c) => <option key={c} value={c} />)}
              </datalist>
            </div>
            <div>
              <FieldLabel>Subgroup</FieldLabel>
              <input
                type="text"
                list="material-subgroup-options"
                value={subcategory}
                onChange={(e) => setSubcategory(e.target.value)}
                placeholder="e.g. Panel, Cable"
                className="w-full rounded-[8px] border border-[#E6E1D4] bg-white px-3 py-2 text-sm text-[#1A1A1A] placeholder:text-[#C0BAB0] focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]"
                disabled={busy}
              />
              <datalist id="material-subgroup-options">
                {subgroupOptions.map((c) => <option key={c} value={c} />)}
              </datalist>
            </div>
          </div>

          {/* Favourite */}
          <label className="flex cursor-pointer items-center gap-2 text-sm text-[#3A3A3A]">
            <input
              type="checkbox"
              checked={isFavourite}
              onChange={(e) => setIsFavourite(e.target.checked)}
              className="h-4 w-4 accent-[#2F8F5C]"
              disabled={busy}
            />
            Mark as a favourite (shows in the quote's Favourites group)
          </label>

          {/* Stock */}
          <div className="rounded-[8px] border border-[#E6E1D4] bg-[#FAF8F2] p-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-[#3A3A3A]">
              <input
                type="checkbox"
                checked={isStockItem}
                onChange={(e) => setIsStockItem(e.target.checked)}
                className="h-4 w-4 accent-[#2F8F5C]"
                disabled={busy}
              />
              Held in stock
            </label>
            {isStockItem && (
              <p className="mt-2 text-[11px] text-[#A0A0A0]">
                Quantities are tracked per location (factory + vans) in the Stock area — set the opening count there with a stock-take.
              </p>
            )}
          </div>

          {/* Tags */}
          <div>
            <FieldLabel>Tags</FieldLabel>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {tagLibrary.map((tag) => {
                const active = selectedTags.includes(tag.name);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => toggleTag(tag.name)}
                    className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
                      active
                        ? "border-[#2F8F5C] bg-[#E5F2EA] text-[#246F47]"
                        : "border-[#E6E1D4] bg-white text-[#6B6B6B] hover:border-[#D8D2C4] hover:text-[#1A1A1A]"
                    }`}
                    disabled={busy}
                  >
                    {tag.name}
                  </button>
                );
              })}
            </div>
            {/* Free-add */}
            <div className="flex gap-2">
              <input
                type="text"
                value={freeTagInput}
                onChange={(e) => setFreeTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleFreeAddTag();
                  }
                }}
                placeholder="Add new tag..."
                className="flex-1 rounded-[8px] border border-[#E6E1D4] bg-white px-3 py-1.5 text-sm text-[#1A1A1A] placeholder:text-[#C0BAB0] focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]"
                disabled={busy || addingTag}
              />
              <button
                type="button"
                onClick={() => void handleFreeAddTag()}
                disabled={busy || addingTag || !freeTagInput.trim()}
                className="flex items-center gap-1 rounded-[8px] border border-[#E6E1D4] bg-white px-2.5 py-1.5 text-xs font-medium text-[#6B6B6B] transition-colors hover:bg-[#F0EDE4] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {addingTag ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Plus className="h-3.5 w-3.5" />
                )}
                Add
              </button>
            </div>
          </div>

          {/* Preferred supplier */}
          <div>
            <FieldLabel>Preferred supplier</FieldLabel>
            <select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className="w-full rounded-[8px] border border-[#E6E1D4] bg-white px-3 py-2 text-sm text-[#1A1A1A] focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]"
              disabled={busy}
            >
              <option value="">None</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* Description */}
          <div>
            <FieldLabel>Description</FieldLabel>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Optional notes..."
              className="w-full rounded-[8px] border border-[#E6E1D4] bg-white px-3 py-2 text-sm text-[#1A1A1A] placeholder:text-[#C0BAB0] focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C] resize-none"
              disabled={busy}
            />
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-[#E6E1D4] px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-full border border-[#E6E1D4] bg-white px-4 py-2 text-[13px] font-semibold text-[#3A3A3A] transition-colors hover:bg-[#FAF8F2] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="material-form"
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#2F8F5C] px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-[#246F47] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {isEdit ? "Save changes" : "Add material"}
          </button>
        </div>
      </div>
    </div>
  );
}

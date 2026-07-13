// ─────────────────────────────────────────────────────────────────────────────
// pages/catalogue/TemplatesTab.tsx
//
// Quote templates list + inline editor (modelled on PrebuildsTab).
//
// A template is a reusable job-type bundle whose items are a mix of:
//   • material  — catalogue material + qty
//   • prebuild  — a material prebuild bundle (expands as-is)
//   • labour    — a labour role + hours
// "Apply template" on a quote drops them all in. Save uses a simple
// delete-all-then-re-add reconcile (templates are small + edited rarely).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import { Plus, ChevronUp, ChevronDown, Trash2, RefreshCw, Loader2, Archive, ArchiveRestore } from "lucide-react";

import { cardShell, btnPrimary, btnGhost } from "../gantt/components/ledger";
import { SkeletonLine } from "../../components/ui/skeleton";
import { Toaster, type ToastState } from "../../components/ui/Toaster";

import { listMaterials, listPrebuilds, type Material, type Prebuild } from "../../lib/api/materials";
import { listLabourRates, formatRole, type LabourRate } from "../../lib/api/labourRates";
import {
  listTemplates,
  getTemplateWithItems,
  createTemplate,
  updateTemplate,
  setTemplateActive,
  deleteTemplate,
  addTemplateItem,
  removeTemplateItem,
  type QuoteTemplate,
  type QuoteTemplateWithItems,
  type QuoteTemplateItemKind,
} from "../../lib/api/quoteTemplates";
import ConfirmDeleteDialog from "./ConfirmDeleteDialog";

interface Props {
  onWritten: () => void;
}

interface LocalItem {
  id: string | null;
  kind: QuoteTemplateItemKind;
  materialId: string;
  materialName: string;
  unit: string;
  prebuildId: string;
  role: string;
  qty: number;
  tempKey: string;
}

let tempKeyCounter = 0;
function nextTempKey() {
  tempKeyCounter += 1;
  return `tmp-${tempKeyCounter}`;
}

const inputCls =
  "w-full rounded-[8px] border border-[#E6E1D4] bg-white px-3 py-1.5 text-sm text-[#1A1A1A] focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]";

// Colour-code the item kind so a template's mix of materials / prebuilds /
// labour reads at a glance.
const KIND_BADGE: Record<QuoteTemplateItemKind, string> = {
  material: "border-[#CBD8E6] bg-[#EEF3F8] text-[#3D6488]",
  prebuild: "border-[#EAD9B0] bg-[#F9EFD9] text-[#C8841E]",
  labour:   "border-[#B8DFC7] bg-[#E5F2EA] text-[#246F47]",
};

// ─── material picker (search dropdown) ─────────────────────────────────────────

function MaterialPicker({
  materials, value, onChange, disabled,
}: {
  materials: Material[];
  value: string;
  onChange: (id: string, name: string, unit: string) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
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
        className={inputCls}
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

export default function TemplatesTab({ onWritten }: Props) {
  const [templates, setTemplates]       = useState<QuoteTemplate[]>([]);
  const [allMaterials, setAllMaterials] = useState<Material[]>([]);
  const [allPrebuilds, setAllPrebuilds] = useState<Prebuild[]>([]);
  const [labourRates, setLabourRates]   = useState<LabourRate[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);

  const [selected, setSelected]     = useState<QuoteTemplateWithItems | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [isNew, setIsNew]           = useState(false);

  const [eName, setEName]   = useState("");
  const [eDesc, setEDesc]   = useState("");
  const [eCat, setECat]     = useState("");
  const [eItems, setEItems] = useState<LocalItem[]>([]);
  const [busy, setBusy]     = useState(false);
  const [editErr, setEditErr] = useState<string | null>(null);

  // Permanent-delete confirm (distinct from the reversible archive/deactivate).
  const [confirmDelete, setConfirmDelete] = useState<QuoteTemplate | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [toast, setToast] = useState<ToastState>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tpls, mats, pbs, rates] = await Promise.all([
        listTemplates(true),
        listMaterials({ includeInactive: false }),
        listPrebuilds(false),
        listLabourRates(false),
      ]);
      setTemplates(tpls);
      setAllMaterials(mats);
      setAllPrebuilds(pbs);
      setLabourRates(rates);
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
    setEName(""); setEDesc(""); setECat(""); setEItems([]);
    setEditErr(null);
    setEditorOpen(true);
  }

  async function openEdit(tpl: QuoteTemplate) {
    setBusy(true);
    try {
      const full = await getTemplateWithItems(tpl.id);
      if (!full) return;
      setSelected(full);
      setIsNew(false);
      setEName(full.name);
      setEDesc(full.description ?? "");
      setECat(full.category ?? "");
      setEItems(full.items.map((item) => {
        const mat = item.materialId ? allMaterials.find((m) => m.id === item.materialId) : undefined;
        return {
          id: item.id,
          kind: item.kind,
          materialId: item.materialId ?? "",
          materialName: mat?.name ?? "",
          unit: mat?.unit ?? "",
          prebuildId: item.prebuildId ?? "",
          role: item.role ?? "",
          qty: item.qty,
          tempKey: nextTempKey(),
        };
      }));
      setEditErr(null);
      setEditorOpen(true);
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : "Failed to load template", type: "error" });
    } finally {
      setBusy(false);
    }
  }

  function addItemRow(kind: QuoteTemplateItemKind) {
    setEItems((prev) => [
      ...prev,
      { id: null, kind, materialId: "", materialName: "", unit: "", prebuildId: "", role: "", qty: 1, tempKey: nextTempKey() },
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
      return arr;
    });
  }

  function patchItem(key: string, patch: Partial<LocalItem>) {
    setEItems((prev) => prev.map((i) => (i.tempKey === key ? { ...i, ...patch } : i)));
  }

  async function handleSave() {
    setEditErr(null);
    if (!eName.trim()) { setEditErr("Name is required."); return; }
    for (const it of eItems) {
      if (it.kind === "material" && !it.materialId) { setEditErr("Every material row needs a material."); return; }
      if (it.kind === "prebuild" && !it.prebuildId) { setEditErr("Every prebuild row needs a prebuild."); return; }
      if (it.kind === "labour" && !it.role) { setEditErr("Every labour row needs a role."); return; }
    }
    setBusy(true);
    try {
      const templateId = isNew
        ? (await createTemplate({ name: eName.trim(), category: eCat.trim() || null, description: eDesc.trim() || null })).id
        : selected!.id;

      if (!isNew && selected) {
        await updateTemplate(selected.id, {
          name: eName.trim(),
          category: eCat.trim() || null,
          description: eDesc.trim() || null,
        });
        // Simple reconcile: clear existing items, then re-add from the editor.
        for (const old of selected.items) await removeTemplateItem(old.id);
      }

      for (let i = 0; i < eItems.length; i++) {
        const it = eItems[i];
        await addTemplateItem({
          templateId,
          kind: it.kind,
          materialId: it.kind === "material" ? it.materialId : null,
          prebuildId: it.kind === "prebuild" ? it.prebuildId : null,
          role: it.kind === "labour" ? it.role : null,
          qty: it.kind === "prebuild" ? 1 : Math.max(0, it.qty),
          sortOrder: i,
        });
      }

      setToast({ message: isNew ? "Template created" : "Template saved", type: "success" });
      setEditorOpen(false);
      setSelected(null);
      void fetchAll();
      onWritten();
    } catch (err) {
      setEditErr(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleActive(tpl: QuoteTemplate) {
    try {
      await setTemplateActive(tpl.id, !tpl.isActive);
      setToast({
        message: tpl.isActive ? `"${tpl.name}" archived — restore anytime` : `"${tpl.name}" restored`,
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
      await deleteTemplate(confirmDelete.id);
      setToast({ message: `"${confirmDelete.name}" deleted`, type: "success" });
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
    <div className="grid gap-4 lg:grid-cols-[1fr_460px]">
      {/* ── List ─────────────────────────────────────────────────────────── */}
      <div className={`${cardShell} overflow-hidden`}>
        <div className="flex items-center justify-between border-b border-[#E6E1D4] px-4 py-3">
          <h2 className="text-[13px] font-semibold text-[#1A1A1A]">Job templates</h2>
          <button type="button" onClick={openNew} className={btnPrimary}>
            <Plus className="h-4 w-4" />
            New template
          </button>
        </div>

        {error && !loading && (
          <div className="flex items-center justify-between border-b border-[#F0BFBF] bg-[#FBE5E5] px-4 py-3">
            <p className="text-xs text-[#C44545]">{error}</p>
            <button type="button" onClick={() => void fetchAll()} className={btnGhost}>
              <RefreshCw className="h-3.5 w-3.5" />
              Retry
            </button>
          </div>
        )}

        <div className="divide-y divide-[#EFEBE0]">
          {loading && [1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <SkeletonLine className="w-40" />
              <SkeletonLine className="ml-auto w-16" />
            </div>
          ))}

          {!loading && templates.length === 0 && !error && (
            <p className="px-4 py-10 text-center text-sm text-[#A0A0A0]">
              No templates yet. Create one to bundle a job type&rsquo;s materials, prebuilds, and labour.
            </p>
          )}

          {!loading && templates.map((tpl) => (
            <div
              key={tpl.id}
              className={`flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[#FAF8F2] ${
                selected?.id === tpl.id && editorOpen ? "bg-[#F0EDE4]" : ""
              } ${!tpl.isActive ? "opacity-50" : ""}`}
            >
              <button type="button" onClick={() => void openEdit(tpl)} className="flex-1 text-left" disabled={busy}>
                <p className="font-medium text-[#1A1A1A]">{tpl.name}</p>
                {tpl.category && <p className="text-xs text-[#6B6B6B]">{tpl.category}</p>}
              </button>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                  tpl.isActive
                    ? "border-[#B8DFC7] bg-[#E5F2EA] text-[#246F47]"
                    : "border-[#E6E1D4] bg-[#F0EDE4] text-[#8A8378]"
                }`}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: tpl.isActive ? "#2F8F5C" : "#B6AE9F" }} />
                {tpl.isActive ? "Active" : "Archived"}
              </span>
              <button
                type="button"
                onClick={() => void handleToggleActive(tpl)}
                title={tpl.isActive ? "Archive (can be restored)" : "Restore"}
                aria-label={tpl.isActive ? "Archive template" : "Restore template"}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[#E6E1D4] bg-white text-[#6B6B6B] transition-colors hover:bg-[#FAF8F2] hover:text-[#1A1A1A]"
              >
                {tpl.isActive ? <Archive className="h-3.5 w-3.5" /> : <ArchiveRestore className="h-3.5 w-3.5" />}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(tpl)}
                title="Delete permanently"
                aria-label="Delete template"
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
        <div className={`${cardShell} flex flex-col overflow-hidden`}>
          <div className="border-b border-[#E6E1D4] px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#6B6B6B]">
              {isNew ? "NEW TEMPLATE" : "EDIT TEMPLATE"}
            </p>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
            {editErr && (
              <p className="rounded-md border border-[#F0BFBF] bg-[#FBE5E5] px-3 py-2 text-xs text-[#C44545]">{editErr}</p>
            )}

            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[#6B6B6B]">
                Name <span className="text-[#C44545]">*</span>
              </label>
              <input type="text" value={eName} onChange={(e) => setEName(e.target.value)} className={inputCls} disabled={busy} placeholder="e.g. 6.6kW Solar Install" />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[#6B6B6B]">Category</label>
              <input type="text" value={eCat} onChange={(e) => setECat(e.target.value)} className={inputCls} disabled={busy} placeholder="e.g. Solar, Switchboard, A/C" />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[#6B6B6B]">Description</label>
              <textarea value={eDesc} onChange={(e) => setEDesc(e.target.value)} rows={2} className={`${inputCls} resize-none`} disabled={busy} />
            </div>

            {/* Items */}
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <label className="mr-auto text-[11px] font-medium uppercase tracking-wider text-[#6B6B6B]">Items</label>
                <button type="button" onClick={() => addItemRow("material")} className={btnGhost} disabled={busy}>
                  <Plus className="h-3.5 w-3.5" /> Material
                </button>
                <button type="button" onClick={() => addItemRow("prebuild")} className={btnGhost} disabled={busy}>
                  <Plus className="h-3.5 w-3.5" /> Prebuild
                </button>
                <button type="button" onClick={() => addItemRow("labour")} className={btnGhost} disabled={busy}>
                  <Plus className="h-3.5 w-3.5" /> Labour
                </button>
              </div>

              {eItems.length === 0 && (
                <p className="py-2 text-xs text-[#A0A0A0]">No items yet. Add materials, prebuilds, or labour.</p>
              )}

              <div className="space-y-2">
                {eItems.map((item, idx) => (
                  <div key={item.tempKey} className="flex items-start gap-2 rounded-[8px] border border-[#E6E1D4] bg-[#FAF8F2] px-3 py-2">
                    <div className="flex flex-col gap-0.5 pt-1">
                      <button type="button" onClick={() => moveItem(item.tempKey, -1)} disabled={idx === 0 || busy} className="text-[#C0BAB0] hover:text-[#6B6B6B] disabled:opacity-30">
                        <ChevronUp className="h-3 w-3" />
                      </button>
                      <button type="button" onClick={() => moveItem(item.tempKey, 1)} disabled={idx === eItems.length - 1 || busy} className="text-[#C0BAB0] hover:text-[#6B6B6B] disabled:opacity-30">
                        <ChevronDown className="h-3 w-3" />
                      </button>
                    </div>

                    <div className="flex-1 space-y-1.5">
                      <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${KIND_BADGE[item.kind]}`}>
                        {item.kind}
                      </span>
                      {item.kind === "material" && (
                        <div className="flex items-center gap-2">
                          <div className="flex-1">
                            <MaterialPicker
                              materials={allMaterials}
                              value={item.materialId}
                              onChange={(id, name, unit) => patchItem(item.tempKey, { materialId: id, materialName: name, unit })}
                              disabled={busy}
                            />
                          </div>
                          <input type="number" step="0.25" min="0" value={item.qty} onChange={(e) => patchItem(item.tempKey, { qty: Number(e.target.value) })} className="w-16 rounded-[8px] border border-[#E6E1D4] bg-white px-2 py-1.5 text-right text-sm" disabled={busy} />
                          <span className="w-8 text-xs text-[#A0A0A0]">{item.unit || "ea"}</span>
                        </div>
                      )}
                      {item.kind === "prebuild" && (
                        <select value={item.prebuildId} onChange={(e) => patchItem(item.tempKey, { prebuildId: e.target.value })} className={inputCls} disabled={busy}>
                          <option value="">Select a prebuild...</option>
                          {allPrebuilds.map((pb) => <option key={pb.id} value={pb.id}>{pb.name}</option>)}
                        </select>
                      )}
                      {item.kind === "labour" && (
                        <div className="flex items-center gap-2">
                          <select value={item.role} onChange={(e) => patchItem(item.tempKey, { role: e.target.value })} className={`${inputCls} flex-1`} disabled={busy}>
                            <option value="">Select a role...</option>
                            {labourRates.map((r) => <option key={r.id} value={r.role}>{formatRole(r.role)}</option>)}
                          </select>
                          <input type="number" step="0.25" min="0" value={item.qty} onChange={(e) => patchItem(item.tempKey, { qty: Number(e.target.value) })} className="w-16 rounded-[8px] border border-[#E6E1D4] bg-white px-2 py-1.5 text-right text-sm" disabled={busy} />
                          <span className="w-8 text-xs text-[#A0A0A0]">hr</span>
                        </div>
                      )}
                    </div>

                    <button type="button" onClick={() => removeItemRow(item.tempKey)} disabled={busy} className="pt-1 text-[#C0BAB0] transition-colors hover:text-[#C44545] disabled:opacity-30">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center gap-2 border-t border-[#E6E1D4] px-4 py-3">
            {!isNew && selected && (
              <button
                type="button"
                onClick={() => setConfirmDelete(selected)}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#E6E1D4] bg-white px-3 py-2 text-[13px] font-semibold text-[#6B6B6B] transition-colors hover:border-[#F0BFBF] hover:bg-[#FBE5E5] hover:text-[#C44545] disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </button>
            )}
            <button type="button" onClick={() => { setEditorOpen(false); setSelected(null); }} disabled={busy} className={btnGhost + " ml-auto"}>
              Cancel
            </button>
            <button type="button" onClick={() => void handleSave()} disabled={busy} className={btnPrimary}>
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Save
            </button>
          </div>
        </div>
      )}

      {confirmDelete && (
        <ConfirmDeleteDialog
          name={confirmDelete.name}
          noun="template"
          busy={deleting}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => void handleDelete()}
          onArchiveInstead={
            confirmDelete.isActive
              ? () => { const tpl = confirmDelete; setConfirmDelete(null); void handleToggleActive(tpl); }
              : undefined
          }
        />
      )}

      {toast && <Toaster message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

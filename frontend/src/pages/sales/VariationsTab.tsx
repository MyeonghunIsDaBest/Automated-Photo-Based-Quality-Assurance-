// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// pages/sales/VariationsTab.tsx â€” status chips, queue table, inline editor.
//
// Status chips: Draft / Priced / Approved / Declined
// Editor panel: inline (not full-sheet). Context picker (job OR project),
// title/description, line items (three add modes â€” lean local impl), totals,
// status actions.
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, RefreshCw, Search, Package, Trash2, X, Printer, Send } from "lucide-react";

import { FRAUNCES, TONE, cardShell, btnPrimary, btnGhost } from "../gantt/components/ledger";
import { SkeletonLine } from "../../components/ui/skeleton";
import { Toaster, type ToastState } from "../../components/ui/Toaster";
import MotionDrawer from "../../components/ui/MotionDrawer";
import { lineTotal } from "../../lib/commercial/money";
import { fmtMoney } from "../../lib/format";

import {
  listVariations,
  getVariation,
  createVariation,
  addVariationItemFromMaterial,
  addVariationItemFromPrebuild,
  addVariationItemFree,
  updateVariationItem,
  removeVariationItem,
  priceVariation,
  sendVariation,
  approveVariation,
  declineVariation,
  type Variation,
  type VariationItem,
  type VariationStatus,
} from "../../lib/api/commercial";
import { listMaterials, listPrebuilds, type Material, type Prebuild } from "../../lib/api/materials";
import { listServiceJobs, type ServiceJob } from "../../lib/api/serviceJobs";
import { listProjects, type ProjectRow } from "../../lib/api/projects";

// â”€â”€â”€ types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type AddMode = "catalogue" | "prebuild" | "free" | null;

interface Props {
  onChanged: () => void;
  /** Deep-link from a job ("Add variation") — opens the create modal prefilled. */
  initialJobId?: string | null;
  /** Called once the deep link has been used, so the parent clears the seed. */
  onJobSeedConsumed?: () => void;
}

// â”€â”€â”€ helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function stripSearchChars(s: string): string {
  return s.replace(/[*,()/]/g, "");
}

function ageLabel(createdAt: string): string {
  const ms   = Date.now() - new Date(createdAt).getTime();
  const days = Math.floor(ms / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30)  return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

// â”€â”€â”€ status tokens â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const STATUS_TONE: Record<VariationStatus, keyof typeof TONE> = {
  draft:    "ink",
  priced:   "amber",
  sent:     "slate",
  approved: "sage",
  declined: "red",
};

const STATUS_LABELS: Record<VariationStatus, string> = {
  draft:    "Draft",
  priced:   "Priced",
  sent:     "Sent",
  approved: "Accepted",
  declined: "Declined",
};

const ALL_STATUSES: VariationStatus[] = ["draft", "priced", "sent", "approved", "declined"];

// â”€â”€â”€ NumCell (inline edit) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€â”€ SkeletonRow â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function SkeletonRow() {
  return (
    <tr className="border-b border-[#EFEBE0]">
      {[180, 140, 100, 80, 60].map((w, i) => (
        <td key={i} className="px-4 py-3">
          <SkeletonLine style={{ width: w }} />
        </td>
      ))}
    </tr>
  );
}

// â”€â”€â”€ New variation modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function NewVariationModal({
  jobs,
  projects,
  initialJob = null,
  onConfirm,
  onClose,
}: {
  jobs: ServiceJob[];
  projects: ProjectRow[];
  /** Prefill the job context (the on-site "Add variation" deep link). */
  initialJob?: string | null;
  onConfirm: (title: string, contextType: "job" | "project" | "none", contextId: string | null) => Promise<void>;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [contextType, setContextType] = useState<"job" | "project" | "none">(initialJob ? "job" : "none");
  const [contextId, setContextId] = useState(initialJob ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setErr("A title is required."); return; }
    setSaving(true);
    setErr(null);
    try {
      await onConfirm(
        title.trim(),
        contextType,
        contextType !== "none" ? (contextId || null) : null,
      );
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Failed to create variation.");
      setSaving(false);
    }
  }

  return (
    <MotionDrawer open onClose={() => { if (!saving) onClose(); }} variant="modal" ariaLabel="New variation" sizeClass="max-w-md">
      <div className="flex items-center justify-between border-b border-[#E6E1D4] px-6 py-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[#6B6B6B]">Sales &middot; Variations</p>
          <h2 className="mt-1 text-lg font-medium text-[#1A1A1A]">New variation</h2>
        </div>
        <button type="button" onClick={onClose} disabled={saving} className="rounded-md p-2 text-[#A0A0A0] hover:bg-[#F0EDE4]">
          <X className="h-5 w-5" />
        </button>
      </div>
      <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4 px-6 py-5">
        <div>
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[#6B6B6B]">
            Title <span className="text-[#C44545]">*</span>
          </label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={saving}
            placeholder="e.g. Additional GPO â€” bedroom wall"
            className="w-full rounded-md border border-[#E6E1D4] px-3 py-2 text-sm focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C] disabled:opacity-50"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-[#6B6B6B]">Link to (optional)</label>
          <div className="mb-2 flex gap-2">
            {(["none", "job", "project"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => { setContextType(t); setContextId(""); }}
                disabled={saving}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  contextType === t
                    ? "border-[#1A1A1A] bg-[#1A1A1A] text-white"
                    : "border-[#E6E1D4] text-[#6B6B6B] hover:border-[#D8D2C4]"
                }`}
              >
                {t === "none" ? "None" : t === "job" ? "Service job" : "Project"}
              </button>
            ))}
          </div>
          {contextType === "job" && (
            <select
              value={contextId}
              onChange={(e) => setContextId(e.target.value)}
              disabled={saving}
              className="w-full rounded-md border border-[#E6E1D4] px-3 py-2 text-sm focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C] disabled:opacity-50"
            >
              <option value="">No job selected</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>{j.title}</option>
              ))}
            </select>
          )}
          {contextType === "project" && (
            <select
              value={contextId}
              onChange={(e) => setContextId(e.target.value)}
              disabled={saving}
              className="w-full rounded-md border border-[#E6E1D4] px-3 py-2 text-sm focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C] disabled:opacity-50"
            >
              <option value="">No project selected</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}
        </div>
        {err && (
          <p className="rounded-md border border-[#F0BFBF] bg-[#FBE5E5] px-3 py-2 text-xs text-[#C44545]">{err}</p>
        )}
        <div className="flex items-center justify-end gap-2 border-t border-[#E6E1D4] pt-4">
          <button type="button" onClick={onClose} disabled={saving} className={btnGhost}>Cancel</button>
          <button type="submit" disabled={saving} className={btnPrimary}>
            {saving ? "Creating..." : "Create variation"}
          </button>
        </div>
      </form>
    </MotionDrawer>
  );
}

// â”€â”€â”€ Variation editor panel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function VariationEditorPanel({
  variationId,
  jobs,
  projects,
  onClose,
  onChanged,
  onToast,
}: {
  variationId: string;
  jobs: ServiceJob[];
  projects: ProjectRow[];
  onClose: () => void;
  onChanged: () => void;
  onToast: (t: ToastState) => void;
}) {
  const [variation, setVariation] = useState<Variation | null>(null);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [addMode, setAddMode]     = useState<AddMode>(null);

  // Catalogue
  const [catSearch, setCatSearch] = useState("");
  const [catResults, setCatResults] = useState<Material[]>([]);
  const catDebRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [addingMat, setAddingMat] = useState(false);

  // Prebuild
  const [prebuilds, setPrebuilds] = useState<Prebuild[]>([]);
  const [prebuildId, setPrebuildId] = useState("");
  const [addingPb, setAddingPb]   = useState(false);

  // Free
  const [freeDesc, setFreeDesc]   = useState("");
  const [freeQty, setFreeQty]     = useState("1");
  const [freeUnit, setFreeUnit]   = useState("ea");
  const [freePrice, setFreePrice] = useState("0");
  const [addingFree, setAddingFree] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const v = await getVariation(variationId);
      setVariation(v);
    } catch (ex) {
      onToast({ message: ex instanceof Error ? ex.message : "Failed to load variation", type: "error" });
    } finally {
      setLoading(false);
    }
  }, [variationId, onToast]);

  useEffect(() => { void load(); }, [load]);

  // Catalogue debounce
  useEffect(() => {
    if (addMode !== "catalogue") return;
    if (catDebRef.current) clearTimeout(catDebRef.current);
    catDebRef.current = setTimeout(async () => {
      const q = stripSearchChars(catSearch.trim());
      try {
        const mats = await listMaterials({ search: q || undefined });
        // Stock-first ordering: stocked items surface before one-offs.
        setCatResults([...mats].sort((a, b) => Number(b.isStockItem) - Number(a.isStockItem)).slice(0, 12));
      } catch { setCatResults([]); }
    }, 300);
    return () => { if (catDebRef.current) clearTimeout(catDebRef.current); };
  }, [catSearch, addMode]);

  // Prebuild list once
  useEffect(() => {
    if (addMode !== "prebuild" || prebuilds.length > 0) return;
    listPrebuilds().then(setPrebuilds).catch(() => {});
  }, [addMode, prebuilds.length]);

  async function handleItemUpdate(item: VariationItem, patch: { qty?: number; unitPriceExGst?: number }) {
    setSaving(true);
    try {
      await updateVariationItem(item.id, variationId, patch);
      await load();
      onChanged();
    } catch (ex) {
      onToast({ message: ex instanceof Error ? ex.message : "Save failed", type: "error" });
    } finally { setSaving(false); }
  }

  async function handleRemoveItem(item: VariationItem) {
    setSaving(true);
    try {
      await removeVariationItem(item.id, variationId);
      await load();
      onChanged();
    } catch (ex) {
      onToast({ message: ex instanceof Error ? ex.message : "Remove failed", type: "error" });
    } finally { setSaving(false); }
  }

  async function handleAddFromMaterial(mat: Material) {
    setAddingMat(true);
    try {
      await addVariationItemFromMaterial(variationId, mat.id, 1);
      setAddMode(null); setCatSearch(""); setCatResults([]);
      await load(); onChanged();
    } catch (ex) {
      onToast({ message: ex instanceof Error ? ex.message : "Failed to add item", type: "error" });
    } finally { setAddingMat(false); }
  }

  async function handleAddPrebuild() {
    if (!prebuildId) return;
    setAddingPb(true);
    try {
      await addVariationItemFromPrebuild(variationId, prebuildId);
      setAddMode(null); setPrebuildId("");
      await load(); onChanged();
    } catch (ex) {
      onToast({ message: ex instanceof Error ? ex.message : "Failed to add prebuild", type: "error" });
    } finally { setAddingPb(false); }
  }

  async function handleAddFree(e: React.FormEvent) {
    e.preventDefault();
    setAddingFree(true);
    try {
      await addVariationItemFree(variationId, {
        description: freeDesc,
        qty: parseFloat(freeQty) || 1,
        unit: freeUnit,
        unitPriceExGst: parseFloat(freePrice) || 0,
      });
      setAddMode(null);
      setFreeDesc(""); setFreeQty("1"); setFreeUnit("ea"); setFreePrice("0");
      await load(); onChanged();
    } catch (ex) {
      onToast({ message: ex instanceof Error ? ex.message : "Failed to add line", type: "error" });
    } finally { setAddingFree(false); }
  }

  async function handleAction(action: "price" | "send" | "approve" | "decline") {
    setSaving(true);
    try {
      if (action === "price") {
        await priceVariation(variationId);
        onToast({ message: "Variation marked as priced.", type: "success" });
      } else if (action === "send") {
        await sendVariation(variationId);
        onToast({ message: "Marked sent — show or email the printed variation to the customer.", type: "success" });
      } else if (action === "approve") {
        await approveVariation(variationId);
        onToast({
          message: variation?.serviceJobId
            ? "Accepted — folded into the job as a cost centre; it'll be on the invoice created from this job."
            : "Accepted.",
          type: "success",
        });
      } else {
        await declineVariation(variationId);
        onToast({ message: "Variation declined.", type: "info" });
      }
      await load();
      onChanged();
    } catch (ex) {
      onToast({ message: ex instanceof Error ? ex.message : "Action failed", type: "error" });
    } finally { setSaving(false); }
  }

  // Quote-format print sheet (mirrors the PO print pattern) — show/email on site.
  function printVariation() {
    if (!variation) return;
    const rows = items.map((i) => `
      <tr>
        <td>${i.description.replace(/</g, "&lt;")}</td>
        <td class="num">${i.qty}</td>
        <td class="num">${fmtMoney(i.unitPriceExGst)}</td>
        <td class="num">${fmtMoney(i.qty * i.unitPriceExGst)}</td>
      </tr>`).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Variation — ${variation.title.replace(/</g, "&lt;")}</title>
      <style>
        body { font-family: Georgia, serif; color: #1A1A1A; margin: 40px; }
        h1 { font-size: 22px; margin: 0 0 2px; } .muted { color: #6B6B6B; font-size: 13px; }
        p.desc { margin-top: 14px; white-space: pre-wrap; font-size: 14px; }
        table { width: 100%; border-collapse: collapse; margin-top: 18px; font-size: 14px; }
        th { text-align: left; border-bottom: 1px solid #999; padding: 6px 8px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; }
        td { border-bottom: 1px solid #E6E1D4; padding: 7px 8px; }
        .num { text-align: right; font-variant-numeric: tabular-nums; }
        tfoot td { border-bottom: none; font-weight: bold; }
      </style></head><body>
      <h1>Variation — ${variation.title.replace(/</g, "&lt;")}</h1>
      <p class="muted">Casone Electrical · ${contextLabel.replace(/</g, "&lt;")} · ${new Date().toLocaleDateString()}</p>
      ${variation.description ? `<p class="desc">${variation.description.replace(/</g, "&lt;")}</p>` : ""}
      <table>
        <thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Unit</th><th class="num">Total</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr><td colspan="3" class="num">Subtotal (ex GST)</td><td class="num">${fmtMoney(variation.subtotalExGst)}</td></tr>
          <tr><td colspan="3" class="num">GST</td><td class="num">${fmtMoney(variation.gstAmount)}</td></tr>
          <tr><td colspan="3" class="num">Total (inc GST)</td><td class="num">${fmtMoney(variation.totalIncGst)}</td></tr>
        </tfoot>
      </table>
      </body></html>`;
    const w = window.open("", "_blank", "width=800,height=900");
    if (!w) { onToast({ message: "Allow pop-ups to print the variation.", type: "error" }); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  }

  const contextLabel = variation
    ? variation.serviceJobId
      ? ("Job: " + (jobs.find((j) => j.id === variation.serviceJobId)?.title ?? variation.serviceJobId))
      : variation.projectId
      ? ("Project: " + (projects.find((p) => p.id === variation.projectId)?.name ?? variation.projectId))
      : "No context"
    : "";

  const items = variation?.items ?? [];
  const isLocked = variation?.status === "approved" || variation?.status === "declined";
  const statusTone = variation ? TONE[STATUS_TONE[variation.status]] : TONE.ink;

  return (
    <div className="border-t border-[#E6E1D4] bg-[#FAF8F2] p-5">
      {/* Panel header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          {loading
            ? <SkeletonLine className="w-48" />
            : (
              <>
                <p
                  className="text-[16px] font-medium text-[#1A1A1A]"
                  style={{ fontFamily: FRAUNCES }}
                >
                  {variation?.title ?? "Variation"}
                </p>
                {contextLabel && (
                  <p className="text-[11px] text-[#A0A0A0]">{contextLabel}</p>
                )}
              </>
            )
          }
        </div>
        <button type="button" onClick={onClose} className="text-[#A0A0A0] hover:text-[#C44545]">
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Line items table */}
      <div className="mb-4 overflow-x-auto rounded-[10px] border border-[#E6E1D4] bg-white">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-[#E6E1D4] bg-[#FAF8F2]">
              <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Description</th>
              <th className="w-20 px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Qty</th>
              <th className="w-16 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Unit</th>
              <th className="w-28 px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Unit price</th>
              <th className="w-28 px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Line total</th>
              {!isLocked && <th className="w-10 px-3 py-2" aria-label="Actions" />}
            </tr>
          </thead>
          <tbody>
            {loading && [1, 2].map((i) => (
              <tr key={i} className="border-b border-[#EFEBE0]">
                {[180, 60, 60, 80, 80, 40].map((w, j) => (
                  <td key={j} className="px-3 py-2.5"><SkeletonLine style={{ width: w }} /></td>
                ))}
              </tr>
            ))}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-xs text-[#A0A0A0]">No line items yet.</td>
              </tr>
            )}
            {!loading && items.map((item) => {
              const lt = lineTotal({ qty: item.qty, unitPriceExGst: item.unitPriceExGst });
              return (
                <tr key={item.id} className="border-b border-[#EFEBE0] hover:bg-[#FAF8F2]">
                  <td className="px-3 py-2.5 text-[#1A1A1A]">{item.description}</td>
                  <td className="px-3 py-2.5 text-right">
                    {isLocked
                      ? <span className="tabular-nums">{item.qty}</span>
                      : <NumCell value={item.qty} disabled={saving} onCommit={(v) => void handleItemUpdate(item, { qty: v })} />
                    }
                  </td>
                  <td className="px-3 py-2.5 text-[#6B6B6B]">{item.unit}</td>
                  <td className="px-3 py-2.5 text-right">
                    {isLocked
                      ? <span className="tabular-nums">{fmtMoney(item.unitPriceExGst)}</span>
                      : <NumCell value={item.unitPriceExGst} disabled={saving} onCommit={(v) => void handleItemUpdate(item, { unitPriceExGst: v })} />
                    }
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-medium text-[#1A1A1A]">{fmtMoney(lt)}</td>
                  {!isLocked && (
                    <td className="px-3 py-2.5">
                      <button type="button" disabled={saving} onClick={() => void handleRemoveItem(item)} className="text-[#C0BAB0] hover:text-[#C44545] disabled:opacity-40" aria-label="Remove line">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Add row controls */}
      {!isLocked && !loading && (
        <div className="mb-4">
          {addMode === null && (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setAddMode("catalogue")} className={btnGhost}>
                <Search className="h-4 w-4" /> From catalogue
              </button>
              <button type="button" onClick={() => setAddMode("prebuild")} className={btnGhost}>
                <Package className="h-4 w-4" /> From prebuild
              </button>
              <button type="button" onClick={() => setAddMode("free")} className={btnGhost}>
                <Plus className="h-4 w-4" /> Free line
              </button>
            </div>
          )}

          {addMode === "catalogue" && (
            <div className="rounded-[10px] border border-[#E6E1D4] bg-white p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#6B6B6B]">Search catalogue</p>
                <button type="button" onClick={() => { setAddMode(null); setCatSearch(""); setCatResults([]); }} className="text-xs text-[#A0A0A0] hover:text-[#C44545]">Cancel</button>
              </div>
              <input
                autoFocus
                value={catSearch}
                onChange={(e) => setCatSearch(e.target.value)}
                placeholder="Type to search materials..."
                className="w-full rounded-md border border-[#E6E1D4] bg-white px-3 py-2 text-sm focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]"
              />
              {catResults.length > 0 && (
                <ul className="mt-2 divide-y divide-[#EFEBE0] rounded-md border border-[#E6E1D4] bg-white">
                  {catResults.map((mat) => (
                    <li key={mat.id}>
                      <button type="button" disabled={addingMat} onClick={() => void handleAddFromMaterial(mat)} className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm hover:bg-[#FAF8F2] disabled:opacity-50">
                        <span className="font-medium text-[#1A1A1A]">{mat.name}</span>
                        <span className="ml-2 tabular-nums text-[#6B6B6B]">{mat.sellPrice != null ? fmtMoney(mat.sellPrice) : "â€”"} / {mat.unit}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {catSearch.length > 0 && catResults.length === 0 && (
                <p className="mt-2 text-xs text-[#A0A0A0]">No materials match.</p>
              )}
            </div>
          )}

          {addMode === "prebuild" && (
            <div className="rounded-[10px] border border-[#E6E1D4] bg-white p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#6B6B6B]">Pick a prebuild bundle</p>
                <button type="button" onClick={() => { setAddMode(null); setPrebuildId(""); }} className="text-xs text-[#A0A0A0] hover:text-[#C44545]">Cancel</button>
              </div>
              <div className="flex gap-2">
                <select value={prebuildId} onChange={(e) => setPrebuildId(e.target.value)} className="flex-1 rounded-md border border-[#E6E1D4] bg-white px-3 py-2 text-sm focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]">
                  <option value="">Select a prebuild...</option>
                  {prebuilds.map((pb) => (
                    <option key={pb.id} value={pb.id}>{pb.name}</option>
                  ))}
                </select>
                <button type="button" onClick={() => void handleAddPrebuild()} disabled={!prebuildId || addingPb} className={btnPrimary}>
                  {addingPb ? "Adding..." : "Add bundle"}
                </button>
              </div>
            </div>
          )}

          {addMode === "free" && (
            <form onSubmit={(e) => void handleAddFree(e)} className="rounded-[10px] border border-[#E6E1D4] bg-white p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#6B6B6B]">Free line item</p>
                <button type="button" onClick={() => setAddMode(null)} className="text-xs text-[#A0A0A0] hover:text-[#C44545]">Cancel</button>
              </div>
              <div className="flex flex-wrap gap-2">
                <input autoFocus required value={freeDesc} onChange={(e) => setFreeDesc(e.target.value)} placeholder="Description" className="flex-[3] min-w-[140px] rounded-md border border-[#E6E1D4] bg-white px-3 py-2 text-sm focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]" />
                <input type="number" min="0" step="any" value={freeQty} onChange={(e) => setFreeQty(e.target.value)} placeholder="Qty" className="w-16 rounded-md border border-[#E6E1D4] bg-white px-3 py-2 text-sm focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]" />
                <input value={freeUnit} onChange={(e) => setFreeUnit(e.target.value)} placeholder="Unit" className="w-16 rounded-md border border-[#E6E1D4] bg-white px-3 py-2 text-sm focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]" />
                <input type="number" min="0" step="any" value={freePrice} onChange={(e) => setFreePrice(e.target.value)} placeholder="Price ex GST" className="w-32 rounded-md border border-[#E6E1D4] bg-white px-3 py-2 text-sm focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]" />
                <button type="submit" disabled={addingFree} className={btnPrimary}>{addingFree ? "Adding..." : "Add line"}</button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Totals */}
      {variation && (
        <div className="mb-4 flex justify-end">
          <div className="w-full max-w-xs space-y-1">
            <div className="flex items-center justify-between text-sm text-[#6B6B6B]">
              <span>Subtotal (ex GST)</span>
              <span className="tabular-nums">{fmtMoney(variation.subtotalExGst)}</span>
            </div>
            <div className="flex items-center justify-between text-sm text-[#6B6B6B]">
              <span>GST</span>
              <span className="tabular-nums">{fmtMoney(variation.gstAmount)}</span>
            </div>
            <div className="flex items-center justify-between border-t border-[#E6E1D4] pt-2 text-base font-semibold text-[#1A1A1A]">
              <span>Total (inc GST)</span>
              <span className="tabular-nums" style={{ fontFamily: FRAUNCES }}>{fmtMoney(variation.totalIncGst)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Status action bar */}
      {variation && (
        <div className="flex flex-wrap items-center gap-3 border-t border-[#EFEBE0] pt-4">
          <span
            className="inline-flex rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em]"
            style={{ backgroundColor: statusTone.bg, color: statusTone.fg }}
          >
            {STATUS_LABELS[variation.status]}
          </span>
          <div className="ml-auto flex flex-wrap gap-2">
            {(variation.status === "priced" || variation.status === "sent") && (
              <button type="button" onClick={printVariation} className={btnGhost}>
                <Printer className="h-4 w-4" /> Print
              </button>
            )}
            {variation.status === "draft" && (
              <button type="button" disabled={saving} onClick={() => void handleAction("price")} className={btnPrimary}>
                Mark priced
              </button>
            )}
            {variation.status === "priced" && (
              <>
                <button type="button" disabled={saving} onClick={() => void handleAction("send")} className={btnPrimary}>
                  <Send className="h-4 w-4" /> Send to customer
                </button>
                <button type="button" disabled={saving} onClick={() => void handleAction("decline")} className={btnGhost}>
                  Decline
                </button>
              </>
            )}
            {variation.status === "sent" && (
              <>
                <button type="button" disabled={saving} onClick={() => void handleAction("approve")} className={btnPrimary}>
                  Mark accepted
                </button>
                <button type="button" disabled={saving} onClick={() => void handleAction("decline")} className={btnGhost}>
                  Declined by customer
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// â”€â”€â”€ component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function VariationsTab({ onChanged, initialJobId = null, onJobSeedConsumed }: Props) {
  const [variations, setVariations] = useState<Variation[]>([]);
  const [jobs, setJobs]             = useState<ServiceJob[]>([]);
  const [projects, setProjects]     = useState<ProjectRow[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<VariationStatus | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);
  // Job the create modal opens prefilled with (held locally so consuming the
  // parent's one-shot seed doesn't blank the modal while it's open).
  const [modalJobSeed, setModalJobSeed] = useState<string | null>(null);
  const [toast, setToast]           = useState<ToastState>(null);
  const contextLoaded               = useRef(false);

  const fetchVariations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listVariations(statusFilter ? { status: statusFilter } : undefined);
      setVariations(data);
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : "Failed to load variations");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { void fetchVariations(); }, [fetchVariations]);

  // Deep-link from a job ("Add variation"): open the create modal prefilled,
  // then consume the seed so it can't re-trigger (tab switches, remounts).
  useEffect(() => {
    if (initialJobId) {
      setModalJobSeed(initialJobId);
      setShowNewModal(true);
      onJobSeedConsumed?.();
    }
  }, [initialJobId, onJobSeedConsumed]);

  // Any close path clears the prefill so a manual "New variation" starts clean.
  useEffect(() => { if (!showNewModal) setModalJobSeed(null); }, [showNewModal]);

  useEffect(() => {
    if (contextLoaded.current) return;
    contextLoaded.current = true;
    Promise.all([listServiceJobs(), listProjects()])
      .then(([j, p]) => { setJobs(j); setProjects(p); })
      .catch(() => {});
  }, []);

  async function handleCreate(
    title: string,
    contextType: "job" | "project" | "none",
    contextId: string | null,
  ) {
    const v = await createVariation({
      title,
      serviceJobId: contextType === "job" ? (contextId ?? undefined) : undefined,
      projectId:    contextType === "project" ? (contextId ?? undefined) : undefined,
    });
    setShowNewModal(false);
    setToast({ message: "Variation created", type: "success" });
    void fetchVariations();
    onChanged();
    setSelectedId(v.id);
  }

  const contextOf = (v: Variation): string => {
    if (v.serviceJobId) {
      const j = jobs.find((x) => x.id === v.serviceJobId);
      return j ? j.title : "Job";
    }
    if (v.projectId) {
      const p = projects.find((x) => x.id === v.projectId);
      return p ? p.name : "Project";
    }
    return "â€”";
  };

  return (
    <div className={`${cardShell} overflow-hidden`}>
      {/* â”€â”€ Toolbar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="flex flex-wrap items-center gap-3 border-b border-[#E6E1D4] px-4 py-3">
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setStatusFilter(null)}
            className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
              statusFilter === null
                ? "border-[#1A1A1A] bg-[#1A1A1A] text-white"
                : "border-[#E6E1D4] bg-white text-[#6B6B6B] hover:border-[#D8D2C4]"
            }`}
          >
            All
          </button>
          {ALL_STATUSES.map((s) => {
            const t = TONE[STATUS_TONE[s]];
            const active = statusFilter === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(statusFilter === s ? null : s)}
                className="rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors"
                style={active
                  ? { borderColor: t.dot, backgroundColor: t.bg, color: t.fg }
                  : { borderColor: "#E6E1D4", backgroundColor: "white", color: "#6B6B6B" }
                }
              >
                {STATUS_LABELS[s]}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => setShowNewModal(true)}
          className={btnPrimary + " ml-auto"}
        >
          <Plus className="h-4 w-4" />
          New variation
        </button>
      </div>

      {/* â”€â”€ Error â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {error && !loading && (
        <div className="flex items-center justify-between border-b border-[#F0BFBF] bg-[#FBE5E5] px-4 py-3">
          <p className="text-xs text-[#C44545]">{error}</p>
          <button type="button" onClick={() => void fetchVariations()} className={btnGhost + " py-1 px-3 text-xs"}>
            <RefreshCw className="h-3.5 w-3.5" /> Retry
          </button>
        </div>
      )}

      {/* â”€â”€ Table â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-[#E6E1D4] bg-[#FAF8F2]">
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Title</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Job / Project</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Raised by</th>
              <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Total inc GST</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Status</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Age</th>
            </tr>
          </thead>
          <tbody>
            {loading && [1, 2, 3].map((i) => <SkeletonRow key={i} />)}

            {!loading && variations.length === 0 && !error && (
              <tr>
                <td colSpan={6} className="px-4 py-16 text-center text-[#A0A0A0]">
                  <p className="text-sm font-medium">No variations yet</p>
                  <p className="mt-1 text-xs">
                    {statusFilter ? "Try adjusting the status filter." : "Raise a variation to track scope changes."}
                  </p>
                </td>
              </tr>
            )}

            {!loading && variations.map((v) => {
              const tone = TONE[STATUS_TONE[v.status]];
              const isSelected = selectedId === v.id;
              return (
                <tr
                  key={v.id}
                  className={`border-b border-[#EFEBE0] cursor-pointer transition-colors ${isSelected ? "bg-[#F0EDE4]" : "hover:bg-[#FAF8F2]"}`}
                  onClick={() => setSelectedId(isSelected ? null : v.id)}
                >
                  <td className="px-4 py-3 font-medium text-[#1A1A1A]">{v.title}</td>
                  <td className="px-4 py-3 text-[#6B6B6B]">{contextOf(v)}</td>
                  <td className="px-4 py-3 text-[#6B6B6B] font-mono text-xs">{v.raisedBy.slice(0, 8)}â€¦</td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium text-[#1A1A1A]">{fmtMoney(v.totalIncGst)}</td>
                  <td className="px-4 py-3">
                    <span
                      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
                      style={{ backgroundColor: tone.bg, color: tone.fg }}
                    >
                      {STATUS_LABELS[v.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-[#6B6B6B]">{ageLabel(v.createdAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* â”€â”€ Inline editor panel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {selectedId && (
        <VariationEditorPanel
          variationId={selectedId}
          jobs={jobs}
          projects={projects}
          onClose={() => setSelectedId(null)}
          onChanged={() => { void fetchVariations(); onChanged(); }}
          onToast={setToast}
        />
      )}

      {/* New variation modal */}
      {showNewModal && (
        <NewVariationModal
          jobs={jobs}
          projects={projects}
          initialJob={modalJobSeed}
          onConfirm={handleCreate}
          onClose={() => setShowNewModal(false)}
        />
      )}

      {toast && <Toaster message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

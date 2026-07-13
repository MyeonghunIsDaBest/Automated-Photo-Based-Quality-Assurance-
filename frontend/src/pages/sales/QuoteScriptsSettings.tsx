// pages/sales/QuoteScriptsSettings.tsx — manage Scope-of-Works "Insert script"
// templates (migration 80). Embedded in SettingsTab below Labour Rates.
// Manager-gating is the host tab's responsibility. List + add/edit (name, type,
// body) + active toggle + delete.

import { useEffect, useState } from "react";
import { Plus, Trash2, Loader2, Pencil } from "lucide-react";
import { Toaster, type ToastState } from "../../components/ui/Toaster";
import {
  listScripts,
  createScript,
  updateScript,
  setScriptActive,
  deleteScript,
  type QuoteScript,
  type QuoteScriptType,
} from "../../lib/api/quoteScripts";

const inputCls =
  "w-full rounded-md border border-[#E6E1D4] px-3 py-2 text-sm focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C] disabled:opacity-50 bg-white";

const TYPES: { value: QuoteScriptType; label: string }[] = [
  { value: "any", label: "Any" },
  { value: "service", label: "Service" },
  { value: "project", label: "Project" },
];

export default function QuoteScriptsSettings() {
  const [scripts, setScripts] = useState<QuoteScript[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ok" | "error">("loading");
  const [editing, setEditing] = useState<QuoteScript | "new" | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState<QuoteScriptType>("any");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);

  function load() {
    setLoadState("loading");
    listScripts(true)
      .then((s) => { setScripts(s); setLoadState("ok"); })
      .catch(() => setLoadState("error"));
  }
  useEffect(() => { load(); }, []);

  function openNew() { setEditing("new"); setName(""); setType("any"); setBody(""); }
  function openEdit(s: QuoteScript) { setEditing(s); setName(s.name); setType(s.quoteType); setBody(s.body); }

  async function save() {
    if (!name.trim() || !body.trim()) { setToast({ message: "Name and body are required.", type: "error" }); return; }
    setSaving(true);
    try {
      if (editing === "new") {
        await createScript({ name: name.trim(), quoteType: type, body });
        setToast({ message: "Script added.", type: "success" });
      } else if (editing) {
        await updateScript(editing.id, { name: name.trim(), quoteType: type, body });
        setToast({ message: "Script saved.", type: "success" });
      }
      setEditing(null);
      load();
    } catch (ex) {
      setToast({ message: ex instanceof Error ? ex.message : "Save failed.", type: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(s: QuoteScript) {
    try { await setScriptActive(s.id, !s.isActive); load(); }
    catch (ex) { setToast({ message: ex instanceof Error ? ex.message : "Failed.", type: "error" }); }
  }

  async function remove(id: string) {
    try {
      await deleteScript(id);
      setConfirmDeleteId(null);
      setToast({ message: "Script deleted.", type: "success" });
      load();
    } catch (ex) {
      setToast({ message: ex instanceof Error ? ex.message : "Delete failed.", type: "error" });
    }
  }

  return (
    <div className="mt-6 overflow-hidden rounded-[14px] border border-[#E6E1D4] bg-white shadow-[0_1px_2px_rgba(20,20,20,0.04)]">
      <div className="flex items-center justify-between border-b border-[#E6E1D4] px-6 py-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6B6B6B]">Quote scripts</p>
          <p className="mt-0.5 text-xs text-[#A0A0A0]">
            Scope-of-works templates for the quote editor&rsquo;s &ldquo;Insert script&rdquo; picker.
          </p>
        </div>
        {editing === null && (
          <button
            type="button"
            onClick={openNew}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#2F8F5C] px-3.5 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-[#246F47]"
          >
            <Plus className="h-3.5 w-3.5" /> Add script
          </button>
        )}
      </div>

      <div className="px-6 py-5">
        {loadState === "loading" && <p className="text-sm text-[#A0A0A0]">Loading…</p>}
        {loadState === "error" && (
          <div className="flex items-center gap-4">
            <p className="text-sm text-[#C44545]">Failed to load scripts.</p>
            <button type="button" onClick={load} className="text-sm font-medium text-[#2F8F5C] underline underline-offset-2">Retry</button>
          </div>
        )}

        {/* Editor */}
        {editing !== null && (
          <div className="mb-5 space-y-3 rounded-[10px] border border-[#E6E1D4] bg-[#FAF8F2] p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_180px]">
              <div>
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[#6B6B6B]">Name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} disabled={saving} placeholder="e.g. Project — Main Scope of Works" className={inputCls} />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[#6B6B6B]">Applies to</label>
                <select value={type} onChange={(e) => setType(e.target.value as QuoteScriptType)} disabled={saving} className={inputCls}>
                  {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[#6B6B6B]">Body</label>
              <textarea value={body} onChange={(e) => setBody(e.target.value)} disabled={saving} rows={10} className={`${inputCls} resize-y font-mono text-xs`} />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditing(null)} disabled={saving} className="rounded-full border border-[#E6E1D4] bg-white px-3.5 py-1.5 text-[12px] font-semibold text-[#6B6B6B] hover:bg-[#FAF8F2] disabled:opacity-50">Cancel</button>
              <button type="button" onClick={() => void save()} disabled={saving} className="inline-flex items-center gap-1.5 rounded-full bg-[#2F8F5C] px-3.5 py-1.5 text-[12px] font-semibold text-white hover:bg-[#246F47] disabled:opacity-50">
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save
              </button>
            </div>
          </div>
        )}

        {/* List */}
        {loadState === "ok" && (
          <div className="divide-y divide-[#EFEBE0]">
            {scripts.length === 0 && <p className="py-3 text-sm text-[#A0A0A0]">No scripts yet — add one above.</p>}
            {scripts.map((s) => (
              <div key={s.id} className={`flex items-center gap-3 py-2.5 ${s.isActive ? "" : "opacity-50"}`}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[#1A1A1A]">{s.name}</p>
                  <p className="truncate text-xs text-[#A0A0A0]">{s.body.split("\n")[0]}</p>
                </div>
                <span className="rounded-full border border-[#E6E1D4] bg-[#F0EDE4] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#6B6B6B]">{s.quoteType}</span>
                <button type="button" onClick={() => void toggleActive(s)} className="text-[11px] text-[#A0A0A0] hover:text-[#1A1A1A]">
                  {s.isActive ? "Active" : "Inactive"}
                </button>
                <button type="button" onClick={() => openEdit(s)} title="Edit" className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[#E6E1D4] bg-white text-[#6B6B6B] hover:bg-[#FAF8F2]">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                {confirmDeleteId === s.id ? (
                  <span className="inline-flex items-center gap-1">
                    <button type="button" onClick={() => void remove(s.id)} className="rounded-full bg-[#C44545] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[#A83838]">Delete</button>
                    <button type="button" onClick={() => setConfirmDeleteId(null)} className="text-[11px] text-[#A0A0A0] hover:text-[#1A1A1A]">Cancel</button>
                  </span>
                ) : (
                  <button type="button" onClick={() => setConfirmDeleteId(s.id)} title="Delete" className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[#E6E1D4] bg-white text-[#C0BAB0] hover:border-[#F0BFBF] hover:bg-[#FBE5E5] hover:text-[#C44545]">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {toast && <Toaster message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

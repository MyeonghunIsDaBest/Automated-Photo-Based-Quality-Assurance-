// ─────────────────────────────────────────────────────────────────────────────
// pages/stock/NewSupplierMiniModal.tsx — name-and-go wholesaler creation so a
// purchase order or reorder rule never sends you on a detour to Admin →
// Suppliers mid-task. Admin remains the full editor (ABN, branches, contacts).
//
// Stacking note: this often renders INSIDE another MotionDrawer (the PO modal).
// Both drawers listen for Esc at the document level, so the PARENT must guard
// its onClose with "if the mini modal is open, ignore" — see NewOrderModal.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { Loader2, Plus, X } from "lucide-react";

import MotionDrawer from "../../components/ui/MotionDrawer";
import { btnPrimary, btnGhost, inputField } from "../gantt/components/ledger";
import { createSupplier, type Supplier } from "../../lib/api/suppliers";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (supplier: Supplier) => void;
}

export default function NewSupplierMiniModal({ open, onClose, onCreated }: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) { setName(""); setEmail(""); setPhone(""); setError(null); }
  }, [open]);

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed) { setError("The wholesaler needs a name."); return; }
    setSaving(true);
    try {
      const supplier = await createSupplier({
        name: trimmed,
        ...(email.trim() && { mainEmail: email.trim() }),
        ...(phone.trim() && { mainContactNumber: phone.trim() }),
      });
      onCreated(supplier);
      onClose();
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : "Failed to create the wholesaler.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <MotionDrawer open={open} onClose={() => { if (!saving) onClose(); }} variant="modal" ariaLabel="New wholesaler" sizeClass="sm:w-[420px]">
      <div className="flex items-center justify-between border-b border-[#E6E1D4] px-5 py-4">
        <h2 className="text-[17px] font-semibold text-[#1A1A1A]">New wholesaler</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="grid h-[30px] w-[30px] place-items-center rounded-full text-[#A0A0A0] transition-colors hover:bg-[#FAF8F2] hover:text-[#1A1A1A]">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="space-y-3.5 px-5 py-4">
        <label className="block">
          <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.08em] text-[#A0A0A0]">Name *</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. AWM Electrical" className={inputField} autoFocus />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.08em] text-[#A0A0A0]">Orders email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="orders@…" className={inputField} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.08em] text-[#A0A0A0]">Phone</span>
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputField} />
        </label>
        {error && <p className="text-sm text-[#C44545]">{error}</p>}
        <p className="text-[11.5px] text-[#A0A0A0]">ABN, branches, and contacts can be added later in Admin → Suppliers.</p>
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-[#E6E1D4] px-5 py-4">
        <button type="button" onClick={onClose} disabled={saving} className={btnGhost}>Cancel</button>
        <button type="button" onClick={() => void submit()} disabled={saving || !name.trim()} className={btnPrimary}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Create wholesaler
        </button>
      </div>
    </MotionDrawer>
  );
}

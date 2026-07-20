// ─────────────────────────────────────────────────────────────────────────────
// pages/stock/StockSettingsView.tsx — manager stock settings: the nominated
// stock controller (gets restock alerts) + the future auto-send toggle.
//
// The per-item minimums/targets editor and its CSV import moved to the RESTOCK
// tab (P9.BS WS4 — ReorderRulesEditor.tsx): setting thresholds is warehouse
// work that belongs where the below-minimum list lives, not under a gear icon.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { Loader2, Bell } from "lucide-react";

import { Toaster, type ToastState } from "../../components/ui/Toaster";
import { cardShell } from "../gantt/components/ledger";
import { cn } from "../../lib/cn";
import { listProfilesByRole } from "../../lib/api/profiles";
import { getStockSettings, updateStockSettings } from "../../lib/api/purchasing";
import type { Profile, SecurityGroup } from "../../types";

const INTERNAL_GROUPS: SecurityGroup[] = ["company_admin", "construction_mgr", "project_manager", "worker", "dev"];
const fullName = (p: Profile) => `${p.firstName} ${p.lastName}`.trim() || p.email;

const card16 = cn(cardShell, "rounded-[16px]");

export default function StockSettingsView() {
  const [staff, setStaff] = useState<Profile[]>([]);
  const [controllerId, setControllerId] = useState("");
  const [autoSend, setAutoSend] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<ToastState>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([listProfilesByRole(INTERNAL_GROUPS), getStockSettings()])
      .then(([profs, settings]) => {
        if (cancelled) return;
        setStaff(profs);
        setControllerId(settings.stockControllerId ?? "");
        setAutoSend(settings.autoSend);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  async function saveSettings(patch: { stockControllerId?: string | null; autoSend?: boolean }) {
    try {
      await updateStockSettings(patch);
      setToast({ message: "Settings saved.", type: "success" });
    } catch (ex) {
      setToast({ message: ex instanceof Error ? ex.message : "Failed to save settings", type: "error" });
    }
  }

  if (loading) {
    return <div className={cn(card16, "flex items-center gap-2 px-5 py-8 text-sm text-[#A0A0A0]")}><Loader2 className="h-4 w-4 animate-spin" /> Loading settings…</div>;
  }

  return (
    <div className="space-y-4">
      {/* Restock alerts */}
      <div className={cn(card16, "px-5 py-[18px]")}>
        <p className="mb-3 flex items-center gap-2 text-[10.5px] font-bold uppercase tracking-[0.1em] text-[#6B6B6B]"><Bell className="h-3.5 w-3.5" /> Restock alerts</p>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-4">
          <label className="min-w-[220px] flex-1 sm:max-w-[280px]">
            <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.08em] text-[#A0A0A0]">Stock controller (gets restock alerts)</span>
            <select
              value={controllerId}
              onChange={(e) => { setControllerId(e.target.value); void saveSettings({ stockControllerId: e.target.value || null }); }}
              className="w-full rounded-[10px] border border-[#E6E1D4] bg-white px-3 py-2 text-[13.5px] text-[#1A1A1A] focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]"
            >
              <option value="">Nobody yet</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{fullName(s)}</option>)}
            </select>
          </label>
          <label className="flex min-h-11 items-center gap-2 text-[13px] text-[#3A3A3A]">
            <input
              type="checkbox"
              checked={autoSend}
              onChange={(e) => { setAutoSend(e.target.checked); void saveSettings({ autoSend: e.target.checked }); }}
              className="h-4 w-4 accent-[#2F8F5C]"
            />
            Auto-send restock orders to the wholesaler (no review) — future
          </label>
        </div>
      </div>

      <p className="text-[12.5px] text-[#6B6B6B]">
        Looking for minimums, targets, and the reorder CSV? They moved to the <b className="font-semibold text-[#3A3A3A]">Restock</b> tab — thresholds now live beside the below-minimum list they drive.
      </p>

      {toast && <Toaster message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

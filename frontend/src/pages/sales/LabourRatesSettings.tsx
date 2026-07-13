// pages/sales/LabourRatesSettings.tsx — PP1 labour rates settings section.
//
// Self-contained section; no page chrome. Embed inside SettingsTab.tsx below
// Commercial Settings. Manager-gating is the host tab's responsibility.
//
// Features: list all rates (includeInactive=true), inline rate edit (blur-save),
// active toggle, up/down reorder, "Add role" inline row, skeleton/error/retry,
// toast feedback.

import { useEffect, useRef, useState } from "react";
import { SkeletonLine } from "../../components/ui/skeleton";
import { Toaster, type ToastState } from "../../components/ui/Toaster";
import {
  listLabourRates,
  createLabourRate,
  updateLabourRate,
  setLabourRateActive,
  formatRole,
  type LabourRate,
} from "../../lib/api/labourRates";

// ─── types ────────────────────────────────────────────────────────────────────

// ─── shared style tokens ──────────────────────────────────────────────────────

const inputCls =
  "w-full rounded-md border border-[#E6E1D4] px-3 py-1.5 text-sm focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C] disabled:opacity-50 bg-white";

const iconBtnCls =
  "inline-flex h-6 w-6 items-center justify-center rounded border border-[#E6E1D4] bg-white text-[#6B6B6B] transition-colors hover:bg-[#FAF8F2] disabled:cursor-not-allowed disabled:opacity-40";

// ─── RateRow ──────────────────────────────────────────────────────────────────

interface RateRowProps {
  rate: LabourRate;
  isFirst: boolean;
  isLast: boolean;
  saving: boolean;
  onBlur: (id: string, raw: string) => Promise<void>;
  onToggle: (id: string, active: boolean) => Promise<void>;
  onUp: (id: string) => Promise<void>;
  onDown: (id: string) => Promise<void>;
}

function RateRow({ rate, isFirst, isLast, saving, onBlur, onToggle, onUp, onDown }: RateRowProps) {
  const [val, setVal] = useState(rate.loadedRate !== null ? String(rate.loadedRate) : "");
  const prevId = useRef(rate.id);
  useEffect(() => {
    if (prevId.current !== rate.id) {
      prevId.current = rate.id;
      setVal(rate.loadedRate !== null ? String(rate.loadedRate) : "");
    }
  }, [rate.id, rate.loadedRate]);

  return (
    <tr className={rate.isActive ? "" : "opacity-50"}>
      <td className="py-2 pr-3 text-[13px] text-[#3A3A3A]">{formatRole(rate.role)}</td>
      <td className="py-2 pr-3 w-36">
        <input
          type="number" min="0" step="any" value={val}
          placeholder="rate not set" disabled={saving}
          className={`${inputCls} text-right`}
          onChange={(e) => setVal(e.target.value)}
          onBlur={() => { void onBlur(rate.id, val); }}
        />
      </td>
      <td className="py-2 pr-3 text-center">
        <button
          type="button" disabled={saving}
          onClick={() => { void onToggle(rate.id, !rate.isActive); }}
          aria-label={rate.isActive ? "Deactivate" : "Activate"}
          className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${rate.isActive ? "bg-[#2F8F5C]" : "bg-[#D1CEC7]"} disabled:cursor-not-allowed disabled:opacity-50`}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${rate.isActive ? "translate-x-4" : "translate-x-0"}`} />
        </button>
      </td>
      <td className="py-2">
        <div className="flex gap-1">
          <button type="button" disabled={saving || isFirst} onClick={() => { void onUp(rate.id); }} aria-label="Move up" className={iconBtnCls}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M1 7l4-4 4 4"/></svg>
          </button>
          <button type="button" disabled={saving || isLast} onClick={() => { void onDown(rate.id); }} aria-label="Move down" className={iconBtnCls}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M1 3l4 4 4-4"/></svg>
          </button>
        </div>
      </td>
    </tr>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function LabourRatesSettings() {
  const [rates, setRates] = useState<LabourRate[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ok" | "error">("loading");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const [newRole, setNewRole] = useState("");
  const [newRate, setNewRate] = useState("");

  function load() {
    setLoadState("loading");
    listLabourRates(true)
      .then((r) => { setRates(r); setLoadState("ok"); })
      .catch(() => setLoadState("error"));
  }
  useEffect(() => { load(); }, []);

  function sortedInsert(next: LabourRate, prev: LabourRate[]): LabourRate[] {
    const without = prev.filter((r) => r.id !== next.id);
    return [...without, next].sort((a, b) => a.sortOrder - b.sortOrder || a.role.localeCompare(b.role));
  }

  async function handleBlur(id: string, raw: string) {
    const trimmed = raw.trim();
    const parsed = trimmed === "" ? null : parseFloat(trimmed);
    if (trimmed !== "" && isNaN(parsed as number)) return;
    setSaving(true);
    try {
      const updated = await updateLabourRate(id, { loadedRate: parsed });
      setRates((prev) => prev.map((r) => (r.id === id ? updated : r)));
      setToast({ message: "Rate saved.", type: "success" });
    } catch (ex) {
      setToast({ message: ex instanceof Error ? ex.message : "Save failed.", type: "error" });
    } finally { setSaving(false); }
  }

  async function handleToggle(id: string, active: boolean) {
    setSaving(true);
    try {
      await setLabourRateActive(id, active);
      setRates((prev) => prev.map((r) => (r.id === id ? { ...r, isActive: active } : r)));
    } catch (ex) {
      setToast({ message: ex instanceof Error ? ex.message : "Toggle failed.", type: "error" });
    } finally { setSaving(false); }
  }

  async function swapOrder(a: LabourRate, b: LabourRate) {
    setSaving(true);
    try {
      const [ua, ub] = await Promise.all([
        updateLabourRate(a.id, { sortOrder: b.sortOrder }),
        updateLabourRate(b.id, { sortOrder: a.sortOrder }),
      ]);
      setRates((prev) =>
        prev.map((r) => (r.id === ua.id ? ua : r.id === ub.id ? ub : r))
            .sort((x, y) => x.sortOrder - y.sortOrder || x.role.localeCompare(y.role))
      );
    } catch (ex) {
      setToast({ message: ex instanceof Error ? ex.message : "Reorder failed.", type: "error" });
    } finally { setSaving(false); }
  }

  async function handleUp(id: string) {
    const idx = rates.findIndex((r) => r.id === id);
    if (idx > 0) await swapOrder(rates[idx], rates[idx - 1]);
  }

  async function handleDown(id: string) {
    const idx = rates.findIndex((r) => r.id === id);
    if (idx >= 0 && idx < rates.length - 1) await swapOrder(rates[idx], rates[idx + 1]);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const role = newRole.trim();
    if (!role) return;
    const parsed = newRate.trim() === "" ? null : parseFloat(newRate);
    const maxOrder = rates.length > 0 ? Math.max(...rates.map((r) => r.sortOrder)) : 0;
    setSaving(true);
    try {
      const created = await createLabourRate({ role, loadedRate: parsed, sortOrder: maxOrder + 10 });
      setRates((prev) => sortedInsert(created, prev));
      setNewRole("");
      setNewRate("");
      setToast({ message: "Role added.", type: "success" });
    } catch (ex) {
      setToast({ message: ex instanceof Error ? ex.message : "Add failed.", type: "error" });
    } finally { setSaving(false); }
  }

  return (
    <div className="mt-6 overflow-hidden rounded-[14px] border border-[#E6E1D4] bg-white shadow-[0_1px_2px_rgba(20,20,20,0.04)]">
      <div className="border-b border-[#E6E1D4] px-6 py-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6B6B6B]">
          Labour Rates
        </p>
        <p className="mt-0.5 text-xs text-[#A0A0A0]">
          All-in $/hr per role, AUD ex-GST {"—"} used to cost job hours.
        </p>
      </div>

      <div className="px-6 py-5">
        {loadState === "loading" && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-4">
                <SkeletonLine className="w-32" />
                <SkeletonLine className="w-20" />
                <SkeletonLine className="w-10" />
              </div>
            ))}
          </div>
        )}

        {loadState === "error" && (
          <div className="flex items-center gap-4">
            <p className="text-sm text-[#C44545]">Failed to load labour rates.</p>
            <button type="button" onClick={load} className="text-sm font-medium text-[#2F8F5C] underline underline-offset-2 hover:text-[#246F47]">
              Retry
            </button>
          </div>
        )}

        {loadState === "ok" && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] border-collapse">
              <thead>
                <tr className="border-b border-[#EFEBE0]">
                  <th className="pb-2 pr-3 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-[#A0A0A0]">Role</th>
                  <th className="pb-2 pr-3 text-right text-[11px] font-semibold uppercase tracking-[0.12em] text-[#A0A0A0] w-36">$/hr (AUD)</th>
                  <th className="pb-2 pr-3 text-center text-[11px] font-semibold uppercase tracking-[0.12em] text-[#A0A0A0]">Active</th>
                  <th className="pb-2 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-[#A0A0A0]">Order</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EFEBE0]">
                {rates.map((rate, idx) => (
                  <RateRow
                    key={rate.id} rate={rate}
                    isFirst={idx === 0} isLast={idx === rates.length - 1}
                    saving={saving}
                    onBlur={handleBlur} onToggle={handleToggle}
                    onUp={handleUp} onDown={handleDown}
                  />
                ))}
                {rates.length === 0 && (
                  <tr><td colSpan={4} className="py-4 text-center text-sm text-[#A0A0A0]">No roles yet {"—"} add one below.</td></tr>
                )}
                {/* Add role row */}
                <tr>
                  <td className="pt-3 pr-3">
                    <input type="text" value={newRole} placeholder="e.g. Electrician" disabled={saving}
                      className={inputCls} onChange={(e) => setNewRole(e.target.value)} />
                  </td>
                  <td className="pt-3 pr-3 w-36">
                    <input type="number" min="0" step="any" value={newRate} placeholder="optional $/hr" disabled={saving}
                      className={`${inputCls} text-right`} onChange={(e) => setNewRate(e.target.value)} />
                  </td>
                  <td className="pt-3 pr-3 text-center" colSpan={2}>
                    <button type="button" disabled={saving || newRole.trim() === ""}
                      onClick={(e) => { void handleAdd(e); }}
                      className="inline-flex items-center gap-1 rounded-full bg-[#2F8F5C] px-3.5 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-[#246F47] disabled:cursor-not-allowed disabled:opacity-50">
                      Add role
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {toast && <Toaster message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

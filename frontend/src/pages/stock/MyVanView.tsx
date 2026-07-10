// ─────────────────────────────────────────────────────────────────────────────
// pages/stock/MyVanView.tsx — the field worker's view: what's in my van right
// now (live running tally) + a big "Record usage" action. Phone-first.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import { PackagePlus, Loader2, Truck, AlertTriangle, Package, ChevronRight } from "lucide-react";

import { Toaster } from "../../components/ui/Toaster";
import { cardShell, btnPrimary, FRAUNCES } from "../gantt/components/ledger";
import {
  myVan, listStockLevels, subscribeToStockLevels, listMyPendingAllocations,
  type StockLocation, type StockLevel, type StockAllocation,
} from "../../lib/api/stock";
import RecordUsageDrawer from "./RecordUsageDrawer";
import JobBoxAcceptSheet from "./JobBoxAcceptSheet";

type ToastState = { message: string; type: "success" | "error" | "info" } | null;

function fmtQty(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

export default function MyVanView() {
  const [van, setVan] = useState<StockLocation | null>(null);
  const [levels, setLevels] = useState<StockLevel[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  // Pending job boxes (accept at pickup) — loaded even with no van assigned,
  // so the worker still sees the box and the accept error explains the fix.
  const [pendingBoxes, setPendingBoxes] = useState<StockAllocation[]>([]);
  const [activeBox, setActiveBox] = useState<StockAllocation | null>(null);

  const refetchLevels = useCallback(async (locId: string) => {
    const rows = await listStockLevels(locId).catch(() => []);
    setLevels(rows);
  }, []);

  const refetchPending = useCallback(async () => {
    const boxes = await listMyPendingAllocations().catch(() => []);
    setPendingBoxes(boxes);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([myVan(), listMyPendingAllocations().catch(() => [] as StockAllocation[])])
      .then(async ([v, boxes]) => {
        if (cancelled) return;
        setVan(v);
        setPendingBoxes(boxes);
        if (v) await refetchLevels(v.id);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [refetchLevels]);

  // Live tally — refetch whenever this van's levels change.
  useEffect(() => {
    if (!van) return;
    const unsub = subscribeToStockLevels(van.id, () => void refetchLevels(van.id));
    return unsub;
  }, [van, refetchLevels]);

  // A box packed while this page is open doesn't move stock (nothing to
  // subscribe to yet), so refresh the pending banner whenever the worker
  // comes back to the tab/app — i.e. at pickup, when it matters.
  useEffect(() => {
    const onFocus = () => void refetchPending();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [refetchPending]);

  if (loading) {
    return (
      <div className={`flex items-center gap-2 px-5 py-8 text-sm text-[#A0A0A0] ${cardShell}`}>
        <Loader2 className="h-4 w-4 animate-spin" /> Loading your van…
      </div>
    );
  }

  // Banner: pending boxes, shown with or without a van.
  const boxesBanner = pendingBoxes.length > 0 && (
    <div className={`mb-4 overflow-hidden ${cardShell} border-[#E8D8B5]`}>
      <div className="bg-[#F9EFD9] px-5 py-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-[#8A6B1E]">
          <Package className="h-4 w-4" />
          {pendingBoxes.length} job box{pendingBoxes.length === 1 ? "" : "es"} waiting — accept at pickup
        </p>
      </div>
      <ul className="divide-y divide-[#EFEBE0]">
        {pendingBoxes.map((b) => (
          <li key={b.id}>
            <button
              type="button"
              onClick={() => setActiveBox(b)}
              className="flex min-h-14 w-full items-center gap-3 px-5 py-3 text-left hover:bg-[#FAF8F2]"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[#1A1A1A]">{b.jobLabel}</p>
                <p className="truncate text-[12px] text-[#6B6B6B]">
                  {b.lines.length} item{b.lines.length === 1 ? "" : "s"} · from {b.sourceLocationName}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-[#A0A0A0]" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );

  const acceptSheet = (
    <JobBoxAcceptSheet
      box={activeBox}
      onClose={() => setActiveBox(null)}
      onDone={(message) => {
        setActiveBox(null);
        setToast({ message, type: "success" });
        void refetchPending();
        if (van) void refetchLevels(van.id);
      }}
    />
  );

  if (!van) {
    return (
      <>
        {boxesBanner}
        <div className={`px-5 py-10 text-center ${cardShell}`}>
          <Truck className="mx-auto mb-2 h-7 w-7 text-[#A0A0A0]" />
          <p className="text-sm font-medium text-[#1A1A1A]">No van assigned to you yet</p>
          <p className="mt-1 text-sm text-[#6B6B6B]">Ask your manager to assign you a van in the Stock area, then your stock shows up here.</p>
        </div>
        {acceptSheet}
        {toast && <Toaster message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      </>
    );
  }

  const totalUnits = levels.reduce((s, l) => s + l.qty, 0);

  return (
    <>
      {boxesBanner}

      {/* Van header + record action */}
      <div className={`mb-4 flex flex-wrap items-center justify-between gap-3 px-5 py-4 ${cardShell}`}>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#6B6B6B]">Your van</p>
          <h3 className="text-[22px] font-medium text-[#1A1A1A]" style={{ fontFamily: FRAUNCES, letterSpacing: "-0.015em" }}>{van.name}</h3>
          <p className="mt-0.5 text-[13px] text-[#6B6B6B]">{levels.length} item{levels.length === 1 ? "" : "s"} · {fmtQty(totalUnits)} units on board</p>
        </div>
        <button type="button" onClick={() => setDrawerOpen(true)} className={btnPrimary}>
          <PackagePlus className="h-4 w-4" /> Record usage
        </button>
      </div>

      {/* Levels */}
      {levels.length === 0 ? (
        <div className={`px-5 py-10 text-center text-sm text-[#A0A0A0] ${cardShell}`}>
          Your van has no stock recorded yet. Once your manager stocks it (or runs a stock-take), it'll show here.
        </div>
      ) : (
        <div className={`overflow-hidden ${cardShell}`}>
          <ul className="divide-y divide-[#EFEBE0]">
            {levels.map((l) => {
              const out = l.qty <= 0;
              return (
                <li key={l.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[#1A1A1A]">{l.name}</p>
                    {l.sku && <p className="truncate text-[11px] text-[#A0A0A0]">{l.sku}</p>}
                  </div>
                  {out && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#FBE5E5] px-2 py-0.5 text-[11px] font-semibold text-[#C44545]">
                      <AlertTriangle className="h-3 w-3" /> Out
                    </span>
                  )}
                  <div className="text-right">
                    <span className={`text-[20px] font-medium tabular-nums ${out ? "text-[#C44545]" : "text-[#1A1A1A]"}`} style={{ fontFamily: FRAUNCES }}>
                      {fmtQty(l.qty)}
                    </span>
                    <span className="ml-1 text-xs text-[#A0A0A0]">{l.unit}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <RecordUsageDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        van={van}
        items={levels}
        onDone={(message) => { setToast({ message, type: "success" }); void refetchLevels(van.id); }}
      />

      {acceptSheet}

      {toast && <Toaster message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </>
  );
}

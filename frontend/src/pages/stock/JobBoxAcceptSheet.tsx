// ─────────────────────────────────────────────────────────────────────────────
// pages/stock/JobBoxAcceptSheet.tsx — the pickup moment (P4, migration 95).
//
// A worker opens their pending job box, sees exactly what's packed for which
// job, and ACCEPTS — the RPC transfers every line factory → their van and
// stamps who took the box, when. Declining needs a short note so the manager
// hears why ("box short a breaker"). Bottom-sheet on phones (MotionDrawer).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { PackageCheck, Loader2, MapPin } from "lucide-react";

import MotionDrawer from "../../components/ui/MotionDrawer";
import { btnPrimary, btnGhost, inputField, FRAUNCES } from "../gantt/components/ledger";
import { acceptAllocation, declineAllocation, type StockAllocation } from "../../lib/api/stock";

interface Props {
  box: StockAllocation | null;   // null = closed
  onClose: () => void;
  /** Called after a successful accept/decline with a toast message. */
  onDone: (message: string) => void;
}

export default function JobBoxAcceptSheet({ box, onClose, onDone }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [declining, setDeclining] = useState(false);
  const [declineNote, setDeclineNote] = useState("");

  // Fresh state per box.
  useEffect(() => {
    setBusy(false);
    setError(null);
    setDeclining(false);
    setDeclineNote("");
  }, [box?.id]);

  const totalValue = (box?.lines ?? []).reduce(
    (s, l) => s + (l.unitCost != null ? l.qty * l.unitCost : 0),
    0,
  );

  async function handleAccept() {
    if (!box) return;
    setBusy(true);
    setError(null);
    try {
      await acceptAllocation(box.id);
      onDone(`Job box accepted — ${box.lines.length} item${box.lines.length === 1 ? "" : "s"} added to your van.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Accept failed — try again.");
      setBusy(false);
    }
  }

  async function handleDecline() {
    if (!box) return;
    if (declineNote.trim() === "") {
      setError("Add a short reason so your manager knows what's wrong.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await declineAllocation(box.id, declineNote.trim());
      onDone("Job box declined — your manager has been notified.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Decline failed — try again.");
      setBusy(false);
    }
  }

  return (
    <MotionDrawer open={box !== null} onClose={busy ? () => undefined : onClose} ariaLabel="Job box">
      {box && (
        <div className="flex h-full flex-col">
          <div className="border-b border-[#E6E1D4] px-5 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#6B6B6B]">Job box</p>
            <h3 className="mt-0.5 text-[20px] font-medium text-[#1A1A1A]" style={{ fontFamily: FRAUNCES, letterSpacing: "-0.015em" }}>
              {box.jobLabel}
            </h3>
            <p className="mt-1 flex items-center gap-1 text-[13px] text-[#6B6B6B]">
              <MapPin className="h-3.5 w-3.5" /> Pick up from {box.sourceLocationName}
            </p>
            {box.note && (
              <p className="mt-2 rounded-[10px] bg-[#F9EFD9] px-3 py-2 text-[13px] text-[#8A6B1E]">
                {box.note}
              </p>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            <ul className="divide-y divide-[#EFEBE0]">
              {box.lines.map((l) => (
                <li key={l.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[#1A1A1A]">{l.name}</p>
                    {l.sku && <p className="truncate text-[11px] text-[#A0A0A0]">{l.sku}</p>}
                  </div>
                  <span className="text-[18px] font-medium tabular-nums text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>
                    {l.qty}
                  </span>
                  <span className="w-6 text-xs text-[#A0A0A0]">{l.unit}</span>
                </li>
              ))}
            </ul>
            {totalValue > 0 && (
              <p className="mt-2 flex items-center justify-between border-t border-[#E6E1D4] pt-2 text-[13px] text-[#6B6B6B]">
                <span>Box value (cost)</span>
                <span className="font-semibold tabular-nums text-[#1A1A1A]">${(Math.round(totalValue * 100) / 100).toFixed(2)}</span>
              </p>
            )}
          </div>

          <div className="border-t border-[#E6E1D4] px-5 py-4">
            {error && <p className="mb-2 text-xs text-[#C44545]">{error}</p>}

            {declining ? (
              <div className="space-y-2">
                <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#6B6B6B]">
                  What's wrong with the box?
                </label>
                <input
                  value={declineNote}
                  onChange={(e) => setDeclineNote(e.target.value)}
                  placeholder="e.g. Short a circuit breaker"
                  className={inputField}
                  autoFocus
                />
                <div className="flex gap-2">
                  <button type="button" onClick={() => { setDeclining(false); setError(null); }} disabled={busy} className={btnGhost + " flex-1 justify-center"}>
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDecline()}
                    disabled={busy}
                    className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full bg-[#C44545] px-4 text-sm font-semibold text-white hover:bg-[#A83A3A] disabled:opacity-50"
                  >
                    {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                    Decline box
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <button type="button" onClick={() => setDeclining(true)} disabled={busy} className={btnGhost + " justify-center"}>
                  Something's wrong
                </button>
                <button type="button" onClick={() => void handleAccept()} disabled={busy} className={btnPrimary + " min-h-11 flex-1 justify-center"}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />}
                  Accept — load my van
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </MotionDrawer>
  );
}

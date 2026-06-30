// ─────────────────────────────────────────────────────────────────────────────
// pages/stock/RecordUsageDrawer.tsx — the field "tap to record" sheet.
//
// A worker picks the JOB (required), adds the items they pulled from their van +
// quantities, and submits. Each line becomes a usage movement that deducts the
// van's running tally and is captured at cost (so it feeds the job's materials
// cost). Bottom-sheet on phones / right-drawer on desktop (MotionDrawer).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { Plus, Trash2, Loader2, PackageCheck } from "lucide-react";

import MotionDrawer from "../../components/ui/MotionDrawer";
import { btnPrimary, btnGhost, inputField } from "../gantt/components/ledger";
import { recordUsage, type StockLevel, type StockLocation, type JobKind } from "../../lib/api/stock";
import { listServiceJobs } from "../../lib/api/serviceJobs";
import { listSimproJobs } from "../../lib/api/simproJobs";

interface JobOption {
  value: string; // "service:<id>" | "simpro:<id>"
  kind: JobKind;
  id: string;
  label: string;
}

interface Line {
  key: number;
  materialId: string;
  qty: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  van: StockLocation;
  items: StockLevel[]; // what's currently in the van
  onDone: (message: string) => void;
}

let lineSeq = 1;

export default function RecordUsageDrawer({ open, onClose, van, items, onDone }: Props) {
  const [jobs, setJobs] = useState<JobOption[]>([]);
  const [jobValue, setJobValue] = useState("");
  const [lines, setLines] = useState<Line[]>([{ key: lineSeq++, materialId: "", qty: "" }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load the job list when the sheet opens.
  useEffect(() => {
    if (!open) return;
    setError(null);
    void (async () => {
      const [svc, sim] = await Promise.all([
        listServiceJobs().catch(() => []),
        listSimproJobs({ limit: 200 }).catch(() => []),
      ]);
      const opts: JobOption[] = [
        ...svc.map((j) => ({ value: `service:${j.id}`, kind: "service" as JobKind, id: j.id, label: j.title })),
        ...sim.map((j) => ({
          value: `simpro:${j.id}`,
          kind: "simpro" as JobKind,
          id: j.id,
          label: `${j.externalRef}${j.description ? ` — ${j.description}` : j.customerName ? ` — ${j.customerName}` : ""}`,
        })),
      ];
      setJobs(opts);
    })();
  }, [open]);

  // Reset the form each time it opens.
  useEffect(() => {
    if (open) {
      setJobValue("");
      setLines([{ key: lineSeq++, materialId: "", qty: "" }]);
      setError(null);
    }
  }, [open]);

  function setLine(key: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }
  function addLine() {
    setLines((prev) => [...prev, { key: lineSeq++, materialId: "", qty: "" }]);
  }
  function removeLine(key: number) {
    setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== key) : prev));
  }

  const job = jobs.find((j) => j.value === jobValue) ?? null;
  const validLines = lines
    .map((l) => ({ ...l, n: parseFloat(l.qty) }))
    .filter((l) => l.materialId && Number.isFinite(l.n) && l.n > 0);
  const canSubmit = !!job && validLines.length > 0 && !saving;

  async function handleSubmit() {
    if (!job) { setError("Pick the job these materials were used on."); return; }
    if (validLines.length === 0) { setError("Add at least one item with a quantity."); return; }
    setSaving(true);
    setError(null);
    try {
      await recordUsage({
        locationId: van.id,
        jobId: job.id,
        jobKind: job.kind,
        lines: validLines.map((l) => {
          const lvl = items.find((i) => i.materialId === l.materialId);
          return { materialId: l.materialId, qty: l.n, unitCost: lvl?.costPrice ?? null };
        }),
      });
      const count = validLines.length;
      onDone(`Recorded ${count} item${count === 1 ? "" : "s"} used on ${job.label}.`);
      onClose();
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : "Failed to record usage.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <MotionDrawer open={open} onClose={onClose} ariaLabel="Record materials used">
      <div className="flex items-center justify-between border-b border-[#E6E1D4] px-5 py-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#6B6B6B]">{van.name}</p>
          <h2 className="text-lg font-semibold text-[#1A1A1A]">Record materials used</h2>
        </div>
        <button type="button" onClick={onClose} className="text-sm text-[#A0A0A0] hover:text-[#C44545]">Close</button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {/* Job (required) */}
        <label className="mb-4 block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Job *</span>
          <select value={jobValue} onChange={(e) => setJobValue(e.target.value)} className={inputField}>
            <option value="">Select the job…</option>
            {jobs.length > 0 && (
              <optgroup label="Service jobs">
                {jobs.filter((j) => j.kind === "service").map((j) => <option key={j.value} value={j.value}>{j.label}</option>)}
              </optgroup>
            )}
            {jobs.some((j) => j.kind === "simpro") && (
              <optgroup label="Sim-Pro jobs">
                {jobs.filter((j) => j.kind === "simpro").map((j) => <option key={j.value} value={j.value}>{j.label}</option>)}
              </optgroup>
            )}
          </select>
        </label>

        {/* Items used */}
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Items used</p>
        {items.length === 0 ? (
          <p className="rounded-md border border-dashed border-[#D8D2C4] bg-[#FAF8F2] px-3 py-4 text-sm text-[#A0A0A0]">
            Your van has no stock recorded yet — ask your manager to stock it or run a stock-take.
          </p>
        ) : (
          <div className="space-y-2">
            {lines.map((l) => {
              const lvl = items.find((i) => i.materialId === l.materialId);
              return (
                <div key={l.key} className="flex items-center gap-2">
                  <select
                    value={l.materialId}
                    onChange={(e) => setLine(l.key, { materialId: e.target.value })}
                    className={`${inputField} flex-1`}
                  >
                    <option value="">Choose an item…</option>
                    {items.map((i) => (
                      <option key={i.materialId} value={i.materialId}>
                        {i.name} ({i.qty} {i.unit} in van)
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    inputMode="decimal"
                    value={l.qty}
                    onChange={(e) => setLine(l.key, { qty: e.target.value })}
                    placeholder="Qty"
                    className={`${inputField} w-24 text-right tabular-nums`}
                    aria-label="Quantity used"
                  />
                  <span className="w-8 shrink-0 text-xs text-[#A0A0A0]">{lvl?.unit ?? ""}</span>
                  <button
                    type="button"
                    onClick={() => removeLine(l.key)}
                    className="shrink-0 rounded p-1.5 text-[#A0A0A0] hover:text-[#C44545] disabled:opacity-40"
                    disabled={lines.length === 1}
                    aria-label="Remove line"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
            <button
              type="button"
              onClick={addLine}
              className="inline-flex items-center gap-1 rounded-md border border-[#E6E1D4] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#2F8F5C] hover:bg-[#FAF8F2]"
            >
              <Plus className="h-3.5 w-3.5" /> Add another item
            </button>
          </div>
        )}

        {error && <p className="mt-3 text-sm text-[#C44545]">{error}</p>}
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-[#E6E1D4] px-5 py-4">
        <button type="button" onClick={onClose} className={btnGhost}>Cancel</button>
        <button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit} className={btnPrimary}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />}
          Record usage
        </button>
      </div>
    </MotionDrawer>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// pages/catalogue/PrebuildImportCard.tsx — CSV import for PRE-BUILDS (P3).
// Same file → parse → plan → confirm shape as the materials ImportTab card.
// Items resolve strictly by SKU, so the order guard matters: import (or update)
// the materials CSV FIRST. Supersedes the manual prebuilds SQL paste.
// ─────────────────────────────────────────────────────────────────────────────

import { useRef, useState } from "react";
import { Upload, Download, RefreshCw, ChevronDown, ChevronRight, Loader2 } from "lucide-react";

import { cardShell, btnPrimary, btnGhost, TONE } from "../gantt/components/ledger";
import type { ToastState } from "../../components/ui/Toaster";
import { parsePrebuildsCsv, planPrebuildImport, type CsvPrebuild, type PrebuildImportPlan } from "../../lib/catalogue/prebuildCsv";
import { listMaterials, listPrebuilds, runPrebuildImport } from "../../lib/api/materials";

type Stage = "idle" | "preview" | "plan" | "result";

const PREBUILD_CSV_TEMPLATE =
  "prebuild_name,category,subcategory,is_favourite,item_sku,item_qty\r\n" +
  "Downlight point,Electrical,Points,yes,TPS25,12\r\n" +
  "Downlight point,,,,DLK-9W,1\r\n" +
  "GPO point,Electrical,Points,no,TPS25,8\r\n";

function SummaryChip({ count, label, bg, fg }: { count: number; label: string; bg: string; fg: string }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-[13px] font-semibold tabular-nums"
        style={{ backgroundColor: bg, color: fg }}
      >
        {count}
      </span>
      <span className="text-sm text-[#3A3A3A]">{label}</span>
    </div>
  );
}

export default function PrebuildImportCard({ onWritten, onToast }: {
  onWritten: () => void;
  onToast: (t: ToastState) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  // Bumped on reset/new file so an in-flight re-plan can't resurrect a stage
  // the user has already left.
  const planSeq = useRef(0);
  const [stage, setStage] = useState<Stage>("idle");
  const [busy, setBusy] = useState(false);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [parsed, setParsed] = useState<CsvPrebuild[]>([]);
  const [plan, setPlan] = useState<PrebuildImportPlan | null>(null);
  const [skipsOpen, setSkipsOpen] = useState(false);
  const [result, setResult] = useState<{ created: number; itemsAdded: number; failed: { count: number; firstError: string | null } } | null>(null);

  function downloadTemplate() {
    const blob = new Blob([PREBUILD_CSV_TEMPLATE], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "prebuilds-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    planSeq.current += 1;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const { prebuilds, errors } = parsePrebuildsCsv(ev.target?.result as string);
      setParseErrors(errors);
      setParsed(prebuilds);
      setPlan(null);
      setResult(null);
      setStage("preview");
    };
    reader.onerror = () => {
      onToast({ message: "Failed to read file — please try again", type: "error" });
      setStage("idle");
    };
    reader.readAsText(file);
  }

  async function handlePlan(opts?: { refreshOnly?: boolean }) {
    const seq = planSeq.current;
    setBusy(true);
    try {
      const [existing, materials] = await Promise.all([
        listPrebuilds(true),
        listMaterials({ includeInactive: true }),
      ]);
      if (seq !== planSeq.current) return; // user reset / picked a new file mid-flight
      setPlan(planPrebuildImport(
        existing.map((p) => ({ id: p.id, name: p.name })),
        materials.map((m) => ({ id: m.id, sku: m.sku })),
        parsed,
      ));
      setSkipsOpen(false);
      // refreshOnly (post-confirm): update the plan in place so the result
      // panel stays visible — the user switches over via "Review updated plan".
      if (!opts?.refreshOnly) setStage("plan");
    } catch (err) {
      onToast({ message: err instanceof Error ? err.message : "Failed to fetch existing data", type: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirm() {
    if (!plan) return;
    setBusy(true);
    try {
      const res = await runPrebuildImport(plan);
      setResult(res);
      // The pre-import plan is stale — drop it, keep the result panel up, and
      // refresh the plan in place so any retry confirms against reality.
      setPlan(null);
      setStage("result");
      onWritten();
      onToast({
        message: res.failed.count === 0
          ? `Pre-builds imported: ${res.created} created (${res.itemsAdded} item lines)`
          : `Pre-build import finished with ${res.failed.count} failure${res.failed.count === 1 ? "" : "s"} — see below`,
        type: res.failed.count === 0 ? "success" : "info",
      });
      void handlePlan({ refreshOnly: true });
    } catch (err) {
      onToast({ message: err instanceof Error ? err.message : "Import failed", type: "error" });
    } finally {
      setBusy(false);
    }
  }

  function handleReset() {
    planSeq.current += 1;
    setStage("idle");
    setParseErrors([]);
    setParsed([]);
    setPlan(null);
    setResult(null);
    setSkipsOpen(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  const totalItems = parsed.reduce((s, p) => s + p.items.length, 0);

  return (
    <div className={`${cardShell} overflow-hidden`}>
      <div className="flex items-center justify-between border-b border-[#E6E1D4] px-5 py-4">
        <div>
          <h2 className="text-[13px] font-semibold text-[#1A1A1A]">Pre-builds import</h2>
          <p className="mt-0.5 text-xs text-[#6B6B6B]">
            Assemblies like a downlight point — one row per part, grouped by name.{" "}
            <span className="font-medium text-[#C8841E]">Import the materials CSV first</span> — parts match by SKU.
          </p>
        </div>
        <button type="button" onClick={downloadTemplate} className={btnGhost}>
          <Download className="h-4 w-4" />
          Template
        </button>
      </div>

      <div className="space-y-6 px-5 py-5">
        {stage === "idle" && (
          <div className="flex flex-col items-center justify-center gap-4 rounded-[14px] border-2 border-dashed border-[#E6E1D4] py-10">
            <Upload className="h-10 w-10 text-[#D8D2C4]" strokeWidth={1.25} />
            <div className="text-center">
              <p className="text-sm font-medium text-[#3A3A3A]">Upload a pre-builds CSV</p>
              <p className="mt-1 text-xs text-[#A0A0A0]">
                Columns: prebuild_name, category, subcategory, is_favourite, item_sku, item_qty.
              </p>
            </div>
            <label className={btnPrimary + " cursor-pointer"}>
              <Upload className="h-4 w-4" />
              Choose file
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="sr-only" onChange={handleFileChange} />
            </label>
          </div>
        )}

        {stage === "preview" && (
          <div className="space-y-4">
            {parseErrors.length > 0 && (
              <div className="rounded-[10px] border border-[#F0BFBF] bg-[#FBE5E5] px-4 py-3">
                <p className="mb-2 text-xs font-semibold text-[#C44545]">
                  {parseErrors.length} parse error{parseErrors.length !== 1 ? "s" : ""} — those rows are skipped:
                </p>
                <ul className="space-y-0.5">
                  {parseErrors.map((e, i) => <li key={i} className="text-xs text-[#C44545]">{e}</li>)}
                </ul>
              </div>
            )}
            {parsed.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-medium text-[#6B6B6B]">
                  {parsed.length} pre-build{parsed.length !== 1 ? "s" : ""} found ({totalItems} item line{totalItems !== 1 ? "s" : ""}):
                </p>
                <div className="overflow-x-auto rounded-[10px] border border-[#E6E1D4]">
                  <table className="min-w-full text-xs">
                    <thead className="border-b border-[#E6E1D4] bg-[#FAF8F2]">
                      <tr>
                        {["Pre-build", "Group", "Fav", "Items"].map((h) => (
                          <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EFEBE0]">
                      {parsed.slice(0, 20).map((p) => (
                        <tr key={p.name}>
                          <td className="px-3 py-2 text-[#1A1A1A]">{p.name}</td>
                          <td className="px-3 py-2 text-[#6B6B6B]">{p.category ? `${p.category}${p.subcategory ? ` › ${p.subcategory}` : ""}` : "—"}</td>
                          <td className="px-3 py-2">{p.isFavourite ? "★" : "—"}</td>
                          <td className="px-3 py-2 text-[#6B6B6B]">{p.items.map((it) => `${it.sku}×${it.qty}`).join(", ")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {parsed.length > 20 && <p className="px-3 py-2 text-xs text-[#A0A0A0]">…and {parsed.length - 20} more</p>}
                </div>
              </div>
            )}
            <div className="flex gap-2">
              <button type="button" onClick={handleReset} className={btnGhost}>
                <RefreshCw className="h-4 w-4" />
                Choose another file
              </button>
              {parsed.length > 0 && (
                <button type="button" onClick={() => void handlePlan()} disabled={busy} className={btnPrimary}>
                  {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Check SKUs &amp; duplicates
                </button>
              )}
            </div>
          </div>
        )}

        {stage === "plan" && plan && (
          <div className="space-y-5">
            <p className="text-sm font-medium text-[#1A1A1A]">Import plan ready — review before confirming:</p>
            <div className="flex flex-wrap gap-6">
              <SummaryChip count={plan.creates.length} label="to create" bg={TONE.sage.bg} fg={TONE.sage.fg} />
              <SummaryChip count={plan.skips.length} label="skipped" bg="#F0EDE4" fg="#8A8378" />
            </div>
            {plan.missingSkus.length > 0 && (
              <div className="rounded-[10px] border border-[#F0D9A8] bg-[#F9EFD9] px-4 py-3">
                <p className="mb-1 text-xs font-semibold text-[#C8841E]">
                  {plan.missingSkus.length} part{plan.missingSkus.length !== 1 ? "s" : ""} not in the catalogue — import the materials CSV first, then re-check:
                </p>
                <ul className="space-y-0.5">
                  {plan.missingSkus.slice(0, 10).map((m, i) => (
                    <li key={i} className="text-xs text-[#C8841E]">line {m.line}: {m.sku} (in “{m.prebuild}”)</li>
                  ))}
                  {plan.missingSkus.length > 10 && <li className="text-xs text-[#C8841E]">…and {plan.missingSkus.length - 10} more</li>}
                </ul>
              </div>
            )}
            {plan.skips.length > 0 && (
              <div>
                <button type="button" onClick={() => setSkipsOpen((v) => !v)} className="flex items-center gap-1.5 text-xs font-medium text-[#6B6B6B] hover:text-[#1A1A1A]">
                  {skipsOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  {skipsOpen ? "Hide" : "Show"} skip reasons
                </button>
                {skipsOpen && (
                  <ul className="mt-2 space-y-1 rounded-[10px] border border-[#E6E1D4] bg-[#FAF8F2] px-4 py-3">
                    {plan.skips.map((sk, i) => (
                      <li key={i} className="text-xs text-[#6B6B6B]">
                        <span className="font-medium text-[#3A3A3A]">{sk.name}</span>{" — "}{sk.reason}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <div className="flex gap-2">
              <button type="button" onClick={handleReset} className={btnGhost} disabled={busy}>Start over</button>
              <button type="button" onClick={() => void handleConfirm()} disabled={busy || plan.creates.length === 0} className={btnPrimary}>
                {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Confirm import
              </button>
            </div>
          </div>
        )}

        {stage === "result" && result && (
          <div className="space-y-4">
            <div className="rounded-[14px] border border-[#B8DFC7] bg-[#E5F2EA] px-5 py-4">
              <p className="text-sm font-semibold text-[#246F47]">Pre-build import complete</p>
              <div className="mt-3 flex flex-wrap gap-6">
                <SummaryChip count={result.created} label="created" bg={TONE.sage.bg} fg={TONE.sage.fg} />
                <SummaryChip count={result.itemsAdded} label="item lines" bg={TONE.amber.bg} fg={TONE.amber.fg} />
              </div>
            </div>
            {result.failed.count > 0 && (
              <div className="space-y-1 rounded-[10px] border border-[#F0BFBF] bg-[#FBE5E5] px-4 py-3">
                <p className="text-xs font-semibold text-[#C44545]">
                  {result.failed.count} pre-build{result.failed.count !== 1 ? "s" : ""} failed — nothing partial was kept, so fix the cause and retry from the updated plan.
                </p>
                {result.failed.firstError && <p className="text-xs text-[#C44545]">First error: {result.failed.firstError}</p>}
              </div>
            )}
            <div className="flex items-center gap-2">
              <button type="button" onClick={handleReset} className={btnPrimary}>Import another file</button>
              {plan ? (
                <button type="button" onClick={() => setStage("plan")} className={btnGhost}>Review updated plan</button>
              ) : (
                <span className="text-xs text-[#A0A0A0]">Refreshing the plan against the catalogue…</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

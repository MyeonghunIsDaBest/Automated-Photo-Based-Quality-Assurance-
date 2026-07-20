// ─────────────────────────────────────────────────────────────────────────────
// pages/catalogue/ImportTab.tsx
//
// CSV import flow:
//   1. File input (.csv) → FileReader (with onerror handler) → parseMaterialsCsv
//   2. Errors list (row numbers) + valid-row preview table
//      Note: rows with parse errors are skipped; valid rows proceed.
//   3. listMaterials({includeInactive:true}) → planImport → summary chips
//      (N to add / N to update / N skipped + expandable skip reasons)
//   4. Confirm → runImport → result panel (with warning if failures > 0)
//      After any confirm attempt the plan is re-computed (handlePlan re-run)
//      so the next confirm reflects reality and sku-less rows are not
//      duplicated.
//
// Template download: client-side blob with 7-header line + 1 example row.
// Busy/disable throughout.
// ─────────────────────────────────────────────────────────────────────────────

import { useRef, useState } from "react";
import { Upload, Download, RefreshCw, ChevronDown, ChevronRight, Loader2 } from "lucide-react";

import { cardShell, btnPrimary, btnGhost, TONE } from "../gantt/components/ledger";
import { Toaster, type ToastState } from "../../components/ui/Toaster";

import { parseMaterialsCsv, planImport, planSupplierResolution, type CsvMaterialRow, type ImportPlan, type SupplierPlan } from "../../lib/catalogue/csv";
import { listMaterials, runImport } from "../../lib/api/materials";
import { listSuppliers } from "../../lib/api/suppliers";
import PrebuildImportCard from "./PrebuildImportCard";

// ─── types ────────────────────────────────────────────────────────────────────

type Stage = "idle" | "preview" | "plan" | "result";

interface Props {
  onWritten: () => void;
}

// ─── template CSV content ─────────────────────────────────────────────────────

const CSV_TEMPLATE =
  "sku,name,unit,cost_price,sell_price,tags,description,category,subcategory,is_stock_item,is_favourite,supplier,supplier_sku\r\n" +
  'TPS25,"2.5mm TPS cable",m,1.10,2.20,cable|consumable,Twin and earth,Electrical,Cables,yes,no,AWM Electrical,10023756\r\n';

// ─── summary chip ─────────────────────────────────────────────────────────────

function SummaryChip({
  count,
  label,
  bg,
  fg,
}: {
  count: number;
  label: string;
  bg: string;
  fg: string;
}) {
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

// ─── component ───────────────────────────────────────────────────────────────

export default function ImportTab({ onWritten }: Props) {
  const fileRef  = useRef<HTMLInputElement>(null);
  // Bumped on reset/new file so an in-flight re-plan can't resurrect a stage
  // the user has already left.
  const planSeq  = useRef(0);

  const [stage, setStage]       = useState<Stage>("idle");
  const [busy, setBusy]         = useState(false);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [validRows, setValidRows]     = useState<CsvMaterialRow[]>([]);
  const [plan, setPlan]               = useState<ImportPlan | null>(null);
  const [supplierPlan, setSupplierPlan] = useState<SupplierPlan | null>(null);
  const [skipsOpen, setSkipsOpen]     = useState(false);
  const [result, setResult]           = useState<{
    added: number;
    updated: number;
    skipped: number;
    failed: { count: number; firstError: string | null };
    suppliersCreated: number;
    skusLinked: number;
    skusParkedNoSupplier: number;
  } | null>(null);
  const [toast, setToast]             = useState<ToastState>(null);

  function downloadTemplate() {
    const blob = new Blob([CSV_TEMPLATE], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = "materials-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    planSeq.current += 1;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const { rows, errors } = parseMaterialsCsv(text);
      setParseErrors(errors);
      setValidRows(rows);
      setPlan(null);
      setResult(null);
      setStage("preview");
    };
    reader.onerror = () => {
      setToast({ message: "Failed to read file — please try again", type: "error" });
      setStage("idle");
    };
    reader.readAsText(file);
  }

  async function handlePlan(opts?: { refreshOnly?: boolean }) {
    const seq = planSeq.current;
    setBusy(true);
    try {
      const [existing, suppliers] = await Promise.all([
        listMaterials({ includeInactive: true }),
        listSuppliers().catch(() => []),
      ]);
      if (seq !== planSeq.current) return; // user reset / picked a new file mid-flight
      const p = planImport(
        existing.map((m) => ({
          id: m.id,
          sku: m.sku,
          name: m.name,
          isActive: m.isActive,
        })),
        validRows,
      );
      setPlan(p);
      setSupplierPlan(planSupplierResolution(suppliers.map((s) => ({ id: s.id, name: s.name })), validRows));
      setSkipsOpen(false);
      // refreshOnly (post-confirm): update the plan in place so the result
      // panel stays visible — the user switches over via "Review updated plan".
      if (!opts?.refreshOnly) setStage("plan");
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : "Failed to fetch existing materials", type: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirm() {
    if (!plan) return;
    setBusy(true);
    try {
      const res = await runImport(plan, supplierPlan ?? undefined);
      setResult(res);
      // The pre-import plan is stale now — drop it so nobody can confirm it
      // twice (sku-less adds would duplicate), and refresh it in place while
      // the result panel stays on screen.
      setPlan(null);
      setStage("result");
      onWritten();
      if (res.failed.count === 0) {
        setToast({ message: `Import complete: ${res.added} added, ${res.updated} updated`, type: "success" });
      } else {
        setToast({
          message: `Import finished with ${res.failed.count} failure${res.failed.count !== 1 ? "s" : ""} — see details below`,
          type: "info",
        });
      }
      void handlePlan({ refreshOnly: true });
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : "Import failed", type: "error" });
    } finally {
      setBusy(false);
    }
  }

  function handleReset() {
    planSeq.current += 1;
    setStage("idle");
    setParseErrors([]);
    setValidRows([]);
    setPlan(null);
    setSupplierPlan(null);
    setResult(null);
    setSkipsOpen(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className="space-y-6">
    <div className={`${cardShell} overflow-hidden`}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#E6E1D4] px-5 py-4">
        <div>
          <h2 className="text-[13px] font-semibold text-[#1A1A1A]">CSV Import</h2>
          <p className="mt-0.5 text-xs text-[#6B6B6B]">
            Bulk-add or update materials via spreadsheet. Matches on SKU first, then active name.
          </p>
        </div>
        <button
          type="button"
          onClick={downloadTemplate}
          className={btnGhost}
        >
          <Download className="h-4 w-4" />
          Template
        </button>
      </div>

      <div className="px-5 py-5 space-y-6">

        {/* ── Stage: idle ──────────────────────────────────────────────── */}
        {stage === "idle" && (
          <div className="flex flex-col items-center justify-center py-12 gap-4 border-2 border-dashed border-[#E6E1D4] rounded-[14px]">
            <Upload className="h-10 w-10 text-[#D8D2C4]" strokeWidth={1.25} />
            <div className="text-center">
              <p className="text-sm font-medium text-[#3A3A3A]">Upload a CSV file to import materials</p>
              <p className="mt-1 text-xs text-[#A0A0A0]">
                Needs the 7 core columns; group/subgroup/stock/favourite/wholesaler columns are optional. Download the template to see all 13.
              </p>
            </div>
            <label className={btnPrimary + " cursor-pointer"}>
              <Upload className="h-4 w-4" />
              Choose file
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                onChange={handleFileChange}
              />
            </label>
          </div>
        )}

        {/* ── Stage: preview ────────────────────────────────────────────── */}
        {stage === "preview" && (
          <div className="space-y-4">
            {/* Parse errors */}
            {parseErrors.length > 0 && (
              <div className="rounded-[10px] border border-[#F0BFBF] bg-[#FBE5E5] px-4 py-3">
                <p className="mb-2 text-xs font-semibold text-[#C44545]">
                  {parseErrors.length} parse error{parseErrors.length !== 1 ? "s" : ""} — invalid rows will be skipped:
                </p>
                <ul className="space-y-0.5">
                  {parseErrors.map((e, i) => (
                    <li key={i} className="text-xs text-[#C44545]">{e}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Valid rows preview */}
            {validRows.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-medium text-[#6B6B6B]">
                  {validRows.length} valid row{validRows.length !== 1 ? "s" : ""} found:
                </p>
                <div className="overflow-x-auto rounded-[10px] border border-[#E6E1D4]">
                  <table className="min-w-full text-xs">
                    <thead className="bg-[#FAF8F2] border-b border-[#E6E1D4]">
                      <tr>
                        {["SKU", "Name", "Unit", "Cost", "Sell", "Group", "Stock", "Fav", "Tags", "Description"].map((h) => (
                          <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EFEBE0]">
                      {validRows.slice(0, 20).map((row, i) => (
                        <tr key={i}>
                          <td className="px-3 py-2 font-mono text-[#6B6B6B]">{row.sku ?? "—"}</td>
                          <td className="px-3 py-2 text-[#1A1A1A]">{row.name}</td>
                          <td className="px-3 py-2">{row.unit ?? "—"}</td>
                          <td className="px-3 py-2 tabular-nums">{row.costPrice != null ? `$${row.costPrice.toFixed(2)}` : "—"}</td>
                          <td className="px-3 py-2 tabular-nums">{row.sellPrice != null ? `$${row.sellPrice.toFixed(2)}` : "—"}</td>
                          <td className="px-3 py-2 text-[#6B6B6B]">{row.category ? `${row.category}${row.subcategory ? ` › ${row.subcategory}` : ""}` : "—"}</td>
                          <td className="px-3 py-2">{row.isStockItem == null ? "—" : row.isStockItem ? "✓" : "✕"}</td>
                          <td className="px-3 py-2">{row.isFavourite == null ? "—" : row.isFavourite ? "★" : "—"}</td>
                          <td className="px-3 py-2">{row.tags.join(", ") || "—"}</td>
                          <td className="px-3 py-2 max-w-[160px] truncate text-[#6B6B6B]">{row.description ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {validRows.length > 20 && (
                    <p className="px-3 py-2 text-xs text-[#A0A0A0]">...and {validRows.length - 20} more rows</p>
                  )}
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <button type="button" onClick={handleReset} className={btnGhost}>
                <RefreshCw className="h-4 w-4" />
                Choose another file
              </button>
              {validRows.length > 0 && (
                <button
                  type="button"
                  onClick={() => void handlePlan()}
                  disabled={busy}
                  className={btnPrimary}
                >
                  {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Check for duplicates
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Stage: plan ───────────────────────────────────────────────── */}
        {stage === "plan" && plan && (
          <div className="space-y-5">
            <p className="text-sm font-medium text-[#1A1A1A]">Import plan ready — review before confirming:</p>

            {/* Summary chips */}
            <div className="flex flex-wrap gap-6">
              <SummaryChip count={plan.adds.length} label="to add" bg={TONE.sage.bg} fg={TONE.sage.fg} />
              <SummaryChip count={plan.updates.length} label="to update" bg={TONE.amber.bg} fg={TONE.amber.fg} />
              <SummaryChip count={plan.skips.length} label="skipped" bg="#F0EDE4" fg="#8A8378" />
            </div>

            {/* Wholesaler resolution — shown only when the file carries supplier columns */}
            {supplierPlan && (supplierPlan.links.size > 0 || supplierPlan.creates.length > 0) && (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-6">
                  {supplierPlan.links.size > 0 && (
                    <SummaryChip count={supplierPlan.links.size} label="linked to existing wholesalers" bg={TONE.sky.bg} fg={TONE.sky.fg} />
                  )}
                  {supplierPlan.creates.length > 0 && (
                    <SummaryChip count={supplierPlan.creates.length} label="NEW wholesalers will be created" bg={TONE.violet.bg} fg={TONE.violet.fg} />
                  )}
                </div>
                {supplierPlan.creates.length > 0 && (
                  <p className="text-xs text-[#6B6B6B]">
                    Will create: <span className="font-medium text-[#3A3A3A]">{supplierPlan.creates.join(", ")}</span>
                    {" "}— add contact details later in Admin → Suppliers.
                  </p>
                )}
              </div>
            )}

            {/* Skip reasons expandable */}
            {plan.skips.length > 0 && (
              <div>
                <button
                  type="button"
                  onClick={() => setSkipsOpen((v) => !v)}
                  className="flex items-center gap-1.5 text-xs font-medium text-[#6B6B6B] hover:text-[#1A1A1A]"
                >
                  {skipsOpen ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5" />
                  )}
                  {skipsOpen ? "Hide" : "Show"} skip reasons
                </button>
                {skipsOpen && (
                  <ul className="mt-2 space-y-1 rounded-[10px] border border-[#E6E1D4] bg-[#FAF8F2] px-4 py-3">
                    {plan.skips.map((s, i) => (
                      <li key={i} className="text-xs text-[#6B6B6B]">
                        <span className="font-medium text-[#3A3A3A]">{s.row.name}</span>
                        {" — "}
                        {s.reason}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div className="flex gap-2">
              <button type="button" onClick={handleReset} className={btnGhost} disabled={busy}>
                Start over
              </button>
              <button
                type="button"
                onClick={() => void handleConfirm()}
                disabled={busy || (plan.adds.length === 0 && plan.updates.length === 0)}
                className={btnPrimary}
              >
                {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Confirm import
              </button>
            </div>
          </div>
        )}

        {/* ── Stage: result ─────────────────────────────────────────────── */}
        {stage === "result" && result && (
          <div className="space-y-4">
            <div className="rounded-[14px] border border-[#B8DFC7] bg-[#E5F2EA] px-5 py-4">
              <p className="text-sm font-semibold text-[#246F47]">Import complete</p>
              <div className="mt-3 flex flex-wrap gap-6">
                <SummaryChip count={result.added} label="added" bg={TONE.sage.bg} fg={TONE.sage.fg} />
                <SummaryChip count={result.updated} label="updated" bg={TONE.amber.bg} fg={TONE.amber.fg} />
                <SummaryChip count={result.skipped} label="skipped" bg="#F0EDE4" fg="#8A8378" />
                {result.suppliersCreated > 0 && (
                  <SummaryChip count={result.suppliersCreated} label="wholesalers created" bg={TONE.violet.bg} fg={TONE.violet.fg} />
                )}
                {result.skusLinked > 0 && (
                  <SummaryChip count={result.skusLinked} label="supplier codes linked" bg={TONE.sky.bg} fg={TONE.sky.fg} />
                )}
              </div>
              {result.skusParkedNoSupplier > 0 && (
                <p className="mt-2 text-xs text-[#6B6B6B]">
                  {result.skusParkedNoSupplier} supplier code{result.skusParkedNoSupplier !== 1 ? "s" : ""} had no wholesaler name in the file —
                  fill the <span className="font-mono">supplier</span> column and re-import (matched by SKU) to link them.
                </p>
              )}
            </div>
            {result.failed.count > 0 && (
              <div className="rounded-[10px] border border-[#F0BFBF] bg-[#FBE5E5] px-4 py-3 space-y-1">
                <p className="text-xs font-semibold text-[#C44545]">
                  {result.failed.count} row{result.failed.count !== 1 ? "s" : ""} failed to import.
                  {" "}Already-imported rows will be skipped or updated on re-run — review the updated plan before retrying.
                </p>
                {result.failed.firstError && (
                  <p className="text-xs text-[#C44545]">First error: {result.failed.firstError}</p>
                )}
              </div>
            )}
            <div className="flex items-center gap-2">
              <button type="button" onClick={handleReset} className={btnPrimary}>
                Import another file
              </button>
              {plan ? (
                <button type="button" onClick={() => setStage("plan")} className={btnGhost}>
                  Review updated plan
                </button>
              ) : (
                <span className="text-xs text-[#A0A0A0]">Refreshing the plan against the catalogue…</span>
              )}
            </div>
          </div>
        )}

      </div>
    </div>

    {/* Pre-builds import (P3) — assemblies matched to catalogue parts by SKU */}
    <PrebuildImportCard onWritten={onWritten} onToast={setToast} />

    {toast && (
      <Toaster message={toast.message} type={toast.type} onClose={() => setToast(null)} />
    )}
    </div>
  );
}

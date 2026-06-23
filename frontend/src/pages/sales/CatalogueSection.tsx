// ─────────────────────────────────────────────────────────────────────────────
// pages/sales/CatalogueSection.tsx
//
// The Catalogue's five sub-tabs (Materials / Prebuilds / Templates / Import /
// Suggestions), extracted from the old standalone Catalogue page so the
// catalogue can live as a tab UNDER Sales (Service Quotes) — one home for the
// commercial workflow. The sub-tab is driven by a `?cat=` param so it coexists
// with the Sales page's own `?tab=`. Inline counts replace the old masthead
// chips.
// ─────────────────────────────────────────────────────────────────────────────

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";

import { lazyWithRetry } from "../../lib/lazyWithRetry";
import { cardShell } from "../gantt/components/ledger";
import { SkeletonCard } from "../../components/ui/skeleton";
import { listMaterials, listPrebuilds, listCandidates } from "../../lib/api/materials";

// ─── lazy sub-tabs (live in pages/catalogue) ────────────────────────────────────

const MaterialsTab   = lazyWithRetry(() => import("../catalogue/MaterialsTab"));
const PrebuildsTab   = lazyWithRetry(() => import("../catalogue/PrebuildsTab"));
const TemplatesTab   = lazyWithRetry(() => import("../catalogue/TemplatesTab"));
const ImportTab      = lazyWithRetry(() => import("../catalogue/ImportTab"));
const SuggestionsTab = lazyWithRetry(() => import("../catalogue/SuggestionsTab"));

type CatKey = "materials" | "prebuilds" | "templates" | "import" | "suggestions";

interface Props {
  /** Bubble writes up so the Sales masthead counts can refresh. */
  onChanged?: () => void;
}

// ─── sub-tab pill ───────────────────────────────────────────────────────────────

function SubPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-medium transition-colors ${
        active ? "text-white" : "text-[#6B6B6B] hover:bg-[#F0EDE4] hover:text-[#1A1A1A]"
      }`}
    >
      {active && (
        <motion.span
          layoutId="catalogue-subtab-pill"
          className="absolute inset-0 rounded-xl bg-[#1A1A1A] shadow-sm"
          transition={{ type: "spring", damping: 30, stiffness: 360 }}
        />
      )}
      <span className="relative z-10">{label}</span>
    </button>
  );
}

function TabFallback() {
  return (
    <div className="grid gap-3" aria-busy="true" aria-label="Loading tab">
      <SkeletonCard />
      <SkeletonCard />
    </div>
  );
}

const TABS: { key: CatKey; label: string }[] = [
  { key: "materials",   label: "Materials"   },
  { key: "prebuilds",   label: "Prebuilds"   },
  { key: "templates",   label: "Templates"   },
  { key: "import",      label: "Import"      },
  { key: "suggestions", label: "Suggestions" },
];

export default function CatalogueSection({ onChanged }: Props) {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawCat = searchParams.get("cat");
  const VALID: CatKey[] = ["materials", "prebuilds", "templates", "import", "suggestions"];
  const activeCat: CatKey = VALID.includes(rawCat as CatKey) ? (rawCat as CatKey) : "materials";

  const [counts, setCounts] = useState({ materials: 0, prebuilds: 0, pending: 0 });

  const fetchCounts = useCallback(async () => {
    try {
      const [mats, pbs, cands] = await Promise.all([
        listMaterials(),
        listPrebuilds(),
        listCandidates("pending"),
      ]);
      setCounts({ materials: mats.length, prebuilds: pbs.length, pending: cands.length });
    } catch {
      // counts are informational — silent failure
    }
  }, []);

  useEffect(() => { void fetchCounts(); }, [fetchCounts]);

  const bump = useCallback(() => { void fetchCounts(); onChanged?.(); }, [fetchCounts, onChanged]);

  const switchCat = (cat: CatKey) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("cat", cat);
      return next;
    }, { replace: true });
  };

  return (
    <div className="space-y-4">
      {/* Sub-tab strip + inline counts */}
      <div className={`${cardShell} flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3`}>
        <div className="inline-flex items-center gap-1 rounded-2xl border border-[#E6E1D4] bg-[#FAF8F2] p-1">
          {TABS.map(({ key, label }) => (
            <SubPill key={key} label={label} active={activeCat === key} onClick={() => switchCat(key)} />
          ))}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-4 text-[12px] text-[#6B6B6B]">
          <span><span className="font-semibold tabular-nums text-[#1A1A1A]">{counts.materials}</span> materials</span>
          <span><span className="font-semibold tabular-nums text-[#1A1A1A]">{counts.prebuilds}</span> prebuilds</span>
          <span>
            <span className={`font-semibold tabular-nums ${counts.pending > 0 ? "text-[#C8841E]" : "text-[#1A1A1A]"}`}>{counts.pending}</span> pending
          </span>
        </div>
      </div>

      <Suspense fallback={<TabFallback />}>
        {activeCat === "materials"   && <MaterialsTab   onWritten={bump} />}
        {activeCat === "prebuilds"   && <PrebuildsTab   onWritten={bump} />}
        {activeCat === "templates"   && <TemplatesTab   onWritten={bump} />}
        {activeCat === "import"      && <ImportTab      onWritten={bump} />}
        {activeCat === "suggestions" && <SuggestionsTab onWritten={bump} />}
      </Suspense>
    </div>
  );
}

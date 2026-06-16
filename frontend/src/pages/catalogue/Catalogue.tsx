// ─────────────────────────────────────────────────────────────────────────────
// pages/catalogue/Catalogue.tsx — entry shell for the Materials Catalogue.
//
// Guard: canManageCatalogue → Navigate to "/" AFTER all hooks (denied-flag
// pattern from JobsBoard / JobsHub).
//
// Masthead: editorial kicker tile (OFFICE · REFERENCE), Fraunces "Catalogue.",
//   count chips (N materials / N prebuilds / N pending suggestions).
//   bumpCounts() prop drilled to tabs — each write action calls it to refresh.
//
// Sub-tabs: Materials | Prebuilds | Import | Suggestions
//   driven by ?tab= search param (JobsHub grammar). Default: materials.
// ─────────────────────────────────────────────────────────────────────────────

import { Suspense, useCallback, useEffect, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { lazyWithRetry } from "../../lib/lazyWithRetry";
import { motion } from "framer-motion";
import { BookOpen } from "lucide-react";

import { useAppStore } from "../../store";
import { canManageCatalogue } from "../../lib/permissions";
import { FRAUNCES, TONE, cardShell } from "../gantt/components/ledger";
import { SkeletonCard } from "../../components/ui/skeleton";

import {
  listMaterials,
  listPrebuilds,
  listCandidates,
} from "../../lib/api/materials";

// ─── lazy sub-tabs ────────────────────────────────────────────────────────────

const MaterialsTab   = lazyWithRetry(() => import("./MaterialsTab"));
const PrebuildsTab   = lazyWithRetry(() => import("./PrebuildsTab"));
const ImportTab      = lazyWithRetry(() => import("./ImportTab"));
const SuggestionsTab = lazyWithRetry(() => import("./SuggestionsTab"));

// ─── types ────────────────────────────────────────────────────────────────────

type TabKey = "materials" | "prebuilds" | "import" | "suggestions";

interface CountState {
  materials: number;
  prebuilds: number;
  pending: number;
}

// ─── tab strip pill ───────────────────────────────────────────────────────────

function TabPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "text-white"
          : "text-[#6B6B6B] hover:bg-[#F0EDE4] hover:text-[#1A1A1A]"
      }`}
    >
      {active && (
        <motion.span
          layoutId="catalogue-tab-pill"
          className="absolute inset-0 rounded-xl bg-[#1A1A1A] shadow-sm"
          transition={{ type: "spring", damping: 30, stiffness: 360 }}
        />
      )}
      <span className="relative z-10">{label}</span>
    </button>
  );
}

// ─── count chip ───────────────────────────────────────────────────────────────

function CountChip({
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
      <span className="text-[13px] font-medium text-[#3A3A3A]">{label}</span>
    </div>
  );
}

// ─── tab skeleton fallback ────────────────────────────────────────────────────

function TabFallback() {
  return (
    <div className="grid gap-3" aria-busy="true" aria-label="Loading tab">
      <SkeletonCard />
      <SkeletonCard />
    </div>
  );
}

// ─── component ───────────────────────────────────────────────────────────────

export default function Catalogue() {
  const currentProfile = useAppStore((s) => s.currentProfile);
  const currentUser    = useAppStore((s) => s.currentUser);

  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get("tab");
  const VALID_TABS: TabKey[] = ["materials", "prebuilds", "import", "suggestions"];
  const activeTab: TabKey = VALID_TABS.includes(rawTab as TabKey)
    ? (rawTab as TabKey)
    : "materials";

  // Denied flag — guard fires AFTER all hooks
  const denied = !canManageCatalogue(currentProfile ?? currentUser);

  // Counts for masthead chips
  const [counts, setCounts] = useState<CountState>({ materials: 0, prebuilds: 0, pending: 0 });

  const fetchCounts = useCallback(async () => {
    try {
      const [mats, pbs, cands] = await Promise.all([
        listMaterials(),
        listPrebuilds(),
        listCandidates("pending"),
      ]);
      setCounts({
        materials: mats.length,
        prebuilds: pbs.length,
        pending: cands.length,
      });
    } catch {
      // counts are informational — silent failure
    }
  }, []);

  useEffect(() => {
    if (!denied) {
      void fetchCounts();
    }
  }, [denied, fetchCounts]);

  // bumpCounts is passed down to tabs so they can trigger a refresh after writes
  const bumpCounts = useCallback(() => { void fetchCounts(); }, [fetchCounts]);

  // Normalize missing or invalid ?tab= to "materials"
  useEffect(() => {
    if (!rawTab || !VALID_TABS.includes(rawTab as TabKey)) {
      setSearchParams({ tab: "materials" }, { replace: true });
    }
  }, [rawTab, setSearchParams]);

  if (denied) {
    return <Navigate to="/" replace />;
  }

  const switchTab = (tab: TabKey) => {
    setSearchParams({ tab }, { replace: true });
  };

  const TABS: { key: TabKey; label: string }[] = [
    { key: "materials",   label: "Materials"   },
    { key: "prebuilds",   label: "Prebuilds"   },
    { key: "import",      label: "Import"      },
    { key: "suggestions", label: "Suggestions" },
  ];

  return (
    <div
      className="flex min-h-screen flex-col bg-[#F5F2E9]"
      style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}
    >
      <div className="mx-auto w-full max-w-[1400px] px-4 py-5 sm:px-6">

        {/* ── Masthead ───────────────────────────────────────────────────────── */}
        <div className={`mb-5 ${cardShell}`}>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-4 px-5 py-5 sm:px-6">

            {/* Kicker tile */}
            <div className="w-16 min-w-16 overflow-hidden rounded-[11px] border border-[#E6E1D4] bg-white text-center">
              <div className="bg-[#1A1A1A] py-1 text-[10px] font-semibold tracking-[0.16em] text-white">
                REF
              </div>
              <div className="grid place-items-center py-2.5 text-[#1A1A1A]">
                <BookOpen className="h-6 w-6" strokeWidth={1.5} />
              </div>
            </div>

            {/* Title block */}
            <div className="leading-tight">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#6B6B6B]">
                OFFICE &middot; REFERENCE
              </div>
              <h1
                className="m-0 text-[28px] font-medium leading-none text-[#1A1A1A] sm:text-[30px]"
                style={{ fontFamily: FRAUNCES, letterSpacing: "-0.015em" }}
              >
                Catalogue.
              </h1>
            </div>

            {/* Hairline divider */}
            <div className="hidden h-12 w-px bg-[#EFEBE0] sm:block" aria-hidden />

            {/* Count chips */}
            <div className="flex flex-wrap items-center gap-6 sm:gap-8">
              <CountChip
                count={counts.materials}
                label="materials"
                bg={TONE.sage.bg}
                fg={TONE.sage.fg}
              />
              <CountChip
                count={counts.prebuilds}
                label="prebuilds"
                bg={TONE.ink.bg}
                fg={TONE.ink.fg}
              />
              <CountChip
                count={counts.pending}
                label="pending suggestions"
                bg={counts.pending > 0 ? TONE.amber.bg : "#F5F2E9"}
                fg={counts.pending > 0 ? TONE.amber.fg : "#A0A0A0"}
              />
            </div>

            {/* Right: tab strip */}
            <div className="ml-auto">
              <div className="inline-flex items-center gap-1 rounded-2xl border border-[#E6E1D4] bg-[#FAF8F2] p-1">
                {TABS.map(({ key, label }) => (
                  <TabPill
                    key={key}
                    label={label}
                    active={activeTab === key}
                    onClick={() => switchTab(key)}
                  />
                ))}
              </div>
            </div>

          </div>
        </div>

        {/* ── Tab body ──────────────────────────────────────────────────────── */}
        <Suspense fallback={<TabFallback />}>
          {activeTab === "materials" && (
            <MaterialsTab onWritten={bumpCounts} />
          )}
          {activeTab === "prebuilds" && (
            <PrebuildsTab onWritten={bumpCounts} />
          )}
          {activeTab === "import" && (
            <ImportTab onWritten={bumpCounts} />
          )}
          {activeTab === "suggestions" && (
            <SuggestionsTab onWritten={bumpCounts} />
          )}
        </Suspense>

      </div>
    </div>
  );
}

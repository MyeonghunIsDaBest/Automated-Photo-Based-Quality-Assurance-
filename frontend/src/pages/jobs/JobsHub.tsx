// JobsHub — /jobs route shell (IA consolidation, Task 4).
//
// Layout:
//   • Guard: canViewJobsBoard — bounces unauthorised principals to /.
//   • Masthead (single dense bar, per mock): kicker tile + eyebrow + Fraunces
//     "Work." title, vertical hairline, then the stat chips INLINE
//     (open / due this week / overdue — derived from the card snapshot fed
//     back by JobsBoard via onCardsChanged). Right: icon-only help button
//     (hover tooltip, opens ShortcutsModal) + Board|Projects view switcher.
//   • Suspense-lazy JobsBoard (embedded prop) and Projects page per active view.
//
// Seam design (unchanged):
//   onCardsChanged — JobsBoard calls after every fetch; hub derives stats.
//   embedded — JobsBoard hides its LedgerHeader title block.

import { Suspense, useCallback, useState } from "react";
import { lazyWithRetry } from "../../lib/lazyWithRetry";
import { BoardSkeleton, SkeletonCard } from "../../components/ui/skeleton";
import { Navigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ClipboardList, FolderOpen, KanbanSquare, HelpCircle, Upload } from "lucide-react";

import { useAppStore } from "../../store";
import { canViewJobsBoard } from "../../lib/permissions";
import { FRAUNCES, TONE } from "../gantt/components/ledger";
import type { BoardCard } from "../../lib/api/jobsBoard";
import { ShortcutsModal } from "./ShortcutsModal";

// ─── lazy views ──────────────────────────────────────────────────────────────

// lazyWithRetry (not bare lazy): inner views get the same chunk-failure
// retry + one-shot reload protection as top-level routes.
const JobsBoard     = lazyWithRetry(() => import("./JobsBoard"));
const Projects      = lazyWithRetry(() => import("../Projects"));
const SimproJobsTab = lazyWithRetry(() => import("./SimproJobsTab"));

// ─── loading fallbacks — view-shaped skeletons, never a blank flash ──────────

function ProjectsGridSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2" aria-busy="true" aria-label="Loading projects">
      <SkeletonCard />
      <SkeletonCard className="hidden sm:block" />
      <SkeletonCard />
      <SkeletonCard className="hidden sm:block" />
    </div>
  );
}

// ─── stat derivation ─────────────────────────────────────────────────────────

// Terminal/closed board columns (mig 76: Completed/Invoiced/Paid). Cancelled +
// archived arrive via card.cancelled / card.archived, not as columns.
const DONE_STATUSES = new Set(["completed", "invoiced", "paid"]);

function deriveStats(cards: BoardCard[]): { open: number; dueThisWeek: number; overdue: number } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekFromNow = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

  let open = 0;
  let dueThisWeek = 0;
  let overdue = 0;

  for (const card of cards) {
    const isDone = card.cancelled || card.archived || DONE_STATUSES.has(card.column);
    if (!isDone) open++;

    if (card.scheduledFor) {
      const due = new Date(card.scheduledFor + "T00:00:00");
      if (!isDone) {
        if (due < today) {
          overdue++;
        } else if (due < weekFromNow) {
          dueThisWeek++;
        }
      }
    }
  }

  return { open, dueThisWeek, overdue };
}

// ─── stat chip ───────────────────────────────────────────────────────────────

function StatChip({
  count, label, sublabel, bg, fg,
}: { count: number; label: string; sublabel?: string; bg: string; fg: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className="flex h-9 w-9 items-center justify-center rounded-full text-[15px] font-semibold tabular-nums"
        style={{ backgroundColor: bg, color: fg }}
      >
        {count}
      </span>
      <span className="leading-tight">
        <span className="block text-[13px] font-medium text-[#3A3A3A]">{label}</span>
        {sublabel && (
          <span className="block text-[11px] text-[#A0A0A0]">{sublabel}</span>
        )}
      </span>
    </div>
  );
}

// ─── component ───────────────────────────────────────────────────────────────

export default function JobsHub() {
  const currentProfile = useAppStore((s) => s.currentProfile);
  const currentUser    = useAppStore((s) => s.currentUser);

  const [searchParams, setSearchParams] = useSearchParams();
  const rawView = searchParams.get("view");
  const view: "board" | "projects" | "simpro" =
    rawView === "projects" ? "projects" : rawView === "simpro" ? "simpro" : "board";

  const [boardCards, setBoardCards] = useState<BoardCard[]>([]);
  const handleCardsChanged = useCallback((cards: BoardCard[]) => {
    setBoardCards(cards);
  }, []);

  const [showShortcuts, setShowShortcuts] = useState(false);

  if (!canViewJobsBoard(currentProfile ?? currentUser)) {
    return <Navigate to="/" replace />;
  }

  const stats = deriveStats(boardCards);

  const switchView = (next: "board" | "projects" | "simpro") => {
    setSearchParams(next === "board" ? {} : { view: next }, { replace: true });
  };

  return (
    <div
      className="flex min-h-screen flex-col bg-[#F5F2E9]"
      style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}
    >
      <div className="mx-auto w-full max-w-[1400px] px-4 py-5 sm:px-6">

        {/* ── Masthead — one dense bar (kicker · title │ stats … help · switcher) ── */}
        <div className="mb-5 rounded-[14px] border border-[#E6E1D4] bg-white shadow-[0_1px_2px_rgba(20,20,20,0.04)]">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-4 px-5 py-5 sm:px-6">
            {/* Kicker tile */}
            <div className="w-16 min-w-16 overflow-hidden rounded-[11px] border border-[#E6E1D4] bg-white text-center">
              <div className="bg-[#1A1A1A] py-1 text-[10px] font-semibold tracking-[0.16em] text-white">OPS</div>
              <div className="grid place-items-center py-2.5 text-[#1A1A1A]">
                <KanbanSquare className="h-6 w-6" strokeWidth={1.5} />
              </div>
            </div>

            {/* Title block */}
            <div className="leading-tight">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#6B6B6B]">
                OPERATIONS · LIVE
              </div>
              <h1
                className="m-0 text-[28px] font-medium leading-none text-[#1A1A1A] sm:text-[30px]"
                style={{ fontFamily: FRAUNCES, letterSpacing: "-0.015em" }}
              >
                Work.
              </h1>
            </div>

            {/* Hairline divider (hidden when the row wraps on small screens) */}
            <div className="hidden h-12 w-px bg-[#EFEBE0] sm:block" aria-hidden />

            {/* Stat blocks — inline, sized to be read across the room */}
            <div className="flex flex-wrap items-center gap-6 sm:gap-8">
              <StatChip count={stats.open} label="open" sublabel="jobs on the books" bg={TONE.sage.bg} fg={TONE.sage.fg} />
              <StatChip count={stats.dueThisWeek} label="due this week" sublabel="next 7 days" bg={TONE.amber.bg} fg={TONE.amber.fg} />
              <StatChip
                count={stats.overdue}
                label="overdue"
                sublabel={stats.overdue > 0 ? "needs attention" : "all on time"}
                bg={stats.overdue > 0 ? TONE.red.bg : "#F5F2E9"}
                fg={stats.overdue > 0 ? TONE.red.fg : "#A0A0A0"}
              />
            </div>

            {/* Right side: help icon + view switcher */}
            <div className="ml-auto flex items-center gap-2">
              {/* Icon-only help button — tooltip on hover, opens the cheat sheet */}
              <button
                type="button"
                onClick={() => setShowShortcuts(true)}
                title="Keyboard shortcuts (press ?)"
                aria-label="Keyboard shortcuts"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-[#E6E1D4] bg-[#FAF8F2] text-[#6B6B6B] transition-colors hover:border-[#D8D2C4] hover:bg-white hover:text-[#1A1A1A]"
              >
                <HelpCircle className="h-4 w-4" strokeWidth={1.75} />
              </button>

              {/* View switcher — Gantt tab-strip grammar */}
              <div className="inline-flex items-center gap-1 rounded-2xl border border-[#E6E1D4] bg-[#FAF8F2] p-1">
                {([
                  { key: "board",    label: "Board",        Icon: ClipboardList },
                  { key: "projects", label: "Projects",     Icon: FolderOpen    },
                  { key: "simpro",   label: "Sim-Pro Jobs", Icon: Upload        },
                ] as const).map(({ key, label, Icon }) => {
                  const isActive = view === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => switchView(key)}
                      className={`relative flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-medium transition-colors ${
                        isActive
                          ? "text-white"
                          : "text-[#6B6B6B] hover:bg-[#F0EDE4] hover:text-[#1A1A1A]"
                      }`}
                    >
                      {isActive && (
                        <motion.span
                          layoutId="jobs-hub-view-pill"
                          className="absolute inset-0 rounded-xl bg-[#1A1A1A] shadow-sm"
                          transition={{ type: "spring", damping: 30, stiffness: 360 }}
                        />
                      )}
                      <Icon className="relative z-10 h-4 w-4" />
                      <span className="relative z-10">{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* ── View body ─────────────────────────────────────────────────────── */}
        <Suspense fallback={view === "board" ? <BoardSkeleton /> : <ProjectsGridSkeleton />}>
          {view === "board" && (
            <JobsBoard embedded onCardsChanged={handleCardsChanged} />
          )}
          {view === "projects" && <Projects />}
          {view === "simpro" && <SimproJobsTab />}
        </Suspense>

      </div>

      {/* Shortcuts modal */}
      <ShortcutsModal open={showShortcuts} onClose={() => setShowShortcuts(false)} />
    </div>
  );
}

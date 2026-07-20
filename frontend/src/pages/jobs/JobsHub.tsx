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
import { ClipboardList, HelpCircle, AlertTriangle } from "lucide-react";

import { useAppStore } from "../../store";
import { canViewJobsBoard } from "../../lib/permissions";
import { FRAUNCES, TONE } from "../gantt/components/ledger";
import type { BoardCard, BoardColumn } from "../../lib/api/jobsBoard";
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

// ─── stat item (live band) ───────────────────────────────────────────────────

// Tone dot · Fraunces numeral · uppercase label — a ledger totals line. `muted`
// greys the numeral for a healthy zero (e.g. "0 Overdue" reads as calm, not a
// gap). Overdue-when-present renders as its own flagged pill (see the band).
function StatItem({
  count, label, dot, muted,
}: { count: number; label: string; dot: string; muted?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: dot }} aria-hidden />
      <span
        className={`text-[20px] font-semibold leading-none tabular-nums ${muted ? "text-[#A0A0A0]" : "text-[#1A1A1A]"}`}
        style={{ fontFamily: FRAUNCES }}
      >
        {count}
      </span>
      <span className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-[#6B6B6B]">
        {label}
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
  const jobParam = searchParams.get("job");
  const statusParam = searchParams.get("status");
  const quoteRedirectId = searchParams.get("quote");
  // Jobs "Pending / In progress / Complete / Invoiced" sub-views focus one
  // lifecycle column; "Archived" flips the archived view (handled separately).
  const STATUS_COLUMN: Record<string, BoardColumn> = {
    pending: "pending", in_progress: "in_progress", completed: "completed", invoiced: "invoiced",
  };
  const focusColumn = statusParam ? (STATUS_COLUMN[statusParam] ?? null) : null;
  const rawKind = searchParams.get("kind");
  const kindParam = rawKind === "service" || rawKind === "maintenance" || rawKind === "project" ? rawKind : null;
  // Quotes moved to its own /quotes area (SimPro split) — the hub is now just
  // the board + projects + Sim-Pro import.
  const view: "board" | "projects" | "simpro" =
    rawView === "projects" ? "projects"
      : rawView === "simpro" ? "simpro"
      : "board";

  const [boardCards, setBoardCards] = useState<BoardCard[]>([]);
  const handleCardsChanged = useCallback((cards: BoardCard[]) => {
    setBoardCards(cards);
  }, []);

  const [showShortcuts, setShowShortcuts] = useState(false);

  if (!canViewJobsBoard(currentProfile ?? currentUser)) {
    return <Navigate to="/" replace />;
  }

  // Quotes moved to /quotes — forward the retired /jobs?view=quotes location
  // (old bookmarks / history) instead of silently dropping to the board.
  if (rawView === "quotes") {
    return <Navigate to={quoteRedirectId ? `/quotes?quote=${quoteRedirectId}` : "/quotes"} replace />;
  }

  const stats = deriveStats(boardCards);

  const switchView = (next: "board" | "projects" | "simpro") => {
    setSearchParams(next === "board" ? {} : { view: next }, { replace: true });
  };

  return (
    <div
      className="flex min-h-full flex-col bg-[#F5F2E9]"
      style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}
    >
      <div className="mx-auto w-full max-w-[1400px] px-4 py-5 sm:px-6">

        {/* ── Header card — identity + underline tabs, then the live stat band ── */}
        <div className="mb-5 overflow-hidden rounded-[14px] border border-[#E6E1D4] bg-white shadow-[0_1px_2px_rgba(20,20,20,0.04)]">
          {/* Row 1: ink clipboard tile · eyebrow/title │ underline tabs · help */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-4 px-5 py-5 sm:px-6">
            {/* Ink clipboard tile — top-lit gradient + inset ring for a crafted,
                pressed feel rather than a flat black square. */}
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-[14px] bg-linear-to-b from-[#242424] to-[#141414] text-white shadow-[0_2px_10px_rgba(20,20,20,0.16)] ring-1 ring-inset ring-white/10">
              <ClipboardList className="h-7 w-7" strokeWidth={1.75} />
            </div>

            {/* Eyebrow (pulsing live dot) + Fraunces title */}
            <div className="leading-tight">
              <div className="mb-1.5 flex items-center gap-2">
                <span className="relative flex h-2 w-2" aria-hidden>
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#2F8F5C] opacity-60 motion-reduce:hidden" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-[#2F8F5C]" />
                </span>
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#6B6B6B]">
                  Operations · Live
                </span>
              </div>
              <h1
                className="m-0 text-[28px] font-medium leading-none text-[#1A1A1A] sm:text-[30px]"
                style={{ fontFamily: FRAUNCES, letterSpacing: "-0.015em" }}
              >
                Work.
              </h1>
            </div>

            {/* Right: underline tabs + icon-only help */}
            <div className="ml-auto flex items-center gap-5 sm:gap-6">
              <nav className="flex items-center gap-5 sm:gap-6" aria-label="Jobs views">
                {([
                  { key: "board",    label: "Board" },
                  { key: "projects", label: "Projects" },
                  { key: "simpro",   label: "Service Jobs" },
                ] as const)
                  .map(({ key, label }) => {
                    const isActive = view === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => switchView(key)}
                        aria-current={isActive ? "page" : undefined}
                        className={`relative pb-2 pt-0.5 text-[15px] font-medium transition-colors ${
                          isActive ? "text-[#1A1A1A]" : "text-[#6B6B6B] hover:text-[#1A1A1A]"
                        }`}
                      >
                        {label}
                        {isActive && (
                          <motion.span
                            layoutId="jobs-hub-tab-underline"
                            className="absolute inset-x-0 bottom-0 h-[2px] rounded-full bg-[#1A1A1A]"
                            transition={{ type: "spring", damping: 30, stiffness: 360 }}
                          />
                        )}
                      </button>
                    );
                  })}
              </nav>

              {/* Icon-only help — tooltip on hover, opens the cheat sheet */}
              <button
                type="button"
                onClick={() => setShowShortcuts(true)}
                title="Keyboard shortcuts (press ?)"
                aria-label="Keyboard shortcuts"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#E6E1D4] bg-white text-[#A0A0A0] transition-colors hover:border-[#D8D2C4] hover:text-[#1A1A1A]"
              >
                <HelpCircle className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </div>
          </div>

          {/* Row 2: live totals strip — subtle cream wash reads as a ledger
              summary line. Overdue is the flagged entry: loud red pill when
              there's work running late, calm grey zero when there isn't, so a
              manager's eye lands on the problem first. */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5 border-t border-[#EFEBE0] bg-[#FAF8F2] px-5 py-3.5 sm:px-6">
            <StatItem dot="#1A1A1A" count={stats.open} label="Open" />
            <span className="hidden h-4 w-px bg-[#E6E1D4] sm:block" aria-hidden />
            <StatItem dot={TONE.amber.dot} count={stats.dueThisWeek} label="Due this week" />
            <span className="hidden h-4 w-px bg-[#E6E1D4] sm:block" aria-hidden />
            {stats.overdue > 0 ? (
              <span
                className="inline-flex items-center gap-2 rounded-full bg-[#FBE5E5] px-3 py-1"
                title={`${stats.overdue} ${stats.overdue === 1 ? "job is" : "jobs are"} past their scheduled date`}
              >
                <AlertTriangle className="h-3.5 w-3.5 text-[#C44545]" strokeWidth={2} aria-hidden />
                <span
                  className="text-[20px] font-semibold leading-none tabular-nums text-[#C44545]"
                  style={{ fontFamily: FRAUNCES }}
                >
                  {stats.overdue}
                </span>
                <span className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-[#C44545]">
                  Overdue
                </span>
              </span>
            ) : (
              <StatItem dot="#C9BBA0" count={0} label="Overdue" muted />
            )}
          </div>
        </div>

        {/* ── View body ─────────────────────────────────────────────────────── */}
        <Suspense fallback={view === "board" ? <BoardSkeleton /> : <ProjectsGridSkeleton />}>
          {view === "board" && (
            <JobsBoard embedded onCardsChanged={handleCardsChanged} initialJobId={jobParam} initialKind={kindParam} initialShowArchived={statusParam === "archived"} focusColumn={focusColumn} />
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

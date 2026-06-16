// JobsBoard — /jobs kanban page.
//
// Columns: Pending / Scheduled / In Progress / Done (four fixed columns).
// Data: three parallel reads via fetchBoardCards (service jobs + maintenance
//       requests + projects) aggregated in jobsBoard.ts.
// Realtime: postgres_changes on service_jobs + maintenance_requests → refetch.
// DnD: native HTML5 drag-and-drop. Drag is ONLY enabled for canManageServiceJobs
//      principals. dropResult() decides what to do on drop.
// Filter: search (title + clientLabel substring), type chips (All/Service/
//         Maintenance/Projects), Filters popover (Show cancelled, Assigned to me).
// Keyboard: F / / → focus search; N → new job (canManage); ? → shortcuts modal;
//           Esc → clear search / close dialogs.
// Accessibility: aria-live region announces drop moves + initial load count.
//                Column headers aria-label with count. Card aria-labels in BoardCardItem.
// Visuals: entrance choreography, MotionConfig reducedMotion="user", framer-motion
//          layout springs for card moves.

import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { KanbanSquare, Clock, Calendar, CheckCircle2 } from "lucide-react";
import { motion, MotionConfig } from "framer-motion";

import { useAppStore } from "../../store";
import { canViewJobsBoard, canManageServiceJobs } from "../../lib/permissions";
import { supabase, supabaseConfigured } from "../../lib/supabase";

import {
  fetchBoardCards,
  dropResult,
  columnMetrics,
  type BoardCard,
  type BoardColumn,
  type BoardCardType,
} from "../../lib/api/jobsBoard";
import { updateServiceJobStatus, scheduleServiceJob } from "../../lib/api/serviceJobs";
import { updateRequestStatus, scheduleRequest } from "../../lib/api/maintenanceRequests";
import { updateProject } from "../../lib/api/projects";
import { listProfiles } from "../../lib/api/profiles";
import type { Profile } from "../../types";

import { LedgerHeader, cardShell, FRAUNCES, TONE } from "../gantt/components/ledger";
import { Toaster } from "../../components/ui/Toaster";
import { BoardSkeleton } from "../../components/ui/skeleton";
import { BoardCardItem } from "./BoardCardItem";
import { BoardToolbar, type TypeFilter } from "./BoardToolbar";
import { ScheduleDatePopover } from "./ScheduleDatePopover";
import { NewWorkModal } from "./NewWorkModal";
import { ServiceJobDrawer } from "./ServiceJobDrawer";
import { ShortcutsModal } from "./ShortcutsModal";
import type { ServiceJobStatus } from "../../lib/api/serviceJobs";

// ─── types ────────────────────────────────────────────────────────────────────

type ToastState = { message: string; type: "success" | "error" | "info" } | null;

interface PendingSchedule {
  type: BoardCardType;
  id: string;
  title: string;
}

interface PendingConfirm {
  id: string;
  status: string;
}

// ─── constants ───────────────────────────────────────────────────────────────

// Column accent bar colours (2px top bar per column)
const COLUMN_ACCENT: Record<BoardColumn, string> = {
  pending:     "#8A8378",
  scheduled:   "#1A1A1A",
  in_progress: TONE.amber.dot,
  done:        "#2F8F5C",
};

const COLUMNS: { key: BoardColumn; label: string }[] = [
  { key: "pending",     label: "Pending" },
  { key: "scheduled",   label: "Scheduled" },
  { key: "in_progress", label: "In Progress" },
  { key: "done",        label: "Done" },
];

/** Per-column quiet lines — italic serif, the house voice (Design §7). */
const EMPTY_COPY: Record<BoardColumn, string> = {
  pending:     "Nothing pending — the books are clear.",
  scheduled:   "Nothing scheduled yet.",
  in_progress: "All quiet on the tools.",
  done:        "Nothing closed out yet.",
};

// Entrance choreography: orchestrated fade-up per mount.
const COL_STAGGER = 0.05;
const CARD_STAGGER = 0.02;
const CARD_STAGGER_CAP = 5;
const ENTRANCE_DURATION = 0.14;

/** Settle spring for card moves between/within columns. */
const CARD_LAYOUT_SPRING = { type: "spring", stiffness: 500, damping: 35 } as const;

/** True when the event target is a text-editable element (skip shortcut). */
function isEditable(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}

/** Format a YYYY-MM-DD date as "MMM d" (e.g. "Jun 3"). */
function fmtDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

/** Local-midnight today as YYYY-MM-DD. */
function localTodayISO(): string {
  const n = new Date();
  const m = String(n.getMonth() + 1).padStart(2, "0");
  const d = String(n.getDate()).padStart(2, "0");
  return `${n.getFullYear()}-${m}-${d}`;
}

// ─── component props ──────────────────────────────────────────────────────────

interface JobsBoardProps {
  /**
   * When true the board is embedded inside JobsHub. The LedgerHeader title
   * block is hidden; the toolbar row is kept so the hub masthead does not need
   * to re-wire the modal or the loadCards callback.
   */
  embedded?: boolean;
  /**
   * Called after every successful fetch with the current card array.
   * JobsHub uses this to derive stat-strip counts without duplicating the fetch.
   */
  onCardsChanged?: (cards: BoardCard[]) => void;
}

// ─── component ───────────────────────────────────────────────────────────────

export default function JobsBoard({ embedded = false, onCardsChanged }: JobsBoardProps = {}) {
  const currentProfile = useAppStore((s) => s.currentProfile);

  const denied = !canViewJobsBoard(currentProfile);
  const canManage = canManageServiceJobs(currentProfile);

  // ── Data state ────────────────────────────────────────────────────────────
  const [cards, setCards] = useState<BoardCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [includeCancelled, setIncludeCancelled] = useState(false);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");

  // ── Search + filters ──────────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [assignedToMe, setAssignedToMe] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // ── Profiles map ──────────────────────────────────────────────────────────
  const [profilesById, setProfilesById] = useState<Map<string, Profile>>(new Map());

  // ── UI state ──────────────────────────────────────────────────────────────
  const [toast, setToast] = useState<ToastState>(null);
  const [dragOver, setDragOver] = useState<BoardColumn | null>(null);
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [optimisticMove, setOptimisticMove] = useState<Map<string, BoardColumn>>(new Map());

  // Date popover
  const [pendingSchedule, setPendingSchedule] = useState<PendingSchedule | null>(null);
  const [scheduleBusy, setScheduleBusy] = useState(false);

  // Confirm dialog (project → done)
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  // New service job modal — now carries optional initialStatus for inline composer
  const [showNewJobModal, setShowNewJobModal] = useState(false);
  const [newJobInitialStatus, setNewJobInitialStatus] = useState<ServiceJobStatus | undefined>(
    undefined,
  );

  // Service job detail drawer
  const [openJobId, setOpenJobId] = useState<string | null>(null);

  // Shortcuts modal
  const [showShortcuts, setShowShortcuts] = useState(false);

  // Realtime channel
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const hasLoadedRef = useRef(false);
  const entrancePlayedRef = useRef(false);

  // aria-live ref
  const liveRef = useRef<HTMLDivElement>(null);

  // ── Announce helper ───────────────────────────────────────────────────────
  const announce = useCallback((msg: string) => {
    if (!liveRef.current) return;
    liveRef.current.textContent = "";
    // Flush so screen-readers hear the new value even if text is identical.
    window.setTimeout(() => {
      if (liveRef.current) liveRef.current.textContent = msg;
    }, 50);
  }, []);

  // ── Profiles fetch ────────────────────────────────────────────────────────
  useEffect(() => {
    if (denied) return;
    listProfiles()
      .then((profiles) => {
        const map = new Map<string, Profile>();
        for (const p of profiles) {
          if (p.isActive) map.set(p.id, p);
        }
        setProfilesById(map);
      })
      .catch(() => {
        // Non-fatal: coins fall back to User glyph
      });
  }, [denied]);

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const loadCards = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (!silent || !hasLoadedRef.current) setLoading(true);
      setError(null);
      try {
        const data = await fetchBoardCards({ includeCancelled });
        setCards(data);
        onCardsChanged?.(data);
        hasLoadedRef.current = true;
        if (!silent) {
          const open = data.filter((c) => !c.cancelled && c.column !== "done").length;
          announce(`${open} job${open !== 1 ? "s" : ""} across 4 columns`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to load jobs board.";
        setError(msg);
      } finally {
        setLoading(false);
      }
    },
    [includeCancelled, onCardsChanged, announce],
  );

  useEffect(() => {
    if (denied) return;
    void loadCards();
  }, [denied, loadCards]);

  useEffect(() => {
    if (!loading && !error) entrancePlayedRef.current = true;
  }, [loading, error]);

  // ── Realtime ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (denied || !supabaseConfigured()) return;

    const ch = supabase
      .channel("jobs-board-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "service_jobs" }, () =>
        void loadCards({ silent: true }),
      )
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "service_jobs" }, () =>
        void loadCards({ silent: true }),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "maintenance_requests" },
        () => void loadCards({ silent: true }),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "maintenance_requests" },
        () => void loadCards({ silent: true }),
      )
      .subscribe();

    channelRef.current = ch;
    return () => {
      void supabase.removeChannel(ch);
      channelRef.current = null;
    };
  }, [denied, loadCards]);

  // ── Global keyboard shortcuts ─────────────────────────────────────────────
  useEffect(() => {
    if (denied) return;

    const handler = (e: KeyboardEvent) => {
      // Ignore when typing in an editable field (except Escape which always fires)
      if (e.key !== "Escape" && isEditable(e.target)) return;

      if (e.key === "Escape") {
        // Clear search if populated; close shortcuts modal; close new job modal
        if (showShortcuts) {
          setShowShortcuts(false);
          return;
        }
        if (search) {
          setSearch("");
          return;
        }
        return;
      }

      if (e.key === "?" && !e.ctrlKey && !e.metaKey) {
        setShowShortcuts((v) => !v);
        return;
      }

      if ((e.key === "f" || e.key === "F" || e.key === "/") && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if ((e.key === "n" || e.key === "N") && !e.ctrlKey && !e.metaKey && canManage) {
        setNewJobInitialStatus(undefined);
        setShowNewJobModal(true);
        return;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [denied, canManage, search, showShortcuts]);

  // Redirect after all hooks
  if (denied) return <Navigate to="/" replace />;

  // ── DnD handlers ─────────────────────────────────────────────────────────

  const handleDragStart = (card: BoardCard) => (e: React.DragEvent<HTMLDivElement>) => {
    try {
      e.dataTransfer.setData("text/plain", JSON.stringify({ type: card.type, id: card.id }));
      e.dataTransfer.effectAllowed = "move";
    } catch {
      // ignore
    }
    window.setTimeout(() => setDraggingKey(`${card.type}-${card.id}`), 0);
  };

  const handleDragEnd = () => {
    setDraggingKey(null);
    setDragOver(null);
  };

  const handleDragOver = (col: BoardColumn) => (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOver(col);
  };

  const handleDragLeave = () => setDragOver(null);

  const handleDrop = (targetColumn: BoardColumn) => (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(null);

    if (!canManage) return;

    let payload: { type: BoardCardType; id: string };
    try {
      payload = JSON.parse(e.dataTransfer.getData("text/plain"));
      if (!payload?.type || !payload?.id) return;
    } catch {
      return;
    }

    const { type, id } = payload;
    const result = dropResult(type, targetColumn);

    if (result.kind === "blocked") {
      setToast({ message: result.reason, type: "info" });
      return;
    }

    if (result.kind === "confirm") {
      setPendingConfirm({ id, status: result.status });
      return;
    }

    if (result.kind === "needs-date") {
      const card = cards.find((c) => c.id === id && c.type === type);
      setPendingSchedule({ type, id, title: card?.title ?? id });
      return;
    }

    // result.kind === 'apply'
    const card = cards.find((c) => c.id === id && c.type === type);
    const originalColLabel = COLUMNS.find((c) => c.key === card?.column)?.label ?? (card?.column ?? targetColumn);
    void applyMove(type, id, result.status, targetColumn).then(({ ok, landedColumn }) => {
      if (ok) {
        const landedLabel = COLUMNS.find((c) => c.key === landedColumn)?.label ?? landedColumn;
        if (card) announce(`${card.title} moved to ${landedLabel}`);
      } else {
        if (card) announce(`Move failed — ${card.title} returned to ${originalColLabel}`);
      }
    });
  };

  // ── Apply move ────────────────────────────────────────────────────────────

  const applyMove = async (
    type: BoardCardType,
    id: string,
    status: string,
    targetColumn: BoardColumn,
  ): Promise<{ ok: boolean; landedColumn: BoardColumn }> => {
    // maintenance 'in_progress' drop applies 'scheduled' (v1 wrinkle) — landed
    // column is therefore 'scheduled', not 'in_progress'.
    const landedColumn: BoardColumn =
      type === "maintenance" && targetColumn === "in_progress" ? "scheduled" : targetColumn;

    setOptimisticMove((prev) => new Map(prev).set(id, landedColumn));
    try {
      if (type === "service") {
        await updateServiceJobStatus(id, status as ServiceJobStatus);
      } else if (type === "maintenance") {
        await updateRequestStatus(
          id,
          status as import("../../lib/api/maintenanceRequests").MaintenanceRequestStatus,
        );
      } else if (type === "project") {
        await updateProject(id, {
          status: status as import("../../lib/api/projects").ProjectRow["status"],
        });
      }
      setOptimisticMove((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
      void loadCards({ silent: true });
      return { ok: true, landedColumn };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not update status.";
      setToast({ message: msg, type: "error" });
      setOptimisticMove((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
      void loadCards({ silent: true });
      return { ok: false, landedColumn: targetColumn };
    }
  };

  // ── Schedule confirm (date popover) ───────────────────────────────────────

  const handleScheduleConfirm = async (date: string) => {
    if (!pendingSchedule) return;
    const { type, id } = pendingSchedule;
    setScheduleBusy(true);
    try {
      if (type === "service") {
        await scheduleServiceJob(id, date);
      } else if (type === "maintenance") {
        await scheduleRequest(id, date);
      }
      setPendingSchedule(null);
      void loadCards({ silent: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not schedule job.";
      setToast({ message: msg, type: "error" });
    } finally {
      setScheduleBusy(false);
    }
  };

  // ── Confirm dialog (project → done) ──────────────────────────────────────

  const handleConfirmApply = async () => {
    if (!pendingConfirm) return;
    setConfirmBusy(true);
    try {
      await updateProject(pendingConfirm.id, {
        status: pendingConfirm.status as import("../../lib/api/projects").ProjectRow["status"],
      });
      setPendingConfirm(null);
      void loadCards({ silent: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not complete project.";
      setToast({ message: msg, type: "error" });
    } finally {
      setConfirmBusy(false);
    }
  };

  // ── Inline composer open ──────────────────────────────────────────────────

  const openNewJobForColumn = (col: BoardColumn) => {
    if (!canManage) return;
    // Map board column to ServiceJobStatus for the inline composer
    const statusMap: Record<BoardColumn, ServiceJobStatus> = {
      pending: "pending",
      scheduled: "scheduled",
      in_progress: "in_progress",
      done: "done",
    };
    setNewJobInitialStatus(statusMap[col]);
    setShowNewJobModal(true);
  };

  // ── Derived view ─────────────────────────────────────────────────────────

  const todayIso = localTodayISO();
  const nowDate = new Date();

  // Column metrics
  const metrics = columnMetrics(cards, todayIso, nowDate);

  // Build search + type + assignedToMe filtered view
  const searchLower = search.trim().toLowerCase();
  const currentProfileId = currentProfile?.id ?? null;

  const visibleCards = cards.filter((c) => {
    // Type filter
    if (typeFilter !== "all" && c.type !== typeFilter) return false;
    // Search
    if (searchLower) {
      const inTitle = c.title.toLowerCase().includes(searchLower);
      const inClient = c.clientLabel?.toLowerCase().includes(searchLower) ?? false;
      if (!inTitle && !inClient) return false;
    }
    // Assigned-to-me: only affects service cards
    if (assignedToMe && c.type === "service") {
      if (!currentProfileId || c.assignedTo !== currentProfileId) return false;
    }
    return true;
  });

  // Apply optimistic column overrides
  const cardsWithOptimistic = visibleCards.map((c) => {
    const override = optimisticMove.get(c.id);
    return override ? { ...c, column: override } : c;
  });

  // Cards per column — cancelled cards always sink to bottom of Done
  const cardsForColumn = (col: BoardColumn): BoardCard[] => {
    const normal = cardsWithOptimistic.filter((c) => c.column === col && !c.cancelled);
    if (col === "done") {
      const cancelled = cardsWithOptimistic.filter((c) => c.column === "done" && c.cancelled);
      return [...normal, ...cancelled];
    }
    return normal;
  };

  // ── Micro-metric helper per column ───────────────────────────────────────

  function renderMicroMetric(col: BoardColumn): React.ReactNode {
    switch (col) {
      case "pending":
        if (metrics.pendingAvgWaitH === null) return null;
        return (
          <span className="flex items-center gap-1 text-[11px] text-[#6B6B6B]">
            <Clock className="h-3 w-3 shrink-0" strokeWidth={1.5} />
            Avg wait {metrics.pendingAvgWaitH}h
          </span>
        );
      case "scheduled":
        if (metrics.scheduledNextDue === null) return null;
        return (
          <span className="flex items-center gap-1 text-[11px] text-[#6B6B6B]">
            <Calendar className="h-3 w-3 shrink-0" strokeWidth={1.5} />
            Next due {fmtDate(metrics.scheduledNextDue)}
          </span>
        );
      case "in_progress":
        if (metrics.inProgressAvgAgeD === null) return null;
        return (
          <span className="flex items-center gap-1 text-[11px] text-[#6B6B6B]">
            <Clock className="h-3 w-3 shrink-0" strokeWidth={1.5} />
            Avg age {metrics.inProgressAvgAgeD}d
          </span>
        );
      case "done":
        return (
          <span className="flex items-center gap-1 text-[11px] text-[#6B6B6B]">
            <CheckCircle2 className="h-3 w-3 shrink-0" strokeWidth={1.5} />
            {metrics.doneClosedToday} closed today
          </span>
        );
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      className={embedded ? undefined : "flex min-h-screen flex-col bg-[#F5F2E9]"}
      style={embedded ? undefined : { fontFamily: "'DM Sans', system-ui, sans-serif" }}
    >
      {/* Visually-hidden aria-live region for screen-reader announcements */}
      <div
        ref={liveRef}
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      />

      <div className={embedded ? undefined : "mx-auto w-full max-w-[1400px] px-4 py-5 sm:px-6"}>
        {/* Header — standalone mode only */}
        {!embedded && (
          <LedgerHeader
            kicker="JOBS"
            icon={KanbanSquare}
            eyebrow="Service &amp; Maintenance"
            title="Jobs Board"
            meta={`${cards.length} card${cards.length !== 1 ? "s" : ""}`}
          />
        )}

        {/* Toolbar row — always rendered (both standalone + embedded) */}
        <BoardToolbar
          ref={searchInputRef}
          search={search}
          onSearchChange={setSearch}
          typeFilter={typeFilter}
          onTypeFilterChange={setTypeFilter}
          includeCancelled={includeCancelled}
          onIncludeCancelledChange={setIncludeCancelled}
          assignedToMe={assignedToMe}
          onAssignedToMeChange={setAssignedToMe}
          canManage={canManage}
          loading={loading}
          onRefresh={() => void loadCards()}
          onNewJob={() => {
            setNewJobInitialStatus(undefined);
            setShowNewJobModal(true);
          }}
        />

        {/* Loading state — board-shaped skeleton so the layout never blanks */}
        {loading && <BoardSkeleton />}

        {/* Error state */}
        {!loading && error && (
          <div className={`${cardShell} mb-4 flex items-center justify-between px-5 py-4`}>
            <p className="text-sm text-[#C44545]">{error}</p>
            <button
              type="button"
              onClick={() => void loadCards()}
              className="ml-4 rounded-full border border-[#E6E1D4] bg-white px-3 py-1 text-[12px] font-medium text-[#3A3A3A] hover:bg-[#FAF8F2]"
            >
              Retry
            </button>
          </div>
        )}

        {/* Board columns */}
        {!loading && !error && (
          <MotionConfig reducedMotion="user">
            <div className="flex gap-3 overflow-x-auto pb-2">
              {COLUMNS.map((col, colIndex) => {
                const colCards = cardsForColumn(col.key);
                const isOver = dragOver === col.key;
                const entrancePlayed = entrancePlayedRef.current;
                const microMetric = renderMicroMetric(col.key);

                return (
                  <motion.div
                    key={col.key}
                    initial={entrancePlayed ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: ENTRANCE_DURATION,
                      ease: "easeOut",
                      delay: colIndex * COL_STAGGER,
                    }}
                    onDragOver={canManage ? handleDragOver(col.key) : undefined}
                    onDragLeave={canManage ? handleDragLeave : undefined}
                    onDrop={canManage ? handleDrop(col.key) : undefined}
                    className={[
                      "flex min-w-[280px] flex-1 flex-col overflow-hidden rounded-[14px] border transition-colors",
                      isOver
                        ? "border-[#E6E1D4] bg-[#F0EDE4] outline-dashed outline-1 -outline-offset-4 outline-[#D8D2C4]"
                        : "border-[#E6E1D4] bg-[#FAF8F2]",
                    ].join(" ")}
                  >
                    {/* 2px accent bar per column */}
                    <div
                      aria-hidden
                      className="h-0.5 w-full shrink-0"
                      style={{ background: COLUMN_ACCENT[col.key] }}
                    />

                    {/* Column header */}
                    <div className="border-b border-[#E6E1D4] px-4 pt-3 pb-2">
                      <div className="flex items-center justify-between">
                        <span
                          className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#6B6B6B]"
                          aria-label={`${col.label}, ${colCards.length} item${colCards.length !== 1 ? "s" : ""}`}
                        >
                          {col.label}
                        </span>
                        <span className="rounded-full border border-[#E6E1D4] bg-white px-2 py-0.5 text-[11px] font-semibold tabular-nums text-[#3A3A3A]">
                          {colCards.length}
                        </span>
                      </div>
                      {/* Micro-metric line */}
                      {microMetric && (
                        <div className="mt-1">{microMetric}</div>
                      )}
                    </div>

                    {/* Cards */}
                    <div
                      className={[
                        "flex min-h-[120px] flex-1 flex-col gap-2 p-3",
                        col.key === "done" ? "opacity-80" : "",
                      ].join(" ")}
                    >
                      {colCards.length === 0 ? (
                        <p
                          className="px-4 py-10 text-center text-[13px] italic text-[#A0A0A0]"
                          style={{ fontFamily: FRAUNCES }}
                        >
                          {EMPTY_COPY[col.key]}
                        </p>
                      ) : (
                        colCards.map((card, cardIndex) => {
                          const cardKey = `${card.type}-${card.id}`;
                          const cardDelay =
                            colIndex * COL_STAGGER +
                            Math.min(cardIndex, CARD_STAGGER_CAP) * CARD_STAGGER;

                          return (
                            <motion.div
                              key={cardKey}
                              layout
                              layoutId={cardKey}
                              initial={entrancePlayed ? false : { opacity: 0, y: 8 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{
                                opacity: { duration: ENTRANCE_DURATION, ease: "easeOut", delay: cardDelay },
                                y: { duration: ENTRANCE_DURATION, ease: "easeOut", delay: cardDelay },
                                layout: CARD_LAYOUT_SPRING,
                              }}
                            >
                              <BoardCardItem
                                card={card}
                                draggable={canManage}
                                onDragStart={handleDragStart(card)}
                                onDragEnd={handleDragEnd}
                                isDragging={draggingKey === cardKey}
                                onOpenService={(id) => setOpenJobId(id)}
                                profilesById={profilesById}
                                canManage={canManage}
                                todayIso={todayIso}
                                now={nowDate}
                              />
                            </motion.div>
                          );
                        })
                      )}

                      {/* Inline composer — ghost "+ Add job" at each column's bottom */}
                      {canManage && (
                        <button
                          type="button"
                          onClick={() => openNewJobForColumn(col.key)}
                          className="mt-1 flex items-center gap-1.5 rounded-[9px] border border-dashed border-[#D8D2C4] px-3 py-2 text-[12px] text-[#A0A0A0] transition-colors hover:border-[#2F8F5C] hover:text-[#2F8F5C] hover:bg-[#F0FAF4]"
                        >
                          <span className="text-base leading-none">+</span>
                          Add job
                        </button>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </MotionConfig>
        )}
      </div>

      {/* ── Schedule date popover ─────────────────────────────────────────── */}
      <ScheduleDatePopover
        open={pendingSchedule !== null}
        cardTitle={pendingSchedule?.title ?? ""}
        onConfirm={handleScheduleConfirm}
        onCancel={() => setPendingSchedule(null)}
        busy={scheduleBusy}
      />

      {/* ── Confirm dialog — project → done ──────────────────────────────── */}
      {pendingConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#1A1A1A]/50 p-4"
          style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}
        >
          <div className="w-full max-w-sm rounded-[14px] border border-[#E6E1D4] bg-white p-6 shadow-[0_8px_28px_rgba(20,20,20,0.12)]">
            <h3
              className="mb-2 text-lg font-medium text-[#1A1A1A]"
              style={{ fontFamily: FRAUNCES }}
            >
              Mark project complete?
            </h3>
            <p className="mb-5 text-[13px] text-[#6B6B6B]">
              This closes the whole project and sets its status to Completed.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingConfirm(null)}
                disabled={confirmBusy}
                className="rounded-full border border-[#E6E1D4] bg-white px-4 py-1.5 text-[13px] font-medium text-[#3A3A3A] hover:bg-[#FAF8F2] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmApply()}
                disabled={confirmBusy}
                className="rounded-full bg-[#2F8F5C] px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-[#246F47] disabled:opacity-50"
              >
                {confirmBusy ? "Completing…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── New Work modal (tabbed: service job + project) ───────────────── */}
      <NewWorkModal
        open={showNewJobModal}
        initialStatus={newJobInitialStatus}
        onClose={() => {
          setShowNewJobModal(false);
          setNewJobInitialStatus(undefined);
        }}
        onServiceJobCreated={() => {
          setShowNewJobModal(false);
          setNewJobInitialStatus(undefined);
          void loadCards({ silent: true });
          setToast({ message: "Job created", type: "success" });
        }}
        onProjectCreated={() => {
          setShowNewJobModal(false);
          setNewJobInitialStatus(undefined);
          void loadCards({ silent: true });
          setToast({ message: "Project created", type: "success" });
        }}
      />

      {/* ── Service Job Drawer ────────────────────────────────────────────── */}
      {openJobId && (
        <ServiceJobDrawer
          jobId={openJobId}
          onClose={() => setOpenJobId(null)}
          onChanged={() => void loadCards({ silent: true })}
        />
      )}

      {/* ── Shortcuts modal ───────────────────────────────────────────────── */}
      <ShortcutsModal open={showShortcuts} onClose={() => setShowShortcuts(false)} />

      {/* ── Toast ─────────────────────────────────────────────────────────── */}
      {toast && (
        <Toaster message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}

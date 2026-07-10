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
import { BoardToolbar, type TypeFilter, type SortMode } from "./BoardToolbar";
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
  completed:   "#2F8F5C",
  invoiced:    "#C8841E",
  paid:        "#246F47",
};

const COLUMNS: { key: BoardColumn; label: string }[] = [
  { key: "pending",     label: "Pending" },
  { key: "scheduled",   label: "Scheduled" },
  { key: "in_progress", label: "In Progress" },
  { key: "completed",   label: "Completed" },
  { key: "invoiced",    label: "Invoiced" },
  { key: "paid",        label: "Paid" },
];

/** Per-column quiet lines — italic serif, the house voice (Design §7). */
const EMPTY_COPY: Record<BoardColumn, string> = {
  pending:     "Nothing pending — the books are clear.",
  scheduled:   "Nothing scheduled yet.",
  in_progress: "All quiet on the tools.",
  completed:   "Nothing completed yet.",
  invoiced:    "Nothing invoiced yet.",
  paid:        "Nothing paid yet.",
};

// Entrance choreography: orchestrated fade-up per mount.
const COL_STAGGER = 0.05;
const CARD_STAGGER = 0.02;
const CARD_STAGGER_CAP = 5;
const ENTRANCE_DURATION = 0.14;

// How many cards a column renders before collapsing the rest behind a
// "Show all N" toggle. Post-SimPro-import a column can hold 1,000+ cards;
// rendering them all turns the board into an unreadable "long receipt" and
// thrashes layout. The column count stays accurate (header shows the true
// total) — only the DOM is windowed. Expand restores the full (scrollable) list.
const COLUMN_RENDER_CAP = 20;

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
  /** Deep-link: open this job's drawer on mount (?job=). */
  initialJobId?: string | null;
  /** Deep-link: start on a type filter (?kind= service|maintenance|project). */
  initialKind?: TypeFilter | null;
}

// ─── component ───────────────────────────────────────────────────────────────

export default function JobsBoard({ embedded = false, onCardsChanged, initialJobId = null, initialKind = null }: JobsBoardProps = {}) {
  const currentProfile = useAppStore((s) => s.currentProfile);

  const denied = !canViewJobsBoard(currentProfile);
  const canManage = canManageServiceJobs(currentProfile);

  // ── Data state ────────────────────────────────────────────────────────────
  const [cards, setCards] = useState<BoardCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [includeCancelled, setIncludeCancelled] = useState(false);
  // When on, the board swaps the active columns for a searchable archived list.
  const [showArchived, setShowArchived] = useState(false);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>(initialKind ?? "all");

  // ── Search + filters ──────────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [assignedToMe, setAssignedToMe] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("date");
  const searchInputRef = useRef<HTMLInputElement>(null);

  // ── Profiles map ──────────────────────────────────────────────────────────
  const [profilesById, setProfilesById] = useState<Map<string, Profile>>(new Map());

  // ── UI state ──────────────────────────────────────────────────────────────
  const [toast, setToast] = useState<ToastState>(null);
  const [dragOver, setDragOver] = useState<BoardColumn | null>(null);
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [optimisticMove, setOptimisticMove] = useState<Map<string, BoardColumn>>(new Map());
  // Columns the user has expanded past COLUMN_RENDER_CAP (the rest stay windowed).
  const [expandedCols, setExpandedCols] = useState<Set<BoardColumn>>(new Set());

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

  // Deep-link (?job=…): open the drawer, and follow later URL changes while
  // the board stays mounted (e.g. two "View job" clicks in a row).
  useEffect(() => {
    if (initialJobId) setOpenJobId(initialJobId);
  }, [initialJobId]);

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
        const data = await fetchBoardCards({ includeCancelled, includeArchived: showArchived });
        setCards(data);
        onCardsChanged?.(data);
        hasLoadedRef.current = true;
        if (!silent) {
          const open = data.filter(
            (c) => !c.cancelled && !c.archived &&
              c.column !== "completed" && c.column !== "invoiced" && c.column !== "paid",
          ).length;
          announce(`${open} open job${open !== 1 ? "s" : ""} across ${COLUMNS.length} columns`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to load jobs board.";
        setError(msg);
      } finally {
        setLoading(false);
      }
    },
    [includeCancelled, showArchived, onCardsChanged, announce],
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
      completed: "done",
      invoiced: "invoiced",
      paid: "paid",
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
    // Type filter. "Project" = legacy project cards + service jobs born from a
    // PROJECT quote (kind, mig 93); "Service" excludes those project-kind jobs.
    if (typeFilter === "project") {
      if (!(c.type === "project" || (c.type === "service" && c.kind === "project"))) return false;
    } else if (typeFilter === "service") {
      if (!(c.type === "service" && c.kind !== "project")) return false;
    } else if (typeFilter !== "all" && c.type !== typeFilter) {
      return false;
    }
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

  // Sort cards within a column per the toolbar toggle:
  //   "date" → newest first (createdAt desc)
  //   "az"   → alphabetical by customer name (clientLabel); nulls last
  const sortCards = (list: BoardCard[]): BoardCard[] => {
    if (sortMode === "az") {
      return [...list].sort((a, b) => {
        const al = a.clientLabel;
        const bl = b.clientLabel;
        if (al === null && bl === null) return 0;
        if (al === null) return 1; // nulls last
        if (bl === null) return -1;
        return al.localeCompare(bl, undefined, { sensitivity: "base" });
      });
    }
    // "date" → newest createdAt first
    return [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  };

  // Cards per column — cancelled cards always sink to bottom of Done.
  // Open columns honour the sort toggle. For Done: "date" mode shows
  // most-recently-closed first (completedAt desc — the meaningful "newest" for
  // closed work, since the column is windowed to COLUMN_RENDER_CAP); "az" mode
  // sorts by customer. Either way, cancelled cards sink to the bottom.
  const cardsForColumn = (col: BoardColumn): BoardCard[] => {
    const normal = cardsWithOptimistic.filter((c) => c.column === col && !c.cancelled && !c.archived);
    if (col === "completed") {
      const ordered =
        sortMode === "az"
          ? sortCards(normal)
          : [...normal].sort((a, b) => {
              if (a.completedAt && b.completedAt) return b.completedAt.localeCompare(a.completedAt);
              if (a.completedAt) return -1; // dated-closed before undated (projects)
              if (b.completedAt) return 1;
              return 0;
            });
      const cancelled = cardsWithOptimistic.filter((c) => c.column === "completed" && c.cancelled);
      return [...ordered, ...cancelled];
    }
    return sortCards(normal);
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
      case "completed":
        return (
          <span className="flex items-center gap-1 text-[11px] text-[#6B6B6B]">
            <CheckCircle2 className="h-3 w-3 shrink-0" strokeWidth={1.5} />
            {metrics.doneClosedToday} closed today
          </span>
        );
      case "invoiced":
      case "paid":
        return null;
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
          sortMode={sortMode}
          onSortModeChange={setSortMode}
          showArchived={showArchived}
          onShowArchivedChange={setShowArchived}
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
        {!loading && !error && !showArchived && (
          <MotionConfig reducedMotion="user">
            <div className="flex gap-3 overflow-x-auto pb-2">
              {COLUMNS.map((col, colIndex) => {
                const colCards = cardsForColumn(col.key);
                const isOver = dragOver === col.key;
                const entrancePlayed = entrancePlayedRef.current;
                const microMetric = renderMicroMetric(col.key);
                // Window the list: render at most COLUMN_RENDER_CAP unless expanded.
                const isExpanded = expandedCols.has(col.key);
                const overCap = colCards.length > COLUMN_RENDER_CAP;
                // "Add job" makes sense in the working columns, not the terminal
                // money stages — you don't create a brand-new job already Invoiced/Paid.
                const canAddHere = canManage && col.key !== "invoiced" && col.key !== "paid";
                const shownCards = isExpanded ? colCards : colCards.slice(0, COLUMN_RENDER_CAP);

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

                    {/* Cards — windowed + independently scrollable so the page
                        never grows past the column's max height (no "long receipt"). */}
                    <div
                      className={[
                        "flex min-h-[120px] flex-1 flex-col gap-2 overflow-y-auto p-3",
                        "max-h-[60vh]",
                        col.key === "completed" || col.key === "invoiced" || col.key === "paid"
                          ? "opacity-80"
                          : "",
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
                        shownCards.map((card, cardIndex) => {
                          const cardKey = `${card.type}-${card.id}`;
                          // Only stagger the first screenful; expanded tails appear instantly.
                          const cardDelay =
                            cardIndex < CARD_STAGGER_CAP
                              ? colIndex * COL_STAGGER + cardIndex * CARD_STAGGER
                              : 0;

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
                    </div>

                    {/* Pinned footer — Show-all toggle + Add job, below the scroll so
                        both stay reachable and full-opacity (the Done body is muted). */}
                    {(overCap || canAddHere) && (
                      <div className="flex flex-col gap-2 border-t border-[#E6E1D4] p-3">
                        {overCap && (
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedCols((prev) => {
                                const next = new Set(prev);
                                if (next.has(col.key)) next.delete(col.key);
                                else next.add(col.key);
                                return next;
                              })
                            }
                            className="self-center rounded-full border border-[#E6E1D4] bg-white px-3 py-1 text-[11px] font-semibold text-[#3A3A3A] transition-colors hover:bg-[#FAF8F2]"
                          >
                            {isExpanded
                              ? `Show less (top ${COLUMN_RENDER_CAP})`
                              : `Show all ${colCards.length.toLocaleString("en-AU")}`}
                          </button>
                        )}
                        {canAddHere && (
                          <button
                            type="button"
                            onClick={() => openNewJobForColumn(col.key)}
                            className="flex w-full items-center justify-center gap-1.5 rounded-[9px] border border-dashed border-[#D8D2C4] px-3 py-2 text-[12px] text-[#A0A0A0] transition-colors hover:border-[#2F8F5C] hover:text-[#2F8F5C] hover:bg-[#F0FAF4]"
                          >
                            <span className="text-base leading-none">+</span>
                            Add job
                          </button>
                        )}
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </MotionConfig>
        )}

        {/* Archived view — a flat, searchable list (archived jobs leave the active
            board but stay reachable here for reference). Reuses the search + type
            filters already applied to visibleCards. */}
        {!loading && !error && showArchived && (() => {
          const archived = sortCards(visibleCards.filter((c) => c.archived));
          return (
            <div className={`${cardShell} overflow-hidden`}>
              <div className="flex items-center justify-between border-b border-[#E6E1D4] bg-[#FAF8F2] px-4 py-3">
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#6B6B6B]">
                  Archived
                </span>
                <span className="rounded-full border border-[#E6E1D4] bg-white px-2 py-0.5 text-[11px] font-semibold tabular-nums text-[#3A3A3A]">
                  {archived.length}
                </span>
              </div>
              {archived.length === 0 ? (
                <p
                  className="px-4 py-12 text-center text-[13px] italic text-[#A0A0A0]"
                  style={{ fontFamily: FRAUNCES }}
                >
                  No archived jobs{search.trim() ? " match your search" : ""}.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-2 lg:grid-cols-3">
                  {archived.map((card) => (
                    <BoardCardItem
                      key={`${card.type}-${card.id}`}
                      card={card}
                      draggable={false}
                      isDragging={false}
                      onOpenService={(id) => setOpenJobId(id)}
                      profilesById={profilesById}
                      canManage={canManage}
                      todayIso={todayIso}
                      now={nowDate}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })()}
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

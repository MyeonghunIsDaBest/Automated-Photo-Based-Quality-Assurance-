// BoardCardItem — one kanban card. Rendered inside a column by JobsBoard.
//
// Card anatomy (mock design pass):
//   Row 1   type stamp with tiny glyph (Zap/Wrench/Building2) + priority badge
//           from priorityFor() — P1 red-tint pill, P2 amber-tint, P3 neutral
//           slate. Replaces the old maintenance-only urgency pill.
//   Row 2   title — DM Sans medium 14px ink, two-line clamp.
//   Row 3   client/site label with MapPin glyph, 12px muted.
//   Waiting chip  pending column only: amber chip when >= 2h, red when >= 6h;
//                 with AlertTriangle glyph. P1 + waiting chip → soft warm ring.
//   Footer  due pill — "Due today" red-tint / "Overdue" red / "{MMM d}" neutral
//           (amber tint within 3 days); suppressed for done/cancelled.
//           Done column: "Closed today" green-tint pill when completedAt === today,
//           else plain date.
//           Right: assignee initials coin from profilesById map (service cards).
//           Unassigned service card + canManage → ghost "Assign" mini-button
//           opening the job drawer.
//
// Cancelled variant: muted wash + strikethrough title.
// Drag visuals only: grip dots fade in at the left edge on hover.
// aria-label on each card: type, title, priority, due, column.

import { useNavigate } from "react-router-dom";
import { Calendar, MapPin, User, UserPlus, AlertTriangle, Zap, Wrench, Building2 } from "lucide-react";
import type { BoardCard, BoardPriority } from "../../lib/api/jobsBoard";
import { priorityFor, hoursWaiting, localDateOf } from "../../lib/api/jobsBoard";
import type { SimproStage } from "../../lib/jobs/simproCsv";
import type { Profile } from "../../types";
import { useProjectsListStore } from "../projects/store";
import { FRAUNCES } from "../gantt/components/ledger";

// ─── helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

/** Local-midnight today as YYYY-MM-DD so date strings compare day-accurately. */
function localTodayISO(): string {
  const n = new Date();
  const m = String(n.getMonth() + 1).padStart(2, "0");
  const d = String(n.getDate()).padStart(2, "0");
  return `${n.getFullYear()}-${m}-${d}`;
}

function getInitials(profile: Profile): string {
  const f = profile.firstName?.trim()[0] ?? "";
  const l = profile.lastName?.trim()[0] ?? "";
  return (f + l).toUpperCase() || "?";
}

// ─── type stamp config ────────────────────────────────────────────────────────

const TYPE_STAMP: Record<
  BoardCard["type"],
  { label: string; bg: string; fg: string; Icon: React.ComponentType<{ className?: string; strokeWidth?: number }> }
> = {
  service:     { label: "Service",     bg: "#F9EFD9", fg: "#C8841E", Icon: Zap },
  maintenance: { label: "Maintenance", bg: "#EEF1F4", fg: "#5B6B7B", Icon: Wrench },
  project:     { label: "Project",     bg: "#E5F2EA", fg: "#246F47", Icon: Building2 },
};

const stampClass =
  "inline-flex items-center gap-[3px] rounded-[5px] px-1.5 py-[3px] text-[9px] font-bold uppercase tracking-[0.12em] leading-none";

// ─── Sim-Pro stage badge ───────────────────────────────────────────────────────
// Only the three stages that collapse into the single "done" column carry a
// badge — pending / in_progress are already implied by the card's column, so
// badging them would be redundant noise. Tones drawn from the warm ledger palette.
const SIMPRO_STAGE_BADGE: Partial<Record<SimproStage, { label: string; bg: string; fg: string }>> = {
  complete: { label: "Complete", bg: "#EEF1F4", fg: "#5B6B7B" },
  invoiced: { label: "Invoiced", bg: "#F4E9DB", fg: "#A35C2B" },
  archived: { label: "Archived", bg: "#ECE8DE", fg: "#6B6B6B" },
};

// ─── priority badge ───────────────────────────────────────────────────────────

const PRIORITY_STYLES: Record<Exclude<BoardPriority, null>, { bg: string; fg: string }> = {
  P1: { bg: "#FBE5E5", fg: "#C44545" },
  P2: { bg: "#F9EFD9", fg: "#C8841E" },
  P3: { bg: "#EEF1F4", fg: "#5B6B7B" },
};

const priorityPillClass =
  "rounded-full px-2 py-[3px] text-[9px] font-bold uppercase tracking-[0.12em] leading-none";

// ─── grip dots ────────────────────────────────────────────────────────────────

const GRIP_DOTS = [0, 1, 2, 3, 4, 5];

// ─── member avatar coins (project cards only) ─────────────────────────────────

// Deterministic coin backgrounds, cycled by stable hash of the user id.
// Palette: ink / sage / slate / amber (4 slots, index = charCodeSum % 4).
const COIN_BG = ["#1A1A1A", "#2F8F5C", "#5B6B7B", "#C8841E"] as const;

function coinBgForId(userId: string): string {
  let sum = 0;
  for (let i = 0; i < userId.length; i++) sum += userId.charCodeAt(i);
  return COIN_BG[sum % COIN_BG.length];
}

const MAX_COINS = 3;

// ─── component ───────────────────────────────────────────────────────────────

export interface BoardCardItemProps {
  card: BoardCard;
  draggable: boolean;
  /** Optional — omitted for read-only contexts like the archived list. */
  onDragStart?: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd?: () => void;
  isDragging?: boolean;
  onOpenService: (id: string) => void;
  /** Map of profile id → Profile for initials coins. */
  profilesById?: Map<string, Profile>;
  canManage?: boolean;
  /** ISO date string for today (YYYY-MM-DD); passed in so card doesn't recompute per-render. */
  todayIso?: string;
  /** Current time for hoursWaiting; passed in to avoid per-card Date construction. */
  now?: Date;
}

export function BoardCardItem({
  card,
  draggable,
  onDragStart,
  onDragEnd,
  isDragging = false,
  onOpenService,
  profilesById,
  canManage = false,
  todayIso,
  now,
}: BoardCardItemProps) {
  const navigate = useNavigate();
  // A service job born from a PROJECT quote wears the Project stamp (the user's
  // register) while keeping service drag/click semantics.
  const stamp =
    card.type === "service" && card.kind === "project"
      ? { label: "Project", bg: "#F9EFD9", fg: "#C8841E", Icon: Building2 }
      : TYPE_STAMP[card.type];
  const stageBadge = card.simproStage ? SIMPRO_STAGE_BADGE[card.simproStage] : undefined;
  const isCancelled = card.cancelled === true;

  const today = todayIso ?? localTodayISO();
  const nowDate = now ?? new Date();

  // Priority badge — replaces old urgency pill
  const priority = priorityFor(card, today);
  const priorityStyle = priority ? PRIORITY_STYLES[priority] : null;

  // Waiting chip — pending column only
  const waitHours =
    card.column === "pending" && !isCancelled
      ? hoursWaiting(card.createdAt, nowDate)
      : 0;
  const showWaiting = waitHours >= 2;
  const waitingRed = waitHours >= 6;

  // Warm ring: P1 + waiting chip together
  const showRing = priority === "P1" && showWaiting && !isCancelled;

  // Date treatment — suppressed for closed work (Completed/Invoiced/Paid),
  // archived, and cancelled cards.
  const dateMuted =
    isCancelled ||
    card.archived === true ||
    card.column === "completed" ||
    card.column === "invoiced" ||
    card.column === "paid";
  const isOverdue = !dateMuted && card.scheduledFor !== null && card.scheduledFor < today;
  const isToday = !dateMuted && card.scheduledFor === today;

  // Within 3 days (amber tint)
  const isWithin3Days =
    !dateMuted &&
    !isOverdue &&
    !isToday &&
    card.scheduledFor !== null &&
    (() => {
      const [ty, tm, td] = today.split("-").map(Number);
      const [sy, sm, sd] = (card.scheduledFor as string).split("-").map(Number);
      const diff = Math.round(
        (Date.UTC(sy, sm - 1, sd) - Date.UTC(ty, tm - 1, td)) / 86_400_000,
      );
      return diff > 0 && diff <= 3;
    })();

  // Completed column: completed today? Compare LOCAL date to avoid UTC-vs-local mismatch.
  const isDoneColumn = card.column === "completed";
  const completedToday =
    isDoneColumn &&
    card.completedAt !== null &&
    localDateOf(card.completedAt) === today;

  // Assignee coin
  const assigneeProfile =
    card.assignedTo && profilesById ? profilesById.get(card.assignedTo) : undefined;
  const showGhostAssign =
    card.type === "service" && !card.assignedTo && canManage && !isCancelled;

  const handleClick = () => {
    if (card.type === "service") {
      onOpenService(card.id);
    } else if (card.type === "maintenance") {
      navigate("/customers");
    } else {
      // Activate the project in the store before navigating so the Gantt opens it directly.
      useProjectsListStore.getState().setActiveProject(card.id);
      navigate("/gantt");
    }
  };

  // Build aria-label
  const ariaLabel = [
    stamp.label,
    stageBadge ? stageBadge.label : null,
    card.title,
    priority ? priority : null,
    card.scheduledFor && !dateMuted
      ? isOverdue
        ? "overdue"
        : `due ${formatDate(card.scheduledFor)}`
      : null,
    card.column.replace("_", " "),
    card.type === "project" && card.memberIds && card.memberIds.length > 0
      ? `${card.memberIds.length} crew`
      : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div
      draggable={draggable}
      onDragStart={draggable ? onDragStart : undefined}
      onDragEnd={draggable ? onDragEnd : undefined}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick();
        }
      }}
      className={[
        "group relative select-none rounded-[11px] border px-3.5 py-3 transition-[box-shadow,opacity] duration-150",
        isCancelled
          ? "border-[#E6E1D4] bg-[#F7F5EF]"
          : "border-[#E6E1D4] bg-white shadow-[0_1px_2px_rgba(20,20,20,0.04)] hover:shadow-[0_3px_10px_rgba(20,20,20,0.09)]",
        isDragging ? "opacity-40" : isCancelled ? "opacity-75" : "",
        draggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
        showRing ? "ring-1 ring-[#E8C8B8]" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Grip affordance */}
      {draggable && (
        <span
          aria-hidden
          className="absolute left-[5px] top-1/2 grid -translate-y-1/2 grid-cols-2 gap-[2.5px] opacity-0 transition-opacity duration-150 group-hover:opacity-40"
        >
          {GRIP_DOTS.map((i) => (
            <span key={i} className="h-[2.5px] w-[2.5px] rounded-full bg-[#1A1A1A]" />
          ))}
        </span>
      )}

      {/* Row 1: type stamp with glyph + priority badge */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={stampClass} style={{ backgroundColor: stamp.bg, color: stamp.fg }}>
            <stamp.Icon className="h-[9px] w-[9px]" strokeWidth={2} />
            {stamp.label}
          </span>
          {stageBadge && (
            <span className={stampClass} style={{ backgroundColor: stageBadge.bg, color: stageBadge.fg }}>
              {stageBadge.label}
            </span>
          )}
          {/* Upsell in flight: a variation is sent, awaiting the customer's yes */}
          {card.variationPending && !isCancelled && card.archived !== true && (
            <span className={stampClass} style={{ backgroundColor: "#E5F2EA", color: "#246F47" }}>
              Variation sent
            </span>
          )}
          {/* Work done but revenue not collected yet */}
          {card.type === "service" && card.column === "completed" && !isCancelled && card.archived !== true && (
            <span className={stampClass} style={{ backgroundColor: "#F9EFD9", color: "#C8841E" }}>
              To invoice
            </span>
          )}
          {showWaiting && (
            <span
              className="inline-flex items-center gap-[3px] rounded-full px-1.5 py-[3px] text-[9px] font-bold uppercase tracking-[0.12em] leading-none"
              style={
                waitingRed
                  ? { backgroundColor: "#FBE5E5", color: "#C44545" }
                  : { backgroundColor: "#F9EFD9", color: "#C8841E" }
              }
            >
              <AlertTriangle className="h-[8px] w-[8px]" strokeWidth={2.5} />
              {waitHours}h waiting
            </span>
          )}
        </div>
        {priorityStyle && priority && (
          <span
            className={priorityPillClass}
            style={{ backgroundColor: priorityStyle.bg, color: priorityStyle.fg }}
          >
            {priority}
          </span>
        )}
      </div>

      {/* Row 2: job number (when present) + title */}
      {card.number && (
        <p className="font-mono text-[11px] leading-none text-[#A0A0A0]">#{card.number}</p>
      )}
      <p
        className={[
          "text-[15px] leading-snug line-clamp-2",
          card.number ? "mt-0.5" : "",
          isCancelled ? "text-[#6B6B6B] line-through" : "text-[#1A1A1A]",
        ].join(" ")}
        style={{ fontFamily: FRAUNCES, fontWeight: 500 }}
      >
        {card.title}
      </p>

      {/* Row 3: client label with MapPin */}
      {card.clientLabel && (
        <p className="mt-1 flex items-center gap-1 truncate text-[12px] leading-tight text-[#6B6B6B]">
          <MapPin className="h-3 w-3 shrink-0" strokeWidth={1.5} />
          {card.clientLabel}
        </p>
      )}

      {/* Footer: due pill + assignee coin */}
      <div className="mt-2.5 flex items-center justify-between gap-2">
        {/* Left: date treatment */}
        {isDoneColumn ? (
          completedToday ? (
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold leading-none"
              style={{ backgroundColor: "#E5F2EA", color: "#246F47" }}
            >
              <Calendar className="h-3 w-3 shrink-0" strokeWidth={1.5} />
              Closed today
            </span>
          ) : card.completedAt ? (
            <span className="inline-flex items-center gap-1 text-[11px] leading-none text-[#6B6B6B]">
              <Calendar className="h-3 w-3 shrink-0" strokeWidth={1.5} />
              {formatDate(card.completedAt.slice(0, 10))}
            </span>
          ) : (
            <span />
          )
        ) : card.scheduledFor && !dateMuted ? (
          isOverdue ? (
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold leading-none"
              style={{ backgroundColor: "#FBE5E5", color: "#C44545" }}
            >
              <Calendar className="h-3 w-3 shrink-0" strokeWidth={1.5} />
              Overdue
            </span>
          ) : isToday ? (
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold leading-none"
              style={{ backgroundColor: "#FBE5E5", color: "#C44545" }}
            >
              <Calendar className="h-3 w-3 shrink-0" strokeWidth={1.5} />
              Due today
            </span>
          ) : (
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium leading-none"
              style={
                isWithin3Days
                  ? { backgroundColor: "#F9EFD9", color: "#C8841E" }
                  : { backgroundColor: "#F0EDE4", color: "#3A3A3A" }
              }
            >
              <Calendar className="h-3 w-3 shrink-0" strokeWidth={1.5} />
              {formatDate(card.scheduledFor)}
            </span>
          )
        ) : (
          <span />
        )}

        {/* Right: project member avatar stack OR service assignee coin / ghost assign */}
        {card.type === "project" && card.memberIds && card.memberIds.length > 0 ? (
          // Avatar stack — up to MAX_COINS overlapping coins, then overflow "+N".
          // Hours/Timer chips deliberately omitted — no real hours data exists yet.
          <div className="flex items-center" style={{ gap: 0 }}>
            {card.memberIds.slice(0, MAX_COINS).map((uid, idx) => {
              const profile = profilesById ? profilesById.get(uid) : undefined;
              const bg = coinBgForId(uid);
              return (
                <span
                  key={uid}
                  className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full ring-2 ring-white text-[9px] font-bold text-white"
                  style={{
                    backgroundColor: bg,
                    marginLeft: idx === 0 ? 0 : "-6px",
                    zIndex: MAX_COINS - idx,
                    position: "relative",
                  }}
                  title={
                    profile
                      ? `${profile.firstName ?? ""} ${profile.lastName ?? ""}`.trim()
                      : uid
                  }
                >
                  {profile ? (
                    getInitials(profile)
                  ) : (
                    <User className="h-3 w-3" strokeWidth={1.5} />
                  )}
                </span>
              );
            })}
            {card.memberIds.length > MAX_COINS && (
              <span
                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full ring-2 ring-white text-[9px] font-medium text-[#6B6B6B]"
                style={{
                  backgroundColor: "#FAF8F2",
                  marginLeft: "-6px",
                  zIndex: 0,
                  position: "relative",
                  border: "1px solid #E6E1D4",
                }}
                title={`${card.memberIds.length - MAX_COINS} more`}
              >
                +{card.memberIds.length - MAX_COINS}
              </span>
            )}
          </div>
        ) : assigneeProfile ? (
          <span
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[#E6E1D4] bg-[#FAF8F2] text-[9px] font-bold text-[#3A3A3A]"
            title={`${assigneeProfile.firstName} ${assigneeProfile.lastName}`}
          >
            {getInitials(assigneeProfile)}
          </span>
        ) : card.assignedTo ? (
          // assignedTo set but not in map (fetch failed) — fall back to User glyph
          <span
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[#E6E1D4] bg-[#FAF8F2] text-[#6B6B6B]"
            title={card.assignedTo}
          >
            <User className="h-3 w-3" strokeWidth={1.5} />
          </span>
        ) : showGhostAssign ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenService(card.id);
            }}
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-dashed border-[#D8D2C4] text-[#A0A0A0] opacity-0 transition-opacity duration-150 group-hover:opacity-100 hover:border-[#2F8F5C] hover:text-[#2F8F5C]"
            aria-label="Assign job"
            title="Assign"
          >
            <UserPlus className="h-3 w-3" strokeWidth={1.5} />
          </button>
        ) : null}
      </div>
    </div>
  );
}

// BoardToolbar — search input + type filter chips + Filters popover + New service job button.
//
// Extracted from JobsBoard to keep that file under ~700 lines.
//
// Keyboard:
//   F or / → focus search input (ignored when target is editable)
//   Escape → clear search + blur (handled inside the input's keydown)
//
// The keyboard listener is registered in JobsBoard (one listener, shared with
// N / ? shortcuts). The searchInputRef is forwarded here so JobsBoard can
// programmatically focus it.

import { forwardRef, useRef, useState } from "react";
import { Search, SlidersHorizontal, Plus, RefreshCw, ArrowDownWideNarrow, Archive } from "lucide-react";

// ─── types ────────────────────────────────────────────────────────────────────

export type TypeFilter = "all" | "service" | "maintenance" | "project";

const TYPE_FILTERS: { key: TypeFilter; label: string }[] = [
  { key: "all",         label: "All" },
  { key: "service",     label: "Service" },
  { key: "maintenance", label: "Maintenance" },
  { key: "project",     label: "Projects" },
];

// Sort mode for cards within each column.
//   "date" → newest first (createdAt desc; Done keeps most-recently-closed first)
//   "az"   → alphabetical by customer name (clientLabel)
export type SortMode = "date" | "az";

const SORT_MODES: { key: SortMode; label: string }[] = [
  { key: "date", label: "Newest" },
  { key: "az",   label: "A–Z" },
];

// ─── props ────────────────────────────────────────────────────────────────────

export interface BoardToolbarProps {
  search: string;
  onSearchChange: (v: string) => void;
  typeFilter: TypeFilter;
  onTypeFilterChange: (f: TypeFilter) => void;
  includeCancelled: boolean;
  onIncludeCancelledChange: (v: boolean) => void;
  assignedToMe: boolean;
  onAssignedToMeChange: (v: boolean) => void;
  sortMode: SortMode;
  onSortModeChange: (m: SortMode) => void;
  showArchived: boolean;
  onShowArchivedChange: (v: boolean) => void;
  canManage: boolean;
  loading: boolean;
  onRefresh: () => void;
  onNewJob: () => void;
}

// ─── component ───────────────────────────────────────────────────────────────

export const BoardToolbar = forwardRef<HTMLInputElement, BoardToolbarProps>(
  function BoardToolbar(
    {
      search,
      onSearchChange,
      typeFilter,
      onTypeFilterChange,
      includeCancelled,
      onIncludeCancelledChange,
      assignedToMe,
      onAssignedToMeChange,
      sortMode,
      onSortModeChange,
      showArchived,
      onShowArchivedChange,
      canManage,
      loading,
      onRefresh,
      onNewJob,
    },
    ref,
  ) {
    const [filtersOpen, setFiltersOpen] = useState(false);
    const filtersButtonRef = useRef<HTMLButtonElement>(null);

    return (
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {/* Search input */}
        <div className="relative flex min-w-[200px] flex-1 items-center">
          <Search
            className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-[#A0A0A0]"
            strokeWidth={1.5}
          />
          <input
            ref={ref}
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search jobs or clients…"
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                onSearchChange("");
                (e.currentTarget as HTMLInputElement).blur();
              }
            }}
            className="h-8 w-full rounded-full border border-[#E6E1D4] bg-white pl-8 pr-10 text-[13px] text-[#1A1A1A] placeholder-[#A0A0A0] focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]"
          />
          {/* Kbd hint chip */}
          <span className="pointer-events-none absolute right-3 inline-flex h-4 min-w-[16px] items-center justify-center rounded border border-[#D8D2C4] bg-[#F5F2E9] px-1 text-[10px] font-semibold text-[#6B6B6B] shadow-[0_1px_0_#D8D2C4]">
            F
          </span>
        </div>

        {/* Type filter pills */}
        <div className="flex flex-wrap gap-1">
          {TYPE_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => onTypeFilterChange(f.key)}
              className={[
                "rounded-full border px-3 py-1 text-[12px] font-medium transition-colors",
                typeFilter === f.key
                  ? "border-[#1A1A1A] bg-[#1A1A1A] text-white"
                  : "border-[#E6E1D4] bg-white text-[#3A3A3A] hover:bg-[#FAF8F2]",
              ].join(" ")}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Sort pill toggle — Newest (createdAt desc) | A–Z (customer) */}
        <div
          className="inline-flex items-center gap-0.5 rounded-full border border-[#E6E1D4] bg-white p-0.5"
          role="group"
          aria-label="Sort cards"
        >
          <ArrowDownWideNarrow className="ml-1.5 mr-0.5 h-3.5 w-3.5 shrink-0 text-[#A0A0A0]" strokeWidth={1.5} />
          {SORT_MODES.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => onSortModeChange(s.key)}
              aria-pressed={sortMode === s.key}
              className={[
                "rounded-full px-2.5 py-0.5 text-[12px] font-medium transition-colors",
                sortMode === s.key
                  ? "bg-[#1A1A1A] text-white"
                  : "text-[#3A3A3A] hover:bg-[#FAF8F2]",
              ].join(" ")}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Filters pill + popover */}
        <div className="relative">
          <button
            ref={filtersButtonRef}
            type="button"
            onClick={() => setFiltersOpen((o) => !o)}
            className={[
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium transition-colors",
              filtersOpen || includeCancelled || assignedToMe
                ? "border-[#1A1A1A] bg-[#1A1A1A] text-white"
                : "border-[#E6E1D4] bg-white text-[#3A3A3A] hover:bg-[#FAF8F2]",
            ].join(" ")}
            aria-haspopup="true"
            aria-expanded={filtersOpen}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={1.5} />
            Filters
            {(includeCancelled || assignedToMe) && (
              <span className="ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-[#2F8F5C] text-[10px] font-bold text-white">
                {(includeCancelled ? 1 : 0) + (assignedToMe ? 1 : 0)}
              </span>
            )}
          </button>

          {filtersOpen && (
            <>
              {/* Backdrop */}
              <div
                className="fixed inset-0 z-20"
                onClick={() => setFiltersOpen(false)}
              />
              {/* Popover */}
              <div className="absolute left-0 top-full z-30 mt-1.5 w-52 rounded-[11px] border border-[#E6E1D4] bg-white p-3 shadow-[0_4px_16px_rgba(20,20,20,0.12)]">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#6B6B6B]">
                  Filters
                </p>
                {/* Show cancelled toggle */}
                <label className="flex cursor-pointer items-center justify-between rounded-md px-1 py-1.5 text-[13px] text-[#3A3A3A] hover:bg-[#FAF8F2]">
                  Show cancelled
                  <input
                    type="checkbox"
                    checked={includeCancelled}
                    onChange={(e) => onIncludeCancelledChange(e.target.checked)}
                    className="h-3.5 w-3.5 accent-[#2F8F5C]"
                  />
                </label>
                {/* Assigned to me toggle */}
                <label className="flex cursor-pointer items-center justify-between rounded-md px-1 py-1.5 text-[13px] text-[#3A3A3A] hover:bg-[#FAF8F2]">
                  Assigned to me
                  <input
                    type="checkbox"
                    checked={assignedToMe}
                    onChange={(e) => onAssignedToMeChange(e.target.checked)}
                    className="h-3.5 w-3.5 accent-[#2F8F5C]"
                  />
                </label>
              </div>
            </>
          )}
        </div>

        {/* Archived view toggle — swaps the board for a searchable archived list */}
        <button
          type="button"
          onClick={() => onShowArchivedChange(!showArchived)}
          aria-pressed={showArchived}
          className={[
            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium transition-colors",
            showArchived
              ? "border-[#1A1A1A] bg-[#1A1A1A] text-white"
              : "border-[#E6E1D4] bg-white text-[#3A3A3A] hover:bg-[#FAF8F2]",
          ].join(" ")}
        >
          <Archive className="h-3.5 w-3.5" strokeWidth={1.5} />
          {showArchived ? "Active board" : "Archived"}
        </button>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Refresh */}
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-full border border-[#E6E1D4] bg-white px-3 py-1.5 text-[12px] font-medium text-[#3A3A3A] hover:bg-[#FAF8F2] disabled:opacity-50"
          aria-label="Refresh board"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>

        {/* New service job */}
        {canManage && (
          <button
            type="button"
            onClick={onNewJob}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#2F8F5C] px-4 py-1.5 text-[12px] font-semibold text-white hover:bg-[#246F47]"
          >
            <Plus className="h-3.5 w-3.5" />
            New service job
          </button>
        )}
      </div>
    );
  },
);

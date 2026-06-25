-- ============================================================
-- 84) materials: stock flag + on-hand qty (Simpro Stock tab)
-- ============================================================
-- Quote rework Phase 1 Part 7 — the Stock sub-tab browses materials flagged as
-- stocked, showing what's on hand, and adds them to the quote (same grouped
-- browse-and-add as the Catalogue tab). Lightweight v1: a per-material stock flag
-- + a single on-hand number (full multi-location inventory deferred). Additive +
-- idempotent; existing manager-only RLS on materials already covers the columns.
-- ============================================================

alter table public.materials
  add column if not exists is_stock_item boolean not null default false;

alter table public.materials
  add column if not exists stock_on_hand numeric(12,2) not null default 0;

notify pgrst, 'reload schema';

-- ============================================================
-- 82) prebuilds: subgroup + favourite (Simpro Pre-Builds tab)
-- ============================================================
-- Quote rework Phase 1 Part 5 — the Pre-Builds sub-tab browses prebuilds in a
-- two-level Group -> Subgroup tree (Simpro). prebuilds.category is the Group;
-- add `subcategory` for the Subgroup level. `is_favourite` backs Simpro's
-- Favourites group / "Favourites Only" filter / per-part star (org-wide — the
-- team is a single tenant). Additive + idempotent; the existing manager-only
-- RLS on prebuilds already covers the new columns.
-- ============================================================

alter table public.prebuilds
  add column if not exists subcategory text;

alter table public.prebuilds
  add column if not exists is_favourite boolean not null default false;

notify pgrst, 'reload schema';

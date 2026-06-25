-- ============================================================
-- 83) materials: group + subgroup + favourite (Simpro Catalogue tab)
-- ============================================================
-- Quote rework Phase 1 Part 6 — the Catalogue sub-tab browses materials in the
-- same two-level Group -> Subgroup tree as Pre-Builds. Materials grouped only by
-- `tags` until now; add `category` (Group) + `subcategory` (Subgroup), plus
-- `is_favourite` for the Favourites group / "Favourites Only" filter / per-part
-- star (org-wide). Mirrors migration 82 (prebuilds). Additive + idempotent; the
-- existing manager-only RLS on materials already covers the new columns.
-- ============================================================

alter table public.materials
  add column if not exists category text;

alter table public.materials
  add column if not exists subcategory text;

alter table public.materials
  add column if not exists is_favourite boolean not null default false;

notify pgrst, 'reload schema';

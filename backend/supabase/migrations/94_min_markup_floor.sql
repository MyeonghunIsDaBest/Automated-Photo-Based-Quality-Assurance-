-- ============================================================
-- 94) Pricing floor — minimum markup on cost
-- ============================================================
-- Luke's brief (7 Jul meeting): catalogue SELL prices are FIXED numbers he
-- controls; when he negotiates a better BUY price the margin win is KEPT, not
-- leaked. The floor is the safety net: sell should never sit below
-- cost × (1 + min_markup_pct)  — "25% on our buy price".
--
-- Semantics: MARKUP-ON-COST (floor = cost × 1.25 at the 0.25 default), NOT
-- margin-on-sell. The floor never auto-lowers a price — it flags below-floor
-- sells in the catalogue/pickers and powers the per-quote "Revert to minimum
-- pricing" action (reprices costed lines DOWN to the floor to win a job).
--
-- Additive + idempotent. Depends: 65 (commercial_settings), 77 (pricing defaults).
-- ============================================================

alter table public.commercial_settings
  add column if not exists min_markup_pct numeric not null default 0.25;

comment on column public.commercial_settings.min_markup_pct is
  'Minimum markup on cost (0.25 = 25%). Floor sell = cost x (1 + this). Flags + revert-to-minimum only; never auto-lowers a set sell price.';

notify pgrst, 'reload schema';

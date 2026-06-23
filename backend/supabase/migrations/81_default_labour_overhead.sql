-- ============================================================
-- 81) commercial_settings: default labour overhead ($/hr)
-- ============================================================
-- Boss feedback (24 Jun): labour overhead should be a preset configured once,
-- not typed into every quote. Adds an office-wide default the New-Quote wizard
-- prefills (with a "use default" toggle), mirroring default_material_markup /
-- stc_unit_price / veec_unit_value (mig 77). Additive + idempotent.
-- ============================================================

alter table public.commercial_settings
  add column if not exists default_labour_overhead numeric not null default 0;

notify pgrst, 'reload schema';

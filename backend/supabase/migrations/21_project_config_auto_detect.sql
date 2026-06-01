-- 21_project_config_auto_detect.sql
-- Per-project flag gating the diary auto-detect-conditions vision call. Default
-- false so no project incurs an extra Claude vision call on photo attach unless
-- explicitly opted in. Enable for the pilot only (operational step below).
--
-- Sequence: 00_init … 20_diary_entries, 21_project_config_auto_detect ← THIS.
alter table public.project_config
  add column if not exists ai_auto_detect_enabled boolean not null default false;

-- OPERATIONAL (run once against prod, with the real pilot project id):
--   update public.project_config
--     set ai_auto_detect_enabled = true
--     where project_id = '<PILOT_PROJECT_UUID>';

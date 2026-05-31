-- 22_status_snapshot_narrative.sql
-- Adds the AI Daily Brief narrative to the existing daily synthesis cache.
-- Sequence: 00_init … 21_project_config_auto_detect, 22 ← THIS.
alter table public.project_status_snapshots
  add column if not exists narrative_text text;

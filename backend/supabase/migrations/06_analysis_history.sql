-- Phase D-4 — Analysis history.
--
-- Pre-Phase-D, `ai_analyses` had a UNIQUE(photo_id) index (created in
-- 02_phase_c_seam.sql §1). That made the trigger-driven webhook flow
-- idempotent — but it also made re-analysis impossible: a second
-- `analyze-photo` invocation against the same photo would either no-op
-- (claim returned 0 rows because the existing row was already analysed)
-- or fail to INSERT (UNIQUE collision).
--
-- This migration drops UNIQUE(photo_id) so re-analysis flows can INSERT a
-- fresh row per attempt. The frontend already reads "latest by analyzed_at",
-- so multiple rows per photo are a non-issue for display. Idempotency for
-- the original webhook flow is now provided by analyze-photo's claim
-- logic alone (UPDATE ... WHERE analysis_status='queued' returns 0 rows
-- to all but the first invocation).
--
-- Sequence: 00_init, 01, 02_phase_c_seam, 03_messaging, 04_stakeholder,
-- 05_phash_rpc, 06_analysis_history ← THIS FILE.

-- Drop the unique index. `if exists` keeps the migration re-runnable.
drop index if exists ai_analyses_photo_id_unique;

-- Replace with a non-unique covering index — query path "all analyses for
-- this photo, latest first" stays cheap.
create index if not exists idx_ai_analyses_photo_recent
  on ai_analyses (photo_id, analyzed_at desc);

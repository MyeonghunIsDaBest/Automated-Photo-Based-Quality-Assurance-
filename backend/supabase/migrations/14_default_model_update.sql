-- 14_default_model_update.sql
--
-- Bump project_config.ai_default_model from the Phase C placeholder
-- 'mvp-stub@v0' to the Phase D real-vision default 'claude-sonnet-4-6'.
-- Runs ahead of the May 26 Mock→Real Claude Vision cutover so the column
-- default + every existing row both name the model that callClaudeVision()
-- will actually invoke. Without this, analyses created post-cutover would
-- stamp 'mvp-stub@v0' onto their model_used field (via cfg.defaultModel)
-- while the real call goes to Sonnet — confusing the audit trail.
--
-- Idempotent: only updates rows still on the placeholder. Re-running after
-- cutover is a no-op (no rows match the WHERE clause).

update project_config
set    ai_default_model = 'claude-sonnet-4-6',
       updated_at       = now()
where  ai_default_model = 'mvp-stub@v0';

alter table project_config
alter column ai_default_model set default 'claude-sonnet-4-6';

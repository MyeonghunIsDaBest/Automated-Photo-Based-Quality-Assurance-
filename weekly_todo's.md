May 11, 2026
TO DO's:
⦁ Write 09_project_config.sql migration (table, constraints, RLS, triggers)
⦁ Apply migration to dev Supabase and verify backfill of all existing projects
⦁ Build loadProjectConfig.ts shared helper with 60s TTL cache
⦁ Update decideAction.ts signature to accept thresholds parameter
⦁ Add 'project_config' to auditLog.ts entityType union
⦁ Update decideAction.test.ts to pass explicit thresholds
⦁ Run typecheck after Edge function edits
⦁ Run contract-parity check between Deno and Node copies

May 12, 2026
TO DO's:
⦁ Wire loadProjectConfig into analyze-photo Edge function
⦁ Wire loadProjectConfig into confirm-analysis with manual_floor_allowed gate
⦁ Build lib/api/projectConfig.ts with get + update functions
⦁ Add ProjectConfig interface to types/index.ts
⦁ Build useProjectConfig hook subscribed to active project
⦁ Add projectConfig slice to features.ts store
⦁ Add canManageProjectConfig permission helper
⦁ Write projectConfig.test.ts covering read/write and RLS rejection

May 13, 2026
TO DO's:
⦁ Build ProjectConfigTab.tsx shell with project picker
⦁ Build AI thresholds section with live caption
⦁ Build Progression section (mode, weights, target photos, manual floor toggle)
⦁ Build Dedup and Branding sections (phash slider, accent picker, logo upload)
⦁ Wire Save handler with audit log emission
⦁ Mount ProjectConfigTab as new section in Admin.tsx
⦁ Add read-only Configuration panel to ProjectDetailModal
⦁ Manual smoke: edit config and verify audit log row in Supabase

May 14, 2026
TO DO's:
⦁ Write deriveProgress.ts pure function for progression model
⦁ Write deriveProgress.test.ts with 8 edge-case scenarios
⦁ Build ProgressionBreakdown.tsx component with 3 mini-bars
⦁ Gate TaskDrawer slider and breakdown by cfg.progressionMode
⦁ Update Upload.tsx to read phashThreshold from useProjectConfig
⦁ Update seed-demo-data.mjs with customised demo config row
⦁ Seed second demo project with system defaults for side-by-side compare
⦁ Manual smoke: switch progression modes and verify drawer UI changes

May 15, 2026
TO DO's:
⦁ Delete Sidebar.tsx and Files.tsx orphans
⦁ Wire Audit.tsx route in App.tsx and expand TopNav with gates
⦁ Lift Settings, Upload, Gallery, Gantt, Audit onto editorial shell
⦁ Build AccentBar.tsx and swap emerald accents to CSS variable
⦁ Run full verification (typecheck, vitest, vite build, route smoke)
⦁ Append dated section to claude_build_prog.md
⦁ Verify orphan grep checks return 0 hits
⦁ Add Settings entry to TopNav user-menu dropdown

────────────────────────────────────────────────────────────────────────
Phase D — Mock → Real Claude Vision (10-day split: prep without key, then cutover)
ANTHROPIC_API_KEY arrives week of May 25. MockAI stays live through May 22.
Plan reference: C:\Users\footlong\.claude\plans\review-the-entire-source-temporal-sphinx.md (Section 5)
────────────────────────────────────────────────────────────────────────

May 18, 2026
TO DO's:
⦁ Audit git status — list every untracked module from DEMO_ROADMAP.md:23-34
⦁ Commit backend/supabase/functions/_shared/loadProjectConfig.ts (currently untracked, imported by analyze-photo)
⦁ Commit migrations 09_project_config.sql through 13_ai_usage_limits.sql if any are still untracked
⦁ Commit frontend mockAi runtime modules (MockAnalysisButton, useMockAnalysis, mockAi.ts, mockAiUi store)
⦁ Commit ProjectConfigTab.tsx, ProgressionBreakdown.tsx, useProjectConfig.ts, MissingEnvBanner.tsx, AccentBar.tsx
⦁ Commit lib/api/reports.ts, projectConfig.ts, lib/progression/deriveProgress.ts and the new tests
⦁ Run `npm --prefix frontend run typecheck` — expect green after the commits land
⦁ Run `npm --prefix frontend run build` — expect green; verify precache + chunk count is stable

May 19, 2026
TO DO's:
⦁ Read 3 representative Casone seed photos across different phases (framing, electrical, finishing) to inform prompting
⦁ Create backend/supabase/functions/_shared/visionPrompt.ts with VISION_SYSTEM_PROMPT v1 (no API call needed)
⦁ Add buildUserPrompt(phaseHint) helper alongside the system prompt
⦁ Add VISION_PROMPT_VERSION = '2026-05-19-v1' constant for future audit-log stamping
⦁ Manual scan: prompt covers all 8 ConstructionPhase + 6 SafetyFlag + 6 QualityFlag values
⦁ Implement DEMO_ROADMAP.md Week 1 item — "Reset demo" admin action in /admin → Project config
⦁ Implement Week 1 item — notification dedup for batch MockAI runs (one summary toast instead of N)

May 20, 2026
TO DO's:
⦁ Add AnthropicVisionInput + AnthropicVisionMessage types to _shared/anthropic.ts
⦁ Add callAnthropicVision() next to callAnthropic() reusing kill-switch + daily cap checks (offline-safe)
⦁ Wire the vision content block: { type: 'image', source: { type: 'base64', media_type, data } }
⦁ Plumb record_ai_call(totalTokens, costCents) the same way as the text path
⦁ Create __tests__/visionPrompt.test.ts with msw mock of api.anthropic.com — no real key required
⦁ Cover 5 scenarios: parse-success, parse-failure, confidence-clamp, unknown-flag-filtered, missing-key
⦁ Run vitest — expect green
⦁ Contract-parity check: Deno vs Node copies of contract.ts still byte-identical

May 21, 2026
TO DO's:
⦁ Add callClaudeVision(sb, args) function to analyze-photo/index.ts next to mockAnalyze (do NOT call it yet)
⦁ Implement Storage download: sb.storage.from('photos').download(storagePath)
⦁ Implement Uint8Array → base64 (btoa(String.fromCharCode(...buf)))
⦁ Implement guessMediaType() for .jpg/.jpeg/.png/.webp (reject .heic + .mov with failureResult)
⦁ Implement parseVisionResponse(text, model) with JSON.parse + defensive validators (clamp, filter, length-cap)
⦁ Implement failureResult(rationale) helper for download/parse/api errors
⦁ Add validatePhase, filterSafetyFlags, filterQualityFlags helpers
⦁ Keep mockAnalyze() as the active call at line 120 — callClaudeVision() sits idle until next week

May 22, 2026
TO DO's:
⦁ Implement DEMO_ROADMAP.md Week 1 item — AI confidence rollup hook (replace task.percentComplete stand-in)
⦁ Implement Week 1 item — embedded mini-dropzone on /gantt?tab=review (~60-line dropzone, no taskId)
⦁ Implement Week 1 item — seed-data overhaul (3 demo projects: North Site emerald/weekly, South Site rose/monthly, Workshop indigo/none)
⦁ Implement Week 1 item — activity-feed spot-check (every MockAI bump emits task_progress_updated)
⦁ Write backend/supabase/migrations/14_default_model_update.sql (UPDATE 'mvp-stub@v0' → 'claude-sonnet-4-6'; ALTER DEFAULT)
⦁ Apply migration to dev Supabase + verify project_config rows updated
⦁ Append "Week-1 prep complete" section to claude_build_prog.md

────────────────────────────────────────────────────────────────────────
Week 2 — ANTHROPIC_API_KEY arrives, cutover begins
────────────────────────────────────────────────────────────────────────

May 25, 2026
TO DO's:
⦁ Receive the ANTHROPIC_API_KEY (Jordan)
⦁ Set the secret: supabase secrets set ANTHROPIC_API_KEY=sk-ant-…
⦁ Confirm: supabase secrets list — key present, no placeholder
⦁ Smoke-test polish-text first (text path verifies key + wrapper without touching photo path)
⦁ Sign in as company_admin and Polish a 30-char site-diary entry end-to-end
⦁ Confirm ai_usage_daily.call_count incremented in Supabase Studio
⦁ Confirm audit_log row written with action='ai_polish_succeeded' + token counts
⦁ Raise daily token cap if needed: supabase secrets set ANTHROPIC_DAILY_TOKEN_CAP=500000

May 26, 2026
TO DO's:
⦁ Flip the call site: replace mockAnalyze() with callClaudeVision() at analyze-photo/index.ts line 120
⦁ Deploy: supabase functions deploy analyze-photo --no-verify-jwt
⦁ Upload one fresh test photo to "Casone — North Site" via the UploadsTab dropzone
⦁ Tail Edge Function logs: confirm queued → analysing → analysed transition with real model
⦁ Verify ai_analyses row has model_used='claude-sonnet-4-6' + non-zero confidence + 1-3 sentence rationale
⦁ Append dated "Phase D D1-D5 landed (real Claude Vision live)" section to claude_build_prog.md
⦁ Decide Mock-AI button fate: rename to "Re-analyse pending" OR remove OR feature-flag VITE_ENABLE_MOCK_AI
⦁ Add "Failed analyses" affordance to ReviewQueueTab.tsx showing rationale + retry button (forceNew=true)

TIME LOG (sheet format — time slot · task):
6:00-7:00    Convert Sparky into Pop instead of Site diary tab
7:00-8:00    Delete Punch List on Site Diary (remnant of legacy build)
8:00-8:30    Merge the entire Site diary tabs into singular page
8:30-9:00    Fix Assistant error: Failed to send a request to the Edge Function
9:00-10:00   Fix Upload photo/images for PhotoQA
10:00-10:30  Meeting (canceled)
10:30-       Rework entire SiteDiary with potential bug fix
⦁ Analyze AI-Analysis tab for potential broken function
⦁ Analyze AI-Analysis backend wiring for potential broken function
⦁ Analyze aiSignal for testing
⦁ Add photo_phase for backend
⦁ Wire phaseHint through photos.ts + Edge Function
⦁ Add getRecentAnalyses + RecentActivityStrip
⦁ Implement Real upload progress + partial-success batch
⦁ Tighten KpiCell + Hero header sizing
⦁ Tighten Finance + Watchlist sub-row sizing
⦁ Tighten Live activity row sizing + empty-state padding for Recent files/notes
⦁ Wire 'Upload a file' button to real uploadDocument call
⦁ Wire 'Write a note' button to inline composer + addComment
⦁ Extend DiaryEntry type with startTime/endTime/status/tags (optional, legacy-safe)
⦁ Make addDiaryEntry return id + bump store persist version 2→3
⦁ Create diaryRowMapper helper (TimelineRow + isVisibleEntry + colorIndexForWorker)
⦁ Create uploadDiaryPhoto helper for client-buffered photo attach
⦁ Strip mockTimeline.ts to COMMON_WORKS + WORKER_COLORS only
⦁ Refactor Site Diary sub-components (Conditions, DayRollup, DayHeader, ProgressBar, FabCamera, QuickAdd, CommonWorks)
⦁ Refactor TimelineCard + TimelineEntry to real DiaryEntry shape
⦁ Build DiaryEntryDrawer.tsx (new, ~480 lines — autosave on blur + photos + personnel + tags + delete)
⦁ Rewrite SiteDiaryTab for real store data + drawer mount + true empty state
⦁ Move Common Works into drawer as tag picker + auto-stamp start time + buffered photo upload in create mode
⦁ Build SparkyAssistModal — inline Compose → Proposed-rewrite modal replacing the standalone Sparky drawer
⦁ Wire 'Ask Sparky' button + autoOpenSparky one-shot from Site Diary empty state
⦁ Add Drawings & Permits sub-tab inside TaskDrawer (per-task uploads via photos table)
⦁ Refactor TaskDrawingsPane to dual-mode + mount project-wide above Tasks schedule
⦁ Rewrite Task breakdown card editorial style (orange CheckSquare tile + Fraunces complete/total)
⦁ Redesign Finance card editorial style (green DollarSign + 3 sub-rows with Fraunces numbers)
⦁ Redesign Watchlist card editorial style (lavender Eye + tinted icon tiles per row)
⦁ Refactor KpiCell with vertical accent bar + Fraunces big number + delta chip
⦁ Rebuild Hero card with segmented pill mode toggle + larger Fraunces title
⦁ Enhance TrendBody with green-dot date range + big Fraunces % + delta chip
⦁ Extract LiveActivityCard component with filter chips (All / Updates / Diary / Files)
⦁ Add TODAY / YESTERDAY / N DAYS AGO day-bucket grouping to Live activity
⦁ Add cluster collapsing on Live activity ("Show N updates ▾" for repeat-actor runs)
⦁ Redesign Recent files empty state with circular icon + dashed Upload-a-file button
⦁ Redesign Recent notes empty state with circular icon + dashed Write-a-note button
⦁ Refactor Recent notes to read Site Diary entries instead of task comments (correction)
⦁ Redesign Uploads tab editorial style (dashed dropzone + green Browse + file-type chips)
⦁ Add per-upload delete with in-tile confirm overlay (wired through deletePhoto)
⦁ Fix Uploads image sizing consistency (aspect-[4/3] + absolute media + uniform grid)
⦁ Append dated section to claude_build_prog.md covering today's overhaul

May 27, 2026
TO DO's:
⦁ Add re-analyse cap to analyze-photo/index.ts (max 3 per photo per 24h via count query)
⦁ Add test case to __tests__/analyzePhoto.test.ts covering the cap rejection
⦁ Write backend/supabase/migrations/15_ai_usage_per_project.sql (table + record_project_ai_call RPC)
⦁ Patch callAnthropic() + callAnthropicVision() signatures to accept optional projectId
⦁ Insert per-project usage row alongside global on every successful call
⦁ Add monthly-spend chip to ProjectConfigTab.tsx ("This month: $X.XX")
⦁ Manual smoke: run 5 analyses across 2 projects, confirm per-project counts diverge
⦁ Run typecheck + vitest — expect green

May 28, 2026
TO DO's:
⦁ Pick 20 already-uploaded photos across all 8 construction phases for calibration
⦁ Manually rate each: actual phase, actual completion %, actual safety flags (ground truth)
⦁ Run callClaudeVision against each via curl + service-role token (do not auto-bump tasks)
⦁ Build a spreadsheet: photo_id, model_phase, true_phase, model_pct, true_pct, model_flags, true_flags
⦁ Compute phase-detection accuracy, completion-MAE, safety-flag precision + recall
⦁ Identify top 3 failure modes in the model output (e.g. mistakes framing for electrical)

May 29, 2026
TO DO's:
⦁ Tune project_config.ai_auto_update_threshold per project based on calibration data
⦁ Tune project_config.ai_review_queue_threshold similarly (default 0.50 may be too lenient)
⦁ Iterate VISION_SYSTEM_PROMPT v1 → v2 addressing the top 3 failure modes from May 28
⦁ Bump VISION_PROMPT_VERSION to '2026-05-29-v2'
⦁ Re-run the 20 calibration photos against v2 — confirm improvement on weak phases
⦁ Append "Phase D calibration results" section to claude_build_prog.md
⦁ Update PRODUCTION_ROADMAP.md — mark Phase D D1-D5 complete; D6 (calibration) complete
⦁ End-of-Phase-D verification: walk the 10-point checklist from plan Section "Verification"

Backlog — Tester UX suggestions (round 1, captured 2026-05-23)
TO DO's:
⦁ Order flow: split picking into two screens — step 1 = item picker, step 2 = order confirmation. Reduces accidental confirm clicks. Current single-window flow ships line items + confirm in one panel; tester wants the visual handoff.
⦁ Inventory: sort by trade (electrical, plumbing, finishings, etc.) instead of flat alphabetical. Add a "Group by trade" toggle on `frontend/src/pages/gantt/tabs/InventoryTab.tsx` (or wherever inventory renders) with sticky section headers per trade.
⦁ Both items are UX polish, not bugs — schedule after Phase D cutover so they don't compete with API-key + calibration work.

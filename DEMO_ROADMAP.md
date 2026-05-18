# BuildTrack — Demo Roadmap

> **Where we are today.** The working tree currently fails `npm --prefix frontend run typecheck` and `npm --prefix frontend run build` — the Mock-AI runner, progression breakdown, per-project-config hook, and several other modules are imported across the source tree but not all of them are committed yet. **Week 0 lands the scaffolding so the app boots.** Until then every UI improvement below is unreachable.

> **Horizon.** 6 weeks (1 month + 15 days) of focused part-time solo-dev work. Two parallel tracks — automated photo-QA polish (Mock-AI demo loop) and the new AI Writing Assistant (Polish button for site diary entries, per the boss's request 2026-05-12). Goal: a pitch any small Australian electrical contractor can watch end-to-end without you in the room, with both the photo-AI and the text-AI moments landing.

---

## Week 0 — Unbreak the working tree

Prerequisite to everything else. Build is green at end of week.

### Done in this pass

- **`ReviewQueue.tsx` moved → `frontend/src/pages/gantt/tabs/ReviewQueueTab.tsx`.** Now mounted as a Gantt sub-tab with `id: 'review'` between `tasks` and `site_diary`. Dashboard's "Pending review" tile navigates to `/gantt?project=X&tab=review`; the old `/review-queue` route redirects there for back-compat. `MockAnalysisButton` `viewHref` updated to match.
- **Real orphans deleted:** `frontend/src/pages/gantt/tabs/FilesTab.tsx`, `frontend/src/pages/gantt/tabs/WarrantyDrawer.tsx`, `frontend/src/components/layout/Header.tsx`. ~700 LOC + Header gone. Verified via grep — zero remaining importers.
- **Verification:** `tsc --noEmit` clean, `vitest` 66/66, `vite build` clean, precache 1726 KiB (−3 KiB), 51 chunks (down from 57).

### Still to commit (uncommitted modules from prior sessions)

Several modules written across sessions 16–21 of the build log are on disk but untracked in git. They must be committed before a fresh clone can `tsc --noEmit` cleanly. Each is fully written; the work here is `git add` + a sanity scan, not implementation:

- `frontend/src/components/mockAi/MockAnalysisButton.tsx` (now imported by `ReviewQueueTab`, `OverviewTab`, `TasksTab`)
- `frontend/src/components/progression/ProgressionBreakdown.tsx` (imported by `TaskDrawer`)
- `frontend/src/lib/hooks/useProjectConfig.ts` (imported by `Layout`, `Upload`, `TaskDrawer`, `ProjectDetailModal`)
- `frontend/src/components/layout/MissingEnvBanner.tsx` (imported by `Layout`)
- `frontend/src/pages/admin/components/ProjectConfigTab.tsx` (imported by `Admin`)
- `frontend/src/components/editorial/AccentBar.tsx`, `EditorialPageHeader.tsx`
- `frontend/src/lib/api/reports.ts`, `mockAi.ts`, `projectConfig.ts`
- `frontend/src/lib/hooks/useMockAnalysis.ts`
- `frontend/src/lib/progression/deriveProgress.ts`
- `backend/supabase/functions/_shared/loadProjectConfig.ts`
- `backend/supabase/functions/generate-reports/`, `backend/supabase/migrations/09_project_config.sql`, `10_project_reports.sql`
- New tests: `__tests__/deriveProgress.test.ts`, `__tests__/projectConfig.test.ts`

Also still to do: clean up soft `any` casts in `Messages.tsx` + `Reports.tsx`.

### Page audit — Upload + Gallery + Audit deleted

Three top-level pages had no TopNav entry and overlap with Gantt tabs. Deleted in this pass; routes redirect to preserve old links.

| Deleted | Route now redirects to | Feature loss vs. the old page |
|---|---|---|
| `Upload.tsx` | `/gantt?tab=uploads` | Per-task / per-zone selection, EXIF + GPS extraction, perceptual-hash dedup, progress controls, post-upload "bump progress" affordance. UploadsTab is project-scoped only. |
| `Gallery.tsx` | `/gantt?tab=uploads` | `?photo=ID` and `?task=ID` deep-link focus from Dashboard activity feed, Safety incidents, Tasks tab. Click-throughs still land on the tab but lose the specific-photo selection. |
| `Audit.tsx` | `/dashboard` | System-wide filterable audit log + CSV export. No Gantt equivalent. The Overview tab's activity feed shows project-scoped events feed-style only. |

Bundle impact: precache dropped from **1726.49 → 1593.13 KiB (-133 KiB)**, **51 → 41 chunks** (the lazy `Upload` / `Gallery` / `Audit` chunks are gone).

If any of those features end up mattering for the pitch, rebuilds:

- **Photo-focus deep-link.** Add a `?photo=ID` handler to UploadsTab that opens a fullscreen viewer on the matching tile. Roughly half-day work; reuses the existing `PhotoReviewDrawer` shell.
- **Per-task upload affordance.** Add a "Pick task" select to the InlineDropzone inside UploadsTab. Loses EXIF/dedup unless we lift the helpers out of the old Upload.tsx (commit ref in git history if needed).
- **Compliance audit page.** Rebuild as a new section inside `/admin` reading from the existing `audit_log` Supabase table — full-day work for filters + CSV export.

**Done when:** all the modules listed above are committed and `tsc --noEmit` / `vite build` succeed from a fresh clone.

---

## Week 1 — Close the open follow-ups

Mock-AI loop sands so the demo doesn't trip on small bugs in front of a stakeholder.

- **"Reset demo" admin action** in `/admin → Project config`. One click clears `aiAnalysis` from every project photo + resets `tasks.percent_complete` to seed values. Lets you re-pitch back-to-back.
- **Notification dedup for batch Mock-AI runs.** Single summary toast — "Analysed 8 photos, project +42%" — instead of 8 individual toasts.
- **AI confidence rollup hook.** Replace the `task.percentComplete` stand-in in `ProgressionBreakdown` with a real `select avg(confidence) … where action_taken='auto_updated'` per task.
- **Embedded mini-dropzone on `/review-queue`.** ~60-line dropzone that uploads into the active project (no `taskId` required). Keeps the operator on the AI hub end-to-end instead of routing out to `/upload`.
- **Seed-data overhaul.** Three demo projects with different accent colours + report cadences: *Casone — North Site* (emerald, weekly), *Casone — South Site* (rose, monthly), *Casone — Workshop Fitout* (indigo, none). Each pre-loaded with 8–12 photos + 5–10 tasks at varied progression.
- **Activity-feed spot-check.** Confirm every Mock-AI bump emits a visible `task_progress_updated` row.

**Done when:** the existing 10-minute walkthrough passes end-to-end, plus the new affordances above.

---

## Week 2 — AI Writing Assistant V1 (Polish button)

Slotted in **before** demo collateral so the Polish button makes it into the demo video. New feature the boss explicitly asked for on 2026-05-12 — turn raw site-diary notes into report-grade prose with one click.

- **New Edge function `polish-text`** (`backend/supabase/functions/polish-text/index.ts`). JWT-gated wrapper around the Anthropic Messages API. System prompt: faithful paraphrase, no invented details, professional construction language. Audit-logs every call to `audit_log` with token counts + cost.
- **New `<PolishButton>` component** (`frontend/src/components/ai/PolishButton.tsx`). Reusable, four states: idle / running (shimmer) / preview (side-by-side raw vs polished, Accept / Reject / Edit) / error. Disabled with tooltip when offline (`navigator.onLine`) or input < 20 chars.
- **Mount in `SiteDiaryTab`** next to the description textarea inside the entry form. `<PolishButton value={description} onAccept={setDescription} projectId={project.id} surface="site_diary" />`.
- **Anthropic API key + cost monitoring.** `ANTHROPIC_API_KEY` set in Supabase secrets. Daily `audit_log` aggregation gives a per-project spend view. Per-call cost runs ~$0.01 (Claude Sonnet pricing).
- **Risk guards:** original raw text always preserved alongside polished; AI never auto-saves; user reviews + clicks Accept before the field updates. Hallucination defence is "original is always one click away" rather than trusting the model.

**Done when:** A site manager types rough notes into Site Diary, clicks Polish, reviews the cleaned-up version, accepts, and the diary entry is saved. End-to-end. `audit_log` records the call with `action='ai_text_polished'`. Cost per polish < $0.02 verified against Anthropic dashboard. Reference: full technical implementation plan delivered 2026-05-12.

---

## Week 3 — Demo collateral

Working app → sellable story. Not code — the narrative scaffolding. Now includes the Polish button as a fourth flow.

- **Write `DEMO.md` from scratch.** The repo currently links to a `DEMO.md` that doesn't exist; create it. Four flows now:
  - **5-minute Mock-AI flow** (the headliner): Dashboard → Pending Review tile → upload 3 photos → click Run AI → watch the Gantt chart move → drill into the review queue → confirm → audit log entry.
  - **3-minute realtime flow**: two browsers, one operator, cross-page propagation.
  - **2-minute admin flow**: Project Config → flip a threshold + accent colour → demonstrate per-project behaviour change.
  - **NEW — 90-second AI Writing flow** (the boss's "make their wording not shit" pitch): Site Diary → type a rough one-liner → click Polish → reviewed and accepted. Strongest single-action demo moment outside the photo-AI bar movement.
- **Demo-mode banner.** Quiet pill at the top ("Demo data · Casone Electrical sandbox") when the active project name matches the seed.
- **3-minute teaser video.** Loom or OBS recording of the 5-minute flow + the 90-second Polish flow at 1.5× speed. A "watch this in your inbox" link is huge for warm leads.
- **Screenshot pack.** 8–12 hero shots saved to `demo/screenshots/`: Dashboard with Mock-AI running, AI hub with the Gantt chart moving, Admin project-config tab, mobile photo upload, **Polish button side-by-side preview**.
- **One-pager PDF.** "What is BuildTrack QA?" — 1 page, 3 bullets (now: photo-AI / text-AI / realtime collaboration), 2 screenshots, 1 testimonial slot.

**Done when:** you can email a stakeholder one link that leads to recorded demo + one-pager + booking calendar.

---

## Week 4 — UI/UX hardening pass

Most demos die on edge cases. Land each item with the acceptance criteria attached.

- **Loading states everywhere.** Replace every `"Loading..."` text string with `frontend/src/components/ui/skeleton.tsx`. *Acceptance:* Dashboard, Gantt, Gallery, Reports, ReviewQueue, Safety, Messages, Audit, Admin all show skeletons during their initial fetch. Zero `'Loading...'` literals remain.
- **Empty states with CTAs.** Pattern from `ReviewQueue.tsx` `EmptyState` and the Dashboard's `emptyLabel="Nothing yet…"`. *Acceptance:* gallery, tasks tab, reports, audit, messaging conversations, safety docs each render an opinionated empty state pointing at the next action.
- **Error-boundary coverage.** `frontend/src/components/ui/ErrorBoundary.tsx` already exists — confirm every route in `App.tsx` is wrapped. *Acceptance:* throwing inside any single page renders the recoverable fallback (retry / go home), never a white screen.
- **Mobile pass at 375 px.** *Acceptance:* Mock-AI card on `OverviewTab`, photo upload on `Upload.tsx`, the Gantt timeline (overflow handling), and Messages conversation list all read cleanly on a phone. Drawers + modals bottom-sheet via `EditorialModal` — verify it's used consistently.
- **Reconnection UI.** Throttle the network in DevTools. *Acceptance:* `useProjectTasksRealtime` + siblings reconnect cleanly. A quiet "Reconnecting…" pill appears in `TopNav` if any Supabase channel is down > 5 s.
- **Mock-AI button visual polish.** *Acceptance:* spinner + "Analysing 4 of 8…" copy during the batch run (not a frozen button); confirm modal before kickoff; success summary card with the per-task deltas at the end.
- **TopNav project switcher refinement.** *Acceptance:* pill renders correctly at 375 px, shows the current project's accent colour, dropdown lists projects with their phase status.

**Done when:** the demo runs cleanly on a phone AND a laptop, with no visible "this is unfinished" moments.

---

## Week 5 — Sales motion

Demo works → build the path from demo to sale. Three things only.

- **Pricing page mock at `/pricing`.** Stripe Pricing Table or hand-rolled card grid. Numbers can be placeholder; the SaaS shape is the point.
- **ROI calculator.** Small widget: "How many sites? How many photos per week? How many diary entries?" → estimated hours saved per month. Convince-the-CFO numbers. The AI Writing piece adds a second savings lever (admin time cleaning up reports).
- **Public demo deploy.** Vercel preview with seed data pre-applied + a read-only banner. Send the URL with the teaser video — the prospect lands and pitches themselves.

**Done when:** a stakeholder can land on a public URL, watch the demo, read the ROI calc, and book a call — all without you in the loop.

---

## Week 6 — AI Writing V2 + final dress rehearsal

V2 layers structured-field extraction on top of V1; the dress rehearsal week catches anything still rough.

- **AI Writing V2 — structured extraction.** The Polish call also detects weather / personnel / deliveries from the raw notes and pre-fills the diary entry's structured fields. Saves another 30 seconds per entry. Reuses the same Edge function with a richer system prompt that returns `{ polishedText, weather, temperatureC, personnel[], deliveries[] }`. Frontend offers a "Apply suggestions" toggle that fills the form fields alongside the polish.
- **Demo dress rehearsal.** Run the full 10-minute demo end-to-end on a phone AND a laptop. Time each segment. Catch anything that drags.
- **Buffer for slips.** At least 2 of these 5 working days are buffer. Solo-dev part-time always overshoots; the buffer is the difference between shipping calm and shipping panicked.

**Done when:** Site managers polish diary entries AND the form auto-fills weather + crew + delivery fields from the same call. The 10-minute demo runs clean on both devices with practised timing.

---

## What "demo done" looks like

Hand the demo URL + one-pager to any electrical contractor in Australia → they understand the product in 60 seconds. Mock-AI moves the bars believably. The Polish button turns rough notes into report-grade prose in one tap. The narrative arcs are practiced. Edge cases don't blow up the pitch.

---

## Six-week summary

| Week | Theme | Headline output |
|---|---|---|
| 0 | Unbreak the working tree | `tsc` + `vite build` green |
| 1 | Mock-AI loop polish | Reset-demo affordance, notification dedup, seed-data overhaul |
| 2 | **AI Writing Assistant V1** | Polish button in Site Diary, Anthropic API live, audit log |
| 3 | Demo collateral | DEMO.md (4 flows now), teaser video, screenshot pack, one-pager |
| 4 | UI/UX hardening | Skeletons, empty states, error boundaries, mobile pass |
| 5 | Sales motion | `/pricing`, ROI calculator, public demo deploy |
| 6 | **AI Writing V2 + dress rehearsal** | Structured field auto-fill, full demo run-through |

Two AI features land inside the 6-week window: the photo-based Mock-AI loop (Weeks 0–1 polish) and the text-based Polish button (Weeks 2 + 6). Together they're the demo's "the AI helps the field team" narrative — photos AND text, both moving the work forward.

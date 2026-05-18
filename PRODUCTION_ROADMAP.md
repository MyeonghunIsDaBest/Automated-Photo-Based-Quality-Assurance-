# BuildTrack — Production Roadmap

> **Where we are today.** The working tree currently fails `tsc --noEmit` and `vite build` — multiple in-flight modules are imported but not committed. The demo roadmap's Week 0 closes that. Production work resumes only after the build is green.

> **Horizon.** 12–16 weeks part-time solo-dev to first paying customer. Real Claude Vision (photo-QA) is the single biggest unlock; the AI Writing Assistant extensions ride on the same Anthropic infrastructure with minimal extra cost. Multi-tenant boundaries, billing, support, construction-QA depth, and hardening follow.

> **AI feature track.** Two AI capabilities are in flight: **photo-AI** (Phase D — real Claude Vision replacing today's Mock-AI stub) and **text-AI** (the new AI Writing Assistant — V1+V2 land in the demo roadmap's weeks 2 + 6; V3+V4 ship here in Phase D2). They share one Anthropic API key, one `audit_log` shape, one per-project cost cap pattern. Cost at full scale: ~$50/month combined for 100 active projects.

---

## Phase D — Real Claude Vision (weeks 1-3)

Today's `mockAnalyze()` returns confidence 0. The Mock-AI hub bumps clients at 4–10% with no actual photo understanding. The pipeline around it (lifecycle, idempotency, dedup, audit, per-project thresholds, review queue) is already wired — Phase D is just the network call.

- **D1.** Add `ANTHROPIC_API_KEY` to Supabase secrets. Replace `mockAnalyze()` body in `backend/supabase/functions/analyze-photo/index.ts` with `callClaudeVision(storagePath, { phaseHint })`. Reuse the existing `result.modelUsed = body.model ?? cfg.defaultModel` pattern.[^1]
- **D2.** Prompt engineering for construction QA. System prompt returns the `AnalysisResult` shape consistently — phase, completion %, safety flags, quality flags, materials, suggested task name, rationale.
- **D3.** Confidence calibration. 20–30 manually-rated photos → tune the auto / review thresholds per project to match human judgement.
- **D4.** Cost monitoring. Daily Edge function aggregates `ai_analyses` rows by `model_used` × project × day → new `ai_usage` table for billing + audit.
- **D5.** Rate-limit + graceful fallback. On 429 or timeout, mark the analysis `failed` with a retry-after delay. Upload flow must not blow up.

**Phase-D done:** A photo of an actual wall in framing returns `{ phaseDetected: 'framing', completionPct: 65, confidence: 0.88, safetyFlags: [], rationale: '<sensible text>' }`. Mock-AI button stays for demos but is irrelevant for paying customers.

[^1]: Footnote: `backend/supabase/functions/_shared/loadProjectConfig.ts` is currently imported by `analyze-photo/index.ts` but missing from the working tree. Land it in Week 0 of the demo roadmap before D1 begins.

---

## Phase D2 — AI Writing Assistant extensions (weeks 3-5, parallel with end of D + start of E)

V1 + V2 of the AI Writing Assistant ship in the demo roadmap (Polish button for site-diary + structured field auto-fill). This phase layers production-grade extensions onto the same `polish-text` Edge function. Cheap because the heavy lifting (Anthropic key, Edge-function pattern, audit log, cost cap) is already in place from V1.

- **D2.1 — Company voice preset (V3).** New `project_config.ai_voice_preset` text column (or a dedicated `org_writing_style` table once Phase E lands). Admins paste 3 paragraphs of their preferred house style; the `polish-text` Edge function prepends those samples to the system prompt. Per-customer tone calibration without prompt-engineering per call site.
- **D2.2 — Cross-document Polish (V4).** Mount the same `<PolishButton>` on:
  - Incident-report description fields (Safety page)
  - Punch-list item notes
  - Supplier order comments
  - Task description / notes
  Each surface passes its own `surface=` enum so the system prompt can be subtly tuned per context (incident reports are more formal; supplier notes are concise).
- **D2.3 — Per-project AI spend cap.** Add `project_config.ai_monthly_spend_usd_cap` (numeric). Edge function rejects calls with HTTP 402 once the cap is reached. Daily aggregation job updates a `project_ai_usage_monthly` view used by both billing (Phase F1) and the in-app spend chip on the Admin Project Config tab.
- **D2.4 — Voice-to-text dictation (V5, stretch).** Browser native `webkitSpeechRecognition` API → captures spoken notes → passes the transcript through `polish-text`. One motion: speak → text → polished diary entry. Strongest field UX upgrade in the entire roadmap; out of scope unless V1–V4 hit the field well and customers ask for it.

**Phase-D2 done:** Every long-form text field across the app has a Polish button. Spend caps prevent surprise bills. Each customer has a tone calibrated to their brand voice. The Polish action is genuinely useful, not a parlour trick.

**Cost reality check:** Anthropic's commercial API contract states no training on customer data. Combined photo-AI + text-AI spend at 100 active projects ≈ $50–80/month total. The text-AI piece pays for itself before it leaves the first project (admin time saved cleaning up reports vs. ~$0.01 per polish).

---

## Phase E — Multi-tenant + organisation boundaries (weeks 4-5)

Today is single-tenant — one Supabase project per customer. To onboard multiple paying customers without provisioning separate Supabase instances, the schema needs an `organizations` layer.

- **E1.** Migration: `organizations` table + `org_id` FKs on `projects`, `profiles`, `stakeholders`, `suppliers`. Backfill existing rows into a default org.
- **E2.** RLS rewrite: every `auth.role() = 'authenticated'` policy gains `AND org_id = current_org_id()`. New `current_org_id()` SQL helper reads the JWT custom claim.
- **E3.** Org-admin tier above `company_admin`. Org admins mint company-admins, see cross-org reporting, manage billing. Extend the existing capability matrix in `frontend/src/lib/permissions.ts` — that file is the single source of truth for gates, so org-scoped permissions extend it rather than inventing parallel logic.
- **E4.** Invite flow: email-based, org-scoped sign-up. Replaces the current "first user becomes company_admin" trigger.
- **E5.** Audit pass: every `frontend/src/lib/api/*.ts` read scoped by `org_id`. Checklist per query.

**Phase-E done:** Two customer organisations sign up, share the Supabase instance, never see each other's data. RLS audit returns zero cross-org leaks.

---

## Phase F — Customer-facing polish (weeks 6-8)

Things that don't exist today but every SaaS needs.

- **F1.** Stripe Checkout + customer portal. Subscription tiers (Free / Pro / Enterprise) keyed off org metadata. Webhook syncs billing into `org_subscriptions`.
- **F2.** Onboarding wizard. First sign-in: create org → invite teammates → create first project → upload first photo. Skippable but high-conversion.
- **F3.** Help center. Docs site (Mintlify or a Vite static build) with DEMO.md content + per-feature how-tos.
- **F4.** In-app tour. Tooltip overlay for first-time users on Dashboard, Gantt, Upload.
- **F5.** Support contact surface. Pick a tool (Crisp / Intercom / mailto:) and wire it.

**Phase-F done:** A new sign-up can swipe their card, finish onboarding, upload their first photo, and contact support — all without you intervening.

---

## Phase G — Construction-QA depth (weeks 9-11)

Today's product is "photo + AI = task bump". Real construction-QA tools have more.

- **G1.** Checklist templates per phase. Site managers pick a template ("framing: rough-in checklist") → task drawer pre-populates.
- **G2.** Signed-approval workflow. After an inspector confirms an AI analysis, the result is countersigned (digital signature) → PDF generated → filed in Storage. ITP-compliant.
- **G3.** Defect tracking. New `defects` table linked to photos + tasks. Lifecycle (open / triaged / fixed / verified) + notifications.
- **G4.** Drawing markup. Upload a PDF plan → annotate where each photo was taken → see photos pinned to the plan.
- **G5.** Client portal. Stakeholder-tier users see only their assigned project, polished read-only view — progress, gallery, recent updates. No Gantt / admin.

**Phase-G done:** Casone Electrical's pilot can run a full ITP cycle through the app without falling back to spreadsheets or PDFs.

---

## Phase H — Production hardening (weeks 12-14)

Everything you don't want to discover after a paying customer is using it.

- **H1.** Sentry. `@sentry/react` + source-map upload. `SENTRY_DSN` env var. Catches unhandled errors, promise rejections, slow transactions.
- **H2.** Load test. k6 script: 50 concurrent users uploading 100 photos each. Verify Supabase + Edge functions hold. Document breaking point.
- **H3.** Backup + restore policy. Supabase Pro has daily backups; document the restore procedure + dry-run it.
- **H4.** Monitoring + alerting. Grafana dashboard (or Supabase Dashboard) for: AI failure rate, upload errors, Edge-function p95, daily DAU.
- **H5.** Security review. `pnpm audit` + manual RLS audit + third-party pen test. Fix everything critical / high.
- **H6.** Legal: privacy policy, terms, data retention. Termly or a lawyer.

**Phase-H done:** App survives a 5× load test, alarms on every important metric, legal docs are linked from the footer.

---

## Phase I — Beta + iterate (weeks 15-16+)

Real users break things in ways you can't predict.

- **I1.** Recruit 3-5 friendly beta customers. Free for the first 90 days, weekly check-ins.
- **I2.** Bug-fix sprint. Whatever beta surfaces, it's top priority.
- **I3.** Perf optimisation based on real usage — likely targets: list queries, photo upload on poor connections, search.
- **I4.** Pricing iteration. The price you guessed in Phase F is wrong; talk to customers and adjust.

**Phase-I done:** Three paying customers, MRR ticking, churn < 10%/month.

---

## Realistic timing for a solo dev

| | Best case | Realistic |
|---|---|---|
| Demo roadmap (incl. AI Writing V1+V2) | 5 weeks part-time | **6 weeks** (1 month + 15 days — current commit) |
| Production roadmap | 12 weeks full-time | 6–9 months part-time |

Plan for 6 months to first paying customer if you're working alone with a day job; 12–14 weeks if this is full-time. The 6-week demo window is the commit Jordan made on 2026-05-12 and covers both photo-AI demo polish AND the AI Writing Assistant V1+V2.

---

## Today / tomorrow — the 4 most valuable next moves

If you can only do four things in the next 7 days, do these in order:

1. **Land the Week-0 scaffolding** (demo roadmap). Without it nothing else can run, demo or otherwise — `tsc --noEmit` and `vite build` both fail today.
2. **Build AI Writing Assistant V1** (demo roadmap Week 2 — Polish button on Site Diary). Boss-requested 2026-05-12. Ships in ~1 week; reuses the same `ANTHROPIC_API_KEY` Phase D needs anyway. Strongest standalone demo moment outside the photo-AI loop.
3. **Wire Phase D step D1** (the real Anthropic Vision call). The single biggest production unlock — converts the Mock-AI photo demo into a real product. Shares the API key + Edge-function pattern from move #2 above.
4. **Write `DEMO.md` from scratch** (week 3 of the demo roadmap, now four flows including Polish). The repo links to it; the file doesn't exist. Anyone reading the README hits a dead link.

Everything else can wait. Moves 2 + 3 share infrastructure (same Anthropic key, same Edge-function deploy pattern, same audit-log shape) so doing them back-to-back is the right batching.

---

## What this is NOT

- Not a contract. Solo-dev roadmaps slip; the goal is direction, not deadline commitment.
- Not a marketing plan. Demo roadmap covers collateral but not paid acquisition, SEO, or content.
- Not a fundraising deck. If/when you raise, the roadmap content seeds a deck — different rhythm.
- Not a substitute for talking to customers. Both roadmaps assume iteration based on real conversations with Casone Electrical's stakeholders and (in Phase I) the beta cohort.

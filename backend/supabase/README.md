# Supabase setup

This folder is the source of truth for the SiteProof QA backend. The
frontend talks to Supabase directly through `frontend/src/lib/supabase.ts`
and the typed wrappers in `frontend/src/lib/api/`.

```
supabase/
├── README.md                ← you are here
├── config.toml              ← optional, only used by the Supabase CLI
├── migrations/
│   ├── 00_init.sql          ← one consolidated, idempotent script. Run this.
│   └── legacy/              ← the original 11 incremental migrations,
│                              superseded by 00_init.sql. Do not run.
├── functions/
│   └── analyze-photo/index.ts ← Edge Function stub for the future AI pipeline
└── seed.sql                 ← one demo project + a few tasks (optional)
```

## Setting it up on supabase.com (no CLI needed)

1. **Create a project** at https://supabase.com → New Project. Keep the
   database password — you'll need it for direct SQL access if anything
   goes wrong.
2. **Run the schema.** Dashboard → SQL Editor → New query → paste the
   entire contents of `migrations/00_init.sql` → click **Run**.
   The script is idempotent — re-running gives you a freshly wiped
   database. (It also re-empties Storage objects in our two buckets, so
   only re-run when you really mean to nuke.)
3. **Grab your env values.** Dashboard → Project Settings → API.
   - `Project URL`        → `VITE_SUPABASE_URL`
   - `anon` `public` key  → `VITE_SUPABASE_ANON_KEY`
4. **Wire the frontend.**
   ```bash
   cd frontend
   cp .env.local.example .env.local   # then fill in the two values
   npm install
   npm run dev
   ```
5. **Sign up.** Visit `/login` → "Create account". The very first signup
   on a clean database is **automatically promoted to `company_admin`**
   by the `handle_new_user()` trigger — no `/bootstrap-admin` step
   needed. Every subsequent signup keeps the role they pick on the form.
6. **Confirm Realtime is on** for `tasks`, `projects`, `photos`,
   `comments`, `ai_analyses`, `profiles`. The script adds them to the
   `supabase_realtime` publication; double-check under
   Database → Replication if a table doesn't update live.

### About the auto-promote

`handle_new_user()` (defined inside `00_init.sql` § 4) checks `profiles`
on every new auth account. If no active `company_admin` or
`administrator` exists, the new account is promoted regardless of what
they picked on the form. As soon as one admin exists, every later signup
keeps the role they chose. Self-healing, no manual SQL.

If for any reason you need to claim admin from the UI later (e.g. the
existing admins were all deactivated), the `/bootstrap-admin` page is
still wired up and calls the same `claim_first_admin()` RPC.

## Setting it up locally with the Supabase CLI

```bash
npm install -g supabase
supabase start          # boots Postgres + Auth + Storage in Docker
# Apply the schema once the stack is up:
psql "$DATABASE_URL" -f supabase/migrations/00_init.sql
```

After `supabase start`, the CLI prints local URL + anon key. Drop those
into `frontend/.env.local` the same way as the hosted setup.

## Re-running the schema

`migrations/00_init.sql` is one transaction-safe script. Re-running:

- Drops every table / function / trigger / enum we own (CASCADE).
- Recreates everything fresh, including bucket rows + storage policies.
- Preserves rows in `auth.users` (the Supabase-managed table).

A re-run gives you a clean public schema **and** keeps existing auth
accounts working — but the `profiles` rows for those accounts are
recreated by the trigger on next sign-in.

### Wiping uploaded photo files

Supabase blocks direct `DELETE FROM storage.objects` from SQL (a
`protect_delete()` trigger), so the consolidated script can't wipe the
files inside your `photos` / `user-documents` buckets. To do that
manually:

- **Dashboard** (easiest): Storage → bucket → select all → Delete.
- **API / CLI**: with the service role key, list objects then delete in
  batches via `storage.from('photos').remove(paths)`.

This is intentional Supabase safety — orphaned objects (metadata gone,
file remains) are reaped by their cleanup job within ~24h anyway.

## Edge Functions: analyze-photo + confirm-analysis (Phase C)

The Photo-QA seam is two Edge Functions plus four shared helpers under
`supabase/functions/_shared/` (contract types, decideAction rule,
thresholds, safety taxonomy, audit-log helper).

### analyze-photo

Accepts `{ "photoId": "<uuid>" }` (or a Postgres webhook envelope with
`{ "record": { "id": ... } }`). The function:

1. **Idempotency claim**: `UPDATE ai_analyses SET analysis_status='analysing' WHERE photo_id=$1 AND analysis_status='queued' RETURNING id`. Zero rows = another invocation already claimed it = 200 no-op.
2. Runs `mockAnalyze()` (Phase D will swap this for Anthropic Claude Vision).
3. UPDATEs the row with results + `decideAction()` outcome (`auto_updated` ≥ 0.85, `pending` ≥ 0.50 or any safety flag, `skipped` otherwise).
4. If safety flags are set → INSERT `safety_incidents` row with severity from `_shared/safetyTaxonomy.ts`.
5. If action is `auto_updated` → UPDATE `tasks.percent_complete` guarded by `lt('percent_complete', new)` so retries can't roll progress backward.
6. Writes `audit_log` for every state change.

**Deploy** (requires the Supabase CLI logged in to your project):
```bash
supabase functions deploy analyze-photo --no-verify-jwt
supabase functions deploy confirm-analysis
```

### confirm-analysis

JWT-gated review-queue endpoint. Accepts:
```json
{ "photoId": "<uuid>", "action": "confirmed" | "rejected", "overridePct": 65, "notes": "…" }
```
Verifies the JWT via `sb.auth.getUser()`, checks `profiles.security_group ∈ {company_admin, administrator, construction_mgr, project_manager, site_manager}`, and writes the confirm/reject path with a guarded task-progress bump on confirm. Returns 403 for workers, 409 if the analysis is already confirmed/rejected (race loser).

### Wire automatic invocation (Postgres webhook → analyze-photo)

The Supabase CLI doesn't manage webhooks in the stable channel; configure in the dashboard:

1. **Dashboard → Database → Webhooks → Create a new hook**
2. **Table** `photos` · **Events** `INSERT` · **Type** HTTP Request
3. **URL** `https://<project-ref>.functions.supabase.co/analyze-photo`
4. **Method** POST · **Headers**:
   - `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` (function bypasses JWT verification with `--no-verify-jwt`; the service-role key is the trust signal here)
   - `Content-Type: application/json`
   - Optional: `x-webhook-secret: <random>` for an additional shared-secret check (function doesn't enforce yet — flagged as Phase E)
5. **Retries** Dashboard default (3, exponential)
6. **Payload format** Default ("Sends the new row data") — the function reads `body.record.id` as `photoId`.

### Recovering stuck analyses

If `analyze-photo` crashes mid-run, the row is left in `analysis_status='analysing'` and subsequent claims won't fire. Recover with:
```sql
UPDATE ai_analyses
   SET analysis_status = 'queued',
       model_used      = 'pending'
 WHERE analysis_status = 'analysing'
   AND (analyzed_at IS NULL OR analyzed_at < now() - interval '15 minutes');
```
A Phase E follow-up adds a small reaper Edge Function that does this on a cron.

### Wiring a real model (Phase D)

Replace `mockAnalyze()` inside `analyze-photo/index.ts` with a real Anthropic Claude Vision call. The function returns the same `AnalysisResult` shape from `_shared/contract.ts` — `completion_pct`, `confidence`, `safety_flags`, `quality_flags`, `materials`, `suggested_task`, `rationale`, `raw_response`. Nothing else in the function needs to change.

## What's NOT in here yet

- **Production-grade AI**: the Edge Function is a deterministic stub. Phase D's job is to swap `mockAnalyze()` for a Claude Vision call.
- **Database backups** — handled by Supabase automatically on the paid tiers; nothing to commit.
- **Per-project membership** — every authenticated user can read every project. The reworked RBAC in 00_init.sql makes adding a `project_members` table a one-policy-edit-per-table change when multi-tenant matters.
- **Project-scoped RLS for stakeholder/supplier accounts** — Phase A added the security-group tiers but per-project RLS needs join tables (`project_stakeholders`, `project_suppliers`) that don't exist yet. Documented in `01_security_group_expand.sql` header.

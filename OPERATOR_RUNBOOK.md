# Photo-QA Operator Runbook

Operations reference for the Photo-QA pilot. Every fix below uses tools you
already have: the **Supabase dashboard** and its **SQL editor**, plus the Edge
Function **Secrets** page (Project Settings → Edge Functions → Secrets).

All AI calls route through one helper (`_shared/anthropic.ts`), which enforces
a kill switch, daily caps, and per-day usage counting via the `ai_usage_daily`
table. The env vars and tables below are the real ones referenced by that
helper and the migrations — nothing here is hypothetical.

---

## 1. Photos stuck in `queued` state

Photos auto-fire `analyze-photo` on upload (`frontend/src/lib/api/photos.ts`
calls `requestAnalysis` fire-and-forget). A stuck batch usually means the
trigger dropped or AI was gated.

**Check (SQL editor):**

```sql
select count(*) from ai_analyses where analysis_status = 'queued';
```

Lifecycle is `queued → analysing → analysed → confirmed/rejected` (or `failed`).
A growing `queued` count that never advances = analyses not being claimed.

**Fix:**
1. Re-trigger from the UI: open the gallery / Gantt **Uploads** tab and use the
   **Re-analyse** affordance on the affected photo(s). This re-invokes
   `analyze-photo` and inserts a fresh `ai_analyses` row (re-analysis is allowed
   since migration 06 dropped the `UNIQUE(photo_id)` index).
2. If re-analyse does nothing, AI is gated. Confirm the kill switch is off and
   the daily cap is not hit (see §3 and §4):
   - `ANTHROPIC_DISABLED` must be `false`.
   - Daily call / token caps not exceeded.

---

## 2. Sparky returns no history / generic replies

Sparky (the site-diary-assistant function) reads history from the
`diary_entries` table (created in **migration 20**). If that table is missing or
empty for the project, Sparky has no context and falls back to generic replies.

**Check (SQL editor):**

```sql
-- Table exists?
select to_regclass('public.diary_entries');           -- non-null = exists

-- Rows for the project in question?
select count(*) from diary_entries where project_id = '<PROJECT_UUID>';
```

**Fix:**
- If `to_regclass` returns null, migration 20 was never applied — run
  `supabase migration up` (see §7).
- If the table exists but the count is 0, the project simply has no saved diary
  entries yet. The frontend dual-writes each diary entry here; have the user
  save at least one entry, then retry Sparky.

---

## 3. AI features all failing

If every AI surface (photo analysis, Sparky, polish, synthesis) fails at once,
it's almost always a missing/empty key or the kill switch.

**Check (Edge Function Secrets):**
- `ANTHROPIC_API_KEY` — set **and non-empty**. A missing key returns
  `missing_key` from the gate; an empty string behaves the same.
- `ANTHROPIC_DISABLED` — must be `false` (see §5).

After confirming/correcting secrets, re-deploy is not required (secrets are read
at invocation), but a fresh invocation is — retry the failing action.

---

## 4. Daily AI cap hit (429 `rate_limited`)

The gate enforces two daily caps from env vars (defaults in parentheses):
- `ANTHROPIC_DAILY_CALL_CAP` (default **50** calls)
- `ANTHROPIC_DAILY_TOKEN_CAP` (default **200000** tokens)

When either is reached, calls return `rate_limited` (HTTP 429). Counters live in
`ai_usage_daily` (one row per UTC date — **migration 13**).

**Check (SQL editor):**

```sql
select * from ai_usage_daily where usage_date = current_date;
```

**Fix (choose one):**
- Raise the cap: bump `ANTHROPIC_DAILY_CALL_CAP` / `ANTHROPIC_DAILY_TOKEN_CAP`
  in Edge Function Secrets.
- Reset today's counter (forces a clean day):

  ```sql
  delete from ai_usage_daily where usage_date = current_date;
  ```

  The next call recreates the row at zero via the `record_ai_call` RPC.

---

## 5. Kill switch (instantly disable all Claude calls)

**Disable:** set Edge Function secret `ANTHROPIC_DISABLED = true`.

Every AI function returns `disabled` immediately (surfaces as a 503 / disabled
state) — no Anthropic request is made and no budget is spent. Use this for
incident response or to cap spend hard.

**Re-enable:** set `ANTHROPIC_DISABLED = false` (or remove the secret — the
helper defaults to enabled). No redeploy needed; takes effect on the next
invocation.

---

## 6. Lock CORS for production

By default the Edge Functions allow any origin (`Access-Control-Allow-Origin: *`).
To lock CORS to the real deployed frontend:

**Fix:** set Edge Function secret `PRODUCTION_ORIGIN` to the exact frontend
origin, e.g.:

```
PRODUCTION_ORIGIN = https://app.casoneelectrical.com.au
```

`_shared/cors.ts` reads this (`Deno.env.get('PRODUCTION_ORIGIN') ?? '*'`) and
emits it as the allowed origin on every response + preflight. Use the scheme +
host with no trailing slash and no path. Unsetting the secret reverts to `*`.

---

## 7. Deploy backend changes

```sh
cd backend

# Apply any pending migrations (DB schema changes, e.g. diary_entries).
supabase migration up

# Deploy a specific Edge Function after editing it.
supabase functions deploy <name>          # e.g. analyze-photo, site-diary-assistant
```

**Gotcha — `backend/` is gitignored.** New backend files (functions, shared
helpers, migrations) will NOT be committed by a plain `git add`. Force-add them:

```sh
git add -f backend/supabase/functions/<path>
git add -f backend/supabase/migrations/<file>.sql
```

In particular `_shared/cors.ts` is untracked by default — make sure it ships
with any function that imports it.

---

## Quick reference — Edge Function secrets

| Secret | Purpose | Safe default |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | Claude API key | (must be set) |
| `ANTHROPIC_DISABLED` | Kill switch | `false` |
| `ANTHROPIC_DAILY_CALL_CAP` | Max calls / UTC day | `50` |
| `ANTHROPIC_DAILY_TOKEN_CAP` | Max tokens / UTC day | `200000` |
| `ANTHROPIC_DEFAULT_MODEL` | Model id | `claude-haiku-4-5` |
| `ANTHROPIC_MAX_TOKENS` | Per-response ceiling | `1024` |
| `ANTHROPIC_VISION_MAX_TOKENS` | Vision per-response ceiling | falls back to `ANTHROPIC_MAX_TOKENS` |
| `PRODUCTION_ORIGIN` | CORS lock origin | unset = `*` |

## Quick reference — tables

| Table | Migration | Used for |
| --- | --- | --- |
| `ai_analyses` | `00_init` (+ `02` adds `analysis_status`, `06` allows history) | Per-photo analysis rows + lifecycle status |
| `ai_usage_daily` | `13` | Daily call / token / cost counters (cap enforcement) |
| `diary_entries` | `20` | Site-diary history that powers Sparky |

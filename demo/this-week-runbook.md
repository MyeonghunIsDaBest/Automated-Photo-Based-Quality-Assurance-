# Demo runbook — Live Gantt feed (manual, no AI)

**Audience:** internal walkthrough this week. Goal: prove that uploads + manual updates flow into the Gantt in realtime, even though the AI pipeline isn't wired yet.

**Total time:** ~10 min including setup.

---

## 0. One-time setup (do this BEFORE the demo)

### 0a. Apply the schema to your Supabase project

Open the Supabase dashboard → SQL Editor → New query → paste the entire contents of **`supabase/migrations/00_init.sql`** → click **Run**.

That's it — one file, one click. The script is idempotent: it drops everything we own (tables, functions, enums, RLS policies), then rebuilds the whole schema. Re-running is safe.

**Note on Storage:** Supabase blocks SQL deletes against `storage.objects`, so the script doesn't wipe uploaded photos. On a fresh project there's nothing to wipe. If you've uploaded files in a previous run and want a truly clean slate, do it manually: Dashboard → Storage → `photos` → select all → Delete (and the same for `user-documents`).

The legacy 11 incremental migrations live in `supabase/migrations/legacy/` for reference — **do not run them** alongside `00_init.sql`.

### 0b. Wire your `.env.local`

```
cd frontend
cp .env.local.example .env.local     # then fill in the two keys
npm install
npm run dev
```

### 0c. Sign in `myeonghun@seo.com` (auto-promote)

1. Open `/login` → "Create account".
2. Register with `myeonghun@seo.com` / `@testing`. Any role on the picker is fine — the trigger overrides it for the very first signup.
3. The `handle_new_user()` trigger checks if any admin exists. On a fresh DB it doesn't, so this account is auto-promoted to **Company Admin**. No `/bootstrap-admin` step needed.

Verify in SQL Editor:

```sql
select email, security_group, is_active
  from profiles
 where email = 'myeonghun@seo.com';
-- expected: company_admin / true
```

**If the first signup wasn't `myeonghun@seo.com`** (e.g. you already had a different account on the project before running 00_init.sql), promote manually:

```sql
update profiles
   set security_group = 'company_admin', is_active = true,
       first_name = 'Myeonghun', last_name = 'Seo'
 where email = 'myeonghun@seo.com';
```

**If "Invalid login credentials"** comes up: you almost certainly have email confirmation turned ON in Supabase. Either flip it off (Authentication → Providers → Email → uncheck "Confirm email") or run:

```sql
update auth.users
   set email_confirmed_at = coalesce(email_confirmed_at, now())
 where email = 'myeonghun@seo.com';
```

### 0d. Pre-seed a project + 4 tasks (saves you ~3 demo minutes)

You can do this through the app's "+ New Project" form, OR run this in the SQL Editor for a known-good fixture:

```sql
-- Pick the company_admin's id so created_by is populated.
do $$
declare
  v_admin uuid;
  v_project uuid;
begin
  select id into v_admin
    from profiles where email = 'myeonghun@seo.com' limit 1;

  v_project := create_project_with_tasks(
    'Demo — Casone Pilot',                -- p_name
    'Casone Electrical',                  -- p_client
    'Live walkthrough fixture',           -- p_description
    current_date - 7,                     -- p_start_date (already running)
    current_date + 60,                    -- p_end_date
    'active',                             -- p_status
    150000,                               -- p_budget
    jsonb_build_array(
      jsonb_build_object(
        'name', 'Site setup + safety induction',
        'phase', 'foundation',
        'startDate', (current_date - 7)::text,
        'endDate',   (current_date - 1)::text
      ),
      jsonb_build_object(
        'name', 'Main switchboard rough-in',
        'phase', 'electrical',
        'startDate', current_date::text,
        'endDate',   (current_date + 10)::text
      ),
      jsonb_build_object(
        'name', 'Cable tray installation L1',
        'phase', 'electrical',
        'startDate', (current_date + 5)::text,
        'endDate',   (current_date + 25)::text
      ),
      jsonb_build_object(
        'name', 'Final commissioning',
        'phase', 'finishing',
        'startDate', (current_date + 40)::text,
        'endDate',   (current_date + 60)::text
      )
    )
  );

  -- Mark the first task complete so the Gantt has a "done" bar to show.
  update tasks
     set percent_complete = 100, status = 'complete', last_updated = now()
   where project_id = v_project
     and name = 'Site setup + safety induction';

  -- Mark the second task partly done.
  update tasks
     set percent_complete = 30, status = 'in_progress', last_updated = now()
   where project_id = v_project
     and name = 'Main switchboard rough-in';
end $$;
```

(Re-running creates duplicate projects — only do this once, or delete the existing demo project first.)

### 0e. (Optional) Create a "worker" account for the realtime split-screen

Open another browser (or an incognito window) → `/login` → "Create account" → register a second user (e.g. `worker@demo.local` / `@testing`). On the role picker, **choose Worker**. The 0011 trigger sets their `security_group` to `worker` automatically.

Then back in your admin browser, open `/admin` → Users → assign that worker as the assignee on "Main switchboard rough-in".

---

## 1. The demo itself (the live part)

You'll have **two browser windows side by side**: left = admin, right = worker.

### Beat 1 — Show the role split (~30s)

- Admin window: `/dashboard`. Point at the "Signed in as Myeonghun Seo · Company Admin" card. Mention the role-aware permissions: full Gantt edit, manage users, see finance.
- Worker window: same page. Point at the "Signed in as Worker" card. Mention scoped access: upload photos, leave notes, no admin sidebar.
- Note: this is the same code, same page, same data — only the **role chip + capability blurb + sidebar entries** differ. The lock icon next to write actions is the visible proof.

### Beat 2 — Show the live Gantt (~30s)

- Admin: navigate to `/gantt` for the demo project. Bars, statuses, % complete are all there.
- Mention: pulled live from Supabase via `listTasks()`, then kept in sync via a `subscribeToProjectTasks()` realtime channel.

### Beat 3 — Worker uploads a photo (~1m)

- Worker window: `/upload`.
- Pick zone (leave blank if no zones), pick the **"Main switchboard rough-in"** task, drop in any image file, optional note ("Cable trays delivered, starting rough-in").
- Click **Upload & Analyze**.
- The file goes to Supabase Storage at `photos/{project_id}/{photo_id}.{ext}`. A row gets written to `photos`. The `tasks.photo_count` for that task gets bumped via the `increment_photo_count` RPC. A placeholder `ai_analyses` row with `action_taken='pending'` is auto-created by the 0010 trigger — that's what the AI pipeline will eventually consume.

### Beat 4 — Worker sets the new % (~30s)

- Right after upload, the green "Update Gantt progress" card appears.
- Slide the value to e.g. **55%**. Click **Apply & update Gantt**.
- This calls `updateTaskProgress(task, 55)` against Supabase, then runs the local mutator for instant feedback.

### Beat 5 — The realtime payoff (~30s, the whole point of the demo)

- **Without the worker doing anything else, switch focus back to the admin window's `/gantt` page.** The "Main switchboard rough-in" bar's progress overlay should already be at 55% — the realtime subscription patched local state in <1s.
- If the room wants stronger proof, edit the % from the admin side too: click the bar → modal → bump %, save. Switch back to the worker window — same bar moves there.

### Beat 6 — Admin extends the schedule (~30s)

- Admin: click any task → modal → change end date by a week, change status, save.
- Realtime echoes back. Both windows reflect the change.
- Note: only the manager-tier roles can do this. A Worker who tries the same call gets a 403 from RLS (policy `tasks: update by manager+`).

### Beat 7 — Where AI plugs in (~30s — talking, no clicks)

- Open `supabase/functions/analyze-photo/index.ts`. Show the `mockAnalyze()` function.
- The story: every photo upload already creates the `ai_analyses` row. When the model lands, you swap one function body. No frontend changes required — the Gantt + photos + audit log + Storage are all already wired.

---

## 2. If something breaks mid-demo

| Symptom | Quick check |
|---|---|
| "Sign-in failed" | `.env.local` has the right URL + anon key, dev server restarted after edits. |
| Gantt empty | `select count(*) from tasks where project_id = '<id>'` — did 0d's RPC actually run? |
| Photo upload 403 | Storage policies missing — re-run `0003_storage.sql`. |
| Task edit 403 | RLS policies missing — re-run `0008_mvp_alignment.sql`. |
| Realtime not updating | Database → Replication → confirm `tasks` and `photos` are in `supabase_realtime`. |
| `claim_first_admin` returns false | An admin already exists. Promote with the SQL in 0c instead. |

---

## 3. After the demo — known-not-built, talking points if asked

- **Real AI**: stub Edge Function exists, no model behind it yet.
- **EXIF / GPS**: photos record the pixel size from the actual file, but `taken_at` is upload time. EXIF parsing is one library call away (`exifr`).
- **Drag-to-reschedule**: Gantt bars are read-only positionally. Editing happens in the modal.
- **Per-project membership**: every authenticated user sees every project today. Tighten when multi-tenant matters.
- **Notifications, audit trail**: already wired locally, not yet persisted to the DB audit_log.

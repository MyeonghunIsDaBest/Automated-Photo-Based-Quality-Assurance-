# SiteProof — 10-minute walkthrough

Run this end-to-end before showing the app to a stakeholder. Each step calls out the expected outcome so you know whether something's wrong before they notice. Total time: ~10 minutes from a clean Supabase project.

---

## 0. Prerequisites

You'll need:

- A Supabase project (free tier is fine).
- The project's `Project URL` and `anon key` from **Project Settings → API**.
- The `service_role` key from the same panel (only needed for `seed:demo` — never ship it to a browser).
- Node 20+ and `npm` locally.

### Run the migrations

In Supabase Studio → **SQL Editor**, run each file under `supabase/migrations/` in numeric order:

1. `00_init.sql` — base schema (projects, zones, tasks, photos, ai_analyses, comments, …)
2. `01_security_group_expand.sql` — security_group enum + the `handle_new_user` trigger that promotes the first user to `company_admin`
3. `02_phase_c_seam.sql` — `ai_analyses` extras, `safety_incidents`, `view_photos_safe`
4. `03_messaging.sql` — `conversations`, `conversation_members`, `messages` + RLS

Each script is idempotent; re-running on an already-migrated project is safe.

### Wire the frontend

Create `frontend/.env.local` (don't commit it):

```
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

```
npm --prefix frontend install
npm --prefix frontend run dev
```

The app starts on `http://localhost:5173`.

---

## 1. Sign up the first user

Open the app, click **Create account**, fill in the form. The first user signed up is auto-promoted to `company_admin` by the `handle_new_user` trigger, so they can do everything.

> **Expected:** You land on `/dashboard`. The TopNav shows your name, the role pill reads "Company Admin", and the project switcher pill is empty.

---

## 2. (Optional) Seed demo data

Skip if you'd rather walk through the empty-state setup guide.

```
SUPABASE_URL=https://<ref>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=eyJ... \
npm --prefix frontend run seed:demo
```

The seeder is idempotent — if a project named `Casone Electrical — Demo Site` already exists, it short-circuits.

> **Expected:** Console prints "Demo data seeded." with one project, two zones, three tasks, one photo+analysis, one resolved safety incident, and (if ≥2 users have signed up) one group conversation with four messages.

Refresh the browser. The Dashboard's stat strip now reflects the seeded counts; the project switcher pill shows "Casone Electrical — Demo Site".

---

## 3. Cross-page realtime — the headline trick

This is the moment to land. Open the same project in two browsers (e.g. Chrome + an Incognito Chrome, signed in as different users).

- **Browser A**: stay on `/dashboard`.
- **Browser B**: open `/gantt`, click into a task, bump its progress to 75%, save.

> **Expected on Browser A (no manual refresh):**
> - The "Active Jobs" card updates the percent within ~2s.
> - The "Recent activity" list gains a `task_progress` row that briefly highlights emerald-50 (the 1.5s `activityHighlight` keyframe).
> - Bonus: upload a photo from Browser B's `/upload` page — Browser A's activity feed gains a `photo_upload` row in realtime.

If nothing updates: check the browser console on A for Supabase channel errors. The most common cause is the realtime publication missing the relevant tables (the migrations add them automatically; re-running `00_init.sql` and `03_messaging.sql` is safe).

---

## 4. Safety hazard — pulse on count change

In Browser B, navigate to `/safety` → **Hazards** tab → **Log hazard manually**. Pick `medium` severity and a flag (e.g. "fall hazard"), submit.

> **Expected on Browser A's Dashboard:**
> - Toast pops with "High-severity safety issue" or similar (driven by `useSafetyRealtime`).
> - The "Open AI hazards" stat tile briefly pulses (700ms scale + slate-900 → emerald-700 ramp from the `statPulse` keyframe).
> - The activity feed gains a `safety_flag` row that highlights as it lands.

---

## 5. Review queue — confirm a photo

If you didn't seed demo data, upload a photo first via `/upload`. Once an analysis exists with `action_taken='pending'`, manager-tier users see the "Pending review" Dashboard tile.

Click the tile → opens `/review-queue?project=<id>`. Confirm one analysis.

> **Expected:** The "Pending review" tile drops by one and pulses; the activity feed gains an `ai_analysed` row.

---

## 6. Messaging — direct + group

In Browser A, click **Messages** → **New conversation** → **Direct**, type to find the user signed in to Browser B, click their row.

> **Expected:** The modal closes; the new thread opens; the inbox at left shows it. Type "hello" + Enter.

In Browser B, navigate to `/messages` (or stay there if already open).

> **Expected (no manual refresh):**
> - The inbox shows the new thread with an unread dot.
> - Selecting it shows your "hello" message.
> - Reply from Browser B; Browser A sees it within ~2s.

Now create a group: **New conversation** → **Group**. Name it "Site Walk Through", search and pick two members, click **Create group**. Type a message; both other browsers (if signed in as those members) see the conversation appear and the message land.

---

## 7. Project pill at narrow widths

Open DevTools → device emulation → set viewport to 375px wide. The TopNav stays usable: project pill truncates with the ellipsis, chevron stays visible, no horizontal scroll.

> **Expected:** Pill clips at the truncation boundary; the bell icon and avatar stay inside the bar.

This is the Pass 1 bug fix — pre-fix the pill overflowed past the right edge on narrow widths because the intermediate `relative` wrapper was missing `min-w-0`.

---

## 8. Sign out / role switch

Sign out from the user menu (avatar at top right → **Sign out**). The login screen returns. Sign in as a non-admin user (sign up a second account and use the admin panel to demote it to `worker`, or sign up fresh to land at `worker` — the trigger only auto-promotes user #1).

> **Expected:** Worker tier doesn't see Admin in the nav; opens `/dashboard` showing only the four base tiles (no "Open AI hazards" or "Pending review" — those are manager-gated).

---

## When to skip steps

- **No service role key handy?** Skip step 2 — the empty-state setup guide on Gantt's Overview tab is itself part of the demo.
- **Only one user available?** Skip the cross-browser parts of steps 3 and 6, but step 2's seed will still create a populated dashboard.
- **Stakeholder is short on time?** Steps 1 + 3 + 6 + 7 cover the punch line in ~4 minutes.

---

## Troubleshooting

- **"Supabase is not configured"** — `.env.local` is missing or wasn't picked up. Restart `npm run dev` after creating the file.
- **Sign-up fails with "duplicate key value violates unique constraint"** — the email is already in `auth.users`. Sign in instead.
- **Realtime never fires** — Supabase free tier limits the number of concurrent connections. If you've left tabs open over many demos, the limit can hit; sign out everywhere and start fresh, or upgrade.
- **Seed script aborts with "no confirmed auth users"** — sign up at least one user via the app first; the seeder needs a real `auth.users` row to act as the project owner.
- **Inbox is empty after seeding** — the seeded conversation only includes signed-up users. Sign up the user you're logged in as first, then re-run the seed.

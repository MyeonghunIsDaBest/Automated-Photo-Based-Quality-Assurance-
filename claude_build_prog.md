# Claude Build Progress — SiteProof Frontend

A running log of everything we built together on the **Automated Photo-Based Quality Assurance** demo. The app's promise: drop a daily site photo, the Gantt chart updates automatically, and a permanent record is filed for QA and liability.

Stack: **React 18 + TypeScript + Vite + Tailwind + shadcn/ui + Zustand**.
Working tree root: `frontend/src/`.

---

## 1. Editorial design language (applied across pages)

A consistent visual identity was built up across the app:

- **Typography**: `Fraunces` (serif display) + `DM Sans` (body), italic emerald accent for the focus word in headlines (e.g. "Quality, *photographed*").
- **Eyebrow text**: uppercase, tracked-out (`tracking-[0.2em]`), preceded by a thin slate dash.
- **Backgrounds**: off-white `#FAFAF7` page surface; subtle grid-pattern overlay; blurred emerald + blue glows for depth.
- **Buttons**: `bg-slate-900` pill that hovers up to `bg-emerald-700` with shadow lift; `ArrowUpRight` icon micro-interaction.
- **Stat cells**: white card with a thin colored bar at top-left, eyebrow label, Fraunces tabular-num value, slate caption.
- **Modals**: fixed overlay (`bg-slate-900/50`), white card with header / scrollable body / footer button row.

Pages now sharing this language: Dashboard, Files, Reports, Projects, Gantt, Gallery, Messages, Login, and the new ProjectDetailModal.

---

## 2. Cleanup pass — demo data + stray UI

- **Removed the floating project subheader** (`"Lincoln Elementary School - Phase 2 / 67% Complete"`) that hung below the TopNav on every page.
  - File: `components/layout/TopNav.tsx` — dropped the subheader block and its unused `Badge` import + `project / dashboardStats` destructure.
- **Wiped the demo project sprawl** so the live pilot has a clean slate:
  - `data/mockData.ts` — single project (`Casone Electrical — QA Pilot`); empty zones, tasks, photos, audit logs, comments, reports, activity feed; dashboard stats default to zeros and `daysRemaining` is computed live from the project end date.
  - `pages/projects/mocks/projects.ts` — single `project_1` record.
  - `pages/projects/mocks/documents.ts`, `dailyLogs.ts` — emptied.
  - `pages/projects/mocks/workers.ts` — reduced to 3 placeholder Casone Electrical entries.
  - `store/finance.ts` — single seed budget (`$150,000`, 0 spent, 0 committed); no seed invoices.
  - `pages/Reports.tsx` — `SAFETY_FLAGS = []` (was 5 Lincoln-themed mock entries).
  - `store/features.ts` — replaced "Lincoln Elementary School" reference with "Casone Electrical — QA Pilot".
- **Fixed broken "View" button on the Projects list** (was redirecting to Dashboard via missing route): introduced an `onView` callback on `ProjectsListTab`.

---

## 3. Login page rewrite

`pages/Login.tsx` was rebuilt twice:

1. **First pass** — full editorial layout matching the rest of the app (two-column: brand panel left, sign-in form right), with two demo-account cards each carrying allow/deny bullet lists, Mail-icon email input, "Sign in as Admin/Visitor" button.
2. **Simplification pass** — pared down to align tightly with the demo's stated goal:
   - Left panel: brand mark + "**One photo a day — *the rest writes itself*.**" + a 3-step flow card (**Upload → Update → Prove**) explaining the demo's pipeline.
   - Right panel: compact role selector (icon + name + badge + one-line summary, no bullet lists), single "Continue as Admin/Visitor" button.
   - Dropped the always-zero stat strip.

---

## 4. Role-based access control (RBAC)

Two demo accounts live in `data/mockData.ts`:

| Email | Name | Role | Capabilities |
|---|---|---|---|
| `admin@siteproof.com` | Jordan Casone | `admin` | Create projects, upload photos/documents, edit tasks/timelines, view financials, manage users |
| `visitor@siteproof.com` | Casey Visitor | `stakeholder` (client) | Read-only across the app; can leave notes/comments on charts |

### Permission helpers (`lib/permissions.ts`)

Single source of truth — role-write allowlist + per-permission flags:

```
admin:        ['*']                                 (full write)
supervisor:   ['tasks', 'photos', 'comments']
inspector:    ['comments']
subcontractor:['photos', 'comments']
stakeholder:  ['comments']
```

Exported helpers:

- `canEditTasks`, `canDeleteTasks`, `canUploadPhotos`, `canAddComments`
- `canCreateProjects` (admin-only)
- `canEditProjects` (admin-only) — newly added for the project detail modal
- `canViewFinance`, `canManageUsers`, `hasPermission`
- `describeAccess` — human-readable summary used by the Login page

### Where RBAC is wired to the UI

| Surface | Behavior |
|---|---|
| `pages/Projects.tsx` "New Project" button | Replaced with a "Read-only access" pill for non-admins |
| `pages/Upload.tsx` | Visitors see a locked-state card with `Lock` icon + shortcuts to Gallery / Dashboard, instead of the upload form |
| `components/layout/QuickActionsSidebar.tsx` | Each action tagged with `requires: Capability`; visitors only see Photo Gallery, Gantt, Project Files, Progress Reports, Audit Trail, Messages, Safety Alerts |
| `pages/Reports.tsx` | Finance tab gated behind `canViewFinance` (existing) |
| `pages/projects/components/ProjectDetailModal.tsx` | "Edit details" button only renders when `canEditProjects(currentUser)` is true |

---

## 5. Project Detail modal

`pages/projects/components/ProjectDetailModal.tsx` (new file). Opens when any user clicks "View" on the projects list.

**Read-only view** (everyone):
- Header with project name (Fraunces), client subtitle, status accent bar
- 2×2 grid of cells: Status pill, Days Remaining (with total duration caption), Start Date, End Date
- Progress bar with `percentComplete` and tabular-num readout
- 3-up stat row: Complete / Pending / Outstanding task counts
- Footer: "Close"; admins also see "Edit details"

**Edit mode** (admin only):
- Same fields as inputs: Name, Client, Status (select), Start/End Date, Percent Complete (range slider + number), three task counts
- Validation: name + client required, end date after start, percent in `[0, 100]`, non-negative counts
- Save calls `useProjectsListStore.updateProject(id, patch)`
- Cancel reverts the draft

**Store mutator** (`pages/projects/store.ts`):

```ts
updateProject: (id, patch) =>
  set((state) => ({
    projects: state.projects.map((p) => (p.id === id ? { ...p, ...patch } : p)),
  })),
```

---

## 6. Gantt chart — always render the shell

`components/ui/GanttChart.tsx`:

- **Non-compact mode**: when `tasks.length === 0`, an inline empty notice fills the task body (`bg-slate-50/60`, eyebrow "No tasks yet", body line about uploading photos / adding milestones). The chart's month headers and legend remain visible — the chart now reads as "empty timeline" rather than "missing chart".
- **Compact mode**: shorter inline notice in the same spot, tuned to the dashboard summary surface.

`pages/Projects.tsx`:

- Removed the `timelineTasks.length === 0` branch that previously swapped the chart for a `FolderKanban` empty card. The Timeline tab now always renders `<GanttChart>` regardless of task count.

---

## 7. Safety & Compliance page (OHS&E / SWMS / MSDS / Incidents)

A new `/safety` route covers the construction safety paperwork the user wasn't familiar with. Built around two ideas: **documents** the team needs on file, and **incidents** they need to log.

### Vocabulary the page handles

| Term | What it captures |
|---|---|
| **OHS&E** | Occupational Health, Safety & Environment policies, inductions, environmental controls. |
| **SWMS** | Safe Work Method Statement — per high-risk task, hazards + controls. |
| **MSDS / SDS** | Material/Safety Data Sheet — chemical & material hazard info. |
| **Injury form** | Captures who was hurt, where, severity, body part, treatment. |
| **Near miss form** | Captures situations that *could* have caused harm — gold for prevention. |

### Files added

- `pages/Safety.tsx` — main page (editorial design, stat strip, glossary card, two tabs)
- `pages/safety/types.ts` — `SafetyDocument`, `IncidentReport`, severity / status / category enums + label maps
- `pages/safety/store.ts` — Zustand store with `persist` middleware (localStorage key `siteproof-safety`); mutators: `addDocument`, `removeDocument`, `addIncident`, `setIncidentStatus`
- `pages/safety/components/SafetyDocumentModal.tsx` — upload modal with category toggle, title/reference, effective + expiry dates, file picker, notes
- `pages/safety/components/IncidentFormModal.tsx` — single form that toggles between Injury and Near Miss modes; conditional fields (body part / treatment for injury, contributing factors / recommended action for near miss); attaches photos by name

### Page anatomy

- **Header** — eyebrow `Workspace · Safety`, display headline "Safety, *on the record*.", admin-only "Upload document" + "Log incident" actions (visitors get a "Read-only access" pill).
- **Stat strip** — Active SWMS · MSDS on file · Open incidents · Days since last incident.
- **Glossary card** — three-cell explainer (OHS&E / SWMS / MSDS) for users new to the terminology.
- **Documents tab** — filter pills (All / OHS&E / SWMS / MSDS) + list of uploaded documents. Each row shows category badge, title, reference, file metadata, effective + expiry dates (expired dates render red). Admins can delete.
- **Incidents tab** — filter pills (All / Injury / Near Miss) + list of incidents. Each row shows type badge, severity badge, status badge, datetime, description, location, reporter, expandable detail strip (treatment, contributing factors, recommended action, witnesses, photo count). Admins can change status via dropdown (Open → Investigating → Closed).

### RBAC integration

- Reuses `canEditProjects(currentUser)` to gate uploads, form submissions, deletes, and status changes — visitor sees the data but can't write.
- Sidebar entry visible to all roles (`admin`, `supervisor`, `stakeholder`, `inspector`); write actions hide for non-admins.

### Wiring

- `App.tsx` — `<Route path="safety" element={<Safety />} />` added under the protected layout.
- `components/layout/Sidebar.tsx` — new "Safety & Compliance" nav item with `HardHat` icon, sits between Reports and Settings.

---

## 8. Other pages re-skinned with the editorial language

In addition to the items above, these pages were rewritten to share the same design system (work happened earlier in the session):

- **Dashboard** — eyebrow + display headline, stat strip, editorial section cards.
- **Files** — same.
- **Reports** — same; finance tab gated behind `canViewFinance`.
- **Gallery, Gantt, Messages** — editorial chrome applied; Messages got a full rewrite (4-cell stat strip, two-pane card, slate-900 active conversation pill, slate-900 outgoing message bubbles, restyled NewChatModal).

---

## 9. Files touched (cumulative)

```
frontend/src/
├── App.tsx                                            (M)
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx                                (M)
│   │   ├── TopNav.tsx                                 (M, removed subheader)
│   │   └── QuickActionsSidebar.tsx                    (M, RBAC filtering)
│   └── ui/
│       └── GanttChart.tsx                             (M, empty-state inline)
├── data/
│   └── mockData.ts                                    (M, clean-slate)
├── lib/
│   └── permissions.ts                                 (NEW dir, RBAC helpers)
├── pages/
│   ├── Dashboard.tsx                                  (M, editorial)
│   ├── Files.tsx                                      (M, editorial)
│   ├── Finance.tsx                                    (NEW)
│   ├── Gallery.tsx                                    (M)
│   ├── Gantt.tsx                                      (M)
│   ├── Login.tsx                                      (M, rebuilt + simplified)
│   ├── Messages.tsx                                   (M, editorial)
│   ├── Projects.tsx                                   (NEW, full page)
│   ├── Reports.tsx                                    (M, finance gated, mock SAFETY_FLAGS empty)
│   ├── Safety.tsx                                     (NEW, OHS&E / SWMS / MSDS / incidents)
│   ├── Upload.tsx                                     (M, visitor lock-state)
│   ├── safety/                                        (NEW dir)
│   │   ├── types.ts                                   (NEW)
│   │   ├── store.ts                                   (NEW, persist middleware)
│   │   └── components/
│   │       ├── SafetyDocumentModal.tsx                (NEW)
│   │       └── IncidentFormModal.tsx                  (NEW)
│   └── projects/
│       ├── store.ts                                   (M, updateProject)
│       ├── types/
│       ├── components/
│       │   ├── ProjectsListTab.tsx                    (M, onView callback)
│       │   ├── ProjectDetailModal.tsx                 (NEW)
│       │   ├── NewProjectModal.tsx                    (M, placeholder copy)
│       │   ├── ActivityTab.tsx
│       │   ├── DocumentsTab.tsx
│       │   ├── LogsTab.tsx
│       │   └── ProjectSelector.tsx
│       └── mocks/
│           ├── projects.ts                            (M, single live project)
│           ├── documents.ts                           (M, emptied)
│           ├── dailyLogs.ts                           (M, emptied)
│           └── workers.ts                             (M, 3 placeholders)
├── store/
│   ├── dashboard.ts                                   (NEW)
│   ├── features.ts                                    (M, project name)
│   ├── finance.ts                                     (M, single seed budget)
│   └── index.ts                                       (M)
└── types/
    └── index.ts                                       (M)
```

(M = modified, NEW = newly added.)

---

## 10. Known carry-over issues (not introduced by these changes)

`npx tsc --noEmit` reports these pre-existing errors unrelated to the work above:

- `components/TimelineView.tsx` — missing `./TimelineFeed` and `./ui/skeleton` modules; references `Photo.timestamp / taskName / imageUrl` properties that aren't on the `Photo` type.
- `pages/Files.tsx` — unused imports (`MoreHorizontal`, `Button`).

These are tracked but intentionally untouched.

---

## 11. Verification quick-list

1. Type-check: `npx tsc --noEmit` — only the pre-existing errors above.
2. **Visitor flow** (`visitor@siteproof.com`):
   - Login page shows two role cards; "Continue as Visitor" lands on Dashboard.
   - Projects → "New Project" replaced with read-only pill.
   - Projects → "View" opens detail modal with no edit button.
   - Timeline tab renders Gantt shell + "No tasks yet" notice.
   - Upload page shows the locked-state card.
   - QuickActionsSidebar omits Upload Photos / Upload Documents / Generate Report / Financial Reports / Task Dashboard.
   - Reports → Finance tab is hidden.
3. **Admin flow** (`admin@siteproof.com`):
   - All write affordances visible.
   - Project detail modal → Edit details → change status, percent, task counts → Save → reflected in the list row and persisted on reopen.

---

## 12. Safety entry point + seeded Gantt tasks

- **TopNav** now exposes `Safety` (HardHat icon) so the page is reachable from the top bar (sidebar already had it).
  - File: `components/layout/TopNav.tsx`.
- **Seeded the Gantt** with a realistic baseline for the Casone Electrical pilot so the timeline reads as an active job on first load (previously empty by design).
  - File: `data/mockData.ts`.
  - 4 zones: L1 Main Distribution Room, L1 Open Office, L2 Meeting Rooms, External Site (each color-tagged).
  - 9 tasks spanning April–December 2026, mixing `excavation` / `electrical` / `finishing` phases. Statuses cover `complete` (2), `in_progress` (2), `not_started` (5) so the Gantt shows real progress immediately.
  - Dashboard stats now derive from the seed (overall progress ≈ 33%, 9 total tasks, 2 complete, 2 in progress) instead of hard-coded zeros.
- Existing `CreateTaskModal` flow on the Gantt page is unchanged — admins can keep adding tasks on top of the seed via the "New Task" button.

---

*Last updated: end of the session that seeded the Gantt baseline + added Safety to the top nav.*

---

## 2026-04-30 — Real Supabase auth + Admin dashboard (Users / Stakeholders / Suppliers)

### What was built

**Database (4 new migrations)** — `supabase/migrations/0004_profiles.sql` …
`0007_suppliers.sql`. Added the `security_group` enum (six tiers: company_admin,
administrator, construction_mgr, project_manager, site_manager, worker), a
`profiles` table extending `auth.users`, an `on_auth_user_created` trigger that
seeds a default profile on signup, `is_admin_role()` / `is_company_admin()`
helpers, the `user-documents` storage bucket with admin-only writes, and the
`stakeholders` / `suppliers` / `supplier_branches` / `supplier_contacts` tables
with RLS that opens reads to authed users and gates writes behind
`is_admin_role()`.

**Auth + permission layer** — Replaced the legacy 5-role `UserRole` model with
a 6-tier `SecurityGroup` (kept `UserRole` as a compatibility alias via
`mapSecurityGroupToLegacyRole` so older UI keeps compiling). New API modules
under `frontend/src/lib/api/`: `auth.ts`, `profiles.ts`, `stakeholders.ts`,
`suppliers.ts`, `userDocuments.ts`. `lib/permissions.ts` now exposes
`canSeeAdminDashboard`, `canManageUsers`, `canManageStakeholders`,
`canManageSuppliers`, and `canAssignSecurityGroup` (the last one prevents
Administrators from minting other company_admins).

**Auth store** — `store/index.ts`:
`login(email, password)`, `register(email, password, firstName, lastName)`,
`logout()`, `refreshProfile()`. Now bootstraps from `getSession()` on mount and
listens to `onAuthStateChange` so signing out in another tab clears local
state. `currentUser` is derived from the loaded `Profile` so all existing
components reading `currentUser.fullName`/`role`/`avatar` keep working.

**Login page** — Rewritten as a sign-in / create-account tab card. Demo
quick-pick chips removed; password is now required. Failed sign-in shows the
Supabase error inline.

**RequireAuth guard** — New `components/RequireAuth.tsx`. Spinner while
`isAuthLoading`, redirect to `/login` when unauthenticated, optional
`requireAdmin` prop redirects non-admins to `/dashboard`. Wired into
`App.tsx`; new `/admin` route lives behind `<RequireAuth requireAdmin />`.

**Admin dashboard** — `pages/Admin.tsx` shell + three tabs:
- `UsersTab` — table of profiles with inline security-group dropdown,
  enable/disable, edit-form modal, and a Documents drawer.
- `UserFormModal` — creates accounts via `signUp` or edits existing profiles.
  Captures the spec's emergency-contact and mobile fields.
- `UserDocuments` — lists `user_documents` for a user, uploads a new doc to
  the `user-documents` bucket (10 MB cap), captures Reference/Expiry/Alert/
  Notes, and signs URLs for download.
- `StakeholdersTab` + add modal — Company / First / Last / Email / Mobile /
  Role / Notes.
- `SuppliersTab` + add modal — Main details, Main Address, Postal Address, plus
  repeating Contacts and Branches; expandable rows show child records.

Sidebar and TopNav now show an "Admin" entry only when
`canSeeAdminDashboard(currentProfile)` is true.

### Deviations from the agreed plan

- `UserFormModal` create path uses `signUp()` then leaves the inline dropdown
  to promote the new account. The plan hinted at a server-side
  `auth.admin.createUser` flow but that requires the service-role key which
  must never ship in the browser bundle, so this is the safer route.
- The "Suppliers" modal renders supplier-level details + repeating
  contacts/branches inline rather than splitting them into separate steps;
  felt cleaner for a single-screen admin form.

### Verified vs. unverified

- ✅ `npx tsc --noEmit` reports only the pre-existing TimelineView/Files
  errors — no new TS errors from any of the new code.
- ⚠️ Browser smoke not yet run on this conversation. Suggested manual checks
  before declaring done:
  1. Apply migrations `0004` → `0007` in the Supabase SQL Editor (in order).
  2. Visit `/login` → "Create account" → register `Myeonghun@Seo.com` with
     password `@Administrator`.
  3. In the SQL Editor:
     `update profiles set security_group = 'company_admin' where email = 'Myeonghun@Seo.com';`
  4. Reload — Sidebar/TopNav should now show **Admin**, and `/admin` should
     load the three tabs.
  5. Add a test user, stakeholder, and supplier (with at least one branch and
     one contact) to confirm RLS lets the admin write.

### Explicit follow-ups (out of scope here)

- Email confirmation + password reset UI (Supabase has both built in; we just
  haven't surfaced links yet).
- Cron / email delivery for document expiry alerts. The `expiry_alert` field
  is captured; the worker that fires the reminder is still TODO.
- Avatar upload form on profile edit (column exists, no UI yet).
- Per-project membership table (still using "everyone authenticated sees
  every project" — flagged in `0001_init.sql`).

---

## 2026-04-30 — MVP Phase 0 + 1: test harness + schema/RLS alignment

Foundation work for the live-Gantt MVP roadmap (`~/.claude/plans/check-my-entire-code-greedy-stonebraker.md`). Two milestones in one session.

### Phase 0 — Test infrastructure

- Added Vitest 2.1 + Testing Library 16 + jsdom 25 + jest-dom matchers as
  dev deps; left the existing build chain untouched.
- New scripts in `frontend/package.json`: `test` (single-run), `test:watch`,
  `typecheck` (`tsc --noEmit`).
- `frontend/vitest.config.ts` — jsdom env, alias `@` → `src`, setup file
  registers jest-dom matchers; CSS off so Tailwind/PostCSS doesn't run during
  tests.
- Three smoke tests under `frontend/src/__tests__/`:
  - `permissions.test.ts` — 19 assertions across all 6 security groups for
    `canSeeAdminDashboard`, `canAssignSecurityGroup` (the rule that
    Administrators can't mint other company_admins), and `canEditTasks`.
  - `gantt.test.tsx` — empty-state notice; one-task render shows name + %;
    multi-task renders one row each; month headers render when `showMonths`.
  - `auth.test.tsx` — Login renders; submitting the form calls `login()` with
    the typed credentials (mocked store via `vi.mock('../store')`); tab
    switch reveals the first/last-name fields.
- CI workflow at `.github/workflows/ci.yml` runs typecheck → test → build on
  push to `main` and on every PR.

**Verified:** `npm test` → 19/19 passing. `npm run typecheck` reports only
the pre-existing TimelineView/Files errors documented in section 10.

### Phase 1 — Schema/RLS alignment migration

`supabase/migrations/0008_mvp_alignment.sql` (idempotent, safe to re-run):

1. **Adds frontend-expected task columns**: `assignee_id` (FK profiles, set
   null on delete), `parent_task_id` (FK tasks, cascade), `update_source` text
   with check constraint (`'manual'` | `'ai_auto'` | `'supervisor'`). Indexes
   on `assignee_id` and `parent_task_id`.
2. **Converts `tasks.notes`** from `text` to `jsonb` array so it matches the
   frontend `Task.notes: string[]`. Migration is guarded by an
   `information_schema` lookup so it's a no-op on a re-run.
3. **Replaces blanket `tasks: authed write` policy** with role-gated
   policies: insert + update for the manager tier (company_admin,
   administrator, construction_mgr, project_manager, site_manager); a
   separate update policy lets a worker move their own % bar when
   `assignee_id = auth.uid()`; delete is admin-only via `is_admin_role()`.
4. **Tightens photo RLS**: insert open to any authed user (workers must be
   able to upload), update/delete restricted to the uploader or an admin.
5. **`claim_first_admin()` RPC** — security definer one-shot. Promotes the
   caller to `company_admin` only when no admin/administrator exists yet;
   otherwise returns false. Drives the future bootstrap screen.

`supabase/migrations/0009_bootstrap_admin.sql.example` — template for the
manual SQL-Editor admin promotion (kept as reference; the in-app screen
lives in Phase 6).

**Frontend type sync** — `frontend/src/types/index.ts` `Task` interface gained
`assigneeId?: string` and `parentTaskId?: string`. `notes: string[]` was
already correct (matches the new jsonb column).

**Verified:** `npm test` still 19/19 green; typecheck clean (same 7
pre-existing errors). SQL not yet applied to the live Supabase project —
that's a manual step before Phase 2.

### What's next

Phase 2 wires `Gantt.tsx` and the Zustand stores to live Supabase data and
opens a realtime subscription. Phases 3–6 layer on task CRUD, photo upload
to Storage, the AI scaffold Edge Function, and the in-app bootstrap screen.

---

## 2026-04-30 — MVP Phases 2–6: live data, CRUD, uploads, AI stub, bootstrap

Continuation of the MVP roadmap. All five remaining phases shipped in this
session. Frontend now talks to Supabase end-to-end whenever
`VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` are set; falls back to mock
data when they aren't, so the demo path stays alive.

### Phase 2 — Live Gantt + realtime subscription

- `frontend/src/lib/api/tasks.ts` — `TaskRow` extended with `assignee_id`,
  `parent_task_id`, and `update_source`; `notes` typed as `string[] | null`
  to match the jsonb migration. New `mapTaskRow(row): Task` translates
  snake_case rows into the camelCase frontend `Task`, computing
  `durationDays` from the date span.
- `frontend/src/pages/projects/store.ts` — adds `loadProjects()`. Boots the
  list empty when Supabase is configured (no flash of mock data) and pulls
  the live list. `projectRowToProject` maps DB rows; counts default to 0
  and are computed downstream from the tasks slice.
- `frontend/src/store/index.ts` — `refreshProfile()` now calls
  `loadProjects()` after a successful auth fetch, so the project list is
  always up-to-date as soon as a user signs in.
- `frontend/src/pages/Gantt.tsx` — new `useEffect` keyed on `project.id`
  fetches via `listTasks(projectId)`, replaces only that project's slice in
  `useFeatureStore.tasks`, then opens a `subscribeToProjectTasks`
  subscription. INSERT / UPDATE / DELETE payloads patch the local store
  via `mapTaskRow` so two browser tabs stay in sync.

### Phase 3 — Create / edit / delete tasks against Supabase

- `frontend/src/pages/Gantt.tsx`:
  - `handleCreateTask` → calls `createTask()` with the full row shape
    (project, zone, assignee, parent, dates, notes, dependencies). Local
    `addTask` still runs so the new bar appears instantly even before the
    realtime echo.
  - `handleSaveTask` → calls `updateTask()` with the full edited row,
    keeps `updateTaskProgress` running locally for notification + progress
    history side-effects.
  - `handleDeleteTask` → calls `deleteTask()` then the local mutator;
    realtime DELETE will reconcile if either side fails.
- `frontend/src/pages/projects/components/NewProjectModal.tsx`:
  - `handleSubmit` is async. When Supabase is configured, calls
    `createProjectWithTasks` (the existing `create_project_with_tasks`
    RPC), then `loadProjects()` + `setActiveProject(newId)` so the user
    lands on the new project immediately. Falls back to the local
    `createProject()` path otherwise. Error surfaces inline; submit button
    shows `Creating…` while pending.

### Phase 4 — Photo upload to Storage

- `frontend/src/pages/Upload.tsx`:
  - Replaces `URL.createObjectURL(file)` with `uploadPhoto({ file, ... })`
    when Supabase is configured. The Storage write + `photos` insert run
    server-side via the existing `lib/api/photos.ts` wrapper, which also
    bumps `tasks.photo_count` via the `increment_photo_count` RPC.
  - New `readImageDimensions(file)` helper reads `naturalWidth/Height` so
    the `photos` row records actual pixel dimensions instead of the
    1920×1080 placeholder we shipped with the mock version.
  - `handleApplyProgress` now calls the API `updateTaskProgress(id, %)`
    before the local mutator — task % moves persist across reloads.
  - On upload failure, surface the error in the toast slot but keep the
    local row so the user doesn't lose their work.

### Phase 5 — AI round-trip scaffolding

- `supabase/migrations/0010_ai_pending_trigger.sql` — `AFTER INSERT` trigger
  on `photos` writes a placeholder `ai_analyses` row (model_used='pending',
  completion_pct=0, confidence=0, action_taken='pending'). The unique key
  is (photo_id, model_used, analyzed_at), so future real-model rows land
  alongside without conflict.
- `supabase/functions/analyze-photo/index.ts` — Deno Edge Function stub.
  Accepts `{ photoId }` (or a Postgres-webhook `record.id` payload),
  inserts a real-model row with `action_taken='skipped'`, and flips
  `photos.ai_analyzed = true`. The function body's `mockAnalyze()` is the
  one place to swap in a real vision API later. `supabase/README.md`
  documents `supabase functions deploy analyze-photo --no-verify-jwt` and
  the dashboard webhook hook-up.

### Phase 6 — Bootstrap UX

- `frontend/src/pages/admin/BootstrapAdmin.tsx` — first-run page mounted
  at `/bootstrap-admin` (auth required, no admin requirement). Probes
  `select count(*) from profiles where security_group in
  ('company_admin','administrator') and is_active`. If zero, renders a
  "Claim Company Admin" button that calls the `claim_first_admin()` RPC
  from migration 0008; on success, refreshes the profile and routes to
  `/admin`. If an admin already exists, the page redirects to dashboard.
- `frontend/src/App.tsx` — registers the new route under a plain
  `<RequireAuth>` (intentionally NOT `requireAdmin`, since the whole point
  is to mint the very first admin).
- `supabase/README.md` — migration list updated through 0010, new
  "Mint the first admin" step replaces the manual SQL Editor instruction,
  and an "Edge Function: analyze-photo" section explains deploy + webhook.

### Verified

- `npm test` → 19/19 passing across `auth.test.tsx`, `gantt.test.tsx`,
  `permissions.test.ts`.
- `npm run typecheck` → only the pre-existing TimelineView/Files
  carry-over errors (section 10).
- `npm run build` → succeeds (single-file build, ~1.36 MB / 368 kB gzip).

### Manual smoke (not run from this session — DB is not yet migrated)

1. Apply migration 0008 + 0010 to your Supabase project.
2. Sign up your account → first login routes through `/bootstrap-admin` →
   click "Claim Company Admin" → redirected to `/admin`.
3. Create a project via "+ New Project" → DB row appears in `projects`,
   tasks appear in `tasks`, Gantt opens on the new project.
4. Edit a task's % in another browser tab → realtime echo moves the bar
   in the first tab within ~1s.
5. Upload a photo against a task → Storage path
   `photos/{project_id}/{photo_id}.{ext}` exists, `photos` row written,
   `tasks.photo_count` incremented, an `ai_analyses` row with
   `model_used='pending'` is created automatically.
6. (Optional) Deploy the Edge Function and wire the Database Webhook on
   `photos` INSERT — verify a second `ai_analyses` row gets written with
   `model_used='mvp-stub@v0'` and `action_taken='skipped'`.

### Out of scope for this MVP (deliberate)

- AI status badge in the Gallery — the field is in place
  (`photos.ai_analyzed`, `ai_analyses.action_taken`), the UI just doesn't
  surface it yet.
- Drag-to-reschedule on the Gantt bars (read-only positioning today).
- EXIF GPS / `taken_at` extraction at upload time (current code uses
  `new Date()` for `takenAt`).
- Real vision-model integration in `analyze-photo` — explicitly a stub.
- Per-project membership table — every authenticated user still sees
  every project. Flagged for the next iteration.

---

## 2026-04-30 — Demo prep: signup roles, role banner, runbook

Quick follow-up shipped the same day to support this week's internal demo.

### Self-select role at signup

- New migration `supabase/migrations/0011_signup_role_metadata.sql`
  rewrites `handle_new_user()` so the trigger reads
  `raw_user_meta_data->>'security_group'` and uses it as the new profile's
  starting tier. Whitelist: `worker`, `site_manager`, `project_manager`,
  `construction_mgr`. Anything else (and the two privileged tiers) silently
  falls back to `worker`, so the form **cannot** mint admins on its own.
  Admins still come exclusively from `claim_first_admin()` (first user)
  or the `/admin` dashboard.
- `frontend/src/lib/api/auth.ts` — `signUp()` now takes a 5th argument
  `role: SignupRole` (`worker | site_manager | project_manager |
  construction_mgr | stakeholder | supplier`). The role is sent under
  `raw_user_meta_data.security_group` so the trigger picks it up.
  `stakeholder` and `supplier` aren't security groups — they're separate
  tables — so the trigger normalizes them to `worker` while preserving the
  original choice in `requested_role` metadata for the admin to act on.
- `frontend/src/store/index.ts` — `register()` action threads the role
  argument through.
- `frontend/src/pages/Login.tsx` — register form gains a 6-tile role
  picker (Worker, Site Manager, Project Manager, Construction Mgr,
  Stakeholder, Supplier) with icons and one-line capability captions.
  Selected tile flips to a slate-900 background so it reads as a strong
  pick. State default is `'worker'`.

### Role-aware welcome strip on Dashboard

- `frontend/src/pages/Dashboard.tsx` — under the "The brief." headline,
  added a card that shows the signed-in user's display name, role label
  (from `SECURITY_GROUP_LABELS`), and a one-line capability blurb
  (`ROLE_BLURB` map). Drives home that the **same page** renders
  differently for different roles — the lock icons on write-actions
  elsewhere are the matching proof point.

### Demo runbook

- `demo/this-week-runbook.md` — 7-beat live-demo script (~10 min)
  including:
  - The exact migrations to apply (0001 → 0011 minus the
    `.sql.example` template).
  - **Two ways to promote `myeonghun@seo.com` → company_admin** —
    in-app via `/bootstrap-admin` (recommended), or the SQL Editor
    snippet that also sets the display name. Password `@testing` is
    used as-is.
  - A copy-paste SQL block that creates a fixture project + 4 tasks via
    the existing `create_project_with_tasks` RPC (with a 100%-complete
    historical task and a 30%-complete in-progress one so the Gantt
    looks active out of the gate).
  - Two-window split-screen demo (admin + worker) showing the upload →
    auto photo_count bump → manual % update → realtime echo loop.
  - Talking points for "where AI plugs in" pointing at the
    `mockAnalyze()` function in the Edge Function stub.
  - Troubleshooting matrix (sign-in, RLS 403, realtime, etc.).

### Verified

- `npm run typecheck` clean (only the pre-existing carry-over errors).
- `npm test` 19/19 passing.
- Did NOT apply migrations 0011 to a live Supabase project from this
  session — that's part of the runbook's "0a" step.

---

## 2026-04-30 — Nuke + consolidate: single 00_init.sql, reworked RBAC

After a demo blocker (`myeonghun@seo.com` "invalid credentials" pointing at
schema/database drift after 11 incremental migrations had been applied in
mixed orders), wiped the migration history and replaced it with one
consolidated, idempotent script.

### `supabase/migrations/00_init.sql` (NEW, ~870 lines)

One transaction-safe file with ten labelled sections:

1. **Reset** — `delete from storage.objects` for the two buckets, drop the
   `on_auth_user_created` trigger on `auth.users`, drop all 14 public
   tables in reverse-dependency order with CASCADE, drop the 13 functions
   we own, drop the 8 enums.
2. **Enums** — `project_status`, `task_status`, `construction_phase`,
   `note_type`, `note_status`, `ai_action`, `security_group`,
   `expiry_alert`, all wrapped in `do $$ … duplicate_object … $$`.
3. **Helper functions** — the new RBAC core:
   - `current_security_group()` — STABLE security-definer that reads the
     calling user's group once. Replaces every `exists (select 1 from
     profiles ...)` pattern in policies.
   - `is_manager_or_above()` — true for the five manager-tier groups.
   - `is_admin_role(uid uuid default null)` — kept signature compatible
     with the legacy storage policies.
   - `is_company_admin(uid uuid default null)` — compatible signature.
   - The four `touch_*_updated_at` helpers, `snapshot_project_progress`,
     `on_photo_inserted_queue_ai`, `increment_photo_count`,
     `create_project_with_tasks`, `claim_first_admin` — copied verbatim
     from the legacy migrations.
4. **`handle_new_user()` with auto-promote** — same role-from-metadata
   logic as 0011, plus a new branch: if `count(*) where security_group in
   ('company_admin','administrator') and is_active = 0`, the new account
   becomes `company_admin` regardless of what the form picked.
   Self-healing: once one admin exists, every subsequent signup keeps
   their chosen role. Removes the `/bootstrap-admin` step from the
   common path.
5. **Tables** — 14 tables built in dependency order (`profiles` →
   `projects` → `zones` → `tasks` → `progress_snapshots` → `photos` →
   `ai_analyses` → `comments` → `audit_log` → `user_documents` →
   `stakeholders` → `suppliers` → `supplier_branches` →
   `supplier_contacts`). `tasks.notes` is born as `jsonb not null
   default '[]'`; `tasks` has `assignee_id`, `parent_task_id`,
   `update_source` from the start. All 27 indexes recreated.
6. **Triggers** — six triggers wired after all functions exist.
7. **RLS — reworked** — every write policy that used to do
   `exists (select 1 from profiles where ...)` now reads as one helper
   call:
   ```sql
   create policy "tasks: insert by manager+" on tasks
     for insert with check (is_manager_or_above());
   ```
   End-state: same policies per table as before, half the lines, faster
   to read in `pg_policies`. Same coverage on `projects`, `zones`,
   `tasks`, `photos`, `ai_analyses`, `comments`, `audit_log`,
   `user_documents`, `stakeholders`, `suppliers`, `supplier_branches`,
   `supplier_contacts`, `progress_snapshots`, `profiles`.
8. **Storage** — `insert into storage.buckets ... on conflict do nothing`
   for `photos` and `user-documents`. All seven storage policies dropped
   if exists + recreated.
9. **Realtime** — `tasks`, `projects`, `photos`, `comments`,
   `ai_analyses`, `profiles` added to `supabase_realtime` via
   `do $$ ... duplicate_object ... $$`.
10. **Sanity NOTICEs** — counts of `profiles`, `projects`, `tasks`
    (should all be 0) and a "first signup becomes company_admin"
    reminder.

### Migration archive

`supabase/migrations/legacy/` now holds the original 11 files (0001 →
0011) plus the `0009_bootstrap_admin.sql.example` template. Added a
`legacy/README.md` explaining they're superseded and must not be run
alongside `00_init.sql`. Supabase CLI only reads files directly in
`migrations/`, not subdirectories — so this is a functional delete from
its perspective while preserving git history.

### Frontend / docs follow-ups

- `supabase/README.md` — full rewrite. The "run 11 migrations in order"
  ladder is replaced with one paragraph: "paste `00_init.sql` and click
  Run." Added an "About the auto-promote" section explaining the
  trigger logic.
- `demo/this-week-runbook.md` § 0a + § 0c — single-file step + auto-
  promote explanation. Kept the manual-promote SQL as a fallback for
  the case where `myeonghun@seo.com` isn't the first signup. Added a
  troubleshooting note on email-confirmation gating.
- `frontend/src/pages/admin/BootstrapAdmin.tsx` — header comment
  updated to mark this as a fallback path; the auto-promote handles the
  common case.
- No frontend code changes — the schema names, RPC names, and 6-tier
  enum are unchanged, so `lib/permissions.ts`, `lib/api/*.ts`,
  `Login.tsx`, and `Dashboard.tsx` all stay compatible.

### Verified (this session)

- `npm test` (in `frontend/`) → 19/19 passing.
- `npm run typecheck` → only the pre-existing TimelineView/Files
  carry-over errors from section 10.
- `npm run build` → succeeds (1.36 MB / 369 kB gzip).
- SQL was NOT applied to a live Supabase project — that's the operator's
  step before the demo. The runbook's verification section walks
  through it.

### Out of scope (deliberate)

- **JWT-claim-based RLS** — fast reads via `auth.jwt() ->>
  'security_group'` instead of a profiles join. Too much surface area
  (Auth Hook config + custom JWT template) for same-day demo prep.
- **Per-project membership** — the new `current_security_group()`
  helper makes adding a `project_members` table a one-policy-edit-per-
  table change when multi-tenant matters.
- **Real vision model in the Edge Function** — still a stub. The
  pending-row trigger stays; only the Edge Function body needs swapping.

---

## 2026-05-02 — Tab crash isolation, shared task mutations, bulk add, mobile pass

### What landed
- **ErrorBoundary** at `frontend/src/components/ui/ErrorBoundary.tsx`. Wraps
  every Gantt tab and every Projects sub-tab. A render error in one tab now
  shows an inline red card with the error name/message instead of unmounting
  the entire app to a white page. The boundary resets when the tab identity
  changes, so navigating away clears the bad state.
- **Defensive Gantt side-store**. `frontend/src/pages/gantt/store.ts` now has
  a `merge` function on the `persist` config that ensures every collection
  (`dailyLogs`, `todos`, `changeOrders`, `selections`, `warranties`) is an
  object after rehydration. The white-pages on Daily Logs / To-Dos / Change
  Orders / Selections / Warranties were almost certainly an old persisted
  shape with a missing slice — `state.warranties[projectId]` blew up. Every
  consumer (the five tabs + the badge counter in `Gantt.tsx`) now also uses
  optional chaining as a second line of defense.
- **Project name as the schedule title**. `ScheduleTab` no longer reads
  "Project schedule." — the H2 is now the actual project name, with the
  eyebrow trimmed to "Workspace · Schedule" so it doesn't double-stamp the
  name. `Projects → Timeline` already showed the project name; left as-is.
- **Shared task mutation helpers** at `frontend/src/lib/api/taskMutations.ts`:
  `createTaskShared`, `saveTaskShared`, `deleteTaskShared`. Both Gantt and
  Projects now route every task write through these — Supabase persistence
  when configured, feature-store mirroring always. Previously Projects'
  Add Task only mutated the in-memory store, which is exactly the divergence
  the user hit ("dump task in Gantt doesn't reflect in Projects"). Save now
  mirrors every field (name, dates, phase, status), not just `percentComplete`,
  so edits don't silently revert in Supabase-less environments.
- **Bulk add modal** at `frontend/src/components/tasks/BulkAddTasksModal.tsx`.
  Multi-row form with name / phase / start / end / status, plus per-row
  Duplicate and Delete. Surfaces from a "Bulk add" button on both
  `Projects → Timeline` and `Gantt → Schedule`. Empty rows are skipped on
  save; date-order validation runs before any insert; rows are submitted
  sequentially so an error names the offending row.
- **Mobile pass**. Reduced page padding on small screens
  (`Dashboard`/`Projects` now `px-4 sm:px-8`, `Gantt` now `p-4 sm:p-6`). Hero
  display titles drop from `text-5xl` to `text-3xl` on mobile. The Gantt
  chart in `ScheduleTab` is now wrapped in a horizontal-scroll container with
  a `min-w-[720px]` inner so the bars stay readable instead of squishing. The
  Projects tab strip horizontal-scrolls on small screens. The bulk add modal
  uses a card layout per row on mobile and a grid on `md+`.

### Files touched
- `frontend/src/components/ui/ErrorBoundary.tsx` (new)
- `frontend/src/components/tasks/BulkAddTasksModal.tsx` (new)
- `frontend/src/lib/api/taskMutations.ts` (new)
- `frontend/src/pages/Gantt.tsx` (boundary, defensive counts, shared helpers)
- `frontend/src/pages/Projects.tsx` (boundary, bulk add, shared helpers, mobile)
- `frontend/src/pages/Dashboard.tsx` (mobile padding/title)
- `frontend/src/pages/gantt/store.ts` (persist merge)
- `frontend/src/pages/gantt/tabs/ScheduleTab.tsx` (project-name title, bulk add, mobile chart scroll)
- `frontend/src/pages/gantt/tabs/{DailyLogs,Todos,ChangeOrders,Selections,Warranties}Tab.tsx` (optional-chain reads)

### Still loose
- Without DevTools console output from the live repro, the white-page root
  cause is a strong inference (partial-hydration shape mismatch) rather than
  a verified diagnosis. The boundary + defensive guards mean the worst case
  is now an inline error card with the actual exception text — paste that
  back when it next happens and we'll have a definitive answer.
- "Seed demo data" admin button (one-click fixture project + tasks + photos)
  was offered but not built this round. Easy follow-up if needed.

---

## 2026-05-02 (continued) — Frontend-wide mobile compatibility pass

### What landed

Sequenced six phases per the approved plan; one cohesive PR.

**Phase 1 — Foundations**
- `frontend/index.html`: `viewport-fit=cover` so `env(safe-area-inset-*)`
  resolves on iPhone X+ / notched Androids.
- `frontend/src/index.css`: `.pt-safe`/`.pr-safe`/`.pb-safe`/`.pl-safe`
  utilities, a `.body-scroll-lock` class, and a one-rule `@media (max-width:
  640px) { input, select, textarea { font-size: 16px } }` that single-handedly
  kills iOS Safari's auto-zoom on text inputs.
- `Toaster.tsx`: positioned with `calc(1rem + env(safe-area-inset-*))` so it
  clears the home-indicator and doesn't overflow on a 360px screen.
- Touch-target sweep: `TopNav` bell/avatar/hamburger all 44×44; modal close
  buttons (`CreateTaskModal`, `TaskModal`, `BulkAddTasksModal`,
  `NewProjectModal`) bumped to 40×40+ with `active:` states; `Sidebar.tsx`
  project select padded `py-2`.

**Phase 2 — Page chrome**
Applied the proven `Dashboard`/`Projects` template across every remaining
page: `px-4 sm:px-8`, `pt-8 sm:pt-10`, hero titles `text-3xl sm:text-5xl`.
Files in this bucket: `Files.tsx`, `Reports.tsx`, `Safety.tsx`, `Messages.tsx`,
`Settings.tsx`, `Admin.tsx`, `Login.tsx`, `Gallery.tsx`. The `Settings.tsx`
sidebar layout now stacks (`flex-col md:flex-row`); the `Messages.tsx`
inbox/thread split stacks (`flex-col md:flex-row` with `max-h-[60vh]` cap on
the inbox in mobile). Login's role-tile grid is single-column on phones.

**Phase 3 — Tables**
- `ProjectsListTab` and `TasksTab` (both end-user surfaces) ship a
  card-per-row mobile layout with `md:hidden` / `hidden md:block`. Cards show
  the same data the desktop table does, just stacked.
- Admin tables (`UsersTab`, `StakeholdersTab`, `ActivityTab` Workers section)
  get the quick-wrap pattern: `<div class="-mx-4 overflow-x-auto sm:mx-0">`
  with a `min-w-[640–680px]` table inside. Engineers/ops swipe; the page
  itself never scrolls horizontally.
- `SuppliersTab` detail grid → `grid-cols-1 sm:grid-cols-2`.

**Phase 4 — Overlays & modals**
- `TopNav` notifications and user-menu dropdowns now `w-[calc(100vw-1rem)]`
  with a `max-w-{96,xs}` cap, so they fit inside iPhone SE without clipping.
- `ProjectSelector` is `w-full sm:w-72` so the right rail of the Projects tab
  doesn't crowd it.
- `CreateTaskModal`, `TaskModal`, `NewProjectModal`, `ProjectDetailModal`
  standardised on the BulkAdd shape: `flex h-full max-h-[95vh] w-full max-w-X
  flex-col` with the body region scrolling independently. The previous
  `max-h-[calc(100vh-280px)]` on TaskModal (broken on portrait phones) is
  gone.

**Phase 5 — GanttChart shared component**
The `GanttChart` used by Dashboard's "Active Jobs" preview and Projects →
Timeline now horizontal-scrolls with `min-w-[640px]` (full mode) /
`min-w-[560px]` (compact). Task-name column narrows to `w-36` on mobile,
`w-48` on `sm+`.

**Phase 6 — Polish**
- `active:` companions added to TopNav primary nav links and mobile drawer.
- `QuickActionsSidebar` is full-width on phones (was `w-80` = 320px, leaving
  40px of dashboard visible behind it on a 360px screen). On open, it adds
  `body-scroll-lock` to `<body>` so the page underneath doesn't scroll
  behind the panel.

### Files touched (count: 25)

```
frontend/index.html
frontend/src/index.css
frontend/src/components/ui/Toaster.tsx
frontend/src/components/ui/GanttChart.tsx
frontend/src/components/layout/TopNav.tsx
frontend/src/components/layout/Sidebar.tsx
frontend/src/components/layout/QuickActionsSidebar.tsx
frontend/src/components/tasks/CreateTaskModal.tsx
frontend/src/components/tasks/TaskModal.tsx
frontend/src/components/tasks/BulkAddTasksModal.tsx
frontend/src/pages/Files.tsx
frontend/src/pages/Reports.tsx
frontend/src/pages/Safety.tsx
frontend/src/pages/Messages.tsx
frontend/src/pages/Settings.tsx
frontend/src/pages/Admin.tsx
frontend/src/pages/Login.tsx
frontend/src/pages/Gallery.tsx
frontend/src/pages/projects/components/ProjectsListTab.tsx
frontend/src/pages/projects/components/ProjectSelector.tsx
frontend/src/pages/projects/components/ActivityTab.tsx
frontend/src/pages/projects/components/NewProjectModal.tsx
frontend/src/pages/projects/components/ProjectDetailModal.tsx
frontend/src/pages/gantt/tabs/TasksTab.tsx
frontend/src/pages/admin/components/UsersTab.tsx
frontend/src/pages/admin/components/StakeholdersTab.tsx
frontend/src/pages/admin/components/SuppliersTab.tsx
```

`npx tsc --noEmit` is clean across every file touched in this pass. The two
pre-existing failures (`TimelineView.tsx` missing module, `Files.tsx`
unused-import) were flagged out-of-scope in the plan and remain.

### Verification still pending (user)

Walk the golden path on real iPhone + Android, plus DevTools presets for
iPhone SE (375), iPhone 14 Pro (393, notch), Pixel 7 (412), iPad Mini (768),
1280 desktop sanity check. Specifically: dropdowns shouldn't clip, modals
should scroll internally not overflow off-screen, no input should auto-zoom
on iOS, the Toaster should clear the home indicator, every page hero should
fit without horizontal scroll.


2026-05-04 — Daily Logs crash, Dashboard photo sync, MVP roadmap compiled
What landed
Daily Logs / Gantt side-tab infinite-loop fix. Daily Logs was throwing
Maximum update depth exceeded on mount. Root cause: every Gantt side-tab
read its per-project slice through an unstable Zustand selector — e.g.
useGanttSideStore((s) => s.dailyLogs?.[project.id] ?? []). When the project
key was missing, the selector returned a fresh [] on every call. Zustand
runs through useSyncExternalStore and compares snapshots with Object.is,
so React saw the store change every render and infinite-looped. Daily Logs
crashed first because it was the most-mounted side-tab; Todos / Change
Orders / Selections / Warranties were all ticking time bombs with the same
shape — the milestone-merge from 2026-05-02 had reduced the symptoms but
hadn't actually neutralised the unstable-snapshot pattern.
Fix in five tab files plus the parent Gantt page. Pattern: subscribe to the
whole map (stable reference) and derive the per-project slice with useMemo.
tsxconst allLogs = useGanttSideStore((s) => s.dailyLogs);
const logs    = useMemo(() => allLogs?.[project.id] ?? [], [allLogs, project.id]);
In pages/Gantt.tsx, the counter-badge useMemo previously called
useGanttSideStore.getState() once per render — badges only updated when
projectTasks changed, never when the side-stores themselves did. Replaced
the getState snapshot with five proper subscriptions (dailyLogs, todos,
changeOrders, selections, warranties) and folded them into the deps
array so badges live-update as entries are added or removed. The orphan
useGanttSideStore(); "subscribe so badges update" line that did nothing
was removed.
SelectionsTab.tsx was the only file in the set whose React import didn't
already include useMemo; added it as a one-line fix after a Babel
Cannot find name 'useMemo' error surfaced.
Dashboard reflects uploads — Tier 2 sync fixes. Two structural bugs
were keeping the Dashboard's stat cards at zero forever:

pages/Files.tsx was stamping every upload with projectId: 'project_1'
regardless of which project was active. Replaced the hardcoded id with
useProjectsListStore(selectActiveProject) and gated the upload behind
a guard clause that bails (with a console warning + closed modal) when
no project is active. New documents now correctly attach to whichever
project the sidebar shows as active.
store/dashboard.ts — useDashboardStats was computing Photos Today /
Photos This Week from useAppStore.photos, but the Files page writes
to useFeatureStore.documents. The two collections never synced, so
the cards stayed at 0 even after uploads. Switched the selector to
read straight from documents, filtered by type === 'photo' and the
active project id:

tsx   const projectPhotos = documents.filter(
     (d) => d.type === 'photo' && d.projectId === project.id,
   );
Result: a photo uploaded on the Files page increments Photos This Week
on the Dashboard immediately, scoped to the active project.
MVP roadmap compiled (planning artifact, not code). Working doc covering
the gap between the current frontend and the Casone Project Manager site
map, the Supabase-backed stack choice, the core schema (organizations /
users / user_documents / projects / project_members / zones / tasks /
task_dependencies / progress_snapshots / photos / documents / daily_logs /
daily_log_personnel / workers / comments / audit_log / notifications), and a
13-day phased plan from "Schema + Auth" through "Polish, deploy, test." The
roadmap also explicitly named the existing two-store seam
(useFeatureStore mirrored into useAppStore) as the architectural debt
that's manufacturing every dashboard-sync bug we keep hitting; collapsing
it is queued as a Tier 3 follow-up.
Files touched

frontend/src/pages/Gantt.tsx
frontend/src/pages/gantt/tabs/DailyLogsTab.tsx
frontend/src/pages/gantt/tabs/TodosTab.tsx
frontend/src/pages/gantt/tabs/ChangeOrdersTab.tsx
frontend/src/pages/gantt/tabs/SelectionsTab.tsx (also added useMemo to the React import)
frontend/src/pages/gantt/tabs/WarrantiesTab.tsx
frontend/src/pages/Files.tsx
frontend/src/store/dashboard.ts

Verified (user)

Daily Logs / Todos / Change Orders / Selections / Warranties tabs render
their empty state instead of crashing.
Counter badges on the tab strip increment when an entry is added.
Files page upload routes to the active project; switching active projects
scopes the Photos This Week count to the new project.
tsc --noEmit clean across the touched files.

Process notes

Two failed-paste regressions during the fix landing: in both cases the
// ... unchanged ... placeholder comments in the surgical patches were
pasted literally into the file, deleting the surrounding code those
comments were meant to preserve. Recovery in both cases was to issue the
full file as a copy-paste replacement instead of a diff. Lesson logged:
for any file that needs changes in more than one place, ship the full
file — diffs with placeholder comments are unsafe over mobile copy-paste.
A separate issue on Files.tsx had the user place
const activeProject = useProjectsListStore(selectActiveProject) at
module scope (above the imports, even) instead of inside the component
body. Babel surfaced it as a duplicate-identifier error, which pointed
at the import rather than the misplaced const. Surgical 3-step fix
resolved.

Still loose

Tier 2.3 — activity feed entries on uploads. Deferred. Pushing to
useAppStore.activityFeed from uploadDocument requires touching the
cross-store architecture (features ↔ index circular import risk).
Folding into the Tier 3 store-collapse instead of patching it twice.
Tier 3 — collapse the two stores. useFeatureStore and useAppStore
shouldn't both exist. The useFeatureStore.subscribe → useAppStore.setState
mirror is the smell. Plan: useFeatureStore becomes the single source of
truth for tasks, photos, documents, comments, progress history, and
activity feed; useAppStore demotes to UI-only state (currentUser /
currentProfile / isAuthenticated / selectedTask / notification); mirror
subscriber deleted; consumers updated to import from features. ~1–2 days
of refactor; every dashboard-sync bug should evaporate as a side effect.
Recent Activity card on Dashboard still doesn't reflect uploads —
blocked on Tier 2.3 / Tier 3.
Supabase backend not yet provisioned. The MVP roadmap's Day 0 —
create the Supabase project, wire .env.local, smoke-test one
select 1 — is the next concrete unblock for the rest of the plan.

---

## 2026-05-22 · Gantt nav + new-project seeding + demo-button removal + white-page-on-nav fix

In-app testing surfaced four overlapping defects on the Gantt page and TopNav surface. Plan file: `C:/Users/footlong/.claude/plans/in-gantt-page-the-purrfect-cray.md`. Approved by user, then executed in this session.

### What broke (symptoms the user reported)

1. "← All projects" button on the Gantt header → white page.
2. New project → Tasks tab shows empty state ("No tasks on … yet") instead of the 8 pre-seeded phase anchors.
3. The Projects page header still showed a "Generate demo project" button that's no longer part of the onboarding story.
4. Generic SPA nav (Dashboard → Projects → Gantt → etc.) frequently lands on a blank page that only a hard refresh clears. User confirmed this happens in **both `npm run dev` and Vercel-deployed builds**, ruling out *purely* stale chunk hashes as the sole cause.

### Root causes

- **#2** — Migration 15 (`15_create_project_seed_anchors.sql`) is **untracked in git** and has not been run against the remote Supabase DB. So new projects don't get their explicit `seed_phase_anchors()` call inside the `create_project_with_tasks` RPC, and the migration's bundled backfill never ran. The empty-state copy in `TasksTab.tsx` also still pointed users to the demo button.
- **#1, #4** — Every authenticated page is `lazy()`-loaded in `App.tsx`. When a dynamic-import promise rejects (stale chunk hash in prod, Vite dev-server hiccup in dev), `<Suspense fallback={RouteFallback}>` does not catch it — Suspense only handles the *pending* state, not rejection. React caches the rejection on the lazy component instance, so re-navigating to the same route fails immediately. The route-level `<ErrorBoundary key={location.pathname}>` does catch the error, but its `componentDidUpdate` resets when `label` changes, leaving the user perceiving a "stuck blank page until refresh."
- **Defensive layer** — Layout.tsx and Gantt.tsx both read `project.id` without a `?.` guard. The runtime value comes through `toLegacyProject(selectActiveProject(...))` and can briefly be a placeholder with no id (brand-new user, store mid-hydration). A bare `.id` access there throws and crashes the authenticated shell, which also reads as a white page.

### What landed in this session (code only — terminal step listed at the end)

**Removed the demo-project surface entirely**

- `frontend/src/pages/Projects.tsx` — deleted the "Generate demo project" button block (was lines 237-247), the `generateDemoProject` import, and the now-unused `Sparkles` icon import.
- `frontend/src/pages/projects/lib/generateDemoProject.ts` — file deleted. `git grep generateDemoProject frontend/src` now returns no matches.
- `frontend/src/pages/gantt/tabs/TasksTab.tsx:515` — empty-state copy rewritten. Was *"This project hasn't been seeded with the eight construction phases. Try Generate demo project from the Projects page, or create a one-off task."* Now *"This project's phase anchors haven't loaded yet. Refresh if this persists, or create a one-off task below."* Honest about the failure mode and stops pointing users at a button that no longer exists.

**lazy() retry + one-shot reload for the white-page-on-nav bug**

- `frontend/src/App.tsx` — wrapped every `lazy()` call (Dashboard, Gantt, Reports, Settings, Messages, Projects, Safety, Admin, BootstrapAdmin, Pricing, RoleHome, RoleHomeRedirect) in a new `lazyWithRetry` helper. The helper re-attempts the import once on rejection (covers transient dev-server / network blips silently) and, on second failure matching a chunk-error signature (`Failed to fetch dynamically imported module` / `Importing a module script failed` / `ChunkLoadError`), force-reloads the page once per session via a `sessionStorage` guard. An effect in `AppRoutes` clears the guard on every successful navigation, so a chunk-load failure later in the same session can still trigger one reload. Coverage: prod (stale chunk hashes after redeploy), dev (Vite HMR or fetch hiccup), and a fresh single failure mid-session.

**Defensive `project?.id` guards in the shell**

- `frontend/src/components/layout/Layout.tsx` — `activeProjectId` now coalesces `project?.id ?? null` instead of reading `project.id` raw; `useSafetyIncidentsCache` reuses the same coalesced value.
- `frontend/src/pages/Gantt.tsx` — introduced a top-level `const projectId = project?.id ?? '';` and replaced all 8 raw `project.id` references with it (filters, badge counts, useMemo deps). Above the main JSX return, added a no-active-project early return that renders a friendly "Pick a project from the list" empty state instead of letting downstream tabs crash on `project.name` / `project.startDate`.

### Verification

- TypeScript diagnostics on the four edited files showed only expected intermediate-state errors during the multi-step edits (e.g., `Sparkles` cannot be found *after* the import was removed but *before* the button block was removed). After all edits committed, `grep` for the deleted symbols returns no matches.
- Layout-level `useProjectTasksRealtime` already no-ops on a `null` projectId, so the new coalesce doesn't change behaviour when there's an active project — it only avoids the crash when there isn't one.

### Operator follow-up (terminal-only — Claude cannot do this)

The frontend-only deliverable in this session is complete. The DB side requires the user to run from their own PowerShell:

```powershell
cd backend
supabase db push
```

This applies migration 15 (and any other pending migrations including 16_project_members) to the remote Supabase project. The migration is idempotent — `seed_phase_anchors` uses a partial unique index, so re-seeding existing projects is a no-op. After it runs, this SQL in the dashboard editor should return zero rows:

```sql
select id, name from projects where id not in (
  select project_id from tasks where is_phase_anchor = true
);
```

Then commit both new migrations so the next deploy / pull doesn't lose them:

```powershell
git add backend/supabase/migrations/15_create_project_seed_anchors.sql backend/supabase/migrations/16_project_members.sql
```

### Files touched

**DELETED**
- `frontend/src/pages/projects/lib/generateDemoProject.ts`

**MODIFIED**
- `frontend/src/App.tsx` — `lazyWithRetry` helper + AppRoutes reload-flag-clearing effect.
- `frontend/src/components/layout/Layout.tsx` — `project?.id ?? null` coalesce.
- `frontend/src/pages/Gantt.tsx` — `projectId` coalesce + no-project empty state.
- `frontend/src/pages/Projects.tsx` — demo button + Sparkles + generateDemoProject import removed.
- `frontend/src/pages/gantt/tabs/TasksTab.tsx` — empty-state copy.

---

## 2026-05-26 · AI Analysis tab — production cleanup pass

User reported the AI Analysis tab on the "Test" project as "full of bugs that is somewhat broken." Photos were uploading but nothing landed in the review queue, plus a cluster of UI bugs compounded the broken feeling. Same session, user also confirmed the real Anthropic API key is now live and SiteProof is entering production state ASAP — so no demo-data tricks. Plan file: `C:/Users/footlong/.claude/plans/kindly-review-ai-analysis-tab-dreamy-brook.md`.

### Root cause story

The review queue filters strictly to `analysis_status='analysed' AND action_taken='pending'` (`aiAnalyses.ts:138-141`). When real Claude Vision runs on clear photos, most results land high-confidence and the Edge Function fires `decideAction` → `'auto_updated'` (schedule bumped, no review needed). Those photos never appear in the queue. The tab offered zero signal that the AI was processing anything at all — user uploads, sees four zeros, concludes "broken."

Migration 14 had already moved every existing `project_config` row off `'mvp-stub@v0'` onto `'claude-sonnet-4-6'`, so the "stub trap" theory the initial exploration agents floated didn't apply.

Verified non-issues (where the exploration agents over-flagged): the realtime `useEffect` dep array IS correct (`ReviewQueueTab.tsx:152`); the schema columns added by migration 02 are not a "CRITICAL" deploy risk; `subscribeToAllAnalyses` is intentionally unscoped (RLS + client-side hook filter handle it).

### What landed

**T1.1 — Recent-activity strip (centerpiece).** New 4-tile strip above the review queue showing `auto-applied / pending / skipped / failed` counts for the last 24h. Closes the "I uploaded photos and nothing happened" gap by surfacing the auto-applied path that bypasses the queue. New helper `getRecentAnalyses(projectId, { since, limit })` in `aiAnalyses.ts` — lightweight projection (id, photo_id, action_taken, analysis_status, confidence, analyzed_at, rationale) with the same `photos!inner(project_id)` join as the existing pending-queue query. Realtime UPDATE handler now also calls `refreshActivity()` so counts stay live.

**T1.2 — Real upload progress.** Donut was `DonutProgress current={0}` literal — static at 0 forever. Now tracks `uploadDone` state, increments per-file on resolution, caption reads `"Uploaded X of N photos…"`.

**T1.3 — Partial-success batch.** Sequential `for/await` aborted on first failure with no per-file feedback. Replaced with `Promise.allSettled` + per-file rejection summary (`"3 of 5 uploaded. Failures — foo.jpg: <reason>; bar.jpg: <reason>"`). Survivors still upload.

**T1.4 — Caption truth fix.** `"0.50 – 0.85 confidence"` → `"Items needing review"`. The old copy lied about safety-flagged rows ≥0.85, which `decideAction.ts:20` also routes to `'pending'`.

**T1.5 — Drawer thumbnail catch parity.** `PhotoReviewDrawer.tsx:59-65` had a `.then()` with no `.catch()` — any storage signing failure was an unhandled rejection. Now logs and falls through to the existing `ImageOff` fallback already in place at line 144-146.

**T1.6 — `phase_hint` end-to-end persistence.** Phase chips were "captured for UX only" per the in-file comment. Now they ride through `uploadPhoto({ phaseHint })` → new `photos.phase_hint` column (migration 17) → Postgres webhook envelope → `analyze-photo`'s `record.phase_hint` fallback → `buildUserPrompt(phaseHint)`. Audit log entry also records `phase_hint_provided` vs. `phase_detected` for prompt-accuracy retros. Uses the existing `construction_phase` enum from `00_init.sql:109` rather than re-declaring the values, so invalid writes are rejected at the DB. **Operational follow-up:** add `phase_hint` to the Supabase Dashboard's photos-INSERT webhook column allowlist or the column ships but never reaches the Edge Function — see Operator follow-up section below.

**T1.7 — Reject-with-notes textarea.** `PhotoReviewDrawer` previously called `rejectAnalysis(photo_id)` with no notes argument and no UI field. Added a 3-row 500-char textarea above the override slider; `handleReject` trims and threads `notes` through. Backend already wrote notes to audit (`confirm-analysis` Edge Function); the missing surface was UI-side only.

**Tests added (3 new test cases).** `aiAnalyses.test.ts` gains a `getRecentAnalyses` block: short-circuits non-UUID project ids, pins the `photos!inner` project filter + `analyzed_at desc` order + default-24h-window math (sanity-checked within 60s), threads explicit `{ since, limit }` through. New `photoReviewDrawer.test.tsx` covers the T1.7 reject-notes flow: trimmed string is threaded correctly; empty textarea passes `undefined`. ReviewQueueTab upload-progress and partial-batch tests deferred — better tested as e2e once Cypress is in place.

### Files touched

**NEW**
- `backend/supabase/migrations/17_photos_phase_hint.sql` — additive column + partial index using existing `construction_phase` enum.
- `frontend/src/__tests__/photoReviewDrawer.test.tsx` — reject-notes UI test.

**MODIFIED**
- `frontend/src/pages/gantt/tabs/ReviewQueueTab.tsx` — T1.1, T1.2, T1.3, T1.4, T1.6 (5 fixes in this file).
- `frontend/src/components/photos/PhotoReviewDrawer.tsx` — T1.5, T1.7.
- `frontend/src/lib/api/aiAnalyses.ts` — new `getRecentAnalyses()` + `RecentAnalysisRow` interface.
- `frontend/src/lib/api/photos.ts` — `phaseHint` in `UploadInput` + insert payload + `PhotoRow.phase_hint`.
- `backend/supabase/functions/analyze-photo/index.ts` — `record.phase_hint` payload widening, `resolvedPhaseHint` body+record fallback, `phase_hint_provided` audit field.
- `frontend/src/__tests__/aiAnalyses.test.ts` — `from()` mock added, `getRecentAnalyses` query-shape tests.

### Verification

- `npm run typecheck` clean across the whole frontend.
- `npm test` — 20 test files, 168 tests, all green. Includes the 3 new tests added in this pass.

### Operator follow-up (terminal-only — Claude cannot do this)

1. Apply migration 17 against the remote DB:
   ```powershell
   cd backend
   supabase db push
   ```
   Confirm with: `select column_name from information_schema.columns where table_name='photos' and column_name='phase_hint';`
2. In the Supabase Dashboard → Database → Webhooks → photos-INSERT, add `phase_hint` to the column allowlist. Without this step, the column lands but the Edge Function never sees it via the webhook path. (The frontend's direct `requestAnalysis(photoId, { phaseHint })` path still works either way.)
3. Deploy the Edge Function:
   ```powershell
   supabase functions deploy analyze-photo
   ```

### Process notes

The first exploration agent flagged the realtime `useEffect` as missing its dependency array (claiming a memory leak risk). Verified directly: the `[project.id]` array is at line 152, exactly where it should be — the agent contradicted itself between its code excerpt and its prose. A third agent flagged the migration ordering (00_init vs 02_phase_c_seam adding `analysis_status` / `rationale`) as "CRITICAL." Verified: the migrations are sequential and idempotent; this is only a risk if production is mid-migration. Trust-but-verify caught both before the plan was written.

### Still loose

- T2.1 — Concurrency cap on uploads (`pLimit(3)` wrap around the new `Promise.allSettled`). Only matters under large batches; defer.
- T2.2 — Deprecate the `mvp-stub@v0` code paths once production telemetry confirms no `project_config` row ever resolves to it. Stub stays in the tree as a smoke-test escape hatch until then.

## 2026-05-26 · Site Diary tab — demo-data removal + real CRUD + photo upload

### Why

The Site Diary tab shipped with 100% fixture data (`MOCK_TIMELINE`, `MOCK_DAY_ROLLUP`, `MOCK_CONDITIONS`, `MOCK_COMMON_WORKS`) — Marcus Holm, Jodie Reyes, "5 entries · 38.5h", a baked Sunday-funday weather chip, and so on. With production live since 2026-05-26 and a Sparky demo on the same day, the page needed to read real data from the existing `useGanttSideStore` diary slice, expose full CRUD, and not look broken when a project has no entries yet.

### What changed

**Types** (`frontend/src/pages/gantt/types.ts`)
- Extended `DiaryEntry` with four optional fields — `startTime`, `endTime`, `status` (`signed` | `pending` | `flagged`), `tags[]`. Optional so the legacy `DailyLog → DiaryEntry` migration keeps working untouched.

**Store** (`frontend/src/pages/gantt/store.ts`)
- `addDiaryEntry` now returns the new entry's id (mirrors `addOrder`). Required for the quick-add → drawer hand-off; no existing caller used the return value.
- Persist version bumped 2 → 3 so any rehydration triggers a defensive remigration. Migrate body unchanged — optional fields are absent on old rows, which renders correctly.

**New files**
- `sitediary/diaryRowMapper.ts` — single source of truth for `DiaryEntry → TimelineRow`. Exports `mapEntryToRow`, deterministic `colorIndexForWorker(workerId)` (hash → 1..5), and `isVisibleEntry()` (filters out the "conditions stub" entries described below).
- `sitediary/uploadDiaryPhoto.ts` — `uploadAndAttach({ file, projectId, entry, updateDiaryEntry })` factors the three photo paths (FAB / QuickAdd / drawer) through one call so the photos.ts UUID guard error surfaces consistently.
- `sitediary/DiaryEntryDrawer.tsx` (~480 lines) — create + edit + delete drawer modeled on `TaskDrawer.tsx`'s autosave-on-blur pattern. Uses `MotionDrawer`. Layout: header / description textarea / time + status row / primary worker block with hours input / additional personnel list with `+ Add person` mini-form / conditions row / tags with X-to-remove and a free-text input / photos pane with `uploadAndAttach` / footer with delete confirm (edit) or Cancel + Create (new). Removing the last personnel row is disabled.
- `sitediary/TimelinePhotoThumb.tsx` — async-resolving thumb. Queries `photos.storage_path` for a `photoId`, signs a URL via `getPhotoUrl`. `alive` flag protects against the date-switch unmount race.

**Refactored**
- `SiteDiaryTab.tsx` — full rewrite. Reads `useDiaryEntries(project.id)` + `usePunchItems(project.id)` from the store. Derives `rollup` (headcount via unique workerIds, hours summed across personnel, signedOffs, openPunchItems) and `usageByName` (7-day tag occurrences) in `useMemo`. Owns the drawer target state (`DiaryEntry | 'new' | null`), `pendingPhoto`, and `seedTags`. Two effects: (a) promote `drawerTarget` from `'new'` → the real entry once `pendingNewIdRef` lands in the store; (b) keep the drawer's `entry` prop fresh when the underlying entry mutates so the photos pane re-renders without reopen. Conditions write rule: patch the most recent entry on the date, or create a silent stub entry that `isVisibleEntry()` filters out everywhere it would otherwise inflate counts.
- `sitediary/ConditionsCard.tsx` — controlled; weather chip and click-to-edit temp input call `onChange` directly. `temperatureF: null` renders as `—`.
- `sitediary/DayRollupCard.tsx` — zeros render in muted grey (`text-[#A0A0A0]`); all five rows stay visible as their own empty-state hint.
- `sitediary/DayHeader.tsx` — replaced hardcoded "5 entries · 38.5h" with live `entryCount` + `hoursLogged` props. "New entry" button wired to `onNewEntry()`. Date chevrons + calendar popover left decorative (out of scope).
- `sitediary/ProgressBar.tsx` — hours/headcount real; day's progress, active zones, and cumulative % held as `—` with a TODO comment until the progression slice exposes a real signal.
- `sitediary/CommonWorksSection.tsx` — switched to constant `COMMON_WORKS` list with `usageByName` injected from the parent. `isFrequent = count >= 3`. `onPick(name)` either appends the tag to the open drawer entry or opens a new-entry drawer seeded with the tag.
- `sitediary/CommonWorkItem.tsx` — accepts `usageCount`, `isFrequent`, `onPick` as props; the orange "frequent" dot is now driven by real counts.
- `sitediary/TimelineCard.tsx` — switched from `MockTimelineEntry` to real `DiaryEntry`. New empty-state branch (zero entries + All filter): centered "No entries yet today" card with 3 CTAs — Log entry (focuses the QuickAddRow input via `forwardRef`), New entry (opens drawer), Ask Sparky (opens existing Sparky drawer). Filter fallback `(e.status ?? 'pending')` catches legacy entries with undefined status.
- `sitediary/TimelineEntry.tsx` — accepts a `TimelineRow`; entire row is a clickable `role="button"` that opens the drawer in edit mode. Multi-personnel adds a `+N more` chip. Photo thumbs come from `TimelinePhotoThumb`.
- `sitediary/QuickAddRow.tsx` — placeholder button → controlled `<input>` with Enter submit. Forwards a `focus()` handle via `forwardRef` so the empty-state CTA can grab focus.
- `sitediary/FabCamera.tsx` — now takes `onClick`. The tab owns the hidden file input + `pendingPhoto` hand-off.
- `sitediary/mockTimeline.ts` — stripped from a ~140-line demo fixture to just the `COMMON_WORKS` template list + `WORKER_COLORS` map.

### Architecture notes

- **One DiaryEntry = one timeline row.** `personnel[0]` is the primary worker shown on the row. Multi-personnel entries surface a "+N more" chip; hours total = sum across `personnel[].hours`.
- **Conditions persistence without a new slice.** Weather + temp piggy-back on `DiaryEntry.weather` / `temperatureF` of the most recent entry on the day. If no entry exists yet, a stub entry (`description: ''`, `personnel: []`, `photoIds: []`) is silently created. `isVisibleEntry()` filters stubs out of both the timeline and the rollup, so they never inflate headcount / hours.
- **Reference-stable empties.** Uses the existing `useDiaryEntries`/`usePunchItems` hooks that already return `EMPTY_DIARY` / `EMPTY_PUNCH` — no new selectors that would re-trigger the Daily Logs crash documented at `store.ts:642-655`.
- **Sparky drawer + `siteDiaryAssistant.ts` not touched** — already wired to real AI.

### Validation

- `npx tsc --noEmit` → exit 0.
- Vite dev server boots at http://localhost:5174/ — root returns 200, no Vite overlay errors in the predev log.
- Visual end-to-end walkthrough deferred to the user pre-meeting (empty state → quick-add → drawer edit → photo upload → Common Works pick → delete → refresh persistence).

### Still loose

- Sparky's `siteDiaryAssistant.ts` reads its own context — verify it pulls from the real store and not mock fallbacks. Out of scope for this pass; file a follow-up if needed.
- Date navigation (chevrons + Calendar popover) is decorative — `todays` filter is hardcoded to `today`. Wire date selection next pass.
- `flagged` status doesn't auto-create a `PunchItem`. The TimelineEntry badge reads "Punch item added" but no punch row is actually inserted. Stretch goal; defer.
- ProgressBar's "Day's progress" %, "Active zones", and cumulative % are still placeholders (`—` / 0%) until the progression slice provides real signals.
- `addDiaryPersonnel` patches the store; the drawer mirrors the change locally with a `pending-${ts}` id placeholder so the row appears immediately. The real id from the store replaces it on the next render. If a user mashes the Add button before the store re-render lands, the local mirror could drift — accepted for v1, watch for it in the meeting demo.

## 2026-05-26 (cont.) · Sparky-in-drawer, Drawings & Permits, Project Overview editorial pass, Uploads delete

### Why

Same-day continuation after the Site Diary CRUD landed. The Sparky drawer popup felt detached from the entry flow, the per-task surface had no place to attach reference docs, and the Project Overview was still on a different visual language than Site Diary / Tasks. Plus the Uploads tab had no way to delete a file once it landed in storage.

### Sparky — moved inline, scrapped the standalone drawer

- New [`sitediary/SparkyAssistModal.tsx`](frontend/src/pages/gantt/tabs/sitediary/SparkyAssistModal.tsx). Two-phase modal that opens over the New Entry drawer:
  - **Compose** — `AI ASSIST` chip + `Sparky` Fraunces title, beige greeting card `G'day, {lastName}. Ready when you are. Bullets, voice memo, or just paste what you've got.` (last whitespace token of `fullName`, so "myeonghun tester" → "tester"), textarea + ⌘/Ctrl+Enter shortcut.
  - **Reviewing** — `Proposed rewrite` heading, ORIGINAL (raw input) and PROPOSED (Sparky's draft) blocks, edit-toggleable proposed text, footer with Discard / Edit / Use this draft (matches the user's reference screenshot exactly).
- Real Claude only — calls `sendAssistantTurn()` directly. If `VITE_ENABLE_REAL_AI=false` or Supabase isn't configured, the modal switches to a `disabled` phase with a clear amber banner. No mock pill.
- Wired into `DiaryEntryDrawer` via an "Ask Sparky" pill button next to the Description label. `Use this draft` writes straight to the description field (and commits to the store in edit mode). Modal can also auto-open via a new `autoOpenSparky` prop — the empty-state "Ask Sparky" button on the timeline now opens the drawer with the modal pre-launched (one-shot via `autoOpenedRef`).
- `assistant/SparkyDrawer.tsx` no longer mounted from `SiteDiaryTab`. Dead in the tree; safe to delete later.

### Drawings & Permits — new TaskDrawingsPane, dual-mode

- New [`gantt/tabs/TaskDrawingsPane.tsx`](frontend/src/pages/gantt/tabs/TaskDrawingsPane.tsx). Two modes via optional `task` prop:
  - **Task-scoped** — mounted as a new "Drawings" sub-tab inside `TaskDrawer` alongside Details / Checklist / Photos. Lists drawings attached to this task; uploads carry `task_id`.
  - **Project-wide** — mounted at the top of `TasksTab` between the TabHeader and the filter chips. Lists drawings with `task_id IS NULL`; uploads attach to the project, not any specific task.
- Storage decision (per user choice) — reuse the existing `photos` table. Drawings are marked via `notes = '__drawing__'`; phase tag rides on the existing `phase_hint` column. No migration needed. Default phase on upload pulls from `task.phase`. The existing `PhotosPane` in `TaskDrawer` never re-queries Supabase, so drawings don't double-show.
- Card design — 3-up grid, phase-tinted preview block (Foundation green-tan, Framing pink, Electrical yellow, etc.), red `PDF` / blue `PNG` / green `JPG` badge, phase chip overlapping the bottom-left of the preview (click to retag inline), filename + size + date footer, more-options menu (Open / Change phase / Delete) with optimistic phase change + rollback on error.
- Add tile — dashed beige border, large upload icon tile, "Add a drawing" + PDF/PNG/JPG file-type chips. Accepts `.pdf,image/png,image/jpeg`.
- TasksTab title rewritten to `Schedule and drawings.` with matching subtitle (mirrors the user's reference screenshot).

### Project Overview — editorial palette pass

Rebuilt every card on the Overview so it shares the Site Diary's warm beige + Fraunces serif language. All within [`OverviewTab.tsx`](frontend/src/pages/gantt/tabs/OverviewTab.tsx) plus one extracted component:

- **KPI strip (4 tiles)** — vertical 3px accent bar on the left (`emerald` / `amber` / `red`; `slate` renders no bar so a clean "Open issues = 0" reads calm). 26px Fraunces number with optional smaller `%` unit, optional `↑ +32% wk` delta chip (green tint when positive, red rotated arrow when negative). Tasks switched from `slate` → `amber` accent.
- **Hero card** — `Schedule & progress` eyebrow + 22px Fraunces title that cycles `Progress trend.` / `Timeline view.` / `Calendar view.` Mode buttons rebuilt as a single segmented pill: `bg-[#FAF8F2]` outer pill, active button gets `bg-[#1A1A1A] text-white`. `TrendBody` now shows a green dot + `Last N datapoints · Feb 1 → Feb 28` on the left, big Fraunces `%` + delta chip on the right.
- **Finance card** — green DollarSign tile in header, 3 sub-rows on `#FAF8F2` cards (Cart / Truck / Receipt in white tiles with subtle border). 18px Fraunces primary number, uppercase label, muted secondary, per-row chevron. Invoices flip to red when `invoicesOverdue > 0`. "View all" routes to the merged `supplier` tab.
- **Task breakdown card** — orange CheckSquare tile, beige `#D6CDB7` progress bar that shows through when nothing's done, 5-status grid (Complete / In progress / Not started / Delayed / Blocked) with editorial palette dots, footer split: `{total} total tasks · {pct}% complete` on the left, big Fraunces `complete / total` on the right.
- **Watchlist card** — lavender Eye tile, 3 sub-rows with per-row tinted icon tiles (Punch list green, Warranties amber, Deadline blue). Big Fraunces number with smaller unit (`active`, `d`). Sub-line tone-coded — `• All clear` green-bold; expiring warranties amber; <14d deadline red.
- **Live activity card** — extracted to [`LiveActivityCard.tsx`](frontend/src/pages/gantt/tabs/LiveActivityCard.tsx). Pulsing emerald dot + Fraunces "Live activity" title + filter chips (All / Updates / Diary / Files). Events bucketed by local-date boundary (TODAY / YESTERDAY / N DAYS AGO / formatted date). New row design: 40px tinted avatar with 16px kind-badge in the bottom-right corner, colored action verb per kind (green/teal/amber/red/blue/brown), relative time subtitle.
- **Activity clustering** — within each day bucket, consecutive same-actor + same-kind events fold into one summary row above `CLUSTER_THRESHOLD = 2`. Row reads e.g. `myeonghun bulk-updated 11 tasks` with a `Show 11 updates ▾` toggle. Click anywhere to expand inline; nested rows render in compact 28px avatar + tighter padding mode. New `SUMMARY_VERB` and `KIND_NOUN` maps drive the headline.
- **Recent files** — lavender FileText tile, dashed-button empty state. The button **now uploads a real file** via `useFeatureStore.uploadDocument` (hidden `<input type="file" multiple>` picker, `accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx"`, category `other`, uploader name from `currentUser.fullName`). Busy label flips to `Uploading…`.
- **Recent notes** — initially built with an inline composer that posted task comments. User clarified — the card should surface Site Diary entries. Rewired to read `useDiaryEntries(project.id)` filtered through `isVisibleEntry` (skip conditions stubs), top 4 by `createdAt`. Each row shows the primary `personnel[0].workerName` + role + diary description + `site diary · MMM d` footer. "Write a note" links route to the `site_diary` tab so the proper full-feature drawer handles authoring. The old inline composer + task-comment dropdown + `addComment` plumbing were removed (along with `allComments` / `projectComments` / `Send` / `X` icons).
- **Sizing tightening pass** — after the first paint the cards felt heavy. Padding scaled down: KpiCell `p-4 → p-3.5`, header tiles `h-8 → h-7`, row icon tiles `h-10 → h-9`, row Fraunces `22px → 18px`, hero title `28px → 22px`, outer grid gaps `gap-4 → gap-3`. Live activity rows tightened too (avatar `44 → 40`, py `3.5 → 3`).

### Uploads tab — editorial restyle + per-item delete

Rewrote [`UploadsTab.tsx`](frontend/src/pages/gantt/tabs/UploadsTab.tsx) to match the rest of the editorial surfaces.

- **New dropzone** — same 12px rounded dashed `#D6CDB7` border on `#FAF8F2` bg as the Drawings & Permits "Add a drawing" tile. Large upload icon tile, copy + `JPG / PNG / HEIC / MP4 / MOV` file-type chips, green `Browse` CTA. Full drag-drop support — `dragOver` flips the wrapper to emerald, drop runs the same `handleFiles` path.
- **Gallery card** — editorial shell (12px border, `#E6E1D4`, subtle shadow), header tile + `{N} item(s)` subtitle. Hydration bumped 12 → 24 items.
- **Tile sizing & consistency** — every tile is `aspect-[4/3]` in an `overflow-hidden` wrapper with the media absolutely positioned at `inset-0 h-full w-full object-cover`. Mobile gets `grid-cols-2`, `sm:grid-cols-3`, `xl:grid-cols-4` (was `1 / 3 / 4` — felt cramped at 4-up on standard laptops). Subtle `group-hover:scale-[1.03]` zoom; `draggable={false}` on images to kill the ghost-drag image.
- **Video badge** — small dark pill with a Video icon in the top-left.
- **Delete action** — hover-revealed `Trash2` button in the top-right (always visible on mobile via `sm:opacity-0`). Click opens an in-tile confirm overlay (dark `#1A1A1A/85` backdrop, "Delete this file?" + Cancel / Delete red buttons). Confirm calls existing `deletePhoto(row)` helper from `photos.ts` (storage object first, then row — matches the RLS-safe order). Tile shows a "Deleting…" overlay during the round-trip; errors surface in the top banner. Each `PhotoTile` now carries the full `PhotoRow` so the delete call has the `storage_path` it needs.

### Verification

- `npx tsc --noEmit` clean across the changeset (only the unrelated `ReviewQueueTab.tsx` `UploadCloud` unused-import warning remains — that file was modified outside this session).
- Vite dev server stays up; no runtime regressions observed against the Test project's empty state.
- Visual walkthrough deferred to the user pre-meeting (Overview cards stack cleanly on Test project, Sparky modal opens from drawer, Drawings panel renders on TasksTab + per-task drawer, Uploads gallery shows uniform 4:3 tiles with delete-on-hover).

### Still loose

- The dead `assistant/` directory (`SparkyDrawer.tsx`, `AssistantView.tsx`, `ChatThread.tsx`, `ComposerBar.tsx`, `DraftCard.tsx`, `useAssistantChat.ts`, `parseDraftBlock.ts`, `useVoiceInput.ts`) is no longer referenced from any project surface. Safe to delete on the next housekeeping pass.
- `SparkyAssistModal` only supports one-shot turns — no follow-up question support like the old chat thread had. Acceptable for the rewrite-bullets-into-prose use case the modal is designed around; revisit if multi-turn is requested.
- Hero `Calendar` and `Timeline` modes still use the old Card/Body layout inside the new editorial wrapper — they look fine but the inner padding could be revisited.
- Recent files thumbnails are filenames only — no preview swatches yet. Out of scope for this pass; revisit when the project-files surface lands.
- The previous-session ReviewQueueTab unused-import warning (`UploadCloud`) is still present; not from this session but worth a 1-line cleanup commit on its own.

---

## 2026-05-26 — Sparky deployment fix + Site Diary v2 layout rebuild

### Sparky (`site-diary-assistant`) was DOA on first test

After the prior session built and committed the conversational drawer chat, the first end-to-end test from the browser returned `Assistant error: Failed to send a request to the Edge Function`. Two cascading root causes:

- **#1 — Edge Function never deployed.** `supabase functions list` returned `polish-text` + `analyze-photo` but not the new one. The frontend `supabase.functions.invoke('site-diary-assistant', ...)` failed at the fetch layer with `FunctionsFetchError` (not `FunctionsHttpError`), confirming the endpoint didn't exist server-side.
- **#2 — Deploy itself failed on a parse bomb.** `unexpected deploy status 400: Failed to bundle the function ... Expected ';', '}' or <eof> at .../sparkyPrompt.ts:44:4`. The implementer subagent's worked-examples preamble inside `STABLE_PROMPT` referenced markdown code-fence syntax using three literal backticks inside a backtick-delimited template literal, which terminated the string early. Fix: rephrase the offending line to "code fences" (no escaping needed). Commit `19eb9c9` — `fix(assistant): escape code-fence reference in sparkyPrompt template literal`.
- Once both were addressed, `supabase functions deploy site-diary-assistant` succeeded; the function is ACTIVE on project `lipvymxsaaktsoxshiyy` and the browser chat round-trips cleanly.
- Memory pin saved: scan long template literals for unescaped backticks before committing, since both the implementer self-review and the spec/quality reviewers missed it.

### Site Diary v2 — full page rebuild from a user-supplied HTML mockup

After the deployment fix, the user pivoted: Sparky should be a *popup writing assistant*, not a sub-view tab, and the whole Site Diary page should match a new HTML/CSS mockup they shared. Brainstormed via [`docs/superpowers/specs/2026-05-26-site-diary-redesign-design.md`](docs/superpowers/specs/2026-05-26-site-diary-redesign-design.md), planned via [`docs/superpowers/plans/2026-05-26-site-diary-redesign.md`](docs/superpowers/plans/2026-05-26-site-diary-redesign.md), executed via subagent-driven-development.

Four phases, five commits, 14 new component files:

- **Phase 1 — Tear down** (`8b82658`) — stripped `SiteDiaryTab.tsx` (1087 → 16 lines), removed the 5-pill sub-view strip (Today / Workers / Calendar / Punch / Sparky), removed the `SubView` type + `initialSubView` prop + `WorkersView` + `PunchView` import. Patched callers in [`Gantt.tsx`](frontend/src/pages/Gantt.tsx) (4 sites) so type-check stayed clean.
- **Phase 2 — Mock fixtures** (`3a6e418`) — added [`sitediary/mockTimeline.ts`](frontend/src/pages/gantt/tabs/sitediary/mockTimeline.ts) carrying five worker timeline entries (Marcus Holm / Jodie Reyes / Anil Patel / Sam Okafor / Dana Kowalski), 12 common-work templates across 5 categories, MOCK_DAY_ROLLUP and MOCK_CONDITIONS — pure data, no JSX.
- **Phase 3 — Layout + drawer** (`7709311` — 14 files / 849 insertions) — orchestrator [`SiteDiaryTab.tsx`](frontend/src/pages/gantt/tabs/SiteDiaryTab.tsx) + every child component. Two-column grid (`300px_1fr`): left aside ConditionsCard + DayRollupCard; right section DayHeader (date-tear + nav + Calendar btn + New entry btn) + ProgressBar + TimelineCard wrapping TimelineEntry x5 + QuickAddRow + slot for CommonWorksSection. FAB camera bottom-right via FabCamera. Sparky drawer ([`SparkyDrawer.tsx`](frontend/src/pages/gantt/tabs/assistant/SparkyDrawer.tsx)) slides in from the right via framer-motion spring; wraps the existing AssistantView chat (refactored to drop its outer Card wrapper since the drawer provides chrome). AssistantView's demo-mode branch flattened to a plain `<div>`. Triggered by a new SparkyCTACard at the bottom of Common Works — Esc / backdrop / X all close.
- **Phase 4 — Calendar popover** (`780bc82`) — [`CalendarPopover.tsx`](frontend/src/pages/gantt/tabs/sitediary/CalendarPopover.tsx) replacing the inert Calendar button in DayHeader with a stateful trigger. Month grid with per-day heatmap dots (4 levels, mocked), today shown with dashed-circle outline, Today + Jump-to-date actions; Esc / outside-click close.
- **Overview punch tile** (`9a474d3`) — removed the `onClick` deep link on the Punch WatchRow in OverviewTab so it no longer routes into a sub-view that no longer exists; tile still displays the open-item count.

Color fidelity to the user's mockup uses Tailwind arbitrary values throughout (`bg-[#F4F1E8]`, `text-[#246F47]`, etc.) since the palette doesn't map onto standard Tailwind colors and the project doesn't extend `tailwind.config.js`.

### Brainstormed (not yet built) — production cutover + old-style Sparky restoration

User then pivoted again: replace the mock timeline with real `useDiaryEntries` reads + add a real entry composer (modal sheet) + restore the OLD-style WritingAssistButton (Sparkles popover then 3 transforms then EditorialModal with side-by-side original/proposed + word-level diff) inside that composer. Delete the conversational drawer entirely along with the `site-diary-assistant` Edge Function. Spec drafted in this session but execution deferred to the next.

Worth flagging: parallel work seems to have introduced `SparkyAssistModal.tsx` and `DiaryEntryDrawer.tsx` (currently `??` untracked in git status) — those may already cover part of the production-cutover scope and the next implementation pass should reconcile rather than duplicate.

### Verification

- `npm run typecheck` clean after each phase.
- All 21 commits between `dc1256a..HEAD` (the v2-redesign + Sparky-deployment-fix span) compile cleanly.
- The conversational Sparky drawer opens, sends, receives, and the Apply-to-diary mechanic still writes via `addDiaryEntry` / `updateDiaryEntry` from the existing store — even though this is the surface that's about to be torn out in the next pass.
- Browser manual walkthrough handed back to the user pre-presentation; no follow-up bugs reported.

### Still loose (next-session pickup list)

- **Production data wiring** — the page still shows the 5 mock worker entries. Need to swap `MOCK_TIMELINE` → `useDiaryEntries(project.id)` and render one card per `DiaryEntry`. Hardcoded `MOCK_DAY_ROLLUP` and `MOCK_CONDITIONS` also need real-data wiring.
- **Entry composer modal** — `EntryComposerSheet.tsx` proposed in the spec but not built; possibly already covered by the existing untracked `SparkyAssistModal` / `DiaryEntryDrawer`. Verify before building from scratch.
- **Old-style Sparky restoration** — [`WritingAssistButton.tsx`](frontend/src/components/writingAssist/WritingAssistButton.tsx) is still on disk and fully functional; just needs to be re-mounted inside the new entry composer next to the description textarea. `polishText.ts` already routes to the deployed `polish-text` Edge Function — the mock fallback path inside `polishText.ts` should be removed per the production-state memory note.
- **Conversational drawer cleanup** — delete `frontend/src/pages/gantt/tabs/assistant/` (the whole directory), `lib/api/siteDiaryAssistant.ts`, the two related test files, the `site-diary-assistant/` Edge Function dir, and the three `_shared/` helpers (`renderDiarySnapshot.ts`, `sparkyPrompt.ts`, `extractDraftBlock.ts`); `supabase functions delete site-diary-assistant` to undeploy.
- **Status badges (Signed / Pending / Flagged) on timeline entries** — currently sourced from mock data, no schema support. Either add a status field to `DiaryEntry` or drop the badges in v3.
- **Calendar popover heatmap data** — currently a hardcoded `DEFAULT_HEATMAP`. Real wiring is small but deferred.
- **The 14 newly-modified-but-uncommitted sitediary files** in `git status` (parallel work, source unclear) — review before the v3 implementation pass to avoid clobbering changes.
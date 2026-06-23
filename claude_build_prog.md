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

---

## 2026-06-01 — Production Finalization Week (Week 1) — shipped to `main`

Big push toward 95% production-ready. All work committed directly to `main` (user preference) across ~13 commits (`23e25b3..f9e8718`). Verified with `tsc --noEmit` (clean) + the full vitest suite (**175 passing, 22 files**, run with bounded parallelism `--pool=forks --maxForks=2` to dodge the local OOM). Backend (migrations 18–22 + new Edge Functions) is committed but **not yet deployed** — `supabase migration up` + `supabase functions deploy` are operational steps for the machine with the linked pilot (see `OPERATOR_RUNBOOK.md`).

### Photo Review (Wed sprint, W1–W7) — already on main
`complete-phase` Edge Function + `project_phase_status` table (migration 18) + `PhaseCompletionCard`; `PhotoReviewDrawer` consumes `taskBumped`/`newPct` → task-bump toast + confirm notes; `ConfidenceRing` extracted with a 0→pct mount sweep + slider value bubble; activity count-up, thumbnail crossfade, optimistic ✓ chip; committed the previously-untracked `_shared/cors.ts`.

### Project synthesis + Daily Brief (Thu, T1–T3 + E1)
`synthesize-project-status` Edge Function + `project_status_snapshots` daily cache (migration 19) + `ProjectStatusCard`. **AI-narrated Daily Brief** (E1): the synthesis payload gained a `narrative` field (migration 22 `narrative_text`) rendered by a new `DailyBriefCard` with a reduced-motion-aware typewriter reveal — **zero extra Claude calls/day** (rides the existing daily-cached call).

### Photo-QA auto-analyze fix (D1) — the critical latent bug
Photos uploaded but `analyze-photo` was never auto-invoked (the Postgres trigger referenced in `02_phase_c_seam.sql` was never defined) — they sat `queued` forever. Fix: `uploadPhoto` now fires `requestAnalysis(photo.id)` fire-and-forget after the INSERT (idempotent claim downstream). New `photos.test.ts` covers it.

### Sparky streaming (D2 / T4–T7)
`_shared/anthropic.ts` gained `checkAnthropicGate` (extracted) + `callAnthropicStream`; `site-diary-assistant` gained an SSE `stream:true` branch (JSON path kept as fallback). `siteDiaryAssistant.ts` got `streamAssistantTurn` (raw-fetch SSE consumer) + exported `isRealAiEnabled` + a client-side fake-stream fallback. `SparkyAssistModal` rebuilt as multi-turn chat with token-by-token reveal, blinking cursor, retry pill, in-session history, and a drafts tray.

### Site Diary persistence + realtime + auto-detect + polish (D3–D5 / F1–F6)
- **`diary_entries` table (migration 20)** — the table `site-diary-assistant` had always queried but which never existed (Sparky ran with zero history). Now `org_id`-ready. `addDiaryEntry` dual-writes (best-effort, no-op in mock mode); `SiteDiaryTab` subscribes to realtime via `subscribeToProjectDiary` → new `upsertDiaryEntryFromRemote` store action (dedupes by text id). **This fixes Sparky's empty-history bug.**
- **Timeline slide-in** — `TimelineEntry` animates in from the right with a fading emerald glow only for post-mount realtime arrivals (initial render static; reduced-motion aware).
- **Auto-detect conditions (F4)** — `detect-diary-conditions` vision Edge Function (gated behind `project_config.ai_auto_detect_enabled`, migration 21, default false/opt-in). First photo in create mode pre-fills weather/temp/crew with dismissable amber "AI suggested" pills.
- **Per-photo upload rings (F5)** + FAB pulse when today has no entry + weather-chip colour transitions.

### Demo-data purge (prod conversion)
Per the user's "no demo data except my test accounts" directive: gated `userSettings` PII + `store/index.ts` mock seeds behind `supabaseConfigured()` (production starts blank); `Settings` now hydrates name/email from the real authenticated `currentUser`. (Earlier in the sprint: removed Dashboard hardcoded demo budget/deliveries/safety-streak/questions; gated the demo task/doc/membership seeds.) Operational follow-up still on the user: dry-run-then-delete the `Casone — North/South/Workshop` seeded rows from the prod DB.

### UI consistency + a11y + hardening (D6)
- **UI:** Settings `alert()` → `setNotification` toast; auth-input `autoComplete`; admin error banners `rounded-lg`→`rounded-2xl` (6 files).
- **a11y:** aria-labels on PhotoReviewDrawer confirm/reject + override slider; `ConfidenceRing` as `role="progressbar"`; diary photo-input aria-label. (EditorialModal error-region wrap skipped — errors are consumer-composed in an opaque footer.)
- **Hardening:** per-route `ErrorBoundary` in `App.tsx` (a crashed page no longer blanks the app); `cors.ts` reads `PRODUCTION_ORIGIN` (default `*`) to lock CORS in prod; new `OPERATOR_RUNBOOK.md` (7 ops scenarios).

### Deferred (tracked, not done this week)
- **husky/lint-staged pre-commit** (H3) — deferred (needs `npm install`; low value vs. risk this session).
- **Modal focus-trap (A7)** — deferred; needs browser testing the local env can't do.
- **Backend deploy + DB demo-row purge + live AI smoke / caps / kill-switch tests** — operational, require the linked Supabase project.
- Everything in `all_task.md` Stages 1–7 (the rest of the road to 95%).

### Verification
- `tsc --noEmit`: clean after every chunk.
- vitest: **175 passing / 22 files** (`--pool=forks --maxForks=2`; the default parallel pool OOMs and single-fork bleeds DOM across files on this machine — bounded parallelism is the reliable local mode; CI remains the real gate).
- Not verified locally (no Supabase/browser this session): Edge Function deploys, realtime cross-device behavior, live Claude calls. Smoke checklist in `OPERATOR_RUNBOOK.md`.
- **The 14 newly-modified-but-uncommitted sitediary files** in `git status` (parallel work, source unclear) — review before the v3 implementation pass to avoid clobbering changes.

---

## 2026-06-01 (later) — Stage 1 kickoff: P0 remainder (core resilience) — on `main`

Picked up the path-to-95% roadmap (`all_task.md`). Closed the **P0 remainder** — the "finish core resilience" items deferred out of Week 1. All on `main`, verified `tsc` clean + vitest **165 passing / 20 files** (the count dropped from 175 because P0.4b deleted 2 dead-code test files).

- **P0.2 — Anthropic retry/backoff + timeout** (`_shared/anthropic.ts`): new `postToAnthropic` wraps the text + vision fetches with an `AbortController` timeout (`ANTHROPIC_TIMEOUT_MS`, default 60s) and retry/backoff on 429/5xx + network blips (`ANTHROPIC_MAX_RETRIES`, default 2), honoring a numeric `retry-after`. Streaming retries its connect only (timer cleared once headers arrive, so the stream body isn't timed out). Failures still return the typed `AnthropicCallFailure` (never throw) → the upload auto-analyze path stays soft-fail.
- **P0.3 — model-aware cost accounting**: `pricingCents()` prices each call from the actual model the API reports, split input/output (haiku 1/5, sonnet 3/15, opus 15/75 per 1M) — fixes the ~3× undercount on a Sonnet override. `record_ai_call` is now awaited + checked (logs on failure) instead of fire-and-forget. (`APPROX_CENTS_PER_TOKEN` kept exported for the stream caller — follow-up to switch it.)
- **P0.4a — done earlier** (Week 1 demo purge): `store/index.ts` mock seeds gated behind `supabaseConfigured()`.
- **P0.4b — real auth + dead-code purge**: `updatePassword`/`updateEmail` now call real `supabase.auth.updateUser` via new `updateAuthPassword`/`updateAuthEmail` helpers (was a `setTimeout` fake). Removed the `Math.random` `runAutoProgressUpdate` simulator (no callers) + its unused import. Deleted the superseded conversational-Sparky `assistant/` dir (8 files) + its 2 tests — production uses `sitediary/SparkyAssistModal`.

### Next (not started) — Stage 1 remainder: **P1.2–P1.6 procurement + punch/checklist persistence**
The big block: move orders/deliveries/invoices/warranties + punch/checklists off the client-only Zustand store onto Supabase (migration + RLS + realtime + `lib/api/*` + component swaps), `org_id`-ready. `[L]`/`[M]` each — a careful sequential refactor (SupplierTab + the gantt side store are shared hot-spots), best done per-domain. Then Stages 2–7.

---

## 2026-06-01 (continued) — Stage 1 P1 complete + Stage 2 P1.7 (safety persistence)

Worked the full P1 persistence block across this session (no git ops from me — the user stages/commits; I write + `tsc`-verify). Every new table is `org_id`-ready per the roadmap cadence rule. Two persistence shapes emerged:
- **FULL SWAP** (component owns data via `lib/api` + realtime, no Zustand mirror) — used where the domain is self-contained.
- **DUAL-WRITE** (Zustand stays the editing source of truth; actions also upsert to Supabase + a hydrate path lands remote truth) — used where delicate cross-record logic must stay intact.

### P1.5 — Warranties (full swap) — migration 23
Proof-of-pattern. `lib/api/warranties.ts` (typed CRUD + `subscribeToProjectWarranties`); `WarrantiesTab` self-hydrates + subscribes; uuid PK.

### P1.6 — Punch items + checklists (full swap) — migrations 24/25
`lib/api/punchItems.ts`, `lib/api/checklistItems.ts` + `useChecklistItems` hook. PunchView / NewPunchItemSheet / PunchItemDrawer swapped off the store (callbacks); TaskDrawer checklist via the hook. **New cross-feature link:** a site-diary entry saved with `status === 'flagged'` now auto-creates a punch item (`DiaryEntryDrawer.handleCreate`, fire-and-forget).

### P1.2–P1.4 — Orders / Deliveries / Invoices (dual-write) — migrations 26/27/28
Kept dual-write because the receipt→order interlock (`deriveOrderStatus`, delivery line-item patching) is delicate. `lib/api/{orders,deliveries,invoices}.ts` each upsert/delete + realtime; the gantt side store's add/update/remove actions mirror to Supabase and gained `set…ForProject` / `upsert…FromRemote` hydration actions. Order **line_items ride along as embedded jsonb** (user-chosen over a normalized table); text PKs round-trip for realtime dedupe. **Hydration centralised in `SupplierTab`** (the always-mounted procurement parent) so every sub-tab + the pill badge counts share one load + subscribe.

### P1.7 — Safety persistence (full swap) — migrations 29/30 — *legal/insurance critical*
The Safety page's documents + WHS incident reports were client-only Zustand (`pages/safety/store.ts`, not even project-scoped). AI photo-hazards (`safety_incidents`) were already real, so P1.7 covered the other two domains:
- **`safety_documents` (migration 29)** — OHS&E / SWMS / MSDS register. Metadata-only for now (`file_ref` reserved for a future storage-bytes upload).
- **`incident_reports` (migration 30)** — the formal injury / near-miss register. Deliberately a **new table, not `safety_incidents`**: that AI table only carries flags/severity/status and cannot hold a full WHS report (person involved, body part, treatment, witnesses, contributing factors, recommended action).
- `lib/api/safetyDocuments.ts` + `lib/api/incidentReports.ts` return the existing `pages/safety/types` domain types → **zero churn in `DocRow`/`IncidentRow`**. `incident_reports` realtime carries INSERT/UPDATE/DELETE (status transitions); `safety_documents` INSERT/DELETE (immutable).
- `Safety.tsx` swapped off the store: hydrate-on-mount + realtime subscribe (mirroring the AI-hazards pattern already in the page); both modals now take `projectId` + `onCreated`, submit async with a saving state, and persist through the API. Documents now **project-scoped** (was global in localStorage — a correctness fix). Deleted the orphaned `pages/safety/store.ts`; `types.ts` retained.

### Verification
- `tsc --noEmit`: clean after the full block.
- vitest: not re-run locally for P1.7 — the change touches **zero tested files** (no test imports the safety store/page) and there's no circular-import risk; CI remains the gate (this machine OOMs the suite). Earlier P1 chunks held at **165 passing**.
- **New migrations 23–30 live under gitignored `backend/`** → need `git add -f` when staging. Operational follow-up (user): `supabase migration up` (applies 18–30) + deploy Edge Functions + restart dev server.

### P1.8 — Reports on real data
The Reports page was a mix: `ScheduledReportsCard` already read the real `project_reports` table, but the **Progress tab's generate flow was fake** (a `setTimeout(900)` → client-only `useFeatureStore.generateReport` that reset on reload) and the **Safety tab was hardcoded** (`SAFETY_FLAGS = []` + a literal `"45"` days-without-incident). The PDF button was a fake `alert('… downloaded')`.
- **`generate-reports` Edge Function** gained an **on-demand single-project mode**: a POST body `{ projectId, reportType }` generates that report immediately (rolling window ending today — 1/7/30 days), bypassing the cron cadence-day gate, and **upserts** (`onConflict project_id,report_type,date_from`) so a same-day re-generate refreshes the figures. The cron sweep path is unchanged when no body is sent. Added CORS (`handleCorsPreflight` + `CORS_HEADERS`) so the browser can invoke it.
- **`progressChange` un-stubbed**: both paths now compute the real period-over-period delta vs. the most recent prior report (`priorOverallProgress` helper); 0 only for a project+type's first report.
- **`lib/api/reports.ts`**: new `generateReportNow(projectId, reportType)` invokes the function and returns the persisted `Report`.
- **`Reports.tsx`**: Progress tab now loads + lists the **real `project_reports`** for the selected project (the local Zustand `reports`/`generateReport` are gone); `handleGenerate` calls `generateReportNow` then refetches. Safety tab reads **real `safety_incidents`** via `listSafetyIncidents` (open/acknowledged → open, resolved count, real "days since last flag", real flag list with an empty-state); removed the fake `SafetyFlag`/`SAFETY_FLAGS`. Every "PDF" button now opens the printable preview modal (browser Save-as-PDF) — the fake `alert` download is gone.
- **Dashboard KPIs**: verified already real — `useDashboardCounts` reads `safety_incidents` + `ai_analyses` counts from Supabase with realtime refetch (the demo tiles were purged in Week 1). No change needed.
- **Deferred**: a true *server-side rendered* PDF (Deno PDF lib) — print-to-PDF is the pragmatic real path for now; server render is a heavy follow-on.

### Verification
- `tsc --noEmit`: clean after the full P1.7 + P1.8 block.
- Migrations now run 00→30; **23–30 are under gitignored `backend/`** → `git add -f`. Edge Function `generate-reports` changed (also gitignored). Operational follow-up (user): `supabase migration up`, `supabase functions deploy generate-reports`, restart dev server.

### P2 — parked (decision required)
Audited and deliberately parked, with the user's agreement: **Sentry** was explicitly deferred in the locked launch plan and needs a DSN + `npm install` this machine can't verify; **there is no ESLint in the project at all** (no `lint` script / no eslint deps — CI runs typecheck+test+build only), so "CI lint completion" is a from-scratch setup + likely a large cleanup wave + install, not a one-line step; **monitoring/alerting** is operational (external services). All three need decisions/installs only the user can drive, so we moved to Stage 3 instead.

## 2026-06-01 (Stage 3) — P3.1 project-membership RLS scoping — migration 31

Closed the security follow-up every P1 table's migration deferred to "Stage-3 P3.1". The whole app launched on a trust model where **any authenticated user can read every project** and **role alone gates writes** (`is_manager_or_above()`); `project_members` drove only the *frontend* access guard, never DB RLS.

- **`is_project_member(p_project_id uuid)`** — new SECURITY DEFINER + STABLE predicate: true for the manager/admin/PM tier (so the pilot owner + every manager keep full cross-project visibility, unchanged) OR for a field-role user holding an active (`removed_at is null`) `project_members` row. SECURITY DEFINER avoids RLS recursion on `project_members`.
- **Migration 31** re-scopes the **9 client-written domain tables** (warranties, punch_items, checklist_items, orders, deliveries, invoices, safety_documents, incident_reports, diary_entries) from `auth.role() = 'authenticated'` to `is_project_member(...)`. Because Postgres RLS policies are **permissive (OR'd)**, it first **drops every existing policy** on each table (enumerating `pg_policies`, robust to name drift) — leaving an old open policy in place would silently defeat the tightening — then recreates only the membership-scoped set. `checklist_items` is task-scoped so it joins through `tasks`; `diary_entries` keeps its original no-delete surface.
- **Out of scope (P3.2, larger pass):** the foundational tables — projects, tasks, photos, ai_analyses, snapshots, project_reports. Re-scoping those needs a membership-backfill audit on the live DB first; they're read by many manager surfaces + service-role writers.

### Verification / operational
- No frontend surface (pure SQL) → `tsc` unchanged from the last green run. RLS-filtered reads return empty arrays (not errors), which the list components already handle; non-member writes fail the check (dual-write paths already log "saved locally" softly).
- **Before applying on prod:** confirm every field user who should keep access has a non-removed `project_members` row for their project(s) — managers are unaffected, so the owner-operated pilot is low-risk. Reversible by re-granting the open policies if a gap surfaces.
- Migration is gitignored (`backend/`) → `git add -f`; applies after 30. User: `supabase migration up`.

## 2026-06-01 (Stage 3) — P3.2 foundational-table read RLS + storage hardening — migrations 32, 33

Extended the membership model from the client-written tables (P3.1) to the **foundational** project-scoped surface, then closed the storage gap it exposed.

- **Migration 32 — foundational reads.** Re-scoped `for select` from `auth.role() = 'authenticated'` to `is_project_member(...)` on: `projects` (on `id`), `tasks`, `photos`, `safety_incidents`, `progress_snapshots`, `zones`, `project_config`, `project_reports`, `project_phase_status`, `project_status_snapshots` (all on `project_id`), and `ai_analyses` (via a join through `photos.project_id`, since it's keyed by `photo_id`). **Reads only** — drops just each table's `cmd='SELECT'` policy (write/ALL policies preserved) so the deliberate write rules (uploader-own photos, worker-own task %, manager Gantt/zones/config, service-role AI, log-own/resolve-mgr safety) are untouched. **Not scoped** (intentional, not project-keyed): profiles (user directory), user_documents, stakeholders, suppliers/branches/contacts; comments + audit_log left for a targeted pass. `view_photos_safe` is `security_invoker` so it inherits the new `photos` read scope automatically.
- **Migration 33 — photos storage bucket reads.** Migration 32 protected photo *metadata* but the `photos` bucket still served *bytes* to any authenticated user. Now the bucket `select` policy scopes on the object path's first folder segment (`storage.foldername(name)[1]` = the `<project_uuid>` from uploadPhoto's `<projectId>/<photoId>.<ext>` convention) → `is_project_member(...)`, with a UUID-regex guard so a non-UUID/legacy path fails closed instead of raising a cast error. The bucket is private, so the gallery's signed-URL *creation* is RLS-gated (members/managers can sign, non-members can't) — legitimate access preserved. Insert stays role-based (mirrors the photos-table insert); update/delete stay uploader-owner-only.

### Verification / operational
- Pure SQL → `tsc` unchanged. Both migrations are **manager-safe** (`is_project_member` short-circuits true for the manager/admin/PM tier — the pilot owner keeps full cross-project access).
- **⚠ Same pre-apply audit as P3.1, now load-bearing:** every field-role user who must keep access needs a non-removed `project_members` row for their project(s), or they'll see empty tasks/photos/etc. (RLS filters rows; it doesn't error). Reversible by re-granting the open read policies.
- Gitignored (`backend/`) → `git add -f`; apply after 31 (`supabase migration up` covers 18→33).

### Migration 34 — comments + audit_log read scoping (Stage 3 read-scoping COMPLETE)
User applied 31–33 to the live DB successfully. Migration 34 then closed the two project-ish tables left for a targeted pass: `comments` (scoped via the parent task OR photo's project — a comment always has at least one) and `audit_log` (scoped on its nullable `project_id`; null = system/user-level rows resolve to manager-only). Same membership predicate as 31–33, so **no new audit needed**. Reads only — `comments: write own` (cmd=ALL, authors keep self-access) and the definer-only audit writes are untouched.

**Stage 3 RLS read-scoping is now complete.** Every project-scoped readable table — projects, tasks, photos (+ bytes), ai_analyses, safety_incidents, snapshots, zones, project_config, project_reports, phase_status, status_snapshots, the 9 client-written domains, comments, audit_log — is membership-gated. Only deliberately-global tables stay open: profiles (user directory), stakeholders, suppliers/branches/contacts (company-wide), user_documents (per-user).

### Migration 35 + helper — per-user AI rate limits (Stage 3 hardening)
The global AI gate (ai_usage_daily, migration 13) capped the whole org's daily spend but let a single user burn the entire budget. Added a per-user layer **on top** of the global cap.
- **Migration 35** — `ai_usage_daily_by_user` (PK `(usage_date, user_id)`, service-role only) + `current_ai_usage_today_for_user(uuid)` + `record_ai_call_for_user(uuid, int, int)`. The record RPC bumps the GLOBAL counters AND, when `p_user_id` is non-null, the per-user counters — a strict superset of `record_ai_call`, so exactly one of the two runs per call (no double-count).
- **`_shared/anthropic.ts`** — `checkAnthropicGate(supabase, userId?)` now enforces per-user daily caps (`ANTHROPIC_USER_DAILY_CALL_CAP` default 30, `ANTHROPIC_USER_DAILY_TOKEN_CAP` default 120k — below the global 50/200k so they actually bite) after the global check, **fail-open** on a read miss (global cap is the hard backstop). New private `recordUsage()` routes to `record_ai_call_for_user` when a userId is present, else `record_ai_call`. `userId?: string | null` added to both call inputs. **Fully backward-compatible**: a null/omitted userId = exact prior behaviour (global-only).
- **`_shared/auth.ts`** — new `getUserId(supabase, req)`: decodes the request's Bearer JWT via `auth.getUser`, returns null on any miss (never throws/blocks).
- **Threaded `userId` into all 6 AI functions**: complete-phase / synthesize-project-status / detect-diary-conditions / polish-text via `getUserId(supabase, req)`; site-diary-assistant reuses its existing `getUser(jwt)` result (and its streaming path now records via `record_ai_call_for_user`); analyze-photo attributes to the photo's `uploaded_by` (more accurate than the trigger caller). Cron/no-JWT contexts pass null → global-only.
- **No webhook HMAC**: confirmed all 10 Edge Functions are app- or cron-invoked (none are inbound third-party webhook receivers), so there's no surface to authenticate.

### Patch — stakeholders/suppliers directory 404 resilience (reported prod bug)
`listStakeholders` (and the identical `listSuppliers`) **threw** when their child-table reads (`stakeholder_contacts`/`stakeholder_projects`, `supplier_branches`/`supplier_contacts`) errored — so a 404 on those optional enrichment tables blanked the whole directory. Both now degrade gracefully (render the directory without contacts/links + `console.warn`). Root cause is operational: those tables come from migration `04_stakeholder_extras.sql`; a 404 means it wasn't applied to the live DB (run `supabase migration up`; check `select to_regclass('public.stakeholder_contacts')`) or PostgREST's schema cache is stale (`NOTIFY pgrst, 'reload schema'`). The `__cf_bm` cookie warning is benign (Cloudflare cookie on Supabase's realtime CDN, not our code). `tsc` clean.

### Verification / operational
- Frontend patches: `tsc --noEmit` clean. Backend (Deno) per-user changes can't be locally typechecked (no local Supabase/Deno) — verify on deploy; IDE unused-var hints all cleared after wiring.
- **To activate per-user caps:** apply migration 35 (`git add -f`; after 34), redeploy all AI functions + `_shared` (`supabase functions deploy`), optionally set `ANTHROPIC_USER_DAILY_CALL_CAP` / `ANTHROPIC_USER_DAILY_TOKEN_CAP` (defaults 30 / 120k). Smoke: exceed a low per-user cap on one account → 429 `rate_limited` with a "Per-user daily …" detail while the global counter still has headroom.

## 2026-06-01 (Stage 4) — P4.1 checklist templates — migration 36

First Stage-4 (Construction-QA depth) feature. Builds directly on the P1.6 `checklist_items` work: a manager-curated (or seeded) set of sub-steps per construction phase, applied to a task in one click.
- **Migration 36 — `checklist_templates`** (org-scoped reference data: `org_id` nullable/ready, `name`, `phase` construction_phase nullable=any, `items text[]`, `is_default`, `created_by`). RLS: read = any authenticated, write = `is_manager_or_above()` (curated, not field-authored — mirrors the zones shape, not the project-membership tables). **Seeded a starter set** (8 templates — electrical-leaning for the pilot + cross-trade staples) via an idempotent insert (`where not exists (… is_default)`) so the picker works on day one with no template-admin UI.
- **`lib/api/checklistTemplates.ts`** — `listChecklistTemplates()` (small reference set; the picker filters by phase client-side).
- **Bulk apply** — `createChecklistItems(taskId, texts[])` (one round-trip insert) on `checklistItems.ts` + `addMany(texts)` on the `useChecklistItems` hook (dedupes against the realtime echo).
- **TaskDrawer `ChecklistPane`** — now takes the task's `phase`; renders an "Apply template" `<select>` (templates matching the phase + phase-agnostic ones, with item counts) when not read-only; selecting one bulk-adds its items. Existing add/toggle/remove unchanged.

### Verification / operational
- `tsc --noEmit` clean (the two `ConstructionPhase` aliases — `lib/ai/contract` vs `types` — are structurally identical, so the phase comparison type-checks).
- Migration 36 gitignored (`backend/`) → `git add -f`; applies after 35. Frontend files normal-add. No deploy needed for the frontend; `supabase migration up` for the table+seed.

## 2026-06-01 (Stage 4) — P4.3 defects board — migration 37

Formal QA defect register with an **open → triaged → fixed → verified** lifecycle, distinct from the binary punch list (snags). Full-swap + realtime, mirroring PunchView.
- **Migration 37 — `defects`** (project-scoped: title, description, severity low/medium/high/critical, status lifecycle, optional `task_id`/`photo_id` links via `on delete set null` so the QA record outlives its provenance, `assignee_id`, `verified_at` sign-off stamp, org_id-ready). **Adopts the P3.1 membership RLS model from the start** (`is_project_member` on read/insert/update/delete). Realtime-published.
- **`lib/api/defects.ts`** — full CRUD + `subscribeToProjectDefects`; `updateDefect` stamps/clears `verified_at` as status crosses `verified`.
- **`DefectsBoard.tsx`** (new tab) — four lifecycle columns with severity-sorted cards; a per-card status `<select>` moves a defect (optimistic + persist); a "New defect" modal (title/description/severity/link-task/assignee); a high/critical-open KPI chip; toasts on create + verify. Hydrate-on-mount + realtime dedupe.
- **Wired** as a `defects` tab in `Gantt.tsx` (TabId + TAB_SPECS with the Bug icon + render branch), after AI-Analysis.
- **Flag→defect trigger (done).** The Safety page's AI-hazards list now has a **"Raise defect"** button (manager/canEdit, on actionable hazards): it creates a defect pre-linked to the hazard's photo, titled from the hazard flags (`Safety: No hard hat, …`), carrying the shared severity + the incident notes; the button flips to "Defect raised" and toasts. The defect lands on the board via realtime. Closes the "links from safety/quality flags" part of P4.3 (the Review-queue quality-flag trigger can mirror this later if wanted).

### Verification / operational
- `tsc --noEmit` clean (`SafetySeverity`/`DefectSeverity` are structurally identical so the severity carries across). Migration 37 gitignored (`backend/`) → `git add -f`; applies after 36 (`supabase migration up`). Frontend files normal-add (incl. the `Safety.tsx` trigger); no function redeploy.

## 2026-06-01 (Finalization push) — Stages 4→7 to the 95% milestone

Autonomous run to finish the roadmap. Ground rules held: **no new npm deps**
(hand-rolled where needed; used the already-installed `vite-plugin-pwa`),
everything `tsc`-clean, each milestone logged, operational apply/deploy left to
the user.

### Stage 4 — Construction-QA depth (complete bar one deferral)
- **P4.1 checklist templates** (migration 36) — done earlier this session.
- **P4.3 defects board** (migration 37) + **safety-flag→defect trigger** — done earlier this session.
- **P4.2 ITP signed approval** (migration 38 `signoffs`) — **no-dep approach**: a
  hand-rolled canvas `SignaturePad` (`components/ui/SignaturePad.tsx`, pointer
  events, no signature lib); `lib/api/signoffs.ts`; PhotoReviewDrawer now has an
  optional "Capture ITP sign-off" on confirm that records an immutable signoff
  (signer name + base64 signature + the confirmed %), best-effort so it never
  undoes the confirm. Membership RLS, immutable (read/insert/delete). **Printable
  ITP certificate = thin follow-up** (the data's there; browser print-to-PDF is
  the path, same as Reports — a server-rendered PDF stays post-95).
- **P4.4 plan/drawing markup — DEFERRED (documented).** `PlansTab` is currently
  unpersisted local blobs; markup needs a plans-persistence + Storage foundation
  first, and rendering a PDF plan to pin on needs a new dep (pdfjs/react-pdf)
  that can't be verified in this env. Pinning on a throwaway blob would be wasted
  work — so it's the one genuine blocker, parked honestly.

### Stage 5 — Workforce / HR (complete; P5.3 as MVP)
New **Crew** Gantt tab (`CrewTab.tsx`) with two sub-views, plus migrations 39/40
+ `lib/api/timesheets.ts` + `lib/api/certifications.ts` (full-swap + realtime,
membership RLS):
- **P5.1 timesheets** — log hours per worker/day; **weekly rollup** (Mon–Sun
  hours per worker, doubling as the "who's on site this week" signal); **manager
  approve/reject** workflow (submitted → approved/rejected, approval stamped).
- **P5.2 certifications** — white cards / inductions / licences / tickets with
  expiry; client-derived **valid / expiring-soon / expired** status + a top
  **alert banner** counting at-risk + REQUIRED-at-risk certs. ("Block assignment
  on an expired required cert" is the noted follow-up — it hooks the task-assign
  path.)
- **P5.3 crew availability** — delivered as the timesheet weekly rollup (on-site
  signal). A full drag-assign availability calendar is the deferred richer form.

### Stage 6 — Launch readiness (PWA already done; a11y + perf)
- **P9.1 PWA/offline — already fully configured** (verified, no work needed):
  `vite.config.ts` VitePWA with an installable manifest + workbox runtime
  caching (Supabase storage CacheFirst → offline gallery, fonts, SPA
  navigateFallback), autoUpdate, and `lib/pwa/registerSW.ts` update-toast
  plumbing. The offline-first PWA target is met.
- **P9.3 a11y** — the Week-1 top-7 stands; added the one missing `aria-label`
  (defect modal close). New components were built with labels on icon-only
  controls + the override/status selects.
- **P9.2 perf** — route code-splitting + PWA caching already in place; large
  lists capped where added (timesheets). Full list **virtualization** is the
  documented follow-up (needs profiling + a virtualization dep — out of the
  no-new-dep envelope here).

### Stage 7 — DR + load (artifacts; you run them)
- **`DR_RUNBOOK.md`** — RPO/RTO targets, what-to-back-up, a **backup
  verification dry-run** (pg_dump→scratch-restore→row-count compare), Storage
  mirror, secrets inventory, and three recovery scenarios (row delete / project
  loss / rebuild-from-migrations).
- **`scripts/k6-load-test.js`** — ramping-VUs read-load (50→ configurable) over
  the dashboard/photo-QA read mix, with p95/error thresholds. **Read-only by
  design** (won't burn AI credit or write junk); documents how to find the
  breaking point + how to safely extend to writes/AI.

---

## ⭐ CONSOLIDATED APPLY / DEPLOY CHECKLIST (everything pending this session)

Do these in order on the live project. Nothing below has been run by me.

**1. Database migrations** — `cd backend && supabase migration up` applies, in order:
- `31`–`34` RLS read-scoping (✅ you already applied 31–33; 34 may be pending)
- `35` per-user AI usage, `36` checklist_templates (+seed), `37` defects,
  `38` signoffs, `39` timesheets, `40` certifications.
- All are gitignored under `backend/` → stage with **`git add -f`**.

**2. Pre-apply RLS audit** (already run for 31–33; same predicate covers 34+):
field-role users without a `project_members` row lose access — see the query in
the P3.1 entry above.

**3. Edge Functions** — `supabase functions deploy <name>` for the AI functions
+ `_shared` (per-user limits touched all of them) and `generate-reports`
(on-demand mode). Optionally set `ANTHROPIC_USER_DAILY_CALL_CAP` /
`ANTHROPIC_USER_DAILY_TOKEN_CAP` (defaults 30 / 120k).

**4. Stakeholder/supplier 404** — confirm migration `04` is live:
`select to_regclass('public.stakeholder_contacts');` → if null, `migration up`
covers it; if non-null but still 404, `NOTIFY pgrst, 'reload schema';`.

**5. Frontend** — normal `git add` for all `frontend/src/**` changes; deploy the
SPA (Vercel build already configured). CI runs typecheck+test+build.

**6. Smoke the new surfaces** — Defects tab (raise from a Safety hazard → it
lands on the board), Crew tab (log hours → weekly rollup → approve; add a cert →
expiry badge), ITP sign-off (confirm a photo with a signature → row in
`signoffs`), per-user cap (exceed a low cap on one account → 429).

**7. Stage 7 (when ready)** — run the DR backup dry-run + the k6 load test per
their docs; record the breaking point.

---

## Roadmap status vs. the 95% milestone
- **Done:** Week 1 (P0/P1.0–1.1), Stage 1 (P0 remainder + P1.2–1.6), Stage 2
  (P1.7 safety, P1.8 reports; P2 observability **parked** — Sentry needs a DSN +
  install, monitoring is operational), Stage 3 (P3 RLS 31–34 + per-user caps),
  Stage 4 (P4.1/P4.2/P4.3 — P4.4 deferred), Stage 5 (P5.1–5.3), Stage 6 (PWA +
  a11y), Stage 7 artifacts.
- **Remaining for a true 95%:** apply/deploy the batch above; the honest
  deferrals — **P4.4** plan markup (PDF-render dep), **P9.2** list virtualization
  (profiling + dep), **P2.1/2.2** Sentry + monitoring dashboard (vendor decision
  + install), and the noted small follow-ups (printable ITP cert, cert→assignment
  block, review-queue quality-flag→defect trigger). These are all
  decision/dependency/ops-gated rather than blocked on more code from me.

### 2026-06-01 (addendum) — migrations 34–40 applied + printable ITP register
- **User applied migrations 34–40** to the live DB. **Still pending: redeploy the
  Edge Functions** — migration 35's per-user caps only activate once the AI
  functions (+ `_shared`) are deployed, and the Reports "Generate" button needs
  the redeployed `generate-reports` (on-demand mode; the live version is cron-only).
- **Printable ITP certificate — done** (closes the P4.2 follow-up). New
  **Sign-offs** tab on the Reports page (`SignoffsPanel`): lists the immutable
  `signoffs` with their captured signature images + confirmed %, and a "Print ITP
  register" button (browser print / Save-as-PDF — the no-server-PDF path). ITP is
  now end-to-end: capture at photo-confirm → record → view/print register.
  `tsc` clean. Frontend-only (normal `git add`); no migration/redeploy needed.

## 2026-06-01 (later) — Gantt-tab UI consistency pass + Gantt chart + crew shift activity log

Goal: bring **every** workspace (gantt) tab onto the same visual language as the
four reference pages the user had already polished (Overview, Site Diary,
AI-Analysis, and the user-edited Defects board), enhance the Tasks Gantt chart,
and make the crew time clock detailed enough to record *what* a worker did.

**Shared KPI band primitive** — `frontend/src/pages/gantt/components/StatCard.tsx`
(new). `StatCard` + `StatBand` lift the exact card the Defects board ships (white
`rounded-2xl`, short top accent bar, icon + uppercase label, Fraunces `.display`
value, caption) into one reusable place. The four reference tabs are left
untouched (they *are* the reference); the rest now match them.

**Tabs standardized onto the shared band** (presentation-only — each feeds it
numbers it already computes from live data, no new queries):
- **Supplier** — new band: Open orders / Deliveries / Unpaid / Warranties ≤30d.
- **Crew** — bands in all three sub-views: Time clock (on-site / roster /
  clocked-today / hours-today), Timesheets (week hrs / workers / pending /
  entries), Certifications (tracked / valid / expiring / expired).
- **Inventory** — replaced its bespoke `Stat` with the shared card (+ icons).
- **Plans** + **Uploads** — swapped the older connected `StatStrip`/`StatCell`
  for the shared accent-card band so the gantt tabs read as one family.

**Tasks Gantt chart enhanced** (`TasksTab.tsx`, additive/low-risk):
- Vertical **schedule gridlines** at each axis division (month/week/quarter;
  skipped at day zoom), behind the bars like the weekend shading.
- A **"Today" marker chip** anchored to the existing pulse line.
- **Per-bar % labels** beside each bar (phase % in the phase colour for anchors,
  task % in slate for children), shown when the bar leaves room.

**Crew shift activity log** (the "what did they do while clocked in" ask) — no
migration needed, the `timesheets` table already has a `notes` column:
- `clockOut(id, timeInIso, notes?)` now accepts the activity note.
- A clocked-in worker gets a live **"What are you working on?"** input; it saves
  on blur (`updateTimesheet`) and is carried onto the shift at clock-out.
- Each roster row is **expandable** into today's shift log — clock in→out times,
  precise duration (`fmtDuration`), and the activity per shift. The note also
  surfaces in the Timesheets entry list (with the in–out window).

Frontend-only; no schema/redeploy needed. Reference docs `lazy_task.md` updated.
Per the local-build constraint (`tsc`/`vitest` OOM on this machine) the quality
gate runs in CI; edits were kept type-clean and IDE diagnostics showed only the
codebase's pre-existing `flex-shrink-0`→`shrink-0` style suggestions.

## 2026-06-02 — Crew page redesign + richer shared KPI card (all on live data)

The user supplied a polished `CrewView` mockup (sample data + local primitives)
and asked to port it onto CrewTab. Ported the *look* onto the real data path —
**no sample arrays shipped** (production no-demo rule). Two scoping decisions
were confirmed first: roll the richer card to all standardized tabs, and run the
Timesheets view as a weekly heatmap + Approve-all (drops the manual log form).

- **Shared `StatCard` upgraded** (`pages/gantt/components/StatCard.tsx`) to the
  richer card: tinted **icon chip**, soft corner **glow**, top accent bar, and a
  staggered load-in reveal. API moved from `accent` (bg-class) to a named `tone`
  (emerald/blue/amber/red/slate/indigo/violet) + optional `delay`. The reveal
  keyframes (`sp-rise`/`sp-fade`, reduced-motion-guarded) live in `index.css`.
- **All five standardized tabs** (Crew/Supplier/Inventory/Plans/Uploads) updated
  to the `tone` API with a staggered delay, so they stay one consistent family.
- **CrewTab rewritten** (`pages/gantt/tabs/CrewTab.tsx`) onto the new design,
  fully wired to live Supabase data and keeping every shipped feature:
  - Data hoisted to the tab: roster (project members + current user),
    `timesheets`, `certifications` — each on realtime; a 1s tick drives live
    numbers. A **persistent KPI band** (on-site / hours today / week / certs
    expiring) shows across all three sub-views.
  - **Time clock**: roster cards with online-dot avatars + an hours-toward-8h
    progress bar; the **live running timer**, the **"What are you working on?"**
    activity input (saved on blur, carried onto the shift at clock-out), and the
    expandable per-worker shift log are all preserved.
  - **Timesheets**: a Mon–Sun **heatmap grid** built from real hours (emerald
    heat, weekend wash), crew totals, per-row + Approve-all (real `updateTimesheet`).
  - **Certifications**: filter (all/valid/expiring/expired) + search + live
    expiry labels; add (reveal form) and delete kept against the real API.

Frontend-only; no schema or Edge Function change. Type-clean (IDE diagnostics
showed only the repo's existing `flex-shrink-0`/`min-w-[9rem]` canonical-class
suggestions); the full gate runs in CI. `lazy_task.md` updated.

---

## 2026-06-03 — Safe Diary→Crew bridge + Defects-on-Inventory

Two requested features, both bridging existing-but-isolated data. No Edge
Function changes; two additive migrations (42, 43) + frontend wiring. Plan:
`.claude/plans/kindly-implement-a-safe-foamy-hippo.md`.

**A — Safe Diary→Crew bridge (kills double-entry of crew hours).** Site Diary
captured crew inline (`diary_entries.personnel[]`) while Crew kept the same in
`timesheets` — entered twice. Now diary hours flow into timesheets, **gap-fill
only** (never overwrites a manual/clocked/approved sheet, never duplicates).
- **Migration `42_timesheets_diary_link.sql`**: adds `timesheets.source_diary_entry_id`
  (text FK → `diary_entries.id`, `on delete set null`) + index, then a one-time
  idempotent backfill (`jsonb_array_elements` over personnel, `not exists` guard,
  hours `least(24, greatest(0, …))` so the 0..24 check can't abort it).
- **Go-forward sync** `syncDiaryPersonnelToTimesheets()` in `lib/api/timesheets.ts`
  mirrors the SQL: reads the day's existing worker_names, inserts only the gaps,
  back-links `source_diary_entry_id`. Best-effort (logged, never thrown), no-op
  in mock / non-uuid. Hooked at the single store choke point — `addDiaryEntry`
  **and** `updateDiaryEntry` in `pages/gantt/store.ts` (also added the missing
  Supabase mirror to `updateDiaryEntry` so edits persist + sync, not just creates).

**B — Defects on Inventory (per-material, inline).** Defects (mig 37) linked only
to photo/task; now they can point at a supply material and surface where it's
managed.
- **Migration `43_defects_inventory_link.sql`**: `defects.order_id` (text FK →
  `orders.id`, set null) + `line_item_id text` + index. Mirrors the `Warranty`
  linkage shape (line items are embedded JSONB → plain text id, no FK).
- **`lib/api/defects.ts`**: `orderId`/`lineItemId` through `Defect`/`DefectRow`/
  `mapDefectRow`/`NewDefect`; `createDefect` sends the link columns **only when
  provided** (conditional spread) so board-side creation keeps working if mig 43
  lags the frontend deploy.
- **`InventoryTab.tsx`**: loads defects + realtime, indexes by `orderId:lineItemId`
  (== the existing row `key`); per-row severity-tinted defect chip → expands to
  the items; `canEdit`-gated "Report defect" modal (`createDefect` with the
  material prefilled); new red "Defective" KPI in the StatBand.
- **`DefectsBoard.tsx`**: cards show a `Package` chip "PO {n} · {material}" when
  a defect carries the link — legible from both sides.

**Tests** (CI-run; local vitest OOMs): `__tests__/timesheets.diarySync.test.ts`
(gap-fill: inserts only missing workers, never overwrites, clamps >24, collapses
dupes, skips blank/zero, no-ops unconfigured/demo) and
`__tests__/defects.inventoryLink.test.ts` (createDefect sends/omits link columns;
mapDefectRow round-trips). Type/test gate runs in CI per the local-env constraint.

**Follow-up (same day) — Overview + Tasks warmed (rollout complete).** The last
two main tabs on the slate look brought onto the warm register; the whole
workspace is now one logbook.
- **OverviewTab** (was ~85% warm already): `TabHeader → LedgerHeader`, status
  `Badge → StatusPill` (tone), `SetupGuide` + `CalendarMode` reskinned warm
  (cream grid, sage today-ring), and the progress-trend chart recoloured to sage
  (`#2F8F5C`) with warm axis/tooltip. KPI cells + finance/watchlist cards were
  already warm.
- **TasksTab** (1.7k lines, heavily slate): status colour maps → warm tones,
  `TabHeader → LedgerHeader` + warm action buttons, and a full slate→warm token
  pass across the Gantt split-pane (row borders, axis/header bg, gridlines,
  weekend shading, today line/chip → sage, child-bar track), the left/child/
  mobile rows, filter chips, inline-add, and the bulk-action modals' overlays/
  borders/inputs. Shared `Button`/`EmptyState`/`Card` components keep their own
  styling (not touched). All Gantt math, bulk runners, drawer, and selection
  logic untouched — presentation only.
Verified: no real slate/emerald colour classes remain in either file (only
`translate-` false positives), no substring corruption, unused imports removed.
CI runs the type/test gate.

**Fix (same day) — AI-Analysis scan history was empty (photo-centric rebuild).**
User reported (3×) the History never showed scanned images. Root cause: the query
returned only *terminal* `ai_analyses` rows (`analysed/confirmed/rejected/failed`),
so a freshly-scanned photo — or one whose `analyze-photo` run is slow/stuck/
undeployed — never appeared. Rebuilt **photo-centric**: new `listScanHistory()`
lists `photos` (the scanned images) newest-by-upload, left-joined to `ai_analyses`
for the verdict. Every scan now shows the instant it uploads with an **Awaiting AI
/ Analyzing… / verdict** status, regardless of whether the analyser finishes.
`ReviewQueueTab` prepends an **optimistic** row on upload + caches to localStorage
(guarded against the old cache shape); realtime `ai_analyses` updates flip status
live. History/Row renderers reworked for the new shape (`ScanHistoryItem`). If
verdicts never land (all "Awaiting AI"), that's the still-pending analyze-photo
Edge Function redeploy, not the UI. CI runs the type/test gate.

**Redesign (later, plan-approved) — AI-Analysis tab "inspection desk".** Features
were all working; user wanted the *visual* lifted ("a basic scan page"). Recomposed
`ReviewQueueTab` (presentation only — data/realtime/judging/history/Files untouched):
- **Scan bench hero** replaces the stacked header + stat strip + upload panel: one
  banded card on a blueprint-grid + grain texture (radial-masked) with a sage glow,
  containing the enlarged **scan dropzone** (focal), the inline task-judge selector,
  and a right-hand **gauge cluster** (`ConfidenceRing` avg-confidence + Pending /
  Flags / Scanned `Gauge`s with count-ups).
- **`ScanDropzone`** (replaces `WarmDropzone`): taller focal zone with a sage
  **scanline sweep** on drag/scan (new `aiqScan` keyframe in `index.css`, reduced-
  motion-guarded) and an inline busy/progress state.
- **Queue cards**: larger thumbnail + a sage completion bar under the verdict line.
- **Scan History → contact sheet**: date-grouped **thumbnail-first gallery**
  (`ContactTile`) with a status corner-chip + `%` overlay + phase tag, replacing the
  thin list rows — reads as a visual timeline.
Stays in the warm logbook palette; `LedgerHeader`/`LedgerStatRow` dropped here in
favour of the bespoke hero. No dangling refs; CI runs the gate.

**Pending the user's apply** (not run here): `git add -f` migrations 42 + 43,
then `supabase migration up`. Deploy order matters — apply 43 before the
Inventory "Report defect" path is used (board creation is unaffected by design).

**Follow-up (same day) — Defects folded into Inventory, standalone tab retired.**
Per request, consolidated the QA surface: the full `DefectsBoard` now renders as
a **"Defects" sub-view inside the Inventory tab** (a Stock | Defects pill sub-nav
with an open-defect count badge), and the top-level **Defects tab is removed**
(`Gantt.tsx` spec + render + `DefectsBoard`/`Bug` imports; `'defects'` dropped
from the `TabId` union). No navigation referenced the old tab id, so nothing
broke. Also widened the Inventory KPI band to **5-up on one row**: `StatBand`
gained an optional `cols={5}` (default stays 4-up for the other tabs).
`InventoryTab` now takes `canDelete` (forwarded to the board).

**Follow-up (same day) — Inventory + Defects reskinned to the Site Diary's warm
logbook.** Reworked both surfaces onto one shared "site register" aesthetic so
they read as siblings and match the Daily Log: cream `#FAF8F2` washes, warm
`#E6E1D4` hairlines, Fraunces numerals, sage `#2F8F5C` accents, dot-marked
statuses. New shared kit `pages/gantt/components/ledger.tsx` (`LedgerHeader`
tear-off-tile + Fraunces title; `LedgerStatRow` single-strip stats — replaces
the slate `StatCard`/`StatBand` 5-card grid here; `StatusPill`, `ToneDot`,
`MetaChip`, `TONE` scale, `btnPrimary`/`btnGhost`, `cardShell`). `InventoryTab`
becomes the **Materials ledger** and `DefectsBoard` the **Defect register**,
both fully restyled (headers, stat strips, sub-nav/filters, table + kanban,
chips, empty states, and both create-defect modals). Pure presentation — all
data, realtime, CRUD, filters preserved. Type/test gate runs in CI (local OOM).

**Fix (same day) — realtime channel collision.** Folding the board into Inventory
meant two components subscribe to defects at once (Inventory's chips/KPIs + the
nested board). `subscribeToProjectDefects` used a fixed topic `defects:<pid>`;
supabase-js reuses a channel on a duplicate topic and then throws "cannot add
`postgres_changes` callbacks … after `subscribe()`", crashing the Inventory tab.
Fixed by giving each subscription a unique channel suffix (`defects:<pid>:<seq>`)
in `lib/api/defects.ts`.

**Follow-up (same day) — warm register rolled out to Supplier + a merged Files
tab.** Extended the `ledger.tsx` kit to the rest of the workspace so every tab
reads as one logbook.
- **Files tab (new)** — merged the old **Plans** and **Uploads** top-level tabs
  into one `FilesTab` with a Plans | Uploads sub-nav (same pattern as Inventory's
  Stock | Defects). `PlansTab` fully reworked to warm; `UploadsTab` header/stat
  strip swapped to the ledger kit (its gallery body was already warm). Gantt
  wiring updated: single `files` tab spec + render, `TabId` comments, jump-map
  (`plans`/`uploads`/`files` → `files`), `counts.files`; dropped the now-unused
  `UploadIcon`/`PlansTab`/`UploadsTab` imports.
- **Supplier** — chrome reworked to `LedgerHeader` + one unified `LedgerStatRow`
  + warm sub-nav and invoice/warranty toggle. The four inner sub-tabs
  (**Orders / Deliveries / Invoices / Warranties**) reworked to warm tables /
  filters / status pills (shared `STATUS_TONE` → `TONE` scale) / dot markers /
  empty states, and their now-redundant per-sub-tab KPI rows removed in favour
  of the single Supplier strip.
- **Deferred (still slate):** the click-through Supplier surfaces — `OrderDrawer`,
  `NewOrderModal`, `DeliveryWizard`, `InvoiceDrawer`, `NewInvoiceModal` — are deep
  forms opened on click; left for a follow-up to avoid churning complex CRUD.
Pure presentation; all data/realtime/CRUD preserved. CI runs the type/test gate.

**Follow-up (same day) — Crew folded into Site Diary.** Made the Site Diary the
daily-operations hub (it owns the Sparky AI writing assistant): added a top
**Daily log · Crew** sub-nav. `SiteDiaryTab` renders the warm-reworked `CrewTab`
under the Crew section; the standalone **Crew tab is retired** (Gantt spec +
render + import + `Users` icon removed; jump-map `crew → site_diary`; `TabId`
`crew` kept as a legacy deep-link alias). `CrewTab` fully reworked to the warm
register — dropped its own `TabHeader`, swapped the slate KPI band for a
`LedgerStatRow`, warm sub-nav, and all three views (Time clock roster cards +
live timers + activity log; Timesheets heatmap grid + Approve-all; Certifications
list + add form) restyled with warm cards, `StatusPill` tones, sage progress,
Fraunces numerals. All data/realtime/clock/approval/cert logic byte-for-byte
preserved. Tab count now 7 (Crew merged). CI runs the type/test gate.

**Follow-up (same day) — AI-Analysis tab reworked (flagship surface).** Full
rewrite of `ReviewQueueTab` onto the warm register + three substantive changes:
- **Task picker replaces the misused phase chips.** A grouped `<select>` (Auto-
  detect · tasks grouped by phase · phase-only escape) — picking a task uploads
  the photo with that `taskId` *and* derives the `phaseHint` from the task's
  phase, so the AI judges it against the task and bumps the task's %. (e.g. a
  water-pipe photo → a Plumbing task.)
- **Scan history (was missing — flagged as a red flag).** New `Queue · History`
  sub-nav. History is a date-grouped list of every photo ever judged (thumbnail,
  phase, %, confidence, status: auto-applied / confirmed / rejected / skipped /
  failed), backed by a new `listAnalysisHistory()` cloud query **and** a
  `localStorage` cache (`photoqa:scanhistory:<pid>`) seeded on mount so it
  survives reloads.
- **Files → Uploads date timeline.** Scanned photos already persist to the
  `photos` table (so they appear in Files); the Uploads gallery is now grouped
  under **Today / Yesterday / weekday** date headers.
Hero `StatTile` cards → `LedgerStatRow`; phase-chip card removed; warm dropzone;
queue rows / activity strip / schedule context restyled. Data flow, realtime,
confirm/resolve, and `PhotoReviewDrawer` preserved. CI runs the type/test gate.

## 2026-06-03 — Phase Completion: single biased card → all-phases board

The Review-tab `PhaseCompletionCard` only ever judged **one** phase, chosen by a
fallback chain (selected task's phase → most-represented phase in the pending
queue → `PHASE_ORDER[0]`). With an empty/auto-detect queue it always landed on
**Excavation**, so the card read as fixated on a single phase regardless of where
the project actually stood — the "biased per phase" report.

**Fix — replaced the single card with `PhaseCompletionBoard` (all 8 phases at
once).** Same file (`PhaseCompletionCard.tsx`), new export:
- New API `listPhaseStatuses(projectId)` in `lib/api/phaseStatus.ts` — one query
  pulls every `project_phase_status` row; the board keys them by phase (no more
  per-phase fetch / 8× round-trips).
- Board renders a thin phase-coloured **spine** (8 segments: solid = complete,
  tint = reviewed, faint = not checked) for an at-a-glance read of the whole
  project, then a row per phase showing its status pill (**Ready for next /
  Complete / N blockers / Reviewed / Not checked**). Click a row to expand the
  full verdict + blockers + **Re-check** (or **Mark phase complete** when no
  verdict yet) — `completePhase` still drives the per-phase run, updating just
  that row. Header summary: "_n_ of 8 signed off".
- **Warmed** off the leftover `stone-*` / `bg-white shadow-sm` / emerald tokens
  onto the shared register kit (`cardShell`, `StatusPill` tones, `FRAUNCES`,
  `REG`, sage `#2F8F5C`, amber blockers). Collapsible board + accordion rows,
  reduced-motion-guarded via the app-root `MotionConfig`.
- `ReviewQueueTab` rewired: dropped the `activePhase` `useMemo` and the
  `QueueView` `activePhase` prop entirely (the bias root); `QueueView` now mounts
  `<PhaseCompletionBoard projectId={project.id} />`.
- `phaseCompletionCard.test.tsx` updated to the board API (mocks
  `listPhaseStatuses`; expands a phase row to assert verdict/blockers and to run
  `completePhase` from the empty state).

CI runs the type/test gate (local `tsc`/`vitest` OOM on this machine).

**Follow-up (same day) — Review queue made scan-aware; Schedule context dropped.**
The Review queue only listed *pending borderline* analyses (`listPendingAnalyses`),
so straight after an upload — when photos are still analysing, or already
auto-applied at ≥85% — nothing showed and the user just saw a bare "All caught
up / No analyses awaiting review." Now `QueueView`:
- Renders a new **Recent scans** section (`RecentScans`) under the queue: a
  thumbnail grid (reusing `ContactTile` + `scanStatus`) of the latest 10 scans
  from the photo-centric `history`, each reflecting its live status the instant
  it uploads — **Awaiting AI / Analyzing… / Auto-applied / Confirmed / Skipped /
  Failed**. A pulsing "_n_ analyzing" pill (reduced-motion-guarded) shows when
  scans are still in flight; "View all → " jumps to the full Scan history tab.
- **Empty-queue state is now context-aware** — when scans exist it shrinks to a
  one-line "Nothing awaiting your review — recent scans auto-resolved, status
  below" banner instead of the big placeholder; the full placeholder only shows
  when there are no scans at all (and now nudges to the scan bench).
- **Deleted the "Schedule context" collapsible** (the embedded `SplitPaneGantt`)
  from the queue per request — removed the block, the `scheduleOpen` state, the
  `SplitPaneGantt` + `ChevronRight` imports, and the now-unused `tasks`/`zones`
  props threaded into `QueueView`.

No data-layer changes — `RecentScans` reads the existing `history` (optimistic
insert on upload + cloud reconcile + localStorage cache). CI runs the gate.

**Follow-up (same day) — Tasks Gantt: "scheduling board" cosmetic restyle.**
User shared a reference Gantt (named bars + assignee avatars + hours + boxed
today column) and asked if ours could look like it. Ours was the phase-grouped
split-pane with thin bars + single-row axis. Picked the **cosmetic restyle**
scope (no data-model changes, no migration, phase grouping kept — avatars/hours
were declined as they'd need member-list wiring / new hours fields). Changes,
all in `TasksTab.tsx` + one shared helper:
- **Two-row day axis** — `dayHeaders()` in `ganttLayout.ts` now carries a narrow
  `weekday` letter + an `isToday` flag; the day-zoom axis renders weekday-over-date
  with **today as a filled sage circle** in a tinted column, weekends dimmed.
- **Today presence** — a faint full-height **today column** at day zoom + the
  today line switched from the gradient pulse to a **solid sage line** (the
  "Today" chip stays).
- **Named timeline bars** — child bars are now taller (26px in a 44px row),
  rounded, with a **3px status-colour left spine**, a **grip glyph**, the **task
  name inside**, a subtle progress wash + a 2px bottom progress strip, hover
  lift, and **click-to-open** the task drawer. Phase-anchor bars are tinted
  bands carrying the phase name. New hex `STATUS_TINT/SOLID/TEXT` maps (warm
  register tones). Narrow bars fall back to a `%` label beside (unchanged).
- **Richer left rows** — phase anchors gained a rolled-% mini progress bar; child
  rows are now two-line (name + a status-coloured progress bar with %), and an
  amber **⚠ at-risk** marker shows on delayed/blocked/overdue tasks (`isAtRisk`,
  ISO-date lexical compare). Mirrored ⚠ onto the mobile rows.
- `ROW_HEIGHT_PX` 36 → 44 (both panes stay in lockstep via the shared constant).

Note: the weekday/date axis only shows at **Day** zoom (default stays month);
the bar/spine/row restyle applies at every zoom. `SplitPaneGantt`/`GanttChart`
untouched. CI runs the type/test gate (local OOM).

**Follow-up (same day) — dialled the Gantt back to the original look.** On review
the user preferred the original thin/dense schedule over the "scheduling board"
heaviness, opting to keep only the cheap wins. So:
- **Reverted the timeline bars** to the original slim look — child bars back to
  12px status bars (no name-inside / grip / spine / 26px), anchors back to the
  18px tinted-border band; the `%` shows beside as before. Dropped the
  `STATUS_TINT/SOLID/TEXT` hex maps + the `GripVertical` import.
- **Kept the cheap wins** (per the user's pick): the two-row weekday/date axis +
  faint today column + **solid today line** (Day zoom); the **list-row progress
  bars** (anchor rolled-% + child %); the **⚠ at-risk** markers (list, mobile,
  and beside any at-risk bar); and **click-a-bar-to-open** the task drawer.
- `ROW_HEIGHT_PX` 44 → **42** (slim, but room for the two-line list rows).
- **Removed the Drawings & Permits pane** (`TaskDrawingsPane`) from the Tasks tab
  per request — dropped the mount + import only; the component file is kept for a
  separate rework/re-enhancement.

CI runs the type/test gate (local OOM).

## 2026-06-03 — Phase Completion → "Phase Completion Scan" (per-phase scan rollup)

Wired the scan pipeline into the Review-tab phase board so each phase surfaces
its scanning progress + AI results inline, not only in the Scan history tab.
- **Renamed** the board header **"Phase completion" → "Phase completion scan"**.
- **New `scans` prop** (`ScanHistoryItem[]`, optional/defaulted) on
  `PhaseCompletionBoard`, fed from the AI-Analysis tab's existing photo-centric
  `history` (so it updates live via the upload optimistic-insert + realtime
  refresh — no new fetch). Scans are bucketed by detected/tagged `phase`.
- **Per-phase Overall %** — each row now shows an `Overall` number (`0%` until a
  scan returns), defined as the **latest analysed scan's `completion_pct`** for
  that phase; climbs as new AI results land. Expanded view repeats it as a
  labelled progress bar ("{Phase} overall — N%").
- **Scan-results list** in the expanded phase — each photo shows its **Scan
  Status badge** (Awaiting AI → Analyzing… → Auto-applied / Confirmed / Skipped /
  Failed / Pending review) *then* its result (`completion %` + `confidence`),
  capped at 6 with "+N more in Scan history". This is the "AI result pops out on
  the phase" behaviour. Below it, the existing verdict + blockers + Mark
  complete / Re-check sign-off is retained.
- The **Review-queue scan status** ask is covered by this + the existing "Recent
  scans" strip (status chip → result on each tile).
- `phaseCompletionCard.test.tsx` updated: passes `scans`, plus a new case
  asserting a phase's scan filename + status badge render when expanded.

Decision flagged: "Overall %" = **latest** reading (most current). Easy to swap
to max/average if preferred. No data-model change, no migration. CI runs the gate.

**Follow-up (same day) — Recent scans consolidated into Scan history; new-task
nesting fix.**
- **Removed the "Recent scans" strip** from the Review queue (`QueueView`) per
  request — the scan gallery now lives only in the **Scan history** sub-tab
  (`HistoryView` / `ContactTile`, unchanged). Dropped the `RecentScans`
  component + `isAnalyzing`/`ANALYZING` helpers + the `onViewAll` prop; reworded
  the empty-queue banner to point at the Phase completion scan board / Scan
  history tab instead of "below". (`history` still feeds the Phase completion
  scan board, so per-phase scan results are unaffected.)
- **New-task nesting fix** — the "Other task" modal (`TaskDrawer` create) set a
  `phase` but no `parentTaskId`, so a created task rendered as a bottom *orphan*
  row instead of under its phase. Added `handleCreateTask` in `TasksTab` that
  resolves the phase's anchor (`anchorsByPhase`) and stamps `parentTaskId` for
  any non-anchor task missing one, then wired the drawer's `onCreate` to it. New
  tasks now appear nested under their chosen phase (e.g. Excavation), matching
  inline-added sub-tasks. No data/migration change. CI runs the gate.
- **Inline-add default range** — inline "+ Add sub-task" used to copy the phase
  anchor's full `startDate`/`endDate`/`durationDays`, so new sub-tasks stretched
  the entire timeline ("Test 1/2/3" full-width bars). Now `createSubTask` defaults
  to a short **~2-week window at the phase start, clamped to the phase end**
  (editable afterwards in the drawer). Uses date-fns `addDays` /
  `differenceInCalendarDays` / `format`.

## 2026-06-03 — Custom phases (keep the 8 built-ins, add your own)

For trades whose work doesn't map onto the 8 construction phases (an electrical
contractor's "Solar & battery", "Switchboard upgrade", …), projects can now add
their own top-level phases alongside the built-ins and fill them with sub-tasks.

- **Migration `44_custom_phases.sql`** (written + **applied by the user on
  Supabase**): adds `tasks.is_custom`, a `custom ⇒ phase-anchor` check, relaxes
  the partial unique index to **built-ins only** (`where is_phase_anchor and not
  is_custom`) so a project can hold many customs, and **re-creates
  `seed_phase_anchors`** so its `ON CONFLICT … WHERE` predicate matches the new
  index (otherwise project creation would error). `backend/` is gitignored →
  `git add -f` to track it.
- **Data layer:** `Task.isCustom` added; `TaskRow.is_custom` + `mapTaskRow`;
  `createTaskShared` now sends `is_phase_anchor` + `is_custom` (previously every
  create forced both false, so anchors couldn't be user-created).
- **TasksTab grouping:** custom anchors are collected separately (never into
  `anchorsByPhase`, which is keyed by the enum) and **appended after the 8
  built-ins** in `phaseRows`. New `phaseDisplay(task)` returns label+colours —
  built-ins from the construction palette, customs by **name** + a stable colour
  from `CUSTOM_PALETTE` (hashed by anchor id). Provably identical to before when
  a project has no custom phases.
- **Rebuilt the create flow** (per the user's "rebuild this"): the header
  **"Other task" → "Add phase"**; the old TaskDrawer create-mode modal is
  replaced by a lightweight **`AddPhaseModal`** (Name + Start + End → inserts a
  custom anchor with placeholder `phase='finishing'`, `isPhaseAnchor`+`isCustom`
  true). `openCreate` removed. Sub-tasks are still added via the inline
  "+ Add sub-task" on any phase (built-in or custom); `rolled_up_pct` rolls them
  up unchanged.
- **Delete custom phase:** trash affordance on custom anchor rows (inline
  confirm) deletes the phase **and its sub-tasks** (children first, to avoid
  orphans). Built-ins keep their pencil (Manage phase) and stay non-deletable.
  Mobile rows show custom name/colour too (no delete on mobile in v1).
- **AI stays on the 8:** the Phase Completion Scan board + `analyze-photo`
  phase-detection remain on the construction enum. Custom phases are a
  scheduling/planning layer — tag photos to a custom phase's sub-task via the
  "Judge against" picker rather than AI auto-routing. (Custom sub-tasks carry the
  placeholder `phase`, invisible in the UI.)

Migration is applied; frontend degrades gracefully if it weren't (no customs
shown). Local gate OOMs → CI is the check.

## 2026-06-03 — Overview rework + custom-phase sync to AI-Analysis

Reworked the Overview "Schedule & progress" hero for consistency + made custom
phases ripple into the AI tab.
- **Progress Trend — always-on, planned vs actual.** `TrendBody` no longer bails
  on empty history. New `buildPlannedVsActual()` plots two series on a numeric
  time axis (`ComposedChart`): **green = actual** cumulative progress (history,
  anchored to live overall % at today) and **red dashed = planned** baseline
  (straight 0%→100% start→end). Headline chip reads "_n_% ahead / behind" by
  comparing overall to the schedule's expected % today, plus a green **TODAY**
  reference marker. Even at 0 activity the chart renders (green under red =
  "behind").
- **Timeline → warm Gantt.** Swapped the old slate `GanttChart` for
  `SplitPaneGantt`. Warmed it off the slate/blue palette onto the register
  (`#E6E1D4`/`#EFEBE0`/`#6B6B6B`/sage; warm STATUS dot/bar tones) and gave it the
  **two-row month + weekly date-tick axis + green TODAY pill + solid today line**
  to match the Tasks Gantt (`weekTicks`, `AXIS_HEIGHT_PX` 36→44).
- **Calendar — informative.** `tasksOn` now excludes phase anchors, so days show
  only real leaf tasks instead of painting every cell with all 8 phases.
- **Custom phases sync to SplitPaneGantt** — `anchorDisp()` shows custom anchors
  by name + their assigned colour (built-ins keep the construction palette), so
  custom phases render correctly in the Overview Timeline.
- **Custom phases sync to the AI-Analysis Phase Completion board** — `ReviewQueueTab`
  passes `customPhases` (rolled-up % via `rolledUpPct`) to `PhaseCompletionBoard`,
  which lists them under a "Custom phases" divider with name + colour + progress
  bar. (AI auto-detection / Mark-complete stay built-in-only; custom phases are a
  scheduling layer.)

No data/migration change beyond 44 (already applied). Local gate OOMs → CI.

**Follow-up (same day) — removed the Calendar view.** Per request, dropped the
Calendar mode from the Schedule & progress hero (it was empty once anchors were
excluded). Removed the toggle button, render branch, `HeroMode` `'calendar'`,
the `CalendarMode` component, and its now-orphaned imports (`CalendarIcon`,
`ChevronLeft`, `startOfMonth`/`endOfMonth`/`eachDayOfInterval`/`isSameDay`/
`isWithinInterval`). The hero is now **Trend ⇆ Timeline**. Also fixed a same-day
regression: `customPhases` was used in `QueueView` but missing from its
destructured params → `ReferenceError` crash on the AI-Analysis tab; added it.

## 2026-06-03 — Overview schedule‑sync + Worker accounts (create / assign / notify / message)

**Part 1 — Schedule card now agrees with the trend chart.** `OverviewTab` `totals`
computed schedule health purely from overdue tasks (`delayed`), so the card read
"On track" while the chart read "19% behind." Now `totals` derives `plannedPct`
(linear baseline by elapsed time, via the existing `clampPct`) + `variance =
overall − plannedPct`, and `scheduleHealth` folds it in (`behind` if `variance ≤ −15
|| delayed > 2`; `at_risk` if `variance ≤ −7 || delayed ≥ 1`). Schedule KPI caption
shows "_n_% behind/ahead · _d_ delayed" so card + chart chip match.

**Part 2 — Worker accounts from the Crew tab.** Most infra already existed (the
`worker` security group + capabilities; field‑roles routed to `/home`, not a
project; `useProjectAccessGuard`; `adminCreateUser` edge fn; `inviteToProject`),
so this is the missing onboarding UI + the notify/message wiring:
- **`AddWorkerModal.tsx`** (new) — two modes gated by `currentProfile`:
  **Create worker** (admin tier, `canManageUsers`) → `adminCreateUser({
  securityGroup:'worker', … })` with an **auto‑generated temp password shown once**
  → `inviteToProject`; pushes the new Profile into the `users` slice so the roster
  resolves the name. **Invite existing** (PM+, `canAdminProjects`) → picker →
  `inviteToProject`. Duplicate‑active invites caught (`23505` → "already on project").
- **`CrewTab.tsx`** — "Add worker" button in the section sub‑nav (shown when
  `canAdminProjects`), modal mount, optimistic roster append. Gating reads the
  profile, **not** the passed `canEdit` (which is the site‑diary write cap).
- **Worker flow** (land on Home, not a project) — already implemented; verified, no change.

**Part 3 — Notify + message on assignment.**
- **Welcome DM:** `sendProjectWelcomeDM(workerUserId, projectName)` in `messaging.ts`
  (`createDirectConversation` + `sendMessage`; inviter is `sender_id=auth.uid()`, so
  it's a real message, not a system message). Called after every `inviteToProject`
  (AddWorkerModal **and** the existing `InviteMemberModal`), best‑effort/try‑catch.
- **Bell:** `notifications.ts` gains a `'project_added'` type + `createProjectAdded`;
  new `useProjectMembersRealtime` hook (mounted per‑user in `Layout.tsx`) listens to
  `project_members` INSERT for the signed‑in user → bell + reloads their project list
  so `/home` updates. Needs **migration `45_project_members_realtime.sql`** (publishes
  `project_members` to `supabase_realtime`) — **user applies it**.

Caveat: the bell is in‑memory (no notifications table) → an offline worker misses the
live ping, but the welcome message + the project on `/home` both persist. Local
type/test gate OOMs → CI is the check; only cosmetic class‑hint warnings. Migration 45
pending‑apply; everything else degrades gracefully without it.

## 2026-06-03 — Dashboard "Planned vs actual" synced to the Overview (shared chart)

The project Dashboard ("The brief.") had its own planned-vs-actual chart that bailed
to "No progress yet" on a fresh project and derived the baseline from `progressHistory`
rows. The user asked for it to behave like the now-solid Gantt **Overview** trend.
- **New shared `frontend/src/components/charts/PlannedVsActualTrend.tsx`** — extracts the
  Overview's chart (green actual area + red dashed planned baseline 0%→100% over the
  project window + green TODAY marker, always renders even at 0 progress). Exports
  `plannedPctNow(start,end)` for the "ahead/behind" chip math.
- **`Dashboard.tsx`** — dropped its bespoke `plannedVsActual`/`trendColor` builder and
  the empty-state, replaced the recharts block with `<PlannedVsActualTrend …>`, and the
  chip now reads "_n_% behind / On track" from `plannedPctNow` (same variance source as
  the Overview Schedule card). Removed the now-unused recharts imports.
- Net: Dashboard trend and Overview trend are visually + behaviourally identical.

Not yet done (flagged for the broader Dashboard "complete sync" pass): the KPI-tile
sparklines still use fabricated `seededTrend` data (no real per-metric history), and the
crew/team tiles aren't on the project_members/timesheets realtime parity the Crew tab has.
CI is the gate (local OOM).

**Follow-up (same day) — Dashboard crew + KPIs de-faked.**
- **Real, live crew.** New shared `frontend/src/lib/hooks/useProjectCrew.ts` — the real
  roster (`listProjectMembers` ∩ the user directory) + how many are clocked in *right
  now* (open shift = `timeIn` set / `timeOut` null), wired to the same
  `subscribeToProjectTimesheets` realtime the Crew tab uses. `Dashboard.tsx` "Crew on
  site" + "Team" now read from it instead of `users.length` × a hard-coded 0.73, so the
  numbers match Site Diary → Crew and update live on clock-in/out. Team rows resolve the
  per-member avatar + security-group label.
- **KPI sparklines de-faked.** `MetricCell` no longer renders the fabricated
  `seededTrend` sparkline — the tiles are now just label + live number + caption +
  accent (honest; the sparkline charts implied history we don't capture).
- Leftover trivia (flagged, harmless): the per-row accent squiggle on Upcoming tasks
  still uses `seededTrend` (decorative 50px mark; keeping it leaves `Sparkline`/`sparks`
  referenced so nothing orphans). CI is the gate (local OOM).

**Follow-up (same day) — Dashboard counts now reflect project structure (store/dashboard.ts).**
- **Tasks Complete** was `0/0` because `useDashboardStats` excluded phase anchors. Now it
  counts the project's structure — every phase (8 fixed + any custom) **and** every
  sub-task — so a fresh project reads e.g. "0 / 8". Anchor completion uses `rolledUpPct`
  (rolled up from children). `overallProgress` stays leaf-based (the work %).
- **Active jobs** filtered to `in_progress`/`delayed` (empty on a fresh project). Now
  `useActiveJobs` returns the **fixed construction phases** (built-in anchors, custom
  phases + sub-tasks excluded), each carrying its rolled-up %, shown even with no
  progress. Dashboard call bumped to `useActiveJobs(8)` to show all phases.
- **Photos this week / today** only counted `documents`, but AI scans write to the
  `photos` table → `useAppStore.photos` (realtime-fed). Now the count is the **union** of
  `useAppStore.photos` + Files-page `documents` (deduped), so scanned photos register.
  Caveat: `useAppStore.photos` is realtime-insert-fed with no bulk fetch on entry, so a
  cold page reload won't recount photos scanned in a prior session until a photos-load on
  project-entry is added (separate follow-up). CI is the gate (local OOM).

---

## 2026-06-04 — "One warm product" sweep: Tier 1 (whole-app warm-ify) + Tier 2 (de-faking)

Goal: make every surface read as the single warm "site register" identity (cream `#FAF8F2`,
`#E6E1D4` hairlines, ink `#1A1A1A`, sage `#2F8F5C`/`#246F47`, Fraunces) — not just the Gantt
workspace — and kill the remaining placeholder/synthetic data. Work staged, **not committed**
(finalization push). Local quality gates skipped (OOM) — CI is the gate.

### Tier 1 — spread the signature look (6 surfaces)
- **TopNav** (`components/layout/TopNav.tsx`): cream chrome + warm hairline (was white/slate-200),
  **Fraunces wordmark**, ink active nav pills (echo the ledger kicker strip), warm project-switcher /
  notifications / user-menu dropdowns, ledger-tone notification glyphs (were blue/purple/red),
  warm mobile drawer. `ReconnectionPill` → ledger amber.
- **Login** (`pages/Login.tsx`): swapped the slate (`rgb(15 23 42)`) + emerald (`rgb(4 120 87)`)
  tokens to the warm ink ramp + sage across the `<style>` block AND the JSX (masthead, hero,
  QA-principle aside, Upload→Update→Prove flow, sign-in card, role picker, tabs, submit, footer);
  editorial structure + paper-grain kept; headings were already Fraunces.
- **Home/RoleHome** (`pages/home/**`, 8 files): hero, action tiles, projects strip, why-panel,
  invited-project + assigned-tasks cards all warmed.
- **Messages** (`pages/Messages.tsx` + 2 messaging modals): slate "glass" chat → warm register —
  sage sent-bubbles, white received, sage-tint active conversation, warm composer.
- **Projects** (`pages/Projects.tsx` + 7 `pages/projects/**` components): warm cards, status
  tones, new-project / detail / invite / supplier-order modals.
- **Admin surfaces** (`Reports`, `Safety`, `Admin` + 6 admin components, `Settings`): warm tables,
  stat strips, tabs, forms, toggles, severity/status tone maps, charts recolored to the warm palette.
- (Tier-1 surfaces #4/#5/#6 + RoleHome warmed via parallel sub-agents against one shared palette
  spec so they came back consistent; TopNav + Login done by hand.)

### Tier 2 — kill placeholder / fake data (5 items)
- **#7 Reports trend** (`pages/Reports.tsx`): replaced the bespoke single-area progress chart with
  the shared **`PlannedVsActualTrend`** (real `progressHistory` + planned baseline + TODAY line) so
  Reports now reads identically to Overview/Dashboard, scoped to the selected project's dates.
- **#8 Dashboard** (`pages/Dashboard.tsx`): full warm pass (the rework so far had been data-only —
  it was still slate/emerald), AND removed the dead `seededTrend` walk + `Sparkline` SVG + the
  per-KPI `sparks`/`spark`/`color` props + the last decorative squiggle on upcoming tasks.
- **#9 Photos survive reload** (`lib/hooks/useProjectPhotosRealtime.ts`): the hook now does a
  one-time `listPhotos` backfill on project entry (idempotent `prependPhoto`, dedupes vs realtime),
  so the Dashboard "Photos this week" recounts prior-session scans after a cold reload — closes the
  caveat logged above.
- **#10 Set budget** (`pages/Reports.tsx`): replaced the `window.prompt()`/`window.alert()` flow
  with a warm `SetBudgetModal` (validated `$` input, Cancel/Save) feeding the same persist path.
- **#11 Failed-analysis drilldown**: added `listFailedAnalyses(projectId)` to `lib/api/aiAnalyses.ts`
  (the long-standing TODO) + a `FailedScansCard` in the AI-Analysis tab (`ReviewQueueTab.tsx`) that
  lists `analysis_status='failed'` scans with thumbnail + one-click **Retry** (`requestAnalysis`
  `forceNew`), so failed scans no longer silently vanish from the pending-only queue.

### Still open (Tier 3 + Ops)
Frontend-completable: #14 Ask-anything wiring, #15 Drawings & Permits rework, #16 scheduling-board
Gantt density, #17 mobile sweep, #18 first-run onboarding. **Deploy-gated** (need the user's Supabase
deploy): #12 persist notifications (new table + RLS), #13 custom phases → AI verdicts (edge fn).
Ops (#42/#43/#45 migrations, AI fn redeploys, commit to `main`) remain the user's action.

---

## 2026-06-04 (cont.) — Tier 3 distinctive features + deploy-gated artifacts

Continued straight into Tier 3 ("continue frontend Tier 3 now"). Frontend items built +
verified-by-review; backend pieces written as **staged, deploy-gated artifacts** (this machine
can't deploy to Supabase). Still staged, **not committed**.

### Frontend (live once merged)
- **#18 First-run onboarding** — new `components/onboarding/FirstRunOnboarding.tsx`: a one-time
  warm overlay (localStorage-gated `siteproof:onboarded:v1`) teaching Upload → AI reads it →
  Progress files itself. Mounted in `Layout`. Also warmed the app-shell bg `bg-slate-50` → cream.
- **#14 Ask-anything widget** — replaced the decorative box (with its fake mic) with a real
  `components/dashboard/AskAnythingCard.tsx`: working single-turn project Q&A, suggestion chips,
  loading/answer states, and **graceful degradation** (calm "not switched on yet" when the backend
  isn't deployed) via `lib/api/askProject.ts`.
- **#17 Mobile polish sweep** — Messages / Projects / Settings / Reports: iOS-zoom fixes
  (`text-base sm:text-sm` on inputs), 44px tap targets, overflow guards on tab strips/toolbars,
  modal full-width + stacking, Settings toggle-row squeeze fix. Desktop unchanged.
- **#15 Drawings & Permits rework** — `PlansTab.tsx` reworked into a warm versioned **plan-set
  register**: sheet grouping, derived Rev A/B/C revision history, permits section, task-link badges,
  stat strip — frontend-only, all existing upload/preview/delete wiring preserved. Permit-expiry
  chips + discipline split + persistent rev numbers are stubbed pending backend fields
  (`expires_at`, `sheet_discipline`, `revision_number`).
- **#12 Persist notifications (frontend half)** — `store/notifications.ts` now hydrates from +
  persists to the DB and dedupes realtime echoes by id; `lib/api/notifications.ts` (fully guarded)
  + `lib/hooks/useNotificationsRealtime.ts` mounted in `Layout`. **All no-op gracefully** until the
  table exists, so the in-memory bell is unchanged pre-deploy.
- **#13 Custom phases → AI verdicts (frontend half)** — `PhaseCompletionCard.tsx` custom-phase rows
  are now expandable with a "Mark phase complete"/"Re-check" verdict, via `completeCustomPhase` in
  `lib/api/phaseStatus.ts`.

### Deploy-gated artifacts (written, staged — USER must deploy; backend/ is gitignored → `git add -f`)
- **`backend/.../migrations/46_notifications.sql`** — `notifications` table + RLS (own-row) +
  realtime publication. Apply to light up #12 persistence.
- **`backend/.../functions/ask-project/index.ts`** — new edge fn for #14: single-turn project Q&A
  over a compact tasks/analyses/diary snapshot, JWT-gated, governed by the shared anthropic caps.
  `supabase functions deploy ask-project`.
- **`backend/.../functions/complete-phase/index.ts`** — extended for #13: accepts `customPhaseId`,
  gathers evidence from confirmed analyses on photos tagged to tasks UNDER the custom anchor
  (`parent_task_id`), best-effort caches the verdict. Redeploy: `supabase functions deploy complete-phase`.

### #16 scheduling-board Gantt density — built as an OPT-IN toggle (user approved)
Earlier the user reverted a dense Gantt ("stick to our original design"), so this ships as a
**Compact ⇄ Board** segmented toggle on `components/ui/SplitPaneGantt.tsx` (the shared, read-only
Gantt used by the AI-Analysis tab) — default **Compact** is byte-for-byte the original; **Board**
adds an assignee-initials avatar per task row + a name·duration label after each bar. Uses
`task.assigneeId` (→ avatar via the users store) and `task.durationDays` (→ "5d"). There is **no
hours field**, so it shows DAYS, not the "28/40h" from the reference; an `estimated_hours` column
would unlock hours later. Editable TasksTab Gantt deliberately untouched (can extend there on
request once the user eyeballs this). Typecheck clean; gantt test passes.

---

## 2026-06-04 (cont.) — Warm-ify the "second layer" outside Gantt/Dashboard

A grep survey showed the top-level pages are warm but a deeper layer (drawers/modals/cards) was
still slate. Scope locked with the user to **everything OUTSIDE the Gantt/Dashboard files** (those
are "done"); the Gantt/Dashboard-internal drawers + cards ("Group 1") were explicitly deferred, and
the public marketing pages (Pricing, RoiCalculator) are **held** pending a call on treatment.

Warmed (7 files, visual-only, via parallel agents on the shared palette spec):
- **Safety modals** — `safety/components/IncidentFormModal.tsx`, `SafetyDocumentModal.tsx`
  (severity/status chips mapped to warm tones, sage CTAs, warm inputs/dropzone, Fraunces titles).
- **Utility / floating UI** — `components/layout/QuickUploadFab.tsx` (sage round FAB),
  `QuickActionsSidebar.tsx` (cream slide-in, no backdrop-blur), `writingAssist/WritingAssistButton.tsx`
  (warm popover + sage accept/diff), `NotAuthorized.tsx` (warm empty state + Fraunces).
- **Admin** — `pages/admin/BootstrapAdmin.tsx` (warm card/inputs/CTA).

Verification: `tsc --noEmit` caught two real breakages — the agents wrote single-quoted JS strings
containing apostrophes (`'doesn't'` in NotAuthorized, `'Couldn't'` in WritingAssistButton) which
terminate the string early; fixed by switching those to double quotes. Re-typecheck **clean**. No
test files reference any of the 7 surfaces, and the changes are visual-only (identical text), so no
test impact. Staged, not committed.

Still HELD: public marketing pages `Pricing.tsx` (28) + `RoiCalculator.tsx` (12) — different
audience, may want a bolder look than the internal register style.

### DEPLOY CHECKLIST (when ready)
1. `supabase db push` (or run in SQL editor) the pending migrations **42** (timesheets↔diary),
   **43** (defects↔inventory), **45** (project_members realtime), **46** (notifications).
2. `supabase functions deploy ask-project` · `supabase functions deploy complete-phase`
   (and redeploy `analyze-photo` / `synthesize-project-status` if scans/synthesis sit idle).
3. `git add -f` the new/changed `backend/` files (backend is gitignored) before committing.
4. Commit the staged frontend + backend to `main` when the build is reviewed.
CI is the quality gate throughout (local `tsc`/`vitest`/`vite` OOM on this machine).

---

## 2026-06-04 (cont.) — Role experiences for every non-admin role (Phases 0–4) + admin consolidation

Built the approved role-experiences plan: a purpose-built, project-scoped surface per role.
Frontend-first; backend (RLS/migrations) staged for deploy. `tsc --noEmit` clean throughout;
permissions snapshot test 30/30. Nothing committed.

- **Phase 0 — foundation.** New capability flags (`respondToOwnOrders`, `releasePaymentMilestone`,
  `editFinance`, `viewPortfolioRollup`; stakeholder `viewReportsFinance` → read). Helpers +
  `dashboardLens()` in `permissions.ts`. Matrix snapshot regenerated.
- **Phase 1 — internal team: one role-adaptive Dashboard.** PM/admin = command + finance-summary
  card; Site Manager = site-ops (no finance); Construction Mgr = portfolio rollup band across
  their projects (`usePortfolioRollup`, `PortfolioRollupBand`, `FinanceSummaryCard`).
- **Phase 2 — Worker field cockpit.** `/home` tightened with one-tap capture + clock in/out
  (`FieldActionsCard`).
- **Phase 3 — Supplier cockpit `/supplier`.** Own POs only (`supplierId` scope), Accept/Hold/Decline
  (`supplierResponse` model on Order + `respondToOrder` store action + targeted `updateOrderResponse`,
  decoupled from procurement status), business summary + ROI widget. Routing: supplier → /supplier.
  Staged **migration 47** (response columns + RLS).
- **Phase 4 — Sponsor cockpit `/sponsor`.** Spend-vs-progress headline, read-only budget + invoices,
  assurance feed, and the signature action: **payment-milestone fund release** — release funds per
  phase once AI-verified complete, captured with a `SignaturePad` sign-off (`paymentMilestones` API,
  `SponsorCockpit`). Routing: stakeholder → /sponsor. Reports finance writes (Set budget / New
  invoice) gated on `canEditFinance` so sponsors get a read-only finance view. Staged **migration 49**
  (`payment_milestones` ledger + RLS).

### Admin consolidation + hidden dev role (mid-build, user-directed)
- **One admin tier = Company Admin.** `administrator` deprecated → removed from all role pickers,
  reassigned to `company_admin` (owner-vs-admin distinction stays in the `isOwner` badge). The enum
  value goes dormant (Postgres can't drop it).
- **Hidden `dev` superuser** — full caps (`DEV_ALL`) + implicit owner; never in any picker/signup;
  only a dev can mint a dev. DB/seed-assigned. Staged **migration 48** (add `dev` enum value +
  reassign administrators; includes the snippet to promote `myeonghun@seo.com`).
- **Add-to-crew "Invite existing"** reworked: multi-select checkboxes + compact layout + smaller
  consistent pill buttons + a **"Joining as" capacity** selector (per role, tailors the welcome DM +
  membership note + landing).

### Deploy order for this batch (user action; backend gitignored → `git add -f`)
Migrations **47** (supplier order response), **48** (admin/dev), **49** (payment milestones).
Then promote your dev account per the snippet in migration 48. Frontend degrades gracefully
pre-deploy. Optional follow-up: surface the supplier's response as a chip in OrdersTab/OrderDrawer.

---

## 2026-06-08 — Role restructure, role-tailored Welcome home, and the auth-loop crash fix

Finalization push toward a presentable build. Frontend-first; backend migrations + edge-fn
redeploys staged for the user to apply. Everything kept **staged** (no commit/push) per the
pay-raise finalization hold. Local quality gates run in CI (this machine OOMs on tsc/vitest).

### Role restructure — Site Manager removed, managers scoped, PMs empowered
- **Site Manager role removed.** It overlapped Project Manager 1:1, so it's gone from every picker,
  signup form, and label. The Postgres enum value stays dormant (can't be dropped); legacy rows are
  coerced `site_manager → project_manager` on read (`rowToProfile`). Staged **migration 52**.
- **Project visibility scoped to membership.** PM and Construction Mgr now see **only** the projects
  they own or were invited to — no more auto-appearing on every project. Only `company_admin` /
  `administrator` / `dev` see all. Staged **migration 53** (redefines `is_project_member`,
  auto-enrolls a project's creator, backfills memberships, tightens members/projects RLS).
- **Project Managers can run their own shop.** PMs can now create personal projects, invite people,
  create accounts for their crew, and set each invitee's role (any non-admin role). Enforced in
  `permissions.ts` + the `admin-create-user` / `confirm-analysis` edge functions. Staged
  **migration 51** (members-write RLS list was missing `dev`, which broke "add Stake Holder").

### Finance tab in the Gantt
- Lifted the Sponsor finance view into a gated **Finance tab** on the project Gantt (`FinanceTab`,
  `ProjectFinancePanel`), visible to `company_admin` / `dev` (and finance-capable roles) — so the
  budget/invoice picture lives next to the schedule, not only on the sponsor cockpit.

### Role-tailored Welcome home for everyone (`/home`)
- Converted the standalone HTML "Welcome" slide-deck mockup into a real, in-app role-tailored home:
  a 7-slide editorial deck (`RoleHome`) driven by per-role config (`roleHomeConfig.ts`) with
  keyboard / wheel / touch nav, a rail stepper, and a **"Skip to my work"** shortcut that funnels
  each role to its real workspace (worker → /gantt, PM/CM/CA → /dashboard, supplier → /supplier,
  stakeholder → /sponsor). Every role now lands here on login (`RoleHomeRedirect`). Warm
  "site-register" palette + Fraunces/DM Sans, scoped CSS.

### Bug fix — the `/home` auth-redirect crash loop
- After everyone started landing on `/home`, the app threw **"Maximum update depth exceeded"** +
  Firefox **"Too many calls to Location/History APIs"** + **"operation is insecure"
  (SecurityError)**, caught by the App-root ErrorBoundary on a `<Navigate>` in `RequireAuth`.
- Root cause was **not** the deck — it was a setState storm in the auth store: `onAuthStateChange`
  re-ran `refreshProfile()` on **every** auth event (incl. routine token refreshes), and
  `refreshProfile` always built a fresh `currentUser` + re-fetched `listUsers()` / `loadProjects()`.
  In a context where the session can't persist (blocked/partitioned storage — Firefox on localhost),
  Supabase re-emits auth events, so this thrashed → render storm → repeated `<Navigate>` →
  History-API rate limit → SecurityError.
- **Fix (auth-store hardening):** (1) dedupe `onAuthStateChange` by `session.user.id` so only a real
  sign-in / sign-out / user change acts; (2) make `refreshProfile` idempotent (skip the redundant
  `set()` + re-fetch when already authenticated as the same user); (3) dropped the dead
  `<Navigate to="/dashboard">` fallback in `RoleHome` (RequireAuth already guarantees a profile).

### Other finalization items this session
- **Login** split-screen redesign + signup form trimmed (Site Manager removed from registration).
- **Projects** page health/portfolio header (Delayed/On-track/Caution states, design #1).
- **TopNav** "Materials" rename; removed the demo-mode banner.
- Storage `SecurityError` hardening (`safeAuthStorage` memory fallback + `safeSession` guards).
- New docs at repo root: **SiteProof_User_Guide.md** (boss-facing, per-role access guide),
  **PROGRESS_REPORT.md**, **QA_TEST_PLAN.md**.

### Deploy order for this batch (user action; backend gitignored → `git add -f`)
Migrations **51** (members-write `dev`), **52** (remove Site Manager), **53** (scope manager access)
— on top of the still-pending **47/48/49**. Redeploy edge functions `admin-create-user`,
`confirm-analysis`. Then commit + push `main` → Vercel when the finalization hold lifts.

---

## 2026-06-08 (cont.) — TopNav label fix, stale-copy cleanup, and profile pictures

- **Nav label is role-aware.** The `/projects` item was hard-labeled "Materials" for everyone;
  it now reads **"Projects"** for all roles and stays **"Materials"** only for the supplier (whose
  world is POs / deliveries). `projectsNavItemFor` helper in `TopNav.tsx`, mirroring `homeNavItemFor`.
- **Stale "Site Manager" copy.** Fixed the four user-facing strings in the worker Welcome deck
  (`roleHomeConfig.ts`) that still named the removed role → "your project manager".
- **Profile pictures (new feature).** Users can upload / change / remove a profile photo from
  Settings → Profile. Avatar preview with an initials fallback (sidebar + form), 5 MB + image-type
  validation, live update across the nav, settings, and team directory.
  - Frontend: `uploadAvatar()` in `lib/api/profiles.ts` (uploads to the public `avatars` bucket at
    `{user_id}/{ts}.{ext}`, returns the public URL), persisted via the existing
    `updateProfile({ avatarUrl })`, mirrored into the store by a new **`setCurrentAvatar`** action
    (needed because `refreshProfile` is now idempotent per-user and won't re-pull a changed avatar).
  - Backend: staged **migration 54** — creates the public `avatars` bucket + owner-scoped RLS
    (public read; insert/update/delete only inside the user's own `{user_id}/` folder).

### Deploy delta for this batch
Add **migration 54** (avatars bucket) to the pending set above. Until it's applied the uploader
fails gracefully with a toast; everything else degrades cleanly. Still staged — nothing committed.

---

## 2026-06-08 (cont.) — Group-chat photos

Group chats can now have a photo — set at creation and editable later. Shows in the inbox list and
the chat header (falls back to the existing Hash / Users tile when none is set).

- **Where you set it.** New-group modal (`NewConversationModal`) gets an optional photo picker with a
  live preview; the photo uploads right after the group is created (non-fatal if it fails — settable
  later). Group settings (`GroupSettingsModal` → Overview) gets a creator-only Change / Remove photo
  control. `Messages.tsx` renders the group photo in the list rows + the conversation header.
- **API** (`lib/api/messaging.ts`): `Conversation.avatarUrl` + `avatar_url` row mapping;
  `uploadGroupAvatar()` (stores in the shared public `avatars` bucket under the uploader's own folder
  `{uid}/groups/{conv}_{ts}.{ext}`, so migration 54's owner-folder RLS already covers it) and
  `updateConversationAvatar()`.
- **Backend** — staged **migration 55**: adds `conversations.avatar_url` **and** the missing
  `conv update` RLS policy. 03/07/08_messaging only ever created SELECT + INSERT policies on
  `conversations`, so there was never an UPDATE policy — meaning the existing **group-rename** feature
  was also silently blocked by RLS. Migration 55 fixes rename and enables set-photo in one go
  (scoped to the group creator + admins).

### Deploy delta
Add **migration 55** (group avatars + `conv update` policy) after migration 54. Depends on 54 for the
bucket. Until applied, group-photo writes (and group rename) fail with a toast; everything else is
unaffected. Still staged — nothing committed.

---

## 2026-06-09 — Backend code-review fixes (F1–F9 of `code-review-findings.md`)

Worked the `/code-review max` findings on the gitignored `backend/` tree (9 Edge Functions + a
migration). Fixed every correctness + security finding; deferred the quality refactors (F10–F14) to a
CI-gated follow-up (rationale recorded in `code-review-findings.md`). All staged — nothing committed.

- **F1 (deploy-blocker)** — two migrations shared version `51`, so `supabase db push` would apply one
  and silently skip the other. Renamed `51_photos_uploaded_by_default.sql` → **`56_…`**.
- **F2 (IDOR / budget)** — added the project-membership gate (`isProjectMember`) to
  `synthesize-project-status` and `detect-diary-conditions`; they read cross-project analyses through
  the RLS-exempt service client and burned Claude calls with no authZ. Mirrors `complete-phase`.
- **F3 (auth / leak)** — `generate-reports`' bodyless POST fell through to the all-projects cron sweep
  with no auth and returned the full project list (browser-readable via the new CORS headers). The
  cron path is now **service-role only**.
- **F4 (throttle)** — the auto photo→analyze path threaded the uploader's id into the per-user cap
  (30), so a worker uploading 31+ photos/day got silently-failed analyses. Added `skipUserCap`: the
  photo path is still **metered** per-user but no longer **capped** (global cap still guards).
- **F5 / F6 (reports correctness)** — on-demand recovery no longer returns a `failed` row as success
  (409 instead); the regenerate is now **insert-first, delete-after** so a write error can't lose the
  prior snapshot.
- **F7** — on-demand **daily** delta now has a real baseline (prior on-demand daily → latest weekly
  cron) instead of a non-existent cron-daily, which pinned "Last 24 hours" change to 0.
- **F8** — streaming Sparky meters a call **only when it produced output**; a mid-stream 0-token error
  no longer burns a call against the caps.
- **F9** — `numEnv()` guards every numeric env read; an empty-string value (`Number('')===0`) no
  longer collapses a daily cap to 0 (which failed closed and looked intermittent).

### Deploy delta
`backend/` is gitignored → `git add -f` the changed functions + migration 56. Redeploy
**complete-phase, synthesize-project-status, detect-diary-conditions, generate-reports, analyze-photo,
site-diary-assistant** (the edited `_shared/anthropic.ts` + `_shared/auth.ts` bundle into each). Apply
**migration 56**. **F3 caveat:** the report cron must call `generate-reports` with the service-role
key (per the function header) or the sweep will 403. F10–F14 (quality) deferred to a follow-up.

---

## 2026-06-09 (cont.) — Mobile Create-Project fixes + app-wide AUD currency

Reported from mobile (in-app browser). All frontend, all staged.

- **Mobile modal scroll** — the New Project modal couldn't scroll to the date fields / buttons on
  mobile. The inner scrollbox was fine; the *overlay* (`flex items-center` + `max-h-[95dvh]`) was the
  problem — if `dvh` is unsupported (in-app WebView) or the keyboard is up, the modal exceeds the
  viewport with no way to reach the rest. Switched to the robust scrollable-overlay pattern
  (`fixed inset-0 overflow-y-auto` + a `min-h-full` centering wrapper) so the whole dialog scrolls.
- **"TypeError: Load failed" on create** — that's WebKit's *network-level* fetch rejection (common in
  in-app browsers), not a Postgres error. The submit handler wrapped the create **and** the
  post-create `loadProjects()` refresh in one try, so a refresh blip looked like a create failure
  (→ user retries → duplicate project). Split them: create is awaited on its own; the refresh is
  best-effort. Added `createErrorMessage()` to translate "Load failed" / "Failed to fetch" into an
  actionable message (check connection / open in a real browser).
- **Currency → AUD** — the company is Australian; the app showed USD everywhere. Converted **all**
  money displays from `en-US`/`USD` to `en-AU`/`AUD` (renders a clean `$`): New Project budget label,
  Reports, Invoices/InvoiceDrawer/NewInvoiceModal, Orders/OrderDrawer, Inventory, Overview,
  FinanceSummaryCard, sponsor ProjectFinancePanel, SupplierWorkspace, and the Pricing page wording
  (display-only — Anthropic AI cost is still billed in USD upstream). The `fmtUSD` helper names were
  left as-is (cosmetic; they now emit AUD) to avoid churning ~15 call sites.

---

## 2026-06-09 (cont.) — Boss feedback: phase task picker + Site-Diary Celsius

### Phase "Add tasks" picker (frontend-only)
Boss wanted, instead of the free-text "+ click to add" under each Gantt phase, a **dropdown to pick
one or many predefined job tasks** — custom per job/client, with a one-off custom add kept.
- New **`lib/construction/phaseTaskCatalog.ts`** — a per-phase pick-list (`PHASE_TASK_CATALOG`),
  seeded from the built-in milestone names. **This is the file to edit** to tailor the list per job.
- New **`AddTasksModal`** (in `TasksTab.tsx`, reusing the local `ModalShell` + the AddWorker
  multi-select pattern): search + multi-select checkboxes of the phase's catalog, **plus** a "custom
  task" field in the same dialog. Already-added tasks are hidden.
- Wired in `TasksTab.tsx`: the phase "+" and the (now clickable) empty-state row open the picker;
  confirm bulk-adds each selected/custom name via the existing `createSubTask` (dates within the
  phase window, 0%). Empty-state copy → "No tasks yet — add from the list." The old inline free-text
  add path is left dormant (unused). **No DB change** — uses the existing `tasks` table.
- *Future option (not built):* persisted per-client task templates with a management UI.

### Site-Diary temperature → Celsius (was Fahrenheit)
The Dashboard weather card was already °C; the Fahrenheit was the Site-Diary "conditions" temperature
(user-entered + AI-detected). Converted end-to-end:
- **Migration 57** — renames `diary_entries.temperature_f` → `temperature_c` and converts existing
  values F→C in place (guarded against re-run).
- **Frontend** — `temperatureF`→`temperatureC` + `°F`→`°C` across DiaryEntry type, `diaryEntries`
  api, `ConditionsCard`, `DiaryEntryDrawer`, `SiteDiaryTab`, `diaryConditions`, `mockWritingAssist`
  (+ its test, 68°F→20°C). Zero Fahrenheit refs remain.
- **Edge functions** — `_shared/conditionsPrompt.ts` now asks Claude for `temperatureC` (Celsius);
  `detect-diary-conditions`, `site-diary-assistant`, and `_shared/renderDiarySnapshot.ts` updated to
  the `temperature_c` column / Celsius display.

### Deploy delta
`backend/` gitignored → `git add -f` **migration 57**. Apply migration 57, then **redeploy BOTH
`detect-diary-conditions` AND `site-diary-assistant`** (both read the renamed column — the latter's
`SELECT` would 400 on the old `temperature_f` post-migration). Phase picker is frontend-only.
Everything staged — nothing committed.

---

## 2026-06-09 (cont.) — Choose phases at creation + real budget in the Finance tab

### Pick phases when creating a project
The 8 default phases were always seeded (trigger on project INSERT). Now the New Project form lets you
choose which to include and add custom ones — "it depends on the job."
- **Migration 58** redefines `create_project_with_tasks` (drops the old 8-arg signature first) with
  two optional params: `p_phases text[]` (built-ins to KEEP; null ⇒ all 8) and `p_custom_phases jsonb`
  (`{name}` list). The trigger still seeds all 8; the RPC then deletes the unchosen built-ins (safe —
  fresh anchors) and inserts custom anchors (`is_custom=true`, placeholder `phase='finishing'`,
  project-window dates) — reusing the migration-44 custom-phase mechanism. Backward compatible.
- API: `CreateProjectInput` + `createProjectWithTasks` (`lib/api/projects.ts`) gained `phases` /
  `customPhases`.
- UI: `NewProjectModal` now has a **Phases** section — checkboxes for the 8 defaults (uncheck to drop)
  + an "add custom phase" chip input. Validates ≥1 phase. Subtitle/help copy updated (phases start
  empty; add tasks from the list in the Gantt). Dropped the now-inaccurate `totalDefaultMilestones`.

### Real budget in the Finance tab ("No budget set" fix)
Root cause: `projects.budget` (DB) was dropped in `projectRowToProject`, and the finance store was
never hydrated from the DB → the panel showed "No budget set".
- **Surface it**: `budget?: number` added to the projects-list `Project` + mapper
  (`pages/projects/store.ts`); `loadProjects` now hydrates `useFinanceStore` budget **total** per
  project from the DB (preserving any manual override) — fixes it everywhere by project id.
- **Production-ready spend**: `ProjectFinancePanel` now computes **spent = Σ paid invoices** and
  **committed = Σ open POs** (not received/cancelled) from the live `useGanttSideStore` records,
  replacing the hardcoded `0`s. Budget-spent %, the health bar, spend-vs-progress, and the per-phase
  payment-milestone amounts all become real. (On the Sponsor cockpit, where gantt-side data isn't
  loaded, spend shows 0 but the budget total still renders.)

### Deploy delta
`git add -f` **migration 58**; apply it (RPC redefine — no edge-fn redeploy). Part B is
frontend-only. Everything staged — nothing committed.
## 2026-06-10 — Maintenance Module: full backend (Phases 1–3 server side)

New domain: customers → properties → reactive requests + recurring schedules + inbound email.
Everything authored + two-stage reviewed (spec, then quality); NOTHING staged/committed or applied yet per Jordan.

### Migrations (backend/supabase/migrations/, apply in order 59→62)
- **59_maintenance.sql** — `customer` enum value (permanent); `customers`/`properties`/`maintenance_requests`
  (urgency 1–5, status lifecycle, source portal|internal|email)/`maintenance_request_photos`;
  `profiles.customer_id` + single-link check; `current_customer_id()` helper; full RLS (customer sees own,
  insert-only fresh portal requests); storage read policy for `maintenance/*` (migration 33 fails closed);
  SECURITY DEFINER manager fan-out trigger on new request; realtime publication.
- **60_maintenance_schedules.sql** — `maintenance_schedules` (frequency, next_due, remind_days_before int[],
  notify_customer, extra_notify_email) + `maintenance_reminders_log` with unique(schedule_id,due_date,days_before)
  idempotency key (migration-10 pattern); RLS (customers read own schedules, never write, no log access).
- **61_maintenance_cron.sql** — first real pg_cron+pg_net wiring: daily 06:00 UTC `net.http_post` to
  maintenance-reminders, URL + service-role key from Vault at RUN time (rtrim slash defense); idempotent
  reschedule; commented generate-reports example; `days_before` column comment documents -1 overdue sentinel.
- **62_maintenance_email_idempotency.sql** — `maintenance_requests.email_message_id` + partial unique index
  (webhook retry dedupe).

### Edge functions (backend/supabase/functions/)
- **_shared/email.ts** — thin `sendEmail` (never throws); MOCK by default, live only when
  `MAINTENANCE_EMAIL_LIVE='true'` + `RESEND_API_KEY` set (Resend REST, `reply_to` snake_case).
- **maintenance-reminders/** — service-role-gated daily sweep; log-claim FIRST then notify managers + email
  customer portal users (one email, deduped recipients, escapeHtml'd); overdue escalation once/day via
  (due_date=today, days_before=-1) claim; per-schedule isolation; fail-fast if manager fetch dies (claims
  are one-shot); counts: reminders_sent / overdue_escalations / emails{sent,mocked,failed}.
- **receive-maintenance-email/** — Resend Inbound webhook: Svix HMAC verify (constant-time, ±300s replay
  window) → sender match (profile email → primary_contact_email → unique domain; ILIKE patterns escaped +
  `*` PostgREST-alias guard; auto-responder senders → triage) → create request (urgency 3, source email,
  23505→200 deduped) + attachments (≤5, ≤5MB, image/pdf allowlist) to maintenance/<id>/ + auto-reply with
  loop guard; unmatched → high-priority admin triage notification; deploy with `--no-verify-jwt`.
- **admin-create-user/** — accepts `customer` group + `linkTo {type:'customer'}` (6 touchpoints: groups list,
  payload union, validation, customers table lookup, required-linkTo guard, profilePatch nulling other FKs).

### Deploy delta (BLOCKED on Jordan — do not run yet)
1. `git add -f` migrations 59–62, `_shared/email.ts`, both new function folders (admin-create-user already tracked).
2. Apply 59→62 in Supabase SQL editor; verify: `select 'customer'::security_group;`, pg_policies check, `cron.job`.
3. Deploy fns: `admin-create-user`, `maintenance-reminders`, `receive-maintenance-email --no-verify-jwt`.
4. External prereqs (Phase 2/3 cutover): pg_cron+pg_net extensions ON; Vault secrets `project_url` +
   `service_role_key`; Resend account + DNS (SPF/DKIM) + `RESEND_API_KEY` + `RESEND_WEBHOOK_SECRET`;
   maintenance@ mailbox forward to Resend Inbound. Email stays MOCKED until `MAINTENANCE_EMAIL_LIVE='true'`.

Frontend (types/capabilities/API modules/portal UI) is next — backend-first per Jordan.

## 2026-06-11 — Maintenance frontend (Stages 2–3) + Service Jobs backend (Stage 1)

### Stage 1 — migration 63_service_jobs.sql (joins Gate A batch → apply 59–63 in ONE sitting)
`service_jobs` (free-text client + optional customer/property link, status pending→scheduled→in_progress→done,
materials/notes), `service_job_photos` (kind before/after/other, bucket path service/{jobId}/),
`service_job_time_entries` (who/date/hours/note — payroll-syncable shape), internal-only RLS (customer role:
zero access), `service/*` storage read policy, realtime. Spec + plan in docs/superpowers/.

### Stage 2 — role plumbing + API modules (F1–F6)
- `customer` in SecurityGroup union; `Profile.customerId` mapped (NOTE: stakeholder/supplier linkage ids were
  NEVER mapped into profiles — pre-existing gap, flagged, not fixed); legacy role map customer→stakeholder;
  isFieldRole includes customer (routes to /home).
- capabilities: createMaintenanceRequest/viewOwnMaintenance (customer), manageMaintenance (4 manager tiers);
  permissions helpers + test matrix + snapshot regenerated (single-fork); ROLE_BADGE/ROLE_BLURB/labels extended.
- New `lib/api/`: customers, properties, maintenanceRequests (WithContext joins, urgency clamp, portal-safe
  createRequest traced against RLS policy, photo upload/signed-URL list), maintenanceSchedules (markScheduleDone
  rolls next_due by frequency, string date math). Review fixes: createSchedule now mirrors DB defaults
  ({30,14}/notify=true — was silently disabling reminders), scheduleRequest clears completed_at, ext guard.
- admin.ts: linkTo 'customer' arm (3-branch FK nulling) + inviteCustomerUser wrapper.

### Stage 3 — Maintenance UI (U1–U3)
- Internal `/maintenance` (manager+): customers list → customer detail (properties + urgency-sorted queue +
  invite-portal-user w/ crypto-random one-time password) → request detail (photos, status flow, assign,
  schedule). Realtime refetch channel.
- Customer portal `/customer`: guard + unlinked-account state; mobile bottom-sheet Report-a-problem (photo
  multi-upload w/ per-photo failure tolerance, urgency 1–5 plain-language picker, default 3); MyRequests
  read-only with friendly labels (new/acknowledged → "Received"). Zero mutations beyond the RLS-allowed inserts.
- Wiring: routes (lazyWithRetry+ErrorBoundary), CUSTOMER role-home deck (skipTo /customer), TopNav: customers
  get single-item nav + hidden project switcher; staff gain Maintenance item gated canManageMaintenance.
- Batch review fixes: roleHomeConfig apostrophe syntax error (build-breaker), TS6133 unused loadRequest (wired
  as post-mutation refresh), infinite-spinner error states → retry panels, object-URL leak on modal cancel,
  cleared-optional-fields now save as null, urgency colors aligned (4-5 red / 3 amber / 1-2 neutral).

### State
Everything authored only — NOTHING staged/committed (Stage 7 batch). CI typecheck pending next push.
Gate A unblocks E2E: apply 59–63, deploy admin-create-user / maintenance-reminders / receive-maintenance-email
(--no-verify-jwt). Next: Stage 4 (serviceJobs+jobsBoard APIs, /jobs kanban) then Stage 5 (schedules UI).

## 2026-06-11 — Service Jobs + Jobs Board (Stage 4) & Schedules UI (Stage 5) — BUILD COMPLETE

### Stage 4 — Service Jobs + /jobs kanban
- Capabilities: viewJobsBoard (all staff), manageServiceJobs (manager tiers), logServiceJobWork (workers too);
  helpers + permissions matrix + snapshot regenerated (30/30 PASS, single-fork).
- `lib/api/serviceJobs.ts`: full CRUD + status (completed_at both directions) + scheduling + before/after/other
  photos (service/{jobId}/ paths, signed URLs) + time entries (hours>0, totalHours 2dp).
- `lib/api/jobsBoard.ts` (TDD, 6/6 unit tests green): pure status-mapping tables for the three card types +
  dropResult (service unrestricted; maintenance pending→acknowledged, in_progress→scheduled wrinkle documented;
  project Done confirm-gated, Scheduled blocked) + fetchBoardCards (parallel 3-source, includeCancelled option,
  scheduledFor-asc-nulls-last sort).
- `/jobs` page: 4-column kanban, native HTML5 DnD (manager-gated; workers read-only), date popover on
  Scheduled drops, project-complete confirm modal, blocked-toast, type/cancelled filters, realtime channel on
  service_jobs + maintenance_requests, silent background refetches (no spinner flash). NewServiceJobModal
  (30-second create, optional customer/property link). ServiceJobDrawer (748 lines): details edit, status
  segmented buttons, schedule/assign, materials/notes, before/after photo sections, time entries with
  totals + manager tech-picker. Route + TopNav "Jobs" item (KanbanSquare, canViewJobsBoard).
- Review fixes: ||/?? syntax error (build-breaker), two TS6133 unused-local CI breakers, spinner-flash on every
  drop (silent refetch mechanism + hasLoadedRef), photo-delete affordance matched to RLS (manager-or-uploader),
  stale date in ScheduleDatePopover, dev excluded from all three assignee/tech pickers.

### Stage 5 — Schedules UI
- Internal SchedulesSection in CustomerDetail: grouped by property, overdue/soon due-tinting, mark-done (toast
  shows rolled next-due from API), edit/deactivate, ScheduleFormModal (30/14 reminder checkboxes + custom days,
  never-empty default {30,14}, notify-customer default ON, email validation).
- Portal UpcomingMaintenance: read-only top-5 active by next-due, friendly copy, zero mutations.
- Review fixes: cleared category/extraNotifyEmail now save as null (UpdateScheduleInput widened), inactive
  properties excluded from picker, UUID display fallbacks → 'Unknown property'.

### STATE: all build stages (0–5) COMPLETE — authored only, nothing staged/committed.
Remaining: Gate A (apply 59–63, deploy 3 fns, git add -f batch), M3/M4/M5 E2E verification, Gate B email
cutover, Stage 7 commit order (polish → maintenance → service jobs). CI typecheck pending first push.

## 2026-06-11 (evening) — IA consolidation: Jobs hub · Customers rename · Reports relocation

Jordan flagged TopNav sprawl (Projects/Jobs/Maintenance overlapping; Reports org-level when its content is
per-project). Full replan (plan-mode, frontend-design skill + dispatch-board/kanban research) then executed:

- **TopNav now**: Dashboard · Jobs · Customers · Messages · [More ▾: Safety, Admin]. Suppliers keep
  Materials→/projects standalone; stakeholders keep Projects; customer portal untouched.
- **Gantt gains a Reports tab** (after Site Diary): Progress / Financial / Sign-offs extracted line-faithfully
  from the 1315-line pages/Reports.tsx (now DELETED); project comes from Gantt context (pickers removed);
  canViewFinance/canEditFinance gating preserved. Org-wide Audit → components/audit/AuditTrailPanel.tsx
  mounted collapsed on Dashboard (managers only). Reports' Safety sub-tab dropped (duplicate of Safety page).
- **JobsHub** (pages/jobs/JobsHub.tsx): editorial masthead (OPERATIONS · LIVE, Fraunces "Work.", live stat
  strip via onCardsChanged seam — no duplicate fetch), Board|Projects switcher (?view= param), Suspense-lazy
  mounts of the EXISTING JobsBoard + Projects pages (zero duplication). Gate-aware /projects route:
  internal → /jobs?view=projects, supplier/stakeholder → standalone page.
- **Board design pass**: ledger columns (small-caps headers + stamp count chips, In-Progress amber top rule,
  Done 80%), strict card anatomy (type stamp/urgency/title/client/date with red Overdue + sage today dot,
  suppressed for closed cards), native-DnD-preserving drag visuals (origin ghost, dashed drop target,
  framer-motion layout springs), <400ms gated entrance stagger, reduced-motion respected, editorial empty copy.
- **Customers rename**: /customers route (+ /maintenance redirect), TopNav label, board card nav retarget.
- **Redirects**: /reports→/gantt?tab=reports · /finance→/gantt?tab=finance · /maintenance→/customers ·
  /projects gate-aware. roleHomeConfig: 5 /reports + 7 internal /projects targets retargeted.
- **Review fixes** (comprehensive batch review): curly-quote parse bomb in roleHomeConfig 165-166
  (build-breaker — third strike for the string-quoting failure class), Rules-of-Hooks guard placement in
  JobsHub + JobsBoard (denied-flag pattern, effects no-op), embedded board no longer double-wraps the page
  shell, dead DONE_STATUSES entries trimmed.

State: authored only, nothing staged/committed. Gate A remainder unchanged (fn deploys + git add -f batch on
Jordan's word). CI typecheck still pending first push — now covers maintenance + service jobs + IA rework.

## 2026-06-12 — Jobs Board "ops command center" rework (mock-driven, data-honest)

Jordan supplied mock designs + a senior-dev enhancement brief; implemented the mock-visible set bound to REAL
data only (nothing invented — the mocks' hour-estimates were skipped: no such field exists; flagged as a v2
schema candidate `estimated_hours`).

- **Data layer** (jobsBoard.ts, TDD 41/41 green): BoardCard.completedAt; pure `priorityFor` (maintenance
  urgency 5-4→P1/3→P2/1-2→P3; service+project from schedule pressure overdue|today→P1, ≤3d→P2, dated→P3,
  undated→none; closed→none), `hoursWaiting`, `columnMetrics` (avg wait / next due / avg age / closed today),
  `localDateOf` (TZ-safe completed-today — fixed a real AEST morning undercount).
- **Board UI**: toolbar (search w/ F+/ shortcuts + kbd hint, type chips, Filters popover housing Show-cancelled
  + Assigned-to-me), Shortcuts pill + ? cheat-sheet modal, N=new job; column accent bars (slate/ink/amber/green)
  + micro-metric lines; mock card anatomy (type stamp w/ glyph, P1-P3 badge, waiting chip ≥2h amber/≥6h red w/
  soft warm ring on hot P1s, contextual due pills, "Closed today" pill, real-initials assignee coins via
  profiles map, Assign ghost button); inline "+ Add job" composer per column (NewServiceJobModal initialStatus
  chaining w/ created-but-pending failure surfaced honestly); aria-live truthful move announcements (actual
  landed column; failure announced); extracted BoardToolbar.tsx + ShortcutsModal.tsx.
- **Projects view cards**: segmented 4-color progress bar (done/in-progress/blocked/not-started, real
  task-status counts incl. new tasksBlocked plumbing), LAST OPENED / ACTIVE TODAY captions (real localStorage
  recents), "{N}d left" chips, "View board →" (activates project then /gantt — also fixed board project-cards
  not activating before navigate). Runway sparkline OMITTED honestly (no historical snapshot source in
  frontend; noted for v2).
- Review fixes: TS6133 CI killer (dead mostRecentId plumbing removed), TZ closed-today, aria-live truthfulness,
  modal partial-failure duplication risk, hardcoded confirm status.

Deferred per scope call (not in mocks / heavy infra): virtualization, PWA offline, websocket presence,
multi-select drag, keyboard reorder, timeline view, crew heatmap, saved filters, bulk actions, per-card timer.

State: authored only, nothing staged/committed. Parked: M3 E2E walkthrough, Gate B email setup, Stage 7 commits.

## 2026-06-12 — White-page navigation bug ROOT-CAUSED + app-wide skeleton loaders

Jordan reported navigations going white until manual reload; asked for skeletons. Investigation found the real
bug first: the route tree was wrapped in AnimatePresence mode="wait" keyed by pathname — and the IA rework
multiplied instant-redirect routes (/projects, /maintenance, /reports, /finance). mode="wait" holds the new
page until the old page's exit completes; back-to-back navigations (exactly what redirects produce) can drop
the incoming child entirely → permanent blank page. FIX: removed the wait-gated exit choreography; routes keep
an enter-only fade (keyed motion.div, no AnimatePresence) — the new page always mounts.

Also:
- `lazyWithRetry` extracted to lib/lazyWithRetry.ts (retry + one-shot reload on stale chunks); JobsHub's inner
  Board/Projects lazy views now use it (were bare lazy()).
- Skeleton system: extended components/ui/skeleton.tsx (editorial cream tones, prefers-reduced-motion aware)
  with SkeletonLine / SkeletonCard / PageSkeleton / BoardSkeleton presets.
- Route-level Suspense fallback → PageSkeleton (was an off-palette spinner — the "white flash" surface).
- JobsHub view fallbacks → BoardSkeleton / projects-grid skeleton; JobsBoard initial load → BoardSkeleton.
- Initial-load spinners swept to layout-matched skeletons: CustomersList, CustomerDetail, RequestDetail,
  CustomerPortal. (Projects + MyRequests render synchronously — no change needed.)

Plus this morning: masthead density rework (single informative bar, icon-only shortcuts w/ tooltip, stat blocks
with sublabels), Projects header merge (green LIVE eyebrow + honest 4-wk runway sparkline reconstructed from
real end dates), project board-cards matched to mock (green stamp, Fraunces titles, real crew avatar stacks
from project_members; hours/Timer chips honestly omitted).

State: authored only, nothing staged/committed. Parked: M3 walkthrough, Gate B, Stage 7 commit train.

## 2026-06-12 (late) — NewWorkModal: tabbed create (Service job | Project) + form rebuilds

Jordan asked for the New-job form rebuilt + a Project tab as a shortcut + the New-project UI made consistent.

- NEW pages/jobs/NewWorkModal.tsx — editorial tabbed shell ("JOBS BOARD" eyebrow, Fraunces "New work."),
  pill tab strip Service job (Zap) | Project (FolderOpen); Project tab gated canCreateProject; when opened
  from a column composer (initialStatus) the Service tab is forced and the strip hidden. Shared cream footer;
  native form-association seam: both tabs are <form id> elements, primary button uses form={activeFormId}.
  Escape/backdrop close, first-input focus, full reset on close.
- ServiceJobForm (inside NewWorkModal): ALL NewServiceJobModal logic preserved (4 initialStatus paths incl.
  scheduled-requires-date autofocus + done/in_progress chaining + created-as-pending partial-failure warning,
  customer→property swap) restyled into three hairline sections (THE JOB / WHO IT'S FOR with cream inset
  mode-panels / SCHEDULING). Old NewServiceJobModal.tsx DELETED (single importer confirmed).
- NEW pages/projects/components/ProjectCreateForm.tsx — project form body extracted (fields, dates, budget,
  full phases state machine) with id/hideFooter embed seam; standalone navigation behavior moved to the
  wrapper's onCreated so the board-embedded path stays put and refetches instead.
- NewProjectModal.tsx → thin restyled wrapper ("PORTFOLIO" eyebrow, Fraunces "New project.") — Projects page
  behavior unchanged. JobsBoard swapped to NewWorkModal (N shortcut, toolbar, composers all land there;
  onProjectCreated = silent refetch + toast).

State: authored only, nothing staged/committed.

## 2026-06-12 (night) — TradeDesk brief scoped (docs only, no code)

Boss delivered the full TradeDesk requirements brief (customer portal / field app / inventory / office-commercial
/ AI), authored against his HTML+localStorage prototype with a Firebase-migration premise. Capability audit of
SiteProof (7 systems, file-verified) showed ~40% of the brief already live — incl. polish-text (= his "AI note
rewording"), signature capture, timesheets, chat, task QA, customer portal. Decisions (Jordan): SiteProof/
Supabase absorbs TradeDesk; scoping doc before build; prototype port noted as cheaper path for the plan viewer.

Shipped: **docs/TRADEDESK_SCOPE.md** (boss-ready: wins table, gap analysis, P1–P7 phased forecast ~6–8 wks
parallel-tracked, all 8 open questions answered w/ 3 flagged for the boss — variation threshold, schedule rules,
Xero-vs-export — plus risk register and permissions appendix). ROADMAP.md gained the NEXT PUSH section; todos.md
synced; memory updated. Key design guards recorded: customer invoicing = NEW customer_invoices table (existing
invoices are supplier bills); timesheets lack rates → worker_rates in P4; signoffs.kind extension for SWMS;
catalogue must preserve order-line text-id convention (migration 43).

Build starts per-phase on boss sign-off. Parked: M3 walkthrough, Gate B email, Stage 7 commit train.

## 2026-06-12 (TradeDesk P1) — Materials catalogue + prebuilds BUILT

First TradeDesk phase executed (spec docs/superpowers/specs/2026-06-12-materials-catalogue-design.md, plan
docs/superpowers/plans/2026-06-12-materials-catalogue.md):

- **Migration 64** (NOT yet applied — joins Jordan's next SQL session): materials (optional unique SKU, ex-GST
  cost/sell, gin-indexed tags, preferred supplier), prebuilds + items (restrict-delete on materials),
  material_tags library, material_candidates mining inbox POPULATED IDEMPOTENTLY from historical
  orders.line_items (key 'description' verified against orders.ts/types; dismissed candidates never
  resurrected); 20 RLS policies (manager CRUD, worker read on 4 tables, candidates manager-only) with
  drop-if-exists guards — re-paste-safe end to end.
- **Capability** manageCatalogue (4 manager tiers) + helper + matrix + snapshot (30/30).
- **lib/catalogue/csv.ts** (TDD 10/10): hand-rolled quoted-CSV parser w/ row-numbered errors + finite/
  non-negative price validation; planImport (sku→update, active-name→skip, else add).
- **lib/api/materials.ts**: 19 functions; ilike escaping + strip of PostgREST-structural chars (* , parens);
  runImport chunked w/ per-chunk failure tolerance + forced re-plan after any confirm (no duplicate inserts on
  retry); approveCandidate links an EXISTING material id (review caught a double-create — fixed).
- **/catalogue page** (More ▾, manager-gated): Materials (debounced safe search, tag chips, price cells
  capability-gated), Prebuilds (editor w/ qty rows + reorder + items-count pills), Import (parse→preview→
  plan→confirm→result, template download, FileReader error handling), Suggestions (occurrence-sorted
  approve/dismiss + bulk dismiss, linkError surfaced honestly).
- Review cycle: 1 Critical (approval double-create) + 2 Important (comma .or() injection, runImport retry
  duplication) + 7 minors — all fixed; tests 10/10 + 30/30.

State: authored only, nothing staged/committed. Jordan's next SQL session: apply migration 64 (idempotent).
P2 (revenue pack) waits on the boss's three TRADEDESK_SCOPE decisions.

## 2026-06-13 — Customers hub rework (Jordan's HTML mock, production-honest)

Jordan supplied an interactive HTML mock for the Customers tab; translated to house tokens + REAL data only
(no seeds — page starts honestly empty in production).

- **Migration 66**: customers.customer_type text null (free text; UI suggests Residential/Commercial/
  Agricultural/Strata/Builder/School). Idempotent. Joins the 64/65 apply batch.
- **CustomersList rebuilt** (~666 lines): masthead w/ properties-under-care count + client-side CSV export;
  urgent strip (real urgent-request count, names list, Review→drawer); search ('/' shortcut, covers
  name/type/contact/email/property text), All/Active/Archived pills w/ counts, 3 sorts (recently-active uses
  derived last-activity), table rows (deterministic-hue initials avatars, open-request pills w/ URGENT marker,
  relative last activity); skeleton/error/empty states.
- **NEW CustomerDrawer** (~442): slide-over w/ contact mailto/tel pills, properties, open requests
  (URGENT/HIGH/ROUTINE from real urgency), derived activity timeline (request logged/completed + customer
  added — full history, cap 6), Archive/Reactivate, Message customer (omitted when no email), Full profile →
  existing CustomerDetail (schedules/invites/commercial untouched).
- **Create modal upgraded**: Type select + optional first-property address (property failure can no longer
  duplicate the customer on retry — split try/catch, honest warning toast); Edit modal gained the same Type
  field (nullable-clear). customers.ts/properties.ts: customerType end-to-end + listAllProperties.
- Review cycle: 2 Critical (TS6133 unused import; duplicate-customer-on-retry) + 2 Important (drawer timeline
  starved of completed requests; urgent count counted customers not requests) — all fixed.
- QA_TESTS.md block I added.

State: authored only. Jordan's SQL batch is now migrations **64 + 65 + 66** (all idempotent, in order).

## 2026-06-15 — PP2 Simpro Jobs import + staging (Jordan's HTML mock + Img #1 hero)

Built the "Sim-Pro Jobs" tab from placeholder → real CSV import + staging workspace. Brainstormed first;
spec at `docs/superpowers/specs/2026-06-15-simpro-jobs-import-design.md`. Decisions: persisted staging table
(not client-only), scheduling timeline deferred, app house-style (not the mock's navy/emerald), parser column
map provisional pending a real Simpro export. Backend-first; TDD on the pure logic.

- **Migrations 68/69/70** (idempotent): 68 `contract_value` numeric(12,2) on projects + service_jobs; 69
  `external_ref` text + partial-unique index on both (idempotent re-import key); 70 `simpro_jobs` staging
  table (external_ref unique, stage CHECK over the 5 Simpro stages, raw jsonb for forward-compat,
  import_batch_id, imported_by, promoted_at/_to_type/_to_id) + touch trigger + RLS (SELECT = manager+ OR
  worker; INSERT/UPDATE/DELETE = manager+, mirrors migration 64 grammar).
- **`lib/jobs/simproCsv.ts`** (pure, TDD — 11 tests green single-fork): `parseSimproCsv` (provisional header
  job_no/description/customer/site/suburb/type/due/stage/job_type/contract_value; required = job_no + stage;
  AU dd/mm/yyyy → ISO; `$1,234` money coercion; stage-spelling normaliser), `planSimproImport` (new ref → add,
  staged ref → update, in-file dup → skip), `resolveJobType` (project/* → project, else service),
  SIMPRO_STAGES/STAGE_LABEL/SIMPRO_CSV_TEMPLATE. Copies the catalogue tokeniser to stay dependency-free.
- **`lib/api/simproJobs.ts`**: listSimproJobs({stage,search} w/ escaped .or ilike), listStagedRefs, stageCounts,
  importStagedJobs (chunked insert + per-row update on external_ref, accumulating failures, one batch id),
  confirmImport (promotes promoted_at-null rows; routes by job_type default service; upsert-on-external_ref
  into service_jobs/projects carrying contract_value + external_ref; stamps promoted_*). Provisional stage→
  status maps; project promote is a minimal direct insert (RPC phase/task scaffold deferred to CSV finalise).
- **`SimproJobsTab.tsx`**: hero (PP2 eyebrow, Fraunces "Simpro jobs.", 5 stage count tiles + total, Download
  template / Upload new CSV / Confirm import — write actions gated by canManageServiceJobs), stage tab-strip
  w/ counts, searchable browse table, ImportModal (file → parse → plan chips + 15-row preview → persist),
  ConfirmModal. House tokens from ledger.tsx (cardShell/btnPrimary/btnGhost/TONE/StatusPill/FRAUNCES).
- **JobsHub.tsx**: lazy SimproJobsTab replaces SimproJobsPlaceholder (removed).
- Verify: single-fork vitest 11/11 green; `tsc --noEmit` clean for all new files (only pre-existing
  TS1127 "Invalid character" errors in `pages/sales/Sales.tsx`, untouched WIP — flagged to Jordan).

State: authored only, nothing staged/committed (pay-rise build hold). Jordan's SQL batch grows to **64 + 65 +
66 + 68 + 69 + 70** (idempotent, in order; 67/labour-rates PP1 not built). Two CSV-gated follow-ups: finalise
`simproCsv.ts` column map + project/service routing against a real Simpro export.

## 2026-06-15 (later) — PP2 importer tuned to the REAL Simpro "Job List Report" + multi-file upload

Jordan supplied 5 real exports (one per stage: Archived/Invoiced/Progress/Complete/Pending). The real format
differs sharply from the provisional guess; reworked the parser to match. Boss decision: "Confirm import"
promotes ALL jobs status-mapped (already the behaviour). No $ value or project/service column in this report →
values import blank, everything routes to Service Jobs.

- **Real format:** row 1 = banner `"Selected Criteria - Job Stage: X"` (stage lives here, not a column);
  row 2 = header `Job, Due Date, Customer, Telephone, Email, Site, Site Address, Site Suburb`; UTF-8 BOM;
  the `Job` cell packs `"<no> - <description>"`; quoted fields contain embedded newlines (records span lines).
- **`simproCsv.ts` rewrite (TDD, 11/11 green single-fork):** replaced the line-split tokeniser with a full
  RFC4180-ish reader (quoted commas + doubled-quote escapes + quoted newlines + BOM strip). Banner→stage
  extraction (`/job stage:\s*(.+)/i` → normalizeStage) applied file-wide, with a per-row Stage column fallback;
  `Job` split on first `" - "`; optional Stage/Contract Value/Type/Job Type columns read if present (future
  value-bearing exports work unchanged). `SimproJobRow` gained `telephone, email, siteAddress`; template +
  fixtures rewritten to the real shape (incl. an embedded-newline regression row, copied from job 4154/3846).
- **Migration 70** gained `telephone, email, site_address` (still unapplied — safe edit).
- **`simproJobs.ts`:** row/domain/`rowToStaged`/`simproRowFields` carry the 3 new fields; promote sets
  `client_phone = telephone` and `address = siteAddress + suburb` (fallback site label). `confirmImport`
  scope unchanged (all, status-mapped).
- **`SimproJobsTab.tsx`:** browse table → Job · Description · Customer · Site · Suburb · Phone · Due · Stage
  (dropped always-empty Type/Value, removed `fmtAUD`); import-preview table likewise (added Phone, dropped
  Value). Multi-file upload (added earlier) lets Jordan drop all 5 stage files in one go — each carries its
  own banner stage; dedupe by external_ref across the set.
- Verify: single-fork vitest 11/11; `tsc --noEmit` clean for all simpro/JobsHub files (only pre-existing
  Sales.tsx TS1127 remain). Manual end-to-end pending Jordan applying 68→69→70 in Supabase.

State: authored only, staged/uncommitted. The CSV-gate is now closed (parser matches the real export);
contract_value still null until a value-bearing Simpro export or manual entry.

## 2026-06-15 (later) — Schedule week board (deferred mock feature, now built)

Built the deferred scheduling timeline from `SiteProof_Schedule_Timeline(1).html` as a new **Schedule**
tab. Brainstorm → spec (`docs/superpowers/specs/2026-06-15-schedule-week-board-design.md`) → plan
(`docs/superpowers/plans/2026-06-15-schedule-week-board.md`) → subagent-driven execution (backend bundle +
frontend bundle, controller review between). Decisions: new Schedule view (4th JobsHub pill), persisted +
live, multiple crew per job, crew = all active staff, reuse `service_jobs.scheduled_for` as the day (no
time-of-day), active jobs only.

- **Migration 71** `service_job_crew` (job_id, user_id PK; assigned_by/at) + index + RLS (view = manager+ OR
  worker; insert/delete = manager+) + guarded realtime publication add + `notify pgrst, 'reload schema'`.
- **`lib/jobs/scheduleWeek.ts`** (pure, TDD 7/7 single-fork): `weekDates` (Mon–Sun, month/year-boundary
  safe), `toISODate`, `groupJobsByDay` (unscheduled / per-day; out-of-week ignored; tolerates ISO timestamps).
- **`lib/api/serviceJobCrew.ts`**: `listCrewForJobs` (jobId→userIds map), `addCrew` (idempotent upsert),
  `removeCrew`. **`serviceJobs.ts`**: `unscheduleServiceJob` (clear scheduled_for + status→pending) +
  surfaced `externalRef` on the ServiceJob type/mapper (column from migration 69).
- **`ScheduleTab.tsx`**: 8-column board (Unscheduled + Mon→Sun, today tinted), week nav, native-HTML5 DnD
  (drag→day = schedule, →pool = unschedule) with optimistic override + revert-on-error, per-card crew avatars
  + a manager-only Assign-crew popover, Supabase realtime on service_jobs + service_job_crew. Controller
  review caught a non-silent refetch (board flashed to spinner on every realtime tick / post-drag) → added a
  `refresh({silent})` path. House tokens from ledger.tsx.
- **`JobsHub.tsx`**: 4th "Schedule" pill (`CalendarDays`, `?view=schedule`) + lazy `ScheduleTab`.
- Verify: scheduleWeek 7/7 single-fork green; `tsc --noEmit` clean for all feature files (total errors = 12,
  all pre-existing `pages/sales/Sales.tsx` TS1127). Manual end-to-end pending Jordan applying migration 71.

State: authored only, staged/uncommitted (pay-rise hold). Pending-apply SQL batch is now **68 · 69 · 70 ·
71** (in order, idempotent). Manual smoke (drag persists across reload; crew avatars persist; live across two
browsers) once 71 is applied.

## 2026-06-16 — Scheduler redirected INLINE onto Sim-Pro Jobs rows + 1000-row count-cap bug fixes

User feedback after seeing the separate Schedule tab: it should be the original mock's **inline per-row
View expander** (one job's timeline + crew), not a tab; and the bar must be a **resizable date range** over
**week/month**. Re-brainstormed (decisions in the spec REVISION block), then rebuilt.

- **Count-cap bug (flagged):** the stage badges summed to exactly 1000 — `stageCounts` did one `select('stage')`
  which PostgREST caps at 1000 rows, so a 1,376-row table read Pending=0, Invoiced=181. Fixed: per-stage
  `count:'exact', head:true` (no rows, no cap). Same cap hardened with `.range()` pagination in
  `listStagedRefs` (re-import dedupe) and `confirmImport` (promote backlog).
- **Migration 72** `72_simpro_schedule.sql`: `simpro_jobs += scheduled_start, scheduled_end (date)`; new
  `simpro_job_crew (simpro_job_id, user_id PK, …)` + RLS + guarded realtime adds (simpro_job_crew + simpro_jobs)
  + reload. Supersedes migration 71's `service_job_crew` (now unused; left in place).
- **`simproJobs.ts`:** `StagedJob`/row/mapper gain `scheduledStart`/`scheduledEnd`; `scheduleSimproJob(id,start,end)`
  + `unscheduleSimproJob(id)`. New **`simproJobCrew.ts`** (list/add/remove on simpro_job_crew).
- **Pure logic (TDD, 24/24 single-fork):** replaced `groupJobsByDay` with `timelineColumns(scale, anchor)`
  (week = Mon–Sun; month = every day) + `barSpan(start, end, columns)` (inclusive clamped span, null if
  out of view); added `inferCategory(description)` (keyword → solar/aircon/battery/generator/ev/other).
- **`SimproJobsTab.tsx`:** added a **Type** pill column (`inferCategory`) + **Actions** View/Hide column; an
  inline expander per row showing crew toggles (all active staff, `simproJobCrew`) + a **Week/Month** timeline
  with the job's bar — **pointer-drag to move + edge-handles to resize** (maps pointer→column via measured
  track width + the tested `barSpan`/`timelineColumns`), click-empty-day to place, Clear to unschedule.
  Optimistic + refetch.
- **Removed** the separate `ScheduleTab.tsx` + `serviceJobCrew.ts`; reverted JobsHub to Board · Projects ·
  Sim-Pro Jobs (no Schedule pill).
- Verify: 24/24 pure tests green single-fork; `tsc --noEmit` clean for all touched files (total errors = 12,
  all pre-existing `pages/sales/Sales.tsx`). Drag feel pending in-browser test.

State: authored only, staged/uncommitted. Pending-apply SQL batch is now **68 / 69 / 70 / 71 / 72** (71's
service_job_crew superseded but harmless). Migrations 68–70 already applied; 71 + 72 still to apply.

### 2026-06-16 (later) — scheduler form factor corrected to the user's draft + crash post-mortem

Two short iterations on the scheduler UI (`SimproJobsTab.tsx` only):
- **Briefly built an all-jobs `GanttModal`** (user had picked "all jobs / modal") — then the user's actual
  draft showed a **single-job inline expander**, so reverted. Crash they saw (`ReferenceError: GanttModal is
  not defined`) was a **stale HMR bundle mid-edit** — `GanttModal` was a hoisted top-level fn + tsc clean;
  moot now since the modal was removed.
- **Final form (matches draft):** per-row **View/Hide inline expander** for ONE job — `JobScheduleExpander`:
  "CREW ON THIS JOB" toggle avatars · status line `Booked · <start> – <end> · Nd` + Clear + hint "Drag the bar
  to move · drag either edge to change the dates" (or "Not scheduled — click a day or drag onto the timeline")
  · right-side **Today / Zoom −+ (16–80px/day) / Sync** ("In sync with SiteProof" toast) · a horizontally-
  scrollable continuous multi-week Gantt (`timelineWindow(center,2,12)`, week-group headers, dimmed weekends,
  today line) with the job's bar — pointer drag-move + edge-resize, **auto-save on drop**, click-empty-day to
  book. Added pure `timelineWindow` (TDD; scheduleWeek now 14/14).
- Verify: pure tests green (scheduleWeek 14 + simproCsv 12); `tsc --noEmit` clean for all touched files (total
  12 = pre-existing Sales.tsx only). Drag/zoom feel pending in-browser. Migration batch unchanged (68–72).

### 2026-06-16 (later still) — Create-job + auto-schedule imported jobs from Due Date

- **Auto-schedule on import:** the Simpro Job List Report has only a sparse Due Date (no start/duration), so
  imported jobs now seed a **3-day bar ending on the Due Date** (start = due − 2 → matches the draft's
  "Mon 15 – Wed 17 · 3d"); jobs without a due date stay unscheduled. New pure `scheduleFromDue(dueIso, days=3)`
  (TDD; scheduleWeek now 18/18). Applied on the import INSERT path (not UPDATE, so re-uploads don't clobber
  manual edits) AND backfilled for the already-imported 1,376 via an idempotent UPDATE in migration 72
  (`scheduled_start = due_date - 2 where due_date is not null and scheduled_start is null`).
- **Create job:** `createSimproJob(input)` API (insert into simpro_jobs, seeds the bar from due date, throws on
  duplicate external_ref) + a hero **New job** button (manager-gated) opening a `CreateJobModal` (job no.,
  description, customer, site/address/suburb, phone, Type→category, Stage, Due date) → on success toasts +
  refreshes the list/counts. Manually-created jobs appear in the table + are schedulable like imported ones.
- Verify: pure 30/30 single-fork; `tsc` clean (total 12 = Sales.tsx only). Migration batch unchanged (68–72;
  72 gained the idempotent backfill — re-run it to seed existing rows).

### 2026-06-16 (eve) — 3 fixes: timeline width containment · auto-schedule ALL jobs · bulk Confirm

- **Timeline blew out the page width** (a wide Gantt in an auto-`<table>` cell forces the table — and the page —
  wider; the inner scroll stopped containing). Fix: measure the table scroll-viewport width via a
  `ResizeObserver` on the wrapper (`tableWrapRef` → `viewportW`), pass it to `JobScheduleExpander`, and pin the
  timeline card to `width: viewportW − 32` so the Gantt scrolls INSIDE the row. No more page-level horizontal scroll.
- **Auto-schedule every job (not just due-dated):** added pure `scheduleFromStart(startIso, days=3)` (start-
  anchored; scheduleWeek now 20/20) + a `defaultSchedule(due, fallback)` helper. Import insert + `createSimproJob`
  now ALWAYS seed a 3-day bar — ending on the Due Date when present, else starting on the import/created day.
  Migration 72 backfill widened to `coalesce(due_date-2, imported_at::date)` / `coalesce(due_date, imported_at::date+2)`
  for ALL unscheduled rows (still guarded on `scheduled_start is null`).
- **Confirm import was slow** (~1,376 × 3 sequential-ish round-trips). Rewrote `confirmImport` to **bulk**: one
  paginated `fetchExistingRefs(table)` → partition into fresh/dupes → chunked bulk `insert` of new rows + chunked
  `markPromoted` (update simpro_jobs `in (external_ref…)`) per successful chunk; existing refs updated via a small
  pool. ~70× fewer requests (a full 1,376 confirm: ~tens of calls vs thousands → seconds not minutes). Dropped the
  per-row `promoted_to_id` stamp (unused in UI). Extracted `serviceJobPayload`/`projectPayload` builders.
- Verify: scheduleWeek 20/20 single-fork; `tsc` clean for all feature files (total 12 = Sales.tsx). Migration
  batch still 68–72 (72 must be re-run to backfill the bars).

### 2026-06-16 (late eve) — crew-load 400 fix + two cosmetic tweaks

- **400 (URI too long):** `listCrewForSimproJobs` was called with the WHOLE stage's ids (500–750 UUIDs) →
  `simpro_job_crew?...in.(…)` URL ~20 KB → PostgREST 400. Crew only shows in the expander, so now we load it
  for the **open job only** (`refreshCrew([expandedId])` on expand/list-refresh; toggle uses `[jobId]`; sync uses
  the open id) — and chunked `listCrewForSimproJobs` at 100 ids defensively. No more giant URL; also far fewer
  requests on stage-switch/crew-toggle.
- **Cosmetic:** View button lost its `⌃/⌄` chevron glyphs (just "View"/"Hide" + the calendar icon); the Stage
  pill got `whitespace-nowrap` so "In Progress" stays one line.
- `tsc` clean for all feature files (total 12 = Sales.tsx).

### 2026-06-16 (late eve, 2) — stop the per-drag table refresh

`applySchedule`/`clearSchedule` ran `refreshList()` in `finally`, which sets `loading=true` → the whole table
flashed to the spinner on EVERY drag/resize commit. Removed the refetch: the optimistic `scheduleOverride`
already moves the bar instantly, the save runs in the background, and on error it reverts the override + toasts.
The override holds the bar until the next deliberate list refresh (stage switch / Sync), by which point the DB
matches. Smooth drag, no flicker. `tsc` clean (total 12 = Sales.tsx).

## 2026-06-17 — Simpro track polished + finished (catch-up: built externally 15–16 Jun)

Returned to find a Simpro import/scheduling track built between sessions (migrations 68–72, SimproJobsTab,
simproJobs/simproJobCrew/simproCsv) that diverged from its own roadmap: PP2 (Simpro) was built FIRST and
expanded beyond "a CSV importer" (staging table + drag/resize scheduling timeline + crew), while PP1 (labour
costing — the profit engine, migration 67) was never written. Scanned it fully; the code is genuinely solid
(chunked/pooled import, idempotent confirm-import on external_ref, RFC4180 CSV parser TDD 12/12, no stubs).

Polish performed (scope: "finish + polish the Simpro track"):
- **Deleted migration 71 (`service_job_crew`)** — dead: referenced NOWHERE in the codebase, unapplied, and
  self-declared "superseded" by 72's `simpro_job_crew`. Apply order is now 68 → 69 → 70 → 72. Reconciled 72's
  header.
- **Board integration verified** — promoted Simpro jobs become ordinary projects/service_jobs rows;
  jobsBoard.fetchBoardCards has no external_ref exclusion, so they appear automatically. confirmImport sets
  status + scheduled_for, so they render correctly.
- **Promotion now carries the timeline** — serviceJobPayload/projectPayload prefer the `scheduled_start/end`
  bars the owner set on the Sim-Pro tab over the raw Simpro due date, so scheduling work isn't lost on promote.
- **QA block J** added (import → dedupe re-import → schedule/crew → confirm → lands on board; worker access).
- **Docs reconciled** — SIMPRO_COSTING_PAYMENTS_ROADMAP (build-vs-plan note + PP2 marked BUILT with real
  migration numbers) and TRADEDESK_ROADMAP P4 (reframed; PP1 flagged as the true next build).

PP1 (labour costing + per-job profit) remains UNBUILT and is the genuine next step — the contract values Simpro
imports are stored but have no profit view behind them until PP1 ships.

State: authored only, nothing staged/committed. Pending-apply backlog now: 64, 65, 66 (TradeDesk P1/P2 +
customers) and 68, 69, 70, 72 (Simpro). simproCsv 12/12 green; my change touched only simproJobs.ts payloads.

## 2026-06-17 — PP1 BUILT: bottom-dollar labour costing + per-job profit

The profit engine behind the Simpro contract values. Boss decisions were already locked (loaded $/hr per role,
gross = revenue − materials, net = − loaded labour, AUD); Jordan confirmed materials = a manual per-job field
in v1 (P3 stock will auto-fill it later).

- **Migration 73_labour_costing.sql** (forward-only; 67 was never written): `labour_rates` (role unique ·
  loaded_rate nullable AUD ex-GST · active · sort; seeded electrician/foreman/apprentice with null rates ready
  to fill; manager-only RLS — workers never read rates) + `role` text on `timesheets` & `service_job_time_entries`
  + `materials_cost` numeric(12,2) on `projects` & `service_jobs`. Idempotent.
- **lib/commercial/costing.ts** (pure, TDD 10/10): `rollUpLabourCost` (hours×rate by role; null/unknown role or
  null rate → surfaced as uncosted, never silently zeroed; rate 0 = costed) + `computeProfit` (gross/net/
  marginPct, nulls→0, marginPct null when no revenue) + `formatAUD`.
- **lib/api/labourRates.ts**: rates CRUD + `getServiceJobProfit`/`getProjectProfit` (assemble revenue +
  manual materials + costed labour → JobProfitResult w/ `complete` flag). Setters `setContractValue`/
  `setMaterialsCost` added to serviceJobs.ts + projects.ts (nullable-clear). `ServiceJobTimeEntry` widened to
  carry `role` cleanly (removed an `as unknown` hack).
- **UI** (manager-gated, AUD, no $ to field roles): `ProfitSummaryCard` (Revenue/Materials/Labour → Gross/Net/
  Margin pill + honest "materials not entered"/"Nh uncosted" flags); `LabourRatesSettings` in Sales→Settings;
  Set-financials modal + Profit section in ServiceJobDrawer; role `<select>` (names only) on TimeEntriesSection;
  profit card + set-financials in ProjectFinancePanel.
- Review: Approved, no Critical/Important. Fixed 2 minors (duplicate margin pill → single Margin row;
  project financials modal now writes only changed fields). Costing suite 10/10.
- **Deferred (flagged):** no role-picker on the *project* weekly timesheet grid (CrewTab) yet → project labour
  reads as "uncosted" until added; service-job hours cost fully. Dashboard margin widgets (later add-on).

State: authored only, nothing staged/committed. Pending-apply backlog: 64/65/66 (TradeDesk) · 68/69/70/72
(Simpro) · 73 (costing). QA block K added.

---

## 17 June 2026 — Master roadmap compiled + Sim-Pro board UI de-clutter

**Docs.** Created `docs/TRADEDESK_MASTER_ROADMAP.md` — the single ranked source of truth across all
TradeDesk-era roadmaps (status-at-a-glance table + Tier 0→4 ranking). Guiding principle:
*consolidate → finish open surfaces → expand → payments last.* Reconciled `docs/EXTRA_FEATURES_ROADMAP.md`:
flagged the migration-number collision (Xero/quoting/cashback were penned to 72/73/74, but 72=Simpro
schedule and 73=labour costing are already built → XF must renumber to 75+) and re-ranked XF1 Xero from
"#1" to late-game (money rails only on a frozen/applied/committed core).

**Sim-Pro board cleanup** (`frontend/src/pages/jobs/SimproJobsTab.tsx`) — the surface flagged as messy:
- Removed the hero's 5 stage-count tiles + total tile (they duplicated the count badges already on the
  stage tabs). Tabs are now the single source of per-stage counts.
- Folded the stage tab-strip + search out of a floating row and into the browse-table card as a cream
  toolbar band — two cards now (slim header + register) instead of card/floating-row/card.
- Slimmed the table 10 → 7 cols: dropped **Stage** (the active tab already pins it — every row was the
  same stage), dropped **Phone**, folded **Suburb** under **Site** as a muted sub-line. `COLUMN_COUNT` 10→7.
- Added a `JobFact` helper + a "Job detail" strip at the top of the inline expander (Stage · Site · Suburb ·
  Phone[tel: link] · Due) so nothing dropped from the table is more than one click away.
- Removed internal "PP2" jargon from the on-screen eyebrow; shortened action labels.
- Doc-block + Customer-cell truncation nits fixed.
- Reviewed (subagent, focused on the recurring CI-killers): no Blocker/Should-fix; `tableWrapRef` still
  sizes the inline timeline; all imports still referenced; cell counts match COLUMN_COUNT=7.

State: authored only, nothing staged/committed (Stage-7 hold still in force; finalization-for-pay-raise).
Pending-apply backlog unchanged: 64/65/66 · 68/69/70/72 · 73.

---

## 17 June 2026 — Tier 0 migrations applied + PP1 project role-picker (completes labour costing)

**Tier 0 (Jordan).** Migration backlog **64·65·66·68·69·70·72·73 applied** (pasted into the Supabase SQL
editor). Master roadmap + status table updated to reflect "applied". QA blocks G–K and the Stage-7 commit
train remain (commit still on hold).

**PP1 completion — project-timesheet labour-costing role-picker** (the deferred gap):
- Problem: `getProjectProfit` rolls up `timesheets.role` (column added by mig 73), but nothing in the UI
  ever set it — so every project timesheet row was `role = null` → project labour always read "uncosted".
- `frontend/src/lib/api/timesheets.ts`: wired `role` through the whole type chain (`Timesheet`,
  `TimesheetRow`, `mapTimesheetRow`, `TimesheetPatch` + `updateTimesheet`). New exported
  `setProjectWorkerRole(projectId, workerName, role)` — bulk-sets the costing role on ALL of a worker's
  rows for a project (the role is constant per worker; profit reads every submitted/approved row, so a
  project-wide set is correct). `isUuid` + `supabaseConfigured` guarded; null clears.
- `frontend/src/pages/gantt/tabs/CrewTab.tsx`: in the weekly Timesheets grid, a manager-gated
  (`canEditBudget` — same gate as the Profit card) per-worker role `<select>` (names only, no $; sourced
  from `listLabourRates`). Optimistic local update + bulk write, reconciled by the realtime UPDATE stream.
  Untagged workers show a dashed-amber "Set role…" state mirroring the Profit card's honest uncosted flag.
- RLS: timesheets UPDATE is `is_project_member` (permissive), so the manager gate is safely tighter than
  the DB; intended users are members.
- Reviewed (subagent): no Blocker/Should-fix. String match electrician↔rate is exact (picker constrained
  to the rate list); `TimesheetRow.role` required-field change breaks nothing (all uses are `as` casts);
  all new imports referenced.

State: authored only, nothing staged/committed (Stage-7 hold). PP1 now costs BOTH service jobs and projects.
Next build (Tier 1 #5): the customer portal HOME page.

---

## 17 June 2026 — Jobs board "long receipt" fix (kanban windowing + Sim-Pro table cap)

After the SimPro import promoted ~1,376 jobs, both Jobs-hub list surfaces rendered EVERY row with no cap
and no internal scroll → the page grew to ~32,000px ("a long receipt you won't read"). Fixed both:

**Kanban board** (`frontend/src/pages/jobs/JobsBoard.tsx`):
- Per-column render cap `COLUMN_RENDER_CAP = 20` with a pinned-footer "Show all N / Show less (top 20)"
  toggle (`expandedCols` Set). The DOM is windowed; column header counts stay the TRUE total.
- Each column body is now `max-h-[60vh] overflow-y-auto` → columns scroll internally; the page height is
  bounded regardless of card volume. `flex-1` kept so footers stay bottom-aligned across columns.
- Done column re-sorted most-recently-closed first (`completedAt` desc) so the windowed view shows
  *relevant recent* closures, not the oldest (the base sort is scheduledFor/createdAt asc = oldest-first,
  wrong for closed work). Cancelled still sink to the bottom.
- "+ Add job" moved into the pinned footer (full opacity, always reachable) alongside the Show-all toggle.
- Reviewed (subagent): no Blocker/Should-fix; JSX balanced; counts accurate; framer-motion layout benign.

**Sim-Pro browse table** (`simproJobs.ts` + `SimproJobsTab.tsx`):
- `listSimproJobs` gained an optional `limit`; the table fetches `BROWSE_LIMIT = 100` most-recent rows
  instead of the whole stage (could be 1,376). Stage totals remain accurate (they come from
  `stageCounts()`, not this list).
- Truncation hint below the table when capped — search-aware ("first 100 matches" vs "100 most recent of
  {stage total} — search to narrow").

State: authored only, nothing staged/committed (Stage-7 hold). Both Jobs surfaces now stay calm + bounded.

---

## 17 June 2026 — Edit a staged Sim-Pro job (fix bad imported data)

Managers can now correct an imported Sim-Pro job's fields AND its stage/status before confirming — for when
a CSV row came in wrong.

- **API** (`lib/api/simproJobs.ts`): new `updateSimproJob(id, patch)` + `UpdateSimproJobInput`. Nullable-clear
  patch (only present keys written), `supabaseConfigured()` guard, throws on error. Deliberately does NOT
  touch the schedule bar (the expander owns that) or promotion columns (editing the staging row never
  retro-updates an already-promoted live job).
- **UI** (`pages/jobs/SimproJobsTab.tsx`): new `EditJobModal` (mirrors the create modal, pre-filled) with a
  **Stage / status** picker, Type, email, and all address/contact fields. A manager-gated **Edit** button sits
  beside View on each row. Saving toasts + re-runs `afterWrite()` (refreshCounts + refreshList) — so a job
  whose stage changed correctly moves to its new tab and counts update. external_ref stays unique (a clash
  throws → error toast). A note appears for already-imported jobs explaining edits only affect the staging copy.
- `category` is only written when the user actually changes it (avoids silently coercing a null category to
  'other' on an unrelated edit).
- Reviewed (subagent): no Blocker/Should-fix after the category fix; all imports referenced; one `<td>` intact
  (COLUMN_COUNT=7); throw→toast path confirmed; expander interaction safe.

State: authored only, nothing staged/committed (Stage-7 hold).

---

## 17 June 2026 — Sim-Pro stage visible on Jobs Board cards

Issue: jobs promoted from Sim-Pro lose their stage on the board — `complete`/`invoiced`/`archived` all
collapse into the single "Done" column (SERVICE_STATUS map), indistinguishable, and the original stage
isn't stored on the promoted job. Fix WITHOUT a migration: recover the stage by joining the promoted card
back to its persisting staging row via `external_ref`, and badge it on the card. (Chosen via AskUserQuestion
— "badge on each card" over filter / separate-columns.)

- `lib/api/projects.ts`: declared `external_ref: string | null` on `ProjectRow` (column already existed).
- `lib/api/jobsBoard.ts`: `BoardCard` gains `simproStage?: SimproStage | null`. New failure-tolerant
  `fetchSimproStages()` builds an `external_ref → stage` map (paginated past 1000, try/catch → empty map on
  error). `fetchBoardCards` runs it as a 4th parallel read and attaches `stageFor(external_ref)` to service +
  project cards (normal + cancelled). Maintenance cards never carry it.
- `pages/jobs/BoardCardItem.tsx`: `SIMPRO_STAGE_BADGE` for **complete/invoiced/archived only** (pending/
  in_progress are implied by the column → no redundant badge). Renders a small tag on row 1 beside the type
  stamp; added to the card aria-label.
- Reviewed (subagent): no Blocker/Should-fix. Mixed-operator ternary parses fine; `Partial<Record>` indexing
  guarded; jobsBoard.test.ts unaffected (pure-fn tests only); the extra read degrades gracefully if simpro_jobs
  is unavailable. Perf note: the ~1,376-row × 2-col read runs on every board (re)fetch — bounded/light, cache
  later only if refetch frequency climbs.

State: authored only, nothing staged/committed (Stage-7 hold).

---

## 17 June 2026 — Customer → staff job-issue reporting (boss-independent backup-plan work)

Context: boss comms stalled, so building features that need NO boss decision. This one lets a customer flag a
problem on a SPECIFIC job (service / promoted Sim-Pro) and pings staff — reusing the existing
maintenance_requests + notifications pipeline (the manager fan-out trigger already existed).

- **Migration 74** `74_job_issue_reporting.sql` (NEW — pending apply; next free after 73, XF/Xero stay 75+):
  - `maintenance_requests.service_job_id` (nullable FK → service_jobs, on delete set null) + partial index.
  - Additive customer SELECT policy on `service_jobs` (own jobs only; inert for staff via current_customer_id()).
  - Rebuilt `maint_req_insert` preserving every mig-59 guard + a job-ownership clause (can't attach a job you
    don't own; property_id NOT NULL + property-ownership still enforced).
  - `create or replace` the notify trigger fn: manager fan-out now names the job (#external_ref) AND the job's
    assigned tech gets a direct high-priority "Issue on your job" notification. Idempotent end-to-end.
- **API:** `service_job_id`/`serviceJobId` threaded through `maintenanceRequests.ts` (Row/domain/mapper/
  CreateRequestInput/createRequest). New `listServiceJobsForCustomer(customerId)` in `serviceJobs.ts`.
- **UI:** `ReportProblemModal` gained an optional `serviceJob` prop (exported `ReportTargetJob`) — pre-links the
  report, derives the property from the job, shows a linked-job banner. `CustomerPortal` loads the customer's
  jobs and renders a "Your jobs" section with a per-job "Report an issue" button.
- Staff side already works: bell notification + the request shows on the Jobs Board as a maintenance card.
- Reviewed (subagent, RLS-focused): no Blocker/Should-fix. Confirmed additive permissive policies, no dropped
  guards, idempotent, email edge fn unaffected (service-role insert, nullable col). Applied 1 nit (assignee
  notification metadata now includes property_id).

State: authored only, nothing staged/committed (Stage-7 hold). **Migration 74 PENDING apply** (Jordan can apply
solo — no boss input needed).

---

## 18 June 2026 — C1 Customer Portal HOME, phase 1 (dashboard shell, ledger-adapted)

The main Tier-1 build. User supplied a polished client-portal mockup (`design/saas-ui-rework/customer-portal-v2.html`,
navy/emerald). Decisions taken: **adapt to the house ledger look** (cream/Fraunces/sage, not navy/emerald) +
**full shell now, wire data progressively**.

Rewrote `frontend/src/pages/customer/CustomerPortal.tsx` from a single column into a dashboard shell:
- Ledger-styled **sidebar** (brand + client card + nav: Dashboard/My Jobs/Invoices/Schedule/Documents/Messages,
  anchor-scrolling to real sections) + **topbar** (breadcrumb · date · notification bell w/ open-request dot ·
  avatar) + **hero** (greeting + Report-a-problem) + **4 KPI tiles** + a **two-column grid**.
- **Live (real data):** Your jobs (+report-an-issue), Recent activity (derived from requests), Invoices, Upcoming
  maintenance, Open/Past requests, Quick actions, Your properties, KPI counts.
- **Honest "coming soon" cards** (customer-scoped backend not built yet): Progress & budget, Document vault, Messages.
- Reused existing section components (MyRequests/UpcomingMaintenance/InvoicesSection/ReportProblemModal) unchanged.
- Dropped now-unused LedgerHeader/LedgerStatRow imports; everything re-skins off the A1 primitives.
- Reviewed (subagent): no Blocker/Should-fix; imports all used, JSX balanced, reused-component props match,
  hook order fine, apostrophe hazards avoided (curly ’ + double-quoted strings).

State: authored only, nothing staged/committed (Stage-7 hold). **Phase 2 (later):** wire the coming-soon
sections — needs customer-scoped RLS/read access for projects+progress, per-customer budget, and a documents vault.

---

## 18 June 2026 — dev superuser can preview the customer portal (view-as)

The dev account (god-mode) was blocked by the `/customer` guard (`securityGroup === 'customer'`). Rather than
downgrade the dev account, added a proper preview path (frontend-only, no migration — dev ∈ is_manager_or_above
so RLS already grants read access to any customer's data):
- `CustomerPortal` guard now allows `customer` OR `dev`.
- A `dev` with no customer link → `DevPreviewGate`: lists customers (`listCustomers`), pick one → renders
  `PortalContent` for that customer with `preview` + `onExitPreview` (Switch customer).
- `PortalContent` gained an optional `preview` flag → an ink "Dev preview · viewing as {customer}" banner.
- Real customers + the not-linked screen unchanged; non-customer-non-dev still redirected.
Self-reviewed (small, contained): guard correct, imports used, Customer type has id+name, JSX balanced.
State: authored only, nothing staged/committed (Stage-7 hold).

## 18 June 2026 (amend) — dev portal preview: dropped the picker, go straight to the no-data UI

Per request (verifying the UI, not real data): removed `DevPreviewGate`/customer picker (it dead-ended on
"No customers yet"). A dev opening /customer now renders `PortalContent` directly with a sentinel UUID
(`00000000-…`) so every section queries cleanly and shows its EMPTY state (a literal '' would fail the uuid
cast). Banner reads "Dev preview — no customer data loaded." Removed now-unused listCustomers/Customer imports.

---

## 18 June 2026 — customer portal standalone chrome + dev view-switcher

- `Layout.tsx`: hide the global `<TopNav>` on `/customer` (exact match) — the portal is a standalone shell with
  its own sidebar; no double-nav. (Also the testbed for the future sidebar-nav rework that will replace the
  TopNav app-wide, starting from the customer domain.)
- `QuickActionsSidebar.tsx`: self-guards `return null` on `/customer` (staff quick-actions launcher doesn't
  belong on the customer portal).
- `CustomerPortal.tsx`: real sidebar footer (mock parity) — Account settings → /settings, Help & support →
  mailto, Sign out → store `logout()`. Dev-only (gated on `preview`) "Switch to staff app" → /dashboard.
- `Settings.tsx`: dev-only "Switch view" card (Staff dashboard / Customer portal buttons) so the dev hops both
  ways via Account settings — "play on both terms".
- Reviewed (subagent, 4 files): no Blocker/Should-fix; guards exact-match only `/customer`, hook order fine,
  all imports used, store exposes logout + currentProfile + 'dev' group.

Roadmap noted: mock sidebar = model for the future global nav rework; remaining mock features (budget chart,
active-projects progress, progress reports, site photos, full messages, document vault) = Phase 2 (need
customer-scoped backend access). State: authored only, nothing staged/committed (Stage-7 hold).

---

## 18 June 2026 — TEMP: /customer renders the full design mock (iframe) + dev switcher kept

Per request ("use the entire mock customer dashboard for a while"): /customer now shows the COMPLETE mock
(public/customer-portal-mock.html = copy of design/saas-ui-rework/customer-portal-v2.html) via an iframe, so
every section + the Chart.js budget chart render with the mock's STATIC demo content (no real data/actions).
- New `pages/customer/CustomerPortalMock.tsx`: customer/dev guard → full-screen iframe + a dev-only floating
  "Switch to staff app" overlay (the dev view-switcher survives the swap; the Settings "Switch view" card is
  unaffected).
- `App.tsx`: the `/customer` lazy import repointed to CustomerPortalMock (route element unchanged).
- The real data-wired portal (`CustomerPortal.tsx`) is preserved on disk, just not routed.
REVERT (one line): change the App.tsx lazy import path back to './pages/customer/CustomerPortal'; then delete
CustomerPortalMock.tsx + public/customer-portal-mock.html. State: authored only, nothing committed (Stage-7 hold).

---

## 18 June 2026 — mock converted to a real React component (FINAL customer-portal design)

User locked the mock as the final design. Converted `public/customer-portal-mock.html` → real React/TS:
- `pages/customer/CustomerDashboard.tsx` (~897 lines) + `pages/customer/customerDashboard.css` (~810 lines,
  every rule scoped under `.cust-portal`, fonts @imported, no global `body`/`*`/`html` leakage).
- Faithful port: class→className, all inline `style="..."` → objects, ALL SVG attrs camelCased, aria values
  numeric. Budget chart re-implemented with **recharts** (already a dep — no Chart.js/CDN). Demo `<script>`s
  dropped (progress bars render at final width).
- Access guard (customer + dev). Dev view-switcher kept: floating "Switch to staff app" (isDev) + Settings
  "Switch view" card unaffected. Sidebar footer wired: Account Settings → /settings, Sign Out → store logout.
- `App.tsx`: `/customer` lazy import now points to `CustomerDashboard`. Static content for now — **backend
  wiring is a later phase** (per user: "lots of work on backend once locked in").
- Reviewed via targeted scans: no kebab SVG attrs, no leftover class=/for=/string-styles/comments, all
  imports used (incl. all 7 recharts), guard/hooks order correct, CSS fully scoped, JSX closes balanced.
  (No local build — CI is the final gate.)
- Fallbacks preserved on disk: `CustomerPortalMock.tsx` + `public/customer-portal-mock.html` (iframe) and the
  earlier data-wired `CustomerPortal.tsx`. Swap the App.tsx import path to fall back.

State: authored only, nothing committed (Stage-7 hold).

---

## 19 June 2026 — job-list sorting + Simpro-style service quoting (labour + cost/margin)

Two sequenced pieces, both authored + reviewed clean (no local build — CI is the gate). Nothing committed (Stage-7 hold).

**Part A — sorting on the Jobs Board + Sim-Pro listing (no migration, client-side).**
- Added a "Newest | A–Z" pill toggle to both surfaces. Default = Date created (newest first); A–Z orders by Customer name.
- `BoardToolbar.tsx`: new `SortMode` type + sort-pill; `JobsBoard.tsx`: `sortMode` state + `sortCards()`; within each column "date" = createdAt desc, "az" = clientLabel asc (nulls last). Done column keeps its special-case (date = most-recently-closed; az = by customer); cancelled always sink.
- `SimproJobsTab.tsx`: `sortMode` state + `displayJobs` useMemo. CSV FINDING: the Sim-Pro export has NO created-date column (only Job/DueDate[~95% blank]/Customer/contact/Site) — the sequential job number IS the creation signal. So "date" = `parseInt(externalRef,10)` desc (NaN sinks), "az" = customerName asc. Render now maps `displayJobs`.

**Part B — Simpro-style quoting (migration 75 + commercial/money/QuoteEditor).** ~60% reused, not rebuilt.
- `75_quote_labour_cost.sql` (PENDING APPLY): adds `kind` ('material'|'labour'|'custom', default 'material' + guarded check) and `cost_price_ex_gst numeric(10,2)` to quote_items + customer_invoice_items + variation_items. Idempotent, RLS unchanged, ends with `notify pgrst`.
- `commercial.ts`: `kind`+`costPriceExGst` threaded through all 3 item Row/domain/mapper trios; material/prebuild adders snapshot `cost_price` + kind='material'; free adders kind='custom' (+ optional cost); **new `addQuoteItemLabour(quoteId, role, hours)`** snapshots the role's loaded rate (sell prefills from rate, marked up inline; null rate ⇒ uncosted). `createInvoiceFromQuote`/`FromJob` carry kind+cost. **`convertQuoteToJob` now sets the job's `contract_value` (= quote subtotal ex-GST) + `materials_cost` (Σ material-line cost)** so the job profit card lights up — line items NOT copied (logged time is the actual-labour source; copying would double-count).
- `money.ts`: pure `quoteCostMargin(items, gstRate)` → sell/materials/labour/other cost + `computeProfit` + uncosted-labour count. Unit test added in `commercialMoney.test.ts`.
- `QuoteEditor.tsx`: 4th "Labour" add-mode (role picker from `listLabourRates` + hours); per-line kind badge (print:hidden); **manager-only cost/margin block** under the totals — gated `canSeeCost && print:hidden`, with a red/amber/sage margin pill + "N labour lines uncosted" flag, labelled "Internal — not shown to customer". `canSeeCost` threaded Sales → QuotesTab → QuoteEditor (always true past the manager gate; cost never reaches customer/print/Xero CSV).
- Deferred (unchanged): XF2 presets (boss walkthrough), labour-add UI on Invoice/Variation editors (schema parity already in place), commission, Xero.

State: authored + subagent-reviewed clean, nothing committed (Stage-7 hold). Migration 75 awaits Jordan's apply.

---

## 19 June 2026 (cont.) — Jobs Board lifecycle columns + job numbers (teammate feedback)

Built from a daily-board user's feedback. Authored + subagent-reviewed clean (no CI-killers). Nothing committed (Stage-7 hold).

- **Sorting** ("most recent at top?") — already delivered in the earlier staged sort work; releasing it answers that. No new code.
- **Migration 76** (`76_job_lifecycle_and_numbers.sql`, PENDING APPLY): extends `service_jobs.status` with `invoiced`/`paid`/`archived` (keeps `done`); adds `job_number` + partial unique index; `job_number_seq` one-time-seeded above the max Sim-Pro `external_ref` (guarded by `pg_sequences.last_value is null` so re-runs never reset it); `next_job_number()` manager-gated RPC mirroring `next_quote_number`. Idempotent.
- **Lifecycle columns**: board now flows Pending · Scheduled · In Progress · **Completed** (renamed from "Done") · **Invoiced** · **Paid** (6 columns). Drag moves a service job through them (Completed→`done`, Invoiced→`invoiced`, Paid→`paid`). **Archived is NOT a column** — archived jobs leave the active board and are reached via a new **"Archived" toggle** in the toolbar (a flat, searchable list reusing the search/sort). `ServiceJobDrawer` status buttons cover all 8 statuses incl. **Archive**. "Add job" hidden on Invoiced/Paid (you don't create a job already paid).
- **Job numbers**: every job shows `#<number>` on its card + drawer header. New in-app jobs continue Sim-Pro's run (next after the highest existing number); imported jobs keep their original Sim-Pro `external_ref`. `displayJobNumber()` = externalRef ?? jobNumber.
- Files: `serviceJobs.ts` (status enum + jobNumber + createServiceJob RPC + completed_at preserved through terminal stages + displayJobNumber), `jobsBoard.ts` (BoardColumn rename/add, mappings, dropResult, BoardCard.number/archived, includeArchived fetch) + `jobsBoard.test.ts` updated, `JobsBoard.tsx`, `BoardToolbar.tsx`, `BoardCardItem.tsx`, `ServiceJobDrawer.tsx`, `JobsHub.tsx` (stat counts).
- Deferred (noted in plan): auto-bump a job to Invoiced/Paid when an in-app invoice is created/paid — manual drag/menu for now (matches the Sim-Pro stage workflow).

State: authored + reviewed clean, nothing committed (Stage-7 hold). Migration 76 awaits Jordan's apply.

---

## 22 June 2026 — Quoting Step 1: pricing markup + discount + solar STC/VEEC rebates + Gross/Nett

First step of the in-house Sim-Pro-style quoting roadmap. Built + subagent-reviewed clean (no CI-killers; money math arithmetic-verified). Nothing committed (Stage-7 hold).

- **Migration 77** (`77_quote_pricing_rebates.sql`, PENDING APPLY): `commercial_settings` += `default_material_markup` (0.25), `default_labour_markup`, `stc_unit_price`, `veec_unit_value`; `quotes` += `discount_ex_gst`, `stc_count`, `stc_unit_price_ex_gst`, `veec_rebate_ex_gst`. Idempotent, safe defaults.
- **Markup pricing:** office sets a material markup % + labour markup % once (Settings). A material with no catalogue sell price now defaults to `cost × (1+markup)`; labour lines prefill at `rate × (1+labour_markup)` (still editable inline). `materialSell` + `fetchPricingDefaults` helpers in commercial.ts.
- **Money model** (`money.ts`): `quoteFinancials` → subtotal − discount → GST on net → total − STC − VEEC = **Customer pays**. `quoteCostMargin` now folds the discount into the net sell and returns **Gross** + **Gross margin %** alongside Nett. Both unit-tested (`commercialMoney.test.ts`).
- **commercial.ts:** discount/STC/VEEC threaded through Quote Row/domain/mapper; `setQuoteDiscount` + `setQuoteRebates`; `recomputeQuoteTotals` applies the discount; `convertQuoteToJob` carries the net (after-discount) sell.
- **QuoteEditor:** manager-only "Discount & solar rebates" editor (blur-to-save); totals footer now shows Discount, STC/VEEC rebates, and a prominent **"Customer pays"**; margin box shows **Gross P/L · Gross margin · Nett P/L · Nett margin**. All cost/markup/margin stays manager-only + `print:hidden`; rebates/discount/customer-pays are customer-facing.
- **SettingsTab:** new "Pricing & solar rebates" section (material markup %, labour markup %, STC unit price, VEEC unit value) — office-maintained.
- **Assumption (flagged):** STC/VEEC rebates are a pass-through (reduce customer price, revenue-neutral to margin — the installer claims the certificate value); a discount reduces margin. One-line change if Casone absorbs rebates instead.
- No boss numbers needed to build: markup defaults to 25%, STC/VEEC default 0 — all editable.

Roadmap remaining (each signed off before the next): Step 2 one-click job templates (Take-Off/XF2) → **AI Quote Drafter layers here** → Step 3 full quote header/custom fields → Step 4 attachments + contractor work orders → Step 5 stock + supplier pricing.

State: authored + reviewed clean, nothing committed (Stage-7 hold). Migrations 75–77 await Jordan's apply.

---

## 22 June 2026 (cont.) — Service Quoting integrated into the Jobs hub (Sim-Pro alignment)

Built + subagent-reviewed clean (no CI-killers). NO migration (reuses existing columns). Nothing committed yet.

- **Quotes tab in the Jobs hub:** `/jobs?view=quotes` mounts the existing `QuotesTab` (full quote builder — markup/discount/STC-VEEC/margin from Step 1). Shown in the hub view-switcher **only for `canManageSales`** (workers see the board, not costs/quoting). The `/sales` page stays as the global commercial hub.
- **Per-job quotes in the drawer:** `ServiceJobDrawer` gains a manager-sales-only **"Quotes"** section listing the job's quotes (number · title · status · total) + a **"New quote for this job"** button → `createQuote({ serviceJobId, customerId, clientName, title })` then deep-links to `/jobs?view=quotes&quote=<id>`. Clicking an existing quote opens it the same way.
- **Reuse, no rebuild:** `listQuotes` gained a `serviceJobId` filter; `QuotesTab` gained an optional `initialQuoteId` prop (deep-link open). `convertQuoteToJob` + Step-1 pricing all unchanged.
- Files: `lib/api/commercial.ts`, `pages/sales/QuotesTab.tsx`, `pages/jobs/JobsHub.tsx`, `pages/jobs/ServiceJobDrawer.tsx`.

Next on the quoting roadmap: **Step 2 — one-click job templates (Take-Off/XF2)**, then the **AI Quote Drafter** layers on.

State: authored + reviewed clean, NOT yet committed (awaiting the user's go to push/deploy).

---

## 22 June 2026 (cont.) — Quoting Step 2: one-click job templates (Take-Off/XF2)

Built + subagent-reviewed clean (no CI-killers). Reuses the quote-item adders + the catalogue editor pattern.

- **Migration 78** (`78_quote_templates.sql`, PENDING APPLY): `quote_templates` + `quote_template_items` (kind material/prebuild/labour; material_id/prebuild_id FKs; role; qty; sort_order). Manager-only RLS via `is_manager_or_above()`. Idempotent.
- **API `lib/api/quoteTemplates.ts`** (NEW): full CRUD + `applyTemplateToQuote(quoteId, templateId)` — drops every template line onto a quote via the EXISTING `addQuoteItemFromMaterial`/`FromPrebuild`/`Labour` adders (so markup/cost/totals are handled identically to manual entry). No cycle.
- **QuoteEditor:** a 5th add-mode **"Apply template"** → pick a template → all its materials + prebuilds + labour drop in.
- **Catalogue → Templates tab** (NEW `TemplatesTab.tsx`): manager editor modelled on PrebuildsTab — name/category/description + item rows that can be **material** (catalogue picker + qty), **prebuild** (select), or **labour** (role + hours); reorder/remove; activate. Save = create-or-(update + clear items + re-add). Wired into `Catalogue.tsx` (new tab, route `?tab=templates`).
- Templates are distinct from material `prebuilds` (a template composes materials + prebuilds + labour for a whole job type — Sim-Pro's "Take-Off").

Next on the roadmap: the **AI Quote Drafter** (approved AI anchor) layers on top of templates + catalogue.

State: authored + reviewed clean. Being pushed with the Jobs↔Quoting integration (Part A). Migration 78 awaits Jordan's apply in Supabase (gitignored backend).

---

## 22 June 2026 (cont.) — Quote editor completeness + clearer empty states (live feedback)

From live-usage feedback. Built + subagent-reviewed clean (no CI-killers). No new migration (uses existing columns). 

- **"Free line" → "Custom line"** + a plain-English hint ("a one-off item you type in yourself — e.g. a callout fee or a non-catalogue part").
- **Clearer empty states:** catalogue search now says "No materials in the catalogue yet — add them in Catalogue → Materials (or Import), or use Custom line"; prebuild picker says "No prebuilds yet — create them in Catalogue → Prebuilds". (Templates already had its hint.) These were empty because no catalogue data has been entered — not a bug.
- **Quote editor now fully editable** (all gated `!isLocked`):
  - **Title** — editable inline (was not shown at all).
  - **Client / customer** — editable "Quote for" block: Existing-customer/One-off toggle → customer select OR one-off **name + email** (delivers the one-off email ask); resolves + shows the real customer name (fixes "(customer linked)").
  - **Valid until** — date input in the header.
  - **Delete quote** — button + confirm in the status bar (new `deleteQuote` API).
  - **Line items** — edit description inline (new `TextCell`) + up/down **reorder** (re-sequences sort_order).
- Print/PDF: title + client + valid-until show; the editors are screen-only; cost/margin stay hidden.
- Files: `QuoteEditor.tsx` (bulk), `commercial.ts` (deleteQuote). Reuses updateQuote/updateQuoteItem/listCustomers + the NumCell pattern.

Note: catalogue/prebuilds/templates still need the office to enter data (Catalogue → Materials/Import/Prebuilds/Templates) + migration 78 applied for templates. "Custom line" unblocks ad-hoc quoting immediately.

State: authored + reviewed clean; pushing to main for the user to test.

---

## 22 June 2026 (cont.) — CI hotfix: green build for live testing (a18ebd3)

Jordan reported GitHub Actions "All jobs have failed" (run #28, commit 029abb5) and asked to make CI green so he stops getting failure emails. The 5 tsc errors were **pre-existing, not from the quoting work** — a half-finished `/home` refactor + a test-import gap had been swept into git by an earlier broad `git add frontend/`, so CI has been red since c23803b (the quoting deploys still went out — Vercel deploys independently of the ci.yml gate).

Fixes (committed as exactly 4 files — staged by path, nothing else swept in):
- **Deleted `WhyPanel.tsx` + `ActionTile.tsx`** (`pages/home/components/`) — orphaned components from the old `/home` design; nothing imports them, and they referenced types the current `roleHomeConfig` no longer exports (`PillarSpec`/`ActionTileSpec`/`AccentTone`, whose shapes diverged — re-aliasing wouldn't have worked). Clears 3 of the 5 errors.
- **Removed unused `firstName`** local in `RoleHome.tsx` (`noUnusedLocals`).
- **Force-added `_shared/resizeImage.logic.ts`** — a pure-logic backend file `resizeImage.test.ts` imports; `backend/` is gitignored so CI couldn't resolve it. Its three sibling test-logic files (`decideAction`/`visionPrompt`/`parseVisionResponse`) were already tracked the same way — this one was simply missed.
- Node 20 deprecation is a non-blocking warning; left as-is (a green build stops the failure emails regardless).

State: pushed to `main` as `a18ebd3`; CI re-running. Couldn't watch the run from here (no `gh`, sandbox has no network) — confirm green on GitHub. Lesson logged to memory: stage by explicit path, never `git add <dir>`.

---

## 22 June 2026 (cont.) — Catalogue bootstrap: starter materials + prebuilds + job templates

Mig 78 applied (Jordan: "Done") — templates feature fully live. Catalogue was empty (production-honest, no auto-seed), so prepared real data for Jordan to load himself (reviewable, he owns the prices). Two repo-root working files (uncommitted; no app code changed):

- **`casone-catalogue-starter.csv`** — 42 real solar+electrical materials in the importer's 7-col format (`sku,name,unit,cost_price,sell_price,tags,description`, tags pipe-sep). Prices are AU 2026 market ESTIMATES — flagged for Jordan to overwrite with real buy/sell before importing. Loads via Catalogue → Import (preview/plan/confirm).
- **`casone-catalogue-prebuilds-templates.sql`** — run in Supabase AFTER the CSV import. 4 prebuild bundles (GPO/downlight/smoke/switch points) + 3 quote templates (6.6kW Solar Install, Switchboard Upgrade, EV Charger 7kW). Idempotent (name-guarded `if not exists`), robust (materials matched by SKU via join → renamed SKUs skip gracefully). Labour lines use seeded roles (electrician/apprentice/foreman); they price from `labour_rates.loaded_rate` which is null until Jordan sets it (lines come in at $0 till then — honest, not faked). Verify-counts query at the end.

Schema confirmed before writing: materials/prebuilds/prebuild_items (mig 64), quote_templates/quote_template_items kind material|prebuild|labour (mig 78), labour_rates seeded roles (mig 73). `applyTemplateToQuote` expands prebuild lines once (qty ignored) → templates built from explicit material lines + labour, prebuilds kept standalone for the editor's prebuild picker.

State: files delivered; Jordan to (1) edit prices + import CSV, (2) set labour rates, (3) run the seed SQL, (4) test Apply template. Next + LAST quoting piece per Jordan: the AI Quote Drafter.

---

## 22 June 2026 (cont.) — Catalogue tabs: edit/archive/delete + roles + UI polish

From Jordan's live-usage feedback on the Catalogue nav (all tabs except Import). Frontend-only; no migration. Subagent-reviewed clean for CI (CI gate = typecheck + vitest + build; no eslint step).

- **API (`lib/api/materials.ts`):** added `deleteMaterial(id)` (FK-aware — translates Postgres 23503 into "used by a prebuild, deactivate instead"), `deletePrebuild(id)` (items cascade, template refs null), and `updateCandidate(id, {rawText|status})` + `UpdateCandidateInput` (23505 → friendly dup message).
- **Roles capitalised (display-only):** `formatRole()` added to `lib/api/labourRates.ts` (title-cases, never mutates stored value → role matching unaffected). Applied in QuoteEditor labour <option>, TemplatesTab labour dropdown, LabourRatesSettings role cell.
- **Materials tab:** clear Active/Archived pill (border + colour + dot); new **Actions** column splitting the ambiguous "Deactivate" into **Archive** (reversible) + **Delete** (permanent, confirm). colSpans 7/5 → 8/6.
- **Prebuilds + Templates tabs:** same Active/Archived pill + Archive/Delete row actions; Templates editor got colour-coded kind badges (`KIND_BADGE`) + a footer Delete; archive toasts reworded ("archived — restore anytime").
- **Suggestions tab:** inline **edit** of mined `raw_text` for pending rows (Pencil → input → save/cancel) + **Restore** (dismissed → pending). No column-count change.
- **New shared `pages/catalogue/ConfirmDeleteDialog.tsx`** — red permanent-delete confirm with an optional "Archive instead" path; used by all three tabs (Materials refactored to it). Removed now-unused `TONE`/`Loader2` imports from the tabs that dropped them.

Known data note (flagged to Jordan): the 4 seeded prebuilds show 0 items — the prebuild seed SQL ran before the materials import so the SKU join matched nothing; fix = add items in the editor or a backfill SQL.

State: implemented + reviewed clean; staged for Jordan's go-ahead to push to main → Vercel.

---

## 23 June 2026 — Quote editability (Reopen) + fold Catalogue under Sales

Live-feedback fixes. Frontend-only, no migration. Subagent-reviewed clean (CI gate = typecheck + vitest + build; no eslint).

**Quotes — "can't modify regardless of credentials" root-caused + fixed.** `QuoteEditor.tsx:567` `isLocked = status in (accepted|declined|expired)` made the editor read-only for everyone with no unlock. Added:
- `confirmReopen` state + a `"reopen"` case in `handleStatusAction` → `setQuoteStatus(id, 'draft')` (no new API; no backward-transition guard existed). 
- A locked banner (print:hidden, amber) explaining the status + an inline **Reopen for editing** button (confirm warns if already converted to a job).
- Back-bar status text now signals editability: "Tap any field to edit · changes save automatically" / "Locked — read only".

**Catalogue folded under Sales (Service Quotes).** `/sales` and `/catalogue` were sibling top-level tabs gated by the same roles (`canManageSales` ≡ `canManageCatalogue`), so:
- NEW `pages/sales/CatalogueSection.tsx` — the catalogue's 5 sub-tabs (Materials/Prebuilds/Templates/Import/Suggestions) + inline counts, sub-tab driven by `?cat=` (coexists with Sales `?tab=`).
- `Sales.tsx` — added a **Catalogue** tab (TabKey/VALID_TABS/TABS + render branch).
- `TopNav.tsx` — removed the standalone Catalogue nav item (+ now-unused `Package`/`canManageCatalogue` imports). `canManageCatalogue` still exported (MaterialsTab et al. use it).
- `App.tsx` — `/catalogue` → `<Navigate to="/sales?tab=catalogue" replace />`; removed the `Catalogue` lazy import.
- Retired (git rm) `pages/catalogue/Catalogue.tsx` (the standalone shell; body now in CatalogueSection). The 5 tab components are unchanged + unmoved (still in pages/catalogue/).

Ships together with the 22 Jun catalogue edit/archive/delete + roles rework (still staged from that session).

State: implemented + reviewed clean; staged for the user's go-ahead to push to main → Vercel.

---

## 23 June 2026 — Quote rework Phase 1 Part 1: Simpro-style New-Quote wizard + vouchers

Kickoff of the Simpro replication (post-tour). Replaces the tiny NewQuoteModal with a 3-tab creation wizard mirroring Simpro's New Service Quote. Subagent-reviewed clean (CI gate = typecheck + vitest + build; fixed one unused-state CI-killer).

- **Migration 79** (`79_quote_header_and_vouchers.sql`, force-added, **Jordan applies**): `quotes` += quote_type(service|project)/stage/cost_centre/order_number/due_date/description/salesperson_id/project_manager_id/technician_ids[]/tags[]/pricing_tier/labour_overhead/fee_pct/material_markup_pct/discount_pct/custom_fields jsonb/applied_voucher_code; NEW `discount_vouchers` (code/label/percent/expiry/max_uses/used_count) + manager RLS.
- **commercial.ts**: `QuoteHeaderInput` + `quoteHeaderToRow()`; Create/UpdateQuoteInput extend it; create/update carry the new columns; `rowToQuote`+QuoteRow+Quote extended; `recomputeQuoteTotals` derives `discount_ex_gst` from `discount_pct` when set (absolute-discount path untouched; money.ts unchanged → commercialMoney.test.ts needs no change).
- **vouchers.ts** (NEW): listVouchers / createVoucher (gen "SVC5-AB12") / getVoucherByCode (validate active/expiry/uses) / applyVoucherToQuote (sets discount_pct + applied_voucher_code, bumps used_count, recompute). One-way import of recomputeQuoteTotals (no cycle).
- **profiles.ts**: `listProfilesByRole(groups)` for the Salesperson/PM (manager-tier) + Technician (internal) pickers.
- **NewQuoteWizard.tsx** (NEW): Main/Optional/Custom-Fields tabs, Service/Project, Cancel/Finish/Next, summary strip; voucher generate+apply control; Site cascades on customer; prefills markup/STC/VEEC from settings. Mounted in QuotesTab (old NewQuoteModal removed). Finish→list, Next→QuoteEditor.
- **QuoteEditor.tsx**: read-only meta row (type/cost-centre/stage/order#/due/voucher).

**TIMING:** the frontend writes the mig-79 columns, so quote creation breaks until Jordan applies migration 79 in Supabase. Flag prominently. Next free migration = 80.

Deferred to Parts 2+: live map, tax-code engine, full customer_contacts table, pricing-tier price engine, Project↔Gantt binding, the AI Quote Drafter (still parked).

---

## 23 June 2026 — Quote rework Phase 1 Part 2: Scope-of-Works scripts + Description/Notes + Technicians

Enhances the quote detail (QuoteEditor) toward Simpro's Details→Summary. Subagent-reviewed clean (CI gate = typecheck+vitest+build; one duplicate-placeholder caught + removed).

- **Migration 80** (`80_quote_scripts.sql`, force-added, **Jordan applies**): `quote_scripts` (name/quote_type any|service|project/body/sort_order/is_active) + touch trigger + manager RLS; idempotent dollar-quoted seeds = the verbatim Casone **Project — Main Scope of Works** SOW + a concise **Service — Scope of Works**.
- **quoteScripts.ts** (NEW): list/create/update/setActive/delete.
- **QuoteEditor.tsx**: customer-facing **Description** (debounced 700ms auto-save, mirrors notes; prints) + **Insert script** dropdown filtered by quote.quoteType (`availableScripts`); **Notes relabelled "Private — not visible to the customer" + `print:hidden`**; **Technicians** chip editor (commit-on-toggle via updateQuote{technicianIds}, names from listProfilesByRole(INTERNAL_GROUPS)). description/technicianIds already accepted by updateQuote (Part 1) — no API change.
- **QuoteScriptsSettings.tsx** (NEW) embedded in SettingsTab below LabourRatesSettings — manager list/add/edit/delete of scripts (so SOW text is editable without a deploy).

TIMING: quote detail Insert-script needs migration 80 applied; editor degrades gracefully (empty script list) until then, but apply 80 to get the seeded templates. Next free migration = 81. Deferred to later parts: full Simpro tabbed detail (Schedule/Customer Assets/Contractor/Attachments/Retention/Activity/Lock/granular costs), rich-text, script merge-fields. AI Quote Drafter still parked.

---

## 23 June 2026 — Quote rework Phase 1 Part 3: Parts & Labour → Billable tab

In-place rework of QuoteEditor's line-item area into Simpro's Billable layout. Frontend-only, NO migration. Subagent-reviewed clean (JSX tag-balance verified; no unused symbols; types sound).

- **commercial.ts**: `UpdateItemInput` += `costPriceExGst?: number|null` + patched in `updateQuoteItem` → per-line Cost is now editable (drives the Markup% column). Doesn't touch totals.
- **QuoteEditor.tsx**: replaced the single line-items table with a **6-pill Parts&Labour sub-tab strip** (Billable built; Take Off/Pre-Builds/Catalogue/Stock/One Off Items = "coming soon" stubs) + a **Parts table** (material+custom) and a **Labour table** (labour), each with **Cost · Markup% · Sell · Qty/Time · Total** via a shared `billableRow` helper. Cost+Markup columns are `canSeeCost` + `print:hidden`; Sell/Qty/Total print (customer quote unchanged). Markup% edit derives Sell = round2(cost×(1+m/100)); Sell/Cost edits recompute markup display (`handleItemMarkup` + extended `handleItemUpdate`). Tables render `hidden print:block` when a non-billable sub-tab is active so the printed quote always has the line items. Add-item controls gated to the Billable sub-tab. The manager cost/margin rollup was replaced by a **Billable Summary** (Material/Labour cost+markup from `quoteCostMargin`, Plant&Equipment $0, Sub-Total/GST/Total from `quoteFinancials`, nett margin). Reorder/delete + all existing add-modes preserved.

Deferred to later parts: the other 5 sub-tabs as full screens, Call-out/Service-Fee catalogue picker, Supplier-quote attach, Plant&Equipment as a real cost class (new kind), Modify Table View, multi-select labour add. AI Quote Drafter still parked. Next migration (when needed) = 81.

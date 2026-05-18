# BuildTrack — Automated Photo-Based Quality Assurance

A construction QA web app: a site lead drops a daily photo, AI reads the construction phase + completion + safety flags, the matching Gantt task auto-updates, and a permanent record is filed. Built for a stakeholder pitch but backed by real Supabase infrastructure.

## Core value

- **Transparency** — visual proof of daily work
- **Automation** — Gantt updates without manual reporting
- **Accountability** — timestamped records + audit log
- **Safety** — AI-detected hazards land in a queue with toast alerts

## Tech stack

- **React 19** + **TypeScript** + **Vite** — frontend
- **Tailwind CSS v4** — styling, with an editorial design system in `frontend/src/components/editorial/`
- **Zustand** — client state
- **Supabase** — Postgres, Auth, Realtime, Storage, Edge Functions (Deno)
- **PWA** — installable, with Workbox precaching of Storage signed URLs

## Repository layout

```
photo-based-quality-assurance-system/
├── DEMO.md                          # 10-minute scripted walkthrough
├── claude_build_prog.md             # Running build log
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   ├── scripts/
│   │   ├── build-whats-new.mjs      # Generates the Dashboard "What's new" card from git log
│   │   ├── check-contract-parity.mjs # Enforces Deno/Node copies of contract.ts stay byte-identical
│   │   └── seed-demo-data.mjs       # Idempotent demo seeder (project + tasks + photo + analysis + group chat)
│   └── src/
│       ├── components/
│       │   ├── editorial/           # EditorialButton, EditorialModal, StatCell, ResponsiveDataTable, …
│       │   ├── layout/              # TopNav, Layout (mounts realtime + safety cache)
│       │   ├── activity/            # ActivityFeed
│       │   ├── photos/              # PhotoReviewDrawer, DuplicateConfirmModal
│       │   ├── messaging/           # NewConversationModal
│       │   └── ui/                  # shadcn/ui primitives
│       ├── pages/                   # Dashboard, Gantt, Gallery, Files, Reports, Safety, Messages, Login, Admin, …
│       ├── lib/
│       │   ├── api/                 # Typed Supabase wrappers (tasks, photos, suppliers, stakeholders, messaging, …)
│       │   ├── ai/contract.ts       # Photo-QA contract — must stay in sync with the Deno mirror
│       │   ├── ai/perceptualHash.ts # Client-side blockhash for dedup
│       │   ├── hooks/               # useProject{Tasks,Photos,Analyses,Comments}Realtime, useSafetyRealtime, useMessagingRealtime, …
│       │   └── permissions.ts       # Single source of truth for capability gates
│       ├── store/                   # useAppStore, useFeatureStore, safetyIncidents, messaging, notifications, …
│       └── types/index.ts
└── supabase/
    ├── config.toml
    ├── migrations/
    │   ├── 00_init.sql               # Base schema (projects, tasks, photos, ai_analyses, comments, …)
    │   ├── 01_security_group_expand.sql
    │   ├── 02_phase_c_seam.sql       # ai_analyses extras + safety_incidents
    │   ├── 03_messaging.sql          # conversations + messages + RLS
    │   ├── 04_stakeholder_extras.sql # stakeholder_contacts + stakeholder_projects
    │   └── legacy/0007_suppliers.sql # Supplier directory (suppliers + branches + contacts)
    └── functions/
        ├── analyze-photo/            # Triggered by photos INSERT; writes ai_analyses (mock vision call today; Phase D plugs in real Claude)
        ├── confirm-analysis/         # Manager confirms an analysis → bumps task progress
        ├── admin-create-user/        # Admin-tier user creation
        └── _shared/                  # contract.ts (mirrors frontend), decideAction.ts, thresholds.ts, auditLog.ts
```

## Roadmap

- [`DEMO_ROADMAP.md`](./DEMO_ROADMAP.md) — 4-week path to a polished stakeholder pitch, starting with Week 0 to unbreak the working tree.
- [`PRODUCTION_ROADMAP.md`](./PRODUCTION_ROADMAP.md) — 12-16-week path to a first paying customer, anchored on Phase D (real Claude Vision) and multi-tenant org boundaries.

## Getting started

### Prerequisites

- Node 20+ and `npm`
- A Supabase project (free tier works) — grab the **Project URL** + **anon key** from Project Settings → API.
- For seeding: also grab the **service_role key** (never ship to the browser).

### 1. Run the migrations

In Supabase Studio → **SQL Editor**, run each file under `supabase/migrations/` in numeric order:

1. `00_init.sql`
2. `01_security_group_expand.sql`
3. `02_phase_c_seam.sql`
4. `03_messaging.sql`
5. `04_stakeholder_extras.sql`

All scripts are idempotent; re-running on a populated project is safe.

### 2. Configure the frontend

Create `frontend/.env.local` (don't commit it):

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

### 3. Install + run

```bash
npm --prefix frontend install
npm --prefix frontend run dev
```

App boots at `http://localhost:5173`.

### 4. (Optional) Seed demo data

```bash
SUPABASE_URL=https://<ref>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=eyJ... \
npm --prefix frontend run seed:demo
```

Idempotent — short-circuits if "Casone Electrical — Demo Site" already exists.

### 5. Walk through the demo

See [`DEMO.md`](./DEMO.md) for the full ~10-minute script: cross-page realtime, safety pulse, review queue, messaging, project pill at narrow widths, sign out.

## Common scripts

```bash
npm --prefix frontend run dev          # dev server
npm --prefix frontend run build        # production build (runs prebuild contract-parity check)
npm --prefix frontend run typecheck    # tsc --noEmit
npm --prefix frontend run test         # vitest
npm --prefix frontend run seed:demo    # idempotent seeder (needs SUPABASE_URL + service-role key)
```

## Edge Functions

Deployed via the Supabase CLI from `supabase/functions/`:

```bash
supabase functions deploy analyze-photo
supabase functions deploy confirm-analysis
supabase functions deploy admin-create-user
```

`analyze-photo` is currently a deterministic stub (returns confidence=0). Phase D swaps `mockAnalyze()` for a real Claude Vision call — no other changes needed; the contract, lifecycle, dedup, and review queue are already wired.

## Realtime architecture

Project-scoped realtime is mounted once at `frontend/src/components/layout/Layout.tsx`:

- `useSafetyIncidentsCache` — pushes `safety_incidents` into the dashboard cache
- `useProjectTasksRealtime` — pushes task INSERT/UPDATE/DELETE into the feature store
- `useProjectPhotosRealtime` — pushes photo INSERT into the app store
- `useProjectAnalysesRealtime` — patches AI analysis updates onto each photo
- `useProjectCommentsRealtime` — placeholder; comments table not yet wired
- `useMessagingRealtime` — per-user channel for cross-browser chat sync

Pages observe the stores; cross-browser updates flow Dashboard → activity feed → tile pulse → row highlight without a manual refresh.

## Permissions

`frontend/src/lib/permissions.ts` is the single source of truth — every capability is a named gate function (`canViewSafetyIncident`, `canConfirmAIAnalysis`, `canManageSuppliers`, …). Pages and components call those, never `currentProfile.securityGroup === '…'` directly.

The eight security groups: `company_admin`, `administrator`, `construction_mgr`, `project_manager`, `site_manager`, `worker`, `stakeholder`, `supplier`. The first signed-up user auto-promotes to `company_admin` via the `handle_new_user` trigger.

## Design system

Editorial primitives at `frontend/src/components/editorial/`:

- **EditorialButton** — slate-900 → emerald-700 hover pill with the `ArrowUpRight` micro-interaction
- **EditorialModal** — sticky header + scrollable body + sticky footer, mobile bottom-sheet on phones
- **StatCell** — accent-bar stat tile (named token via `accent="emerald"` or hex via `accentColor="#0F766E"`)
- **ResponsiveDataTable** — desktop columns, mobile cards
- **EyebrowLabel**, **SectionHeader** — typography helpers

Global styling tokens (Fraunces + DM Sans, shadow-card / shadow-pill / shadow-modal, rounded-pill) live in `frontend/src/index.css` under `@theme`. Pages wrap their root `<div>` with `className="editorial-root"` to opt into the typography.

## License

Demo project; not for distribution.

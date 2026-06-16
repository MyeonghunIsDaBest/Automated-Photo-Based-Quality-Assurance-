// Per-role content for the Welcome deck at `/home` (the role-tailored slide
// experience). The `<RoleHome />` shell renders a fixed 7-slide sequence —
// Cover · Product · Your day · Project preview · Get ready · Why · Final — and
// pulls the role-specific copy + actions from `ROLE_DECKS` below. The Product
// and Why slides are shared across roles (they explain the product); everything
// else reshapes per role.
//
// Voice matches the rest of the app (warm, plain, construction-real). Accent
// words render in italic green via the `accent` field, kept separate from the
// surrounding text so we never need dangerouslySetInnerHTML.

import type { SecurityGroup } from '../../types';
import type { LucideIcon } from 'lucide-react';
import {
  Clock, Check, ScanLine, PenLine, ShieldCheck, TrendingUp,
  Camera, BookOpen, UserRound, FolderPlus, Users,
  LayoutDashboard, ShoppingCart, Truck, Receipt, DollarSign, FileText,
  Image as ImageIcon, BarChart3, Eye, Wrench, PlusCircle,
} from 'lucide-react';

export type Tone = 'green' | 'amber' | 'slate' | 'dark';

export interface DeckCTA {
  label: string;
  icon: LucideIcon;
  to: string;
  variant?: 'dark' | 'green' | 'ghost';
}
export interface DeckCard {
  icon: LucideIcon;
  tone: Tone;
  tag: string;
  title: string;
  body: string;
  to?: string;
}
export interface DeckPillar { icon: LucideIcon; title: string; body: string; }

export interface RoleDeck {
  /** Account sub-label shown in the rail footer. */
  roleLabel: string;
  /** Cover eyebrow tail, e.g. "invited to 2 projects". */
  eyebrowSuffix: (n: number) => string;
  /** Rail label for the final slide (varies: "Get added" / "Get started"…). */
  finalRailLabel: string;
  /** Where "Skip to my work" + the cover's primary CTA send this role. */
  skipTo: string;

  cover: {
    eyebrow: string;
    badges: { tone: 'green' | 'amber' | 'slate'; icon: LucideIcon; label: string }[];
    title: string;   // text before the italic accent
    accent: string;  // italic green word(s)
    sub: string;     // supporting paragraph (plain)
    primary: DeckCTA;
    secondary?: DeckCTA;
  };
  yourDay: { eyebrow: string; title: string; accent: string; cards: [DeckCard, DeckCard, DeckCard] };
  getReady: { eyebrow: string; title: string; accent: string; cards: [DeckCard, DeckCard, DeckCard] };
  final: {
    eyebrow: string;
    title: string;
    accent: string;
    headline: string;   // card heading
    body: string;       // card paragraph
    actions: DeckCTA[];
    note?: string;
  };
}

// ─── Shared slides (product + why) — identical for every role ──────────────
export const PRODUCT_SLIDE = {
  eyebrow: 'What is SiteProof',
  title: 'The photo-first',
  accent: 'site logbook.',
  lead:
    "Take one photo of the day's work — SiteProof matches it to the right task on the schedule, " +
    'estimates progress with vision AI, and files a permanent record for QA and liability.',
  steps: [
    { title: 'Snap a site photo', body: "One photo of the day's work — timestamped, geotagged, attributed." },
    { title: 'Vision AI reads it', body: 'It matches the photo to the right task and estimates the progress made.' },
    { title: 'The record is filed', body: 'QA, the diary entry, and an audit-grade record — written and stored for you.' },
  ],
};

export const WHY_SLIDE: { eyebrow: string; title: string; accent: string; pillars: [DeckPillar, DeckPillar, DeckPillar] } = {
  eyebrow: 'Why crews switch',
  title: 'Less paperwork.',
  accent: 'More proof.',
  pillars: [
    { icon: ScanLine, title: 'Photo QA over paperwork.', body: 'Vision AI estimates progress so you skip the "% done" form. One photo, filed and scored.' },
    { icon: PenLine, title: 'A diary that writes itself.', body: 'Type four words; we expand them with weather, crew, and the work that fits the day.' },
    { icon: ShieldCheck, title: 'Audit-grade record.', body: 'Every photo and analysis is timestamped, attributed, and exportable. Insurance-friendly.' },
  ],
};

// ─── Worker ────────────────────────────────────────────────────────────────
const WORKER: RoleDeck = {
  roleLabel: 'Field crew',
  eyebrowSuffix: (n) => (n > 0 ? `on ${n} project${n === 1 ? '' : 's'}` : 'no project yet'),
  finalRailLabel: 'Get added',
  skipTo: '/gantt',
  cover: {
    eyebrow: 'Welcome to SiteProof',
    badges: [
      { tone: 'amber', icon: Clock, label: 'No project assigned yet' },
      { tone: 'slate', icon: Check, label: 'Account ready' },
    ],
    title: "You're set up,",
    accent: 'Worker.',
    sub: "Your project manager will add you to a crew shortly. Until then, here's how SiteProof turns one photo a day into your whole site logbook — and how to get ready.",
    primary: { label: 'Open camera', icon: Camera, to: '/gantt?tab=uploads', variant: 'dark' },
  },
  yourDay: {
    eyebrow: 'Once you’re on a crew', title: 'Your day,', accent: 'in one photo.',
    cards: [
      { icon: ScanLine, tone: 'green', tag: 'Capability 01', title: 'Photo QA', body: 'Each photo is matched to the right task and bumps progress 4–10% — no "% done" form.', to: '/gantt?tab=uploads' },
      { icon: PenLine, tone: 'amber', tag: 'Capability 02', title: 'Site Diary', body: 'Type four words. We expand them with weather, crew, and the work your photos show.', to: '/gantt?tab=site_diary' },
      { icon: ShieldCheck, tone: 'slate', tag: 'Capability 03', title: 'Audit record', body: 'Every photo and analysis is timestamped, attributed, and one click from export.', to: '/gantt?tab=review' },
    ],
  },
  getReady: {
    eyebrow: 'While you wait', title: 'Three things to', accent: 'set up now.',
    cards: [
      { icon: UserRound, tone: 'green', tag: 'Step 1', title: 'Complete your profile', body: 'Add your trade and a photo so your project manager can find you.', to: '/settings' },
      { icon: Camera, tone: 'dark', tag: 'Step 2', title: 'Allow camera access', body: 'SiteProof needs your camera to capture and timestamp photos. Enable it once.', to: '/gantt?tab=uploads' },
      { icon: BookOpen, tone: 'amber', tag: 'Step 3', title: 'Read the field guide', body: 'A two-minute walkthrough of capturing, QA, and the daily diary.', to: '/gantt?tab=site_diary' },
    ],
  },
  final: {
    eyebrow: 'Next step', title: 'Get added', accent: 'to a crew.',
    headline: 'Ask your project manager',
    body: 'Share your account email so they can invite you to the project. You’ll appear in their crew list right away, and we’ll notify you the moment you’re added.',
    actions: [{ label: 'Open my profile', icon: UserRound, to: '/settings', variant: 'dark' }],
    note: 'Invites are sent by your project manager — no project code needed.',
  },
};

// ─── Project Manager ─────────────────────────────────────────────────────────
const PROJECT_MANAGER: RoleDeck = {
  roleLabel: 'Project Manager',
  eyebrowSuffix: (n) => (n > 0 ? `running ${n} project${n === 1 ? '' : 's'}` : 'no projects yet'),
  finalRailLabel: 'Get started',
  skipTo: '/dashboard',
  cover: {
    eyebrow: 'Welcome to SiteProof',
    badges: [{ tone: 'green', icon: Check, label: 'Account ready' }],
    title: 'Run your projects,',
    accent: 'end to end.',
    sub: 'Create a project, build the crew, and let the photos keep the schedule honest. Spend, progress, and the daily record stay in one place — and update themselves.',
    primary: { label: 'Create a project', icon: FolderPlus, to: '/jobs?view=projects', variant: 'dark' },
    secondary: { label: 'Go to dashboard', icon: LayoutDashboard, to: '/dashboard', variant: 'ghost' },
  },
  yourDay: {
    eyebrow: 'Your command surface', title: 'Plan, track,', accent: 'and prove.',
    cards: [
      { icon: BarChart3, tone: 'green', tag: 'Plan 01', title: 'Schedule & tasks', body: 'Build the Gantt; photos move progress so the plan reflects the real build.', to: '/gantt' },
      { icon: DollarSign, tone: 'amber', tag: 'Plan 02', title: 'Budget & invoices', body: 'Track spend against progress, raise invoices, and watch the burn live.', to: '/gantt?tab=reports' },
      { icon: Users, tone: 'slate', tag: 'Plan 03', title: 'Your crew', body: 'Invite people, set their role, and see who clocked in across the day.', to: '/gantt?tab=site_diary' },
    ],
  },
  getReady: {
    eyebrow: 'Get started', title: 'Three steps to', accent: 'your first project.',
    cards: [
      { icon: FolderPlus, tone: 'green', tag: 'Step 1', title: 'Create the project', body: 'Name it, set the dates, and SiteProof seeds the standard phases for you.', to: '/jobs?view=projects' },
      { icon: Users, tone: 'dark', tag: 'Step 2', title: 'Invite your crew', body: "Add your people and pick each one's role — workers, suppliers, sponsors.", to: '/jobs?view=projects' },
      { icon: BarChart3, tone: 'amber', tag: 'Step 3', title: 'Lay out the schedule', body: 'Drop in the tasks; the photos your crew takes keep them moving.', to: '/gantt' },
    ],
  },
  final: {
    eyebrow: 'Next step', title: 'Start your', accent: 'first project.',
    headline: 'Create a project',
    body: 'You own the projects you create — invite your crew, set their roles, and run the schedule and budget. Only you and the people you invite can see them.',
    actions: [
      { label: 'Create a project', icon: FolderPlus, to: '/jobs?view=projects', variant: 'dark' },
      { label: 'Open dashboard', icon: LayoutDashboard, to: '/dashboard', variant: 'ghost' },
    ],
    note: 'Projects you create are private to you and the team you invite.',
  },
};

// ─── Construction Manager ────────────────────────────────────────────────────
const CONSTRUCTION_MANAGER: RoleDeck = {
  roleLabel: 'Construction Manager',
  eyebrowSuffix: (n) => (n > 0 ? `overseeing ${n} project${n === 1 ? '' : 's'}` : 'no projects yet'),
  finalRailLabel: 'Get going',
  skipTo: '/dashboard',
  cover: {
    eyebrow: 'Welcome to SiteProof',
    badges: [{ tone: 'green', icon: Check, label: 'Account ready' }],
    title: 'Oversight,',
    accent: 'across every site.',
    sub: 'See progress, schedule variance, and open hazards rolled up across the projects you run — then drop into any one to dig in.',
    primary: { label: 'Open portfolio', icon: LayoutDashboard, to: '/dashboard', variant: 'dark' },
  },
  yourDay: {
    eyebrow: 'Your portfolio lens', title: 'Every site,', accent: 'at a glance.',
    cards: [
      { icon: TrendingUp, tone: 'green', tag: 'Oversee 01', title: 'Portfolio rollup', body: 'Progress, behind-schedule count, and open hazards across all your projects.', to: '/dashboard' },
      { icon: BarChart3, tone: 'slate', tag: 'Oversee 02', title: 'Drill into a project', body: 'Tap any project to scope the full dashboard to it — tasks, photos, safety.', to: '/jobs?view=projects' },
      { icon: ShieldCheck, tone: 'amber', tag: 'Oversee 03', title: 'Safety & QA', body: 'Confirm AI calls and close out hazards before they become a problem.', to: '/safety' },
    ],
  },
  getReady: {
    eyebrow: 'Get going', title: 'Three things to', accent: 'check first.',
    cards: [
      { icon: LayoutDashboard, tone: 'green', tag: 'Step 1', title: 'Scan the portfolio', body: 'Open the dashboard to see which projects are on track and which are behind.', to: '/dashboard' },
      { icon: Eye, tone: 'dark', tag: 'Step 2', title: 'Review the AI queue', body: 'Confirm or correct the photo analyses waiting on a manager.', to: '/gantt?tab=review' },
      { icon: FileText, tone: 'amber', tag: 'Step 3', title: 'Pull a report', body: 'Generate a progress report to share up the chain.', to: '/gantt?tab=reports' },
    ],
  },
  final: {
    eyebrow: 'Next step', title: 'Into the', accent: 'portfolio.',
    headline: 'Open your dashboard',
    body: 'Your home is the multi-project rollup. Watch the whole book of work, then drill into any project the moment something needs your attention.',
    actions: [{ label: 'Open dashboard', icon: LayoutDashboard, to: '/dashboard', variant: 'dark' }],
  },
};

// ─── Company Admin ────────────────────────────────────────────────────────────
const COMPANY_ADMIN: RoleDeck = {
  roleLabel: 'Company Admin',
  eyebrowSuffix: (n) => `${n} project${n === 1 ? '' : 's'} across the company`,
  finalRailLabel: 'Set up',
  skipTo: '/dashboard',
  cover: {
    eyebrow: 'Welcome to SiteProof',
    badges: [{ tone: 'green', icon: ShieldCheck, label: 'Full access' }],
    title: 'Your whole company,',
    accent: 'in one place.',
    sub: 'Every project, every person, every dollar — visible to you. Set up your team, then let the site photos keep all of it current.',
    primary: { label: 'Open dashboard', icon: LayoutDashboard, to: '/dashboard', variant: 'dark' },
    secondary: { label: 'Manage users', icon: Users, to: '/admin', variant: 'ghost' },
  },
  yourDay: {
    eyebrow: 'Your control surface', title: 'Run the', accent: 'whole operation.',
    cards: [
      { icon: Users, tone: 'green', tag: 'Admin 01', title: 'People & roles', body: 'Add staff, set roles, and rescue accounts — the whole company directory.', to: '/admin' },
      { icon: LayoutDashboard, tone: 'slate', tag: 'Admin 02', title: 'Every project', body: 'See and manage all projects across the company, not just your own.', to: '/jobs?view=projects' },
      { icon: DollarSign, tone: 'amber', tag: 'Admin 03', title: 'Finance & reports', body: 'Budgets, invoices, and exportable reports across the portfolio.', to: '/gantt?tab=reports' },
    ],
  },
  getReady: {
    eyebrow: 'Set up your company', title: 'Three steps to', accent: 'go live.',
    cards: [
      { icon: Users, tone: 'green', tag: 'Step 1', title: 'Invite your team', body: 'Add your managers and crew, and set each person’s access level.', to: '/admin' },
      { icon: FolderPlus, tone: 'dark', tag: 'Step 2', title: 'Create projects', body: 'Spin up your live jobs so managers and crews can get to work.', to: '/jobs?view=projects' },
      { icon: BookOpen, tone: 'amber', tag: 'Step 3', title: 'Review the guide', body: 'A quick tour of roles, access levels, and the daily photo flow.', to: '/gantt?tab=reports' },
    ],
  },
  final: {
    eyebrow: 'Next step', title: 'Set up', accent: 'your team.',
    headline: 'Invite your people',
    body: 'Add your managers, crew, suppliers, and sponsors, and choose what each one can see and do. You can change anyone’s role at any time.',
    actions: [
      { label: 'Manage users', icon: Users, to: '/admin', variant: 'dark' },
      { label: 'Open dashboard', icon: LayoutDashboard, to: '/dashboard', variant: 'ghost' },
    ],
  },
};

// ─── Supplier ────────────────────────────────────────────────────────────────
const SUPPLIER: RoleDeck = {
  roleLabel: 'Supplier · vendor',
  eyebrowSuffix: (n) => (n > 0 ? `${n} project${n === 1 ? '' : 's'} linked` : 'no projects linked yet'),
  finalRailLabel: 'Your orders',
  skipTo: '/supplier',
  cover: {
    eyebrow: 'Welcome to SiteProof',
    badges: [{ tone: 'green', icon: Check, label: 'Account ready' }],
    title: 'Orders & deliveries,',
    accent: 'paperless.',
    sub: 'See every purchase order sent to you, accept or hold it in a tap, and track it through to delivery and warranty — no phone tag, no scanning POs.',
    primary: { label: 'Go to my orders', icon: ShoppingCart, to: '/supplier', variant: 'dark' },
  },
  yourDay: {
    eyebrow: 'Your vendor view', title: 'Your work,', accent: 'one timeline.',
    cards: [
      { icon: ShoppingCart, tone: 'amber', tag: 'Vendor 01', title: 'Respond to orders', body: 'Accept, hold, or decline each PO sent to you — with an optional note.', to: '/supplier' },
      { icon: Truck, tone: 'green', tag: 'Vendor 02', title: 'Deliveries', body: 'See what’s due today and this week against your open orders.', to: '/supplier' },
      { icon: Receipt, tone: 'slate', tag: 'Vendor 03', title: 'Invoices', body: 'Track what’s unpaid and what’s about to age — at a glance.', to: '/supplier' },
    ],
  },
  getReady: {
    eyebrow: 'Get ready', title: 'Two things to', accent: 'set up.',
    cards: [
      { icon: UserRound, tone: 'green', tag: 'Step 1', title: 'Confirm your details', body: 'Make sure your company and contact details are current.', to: '/settings' },
      { icon: ShoppingCart, tone: 'dark', tag: 'Step 2', title: 'Check open orders', body: 'Review any purchase orders already waiting for your response.', to: '/supplier' },
      { icon: ShieldCheck, tone: 'amber', tag: 'Step 3', title: 'Warranty records', body: 'Deliveries auto-link to warranties so the paperwork surfaces years later.', to: '/supplier' },
    ],
  },
  final: {
    eyebrow: 'Next step', title: 'Into your', accent: 'orders.',
    headline: 'Open your workspace',
    body: 'Your home shows only your own purchase orders on the projects you’re linked to. Respond to each one and track it through to delivery.',
    actions: [{ label: 'Go to my orders', icon: ShoppingCart, to: '/supplier', variant: 'dark' }],
  },
};

// ─── Stakeholder ──────────────────────────────────────────────────────────────
const STAKEHOLDER: RoleDeck = {
  roleLabel: 'Stakeholder · sponsor',
  eyebrowSuffix: (n) => (n > 0 ? `${n} project${n === 1 ? '' : 's'} shared` : 'no projects shared yet'),
  finalRailLabel: 'Your view',
  skipTo: '/sponsor',
  cover: {
    eyebrow: 'Welcome to SiteProof',
    badges: [{ tone: 'green', icon: Check, label: 'Account ready' }],
    title: 'Your money,',
    accent: 'tracked to the build.',
    sub: 'Watch spend against real progress, see the photos behind every milestone, and release payment when a stage is verified complete — all in one read-only view.',
    primary: { label: 'Go to my view', icon: DollarSign, to: '/sponsor', variant: 'dark' },
  },
  yourDay: {
    eyebrow: 'Your sponsor view', title: 'Proof, not', accent: 'promises.',
    cards: [
      { icon: TrendingUp, tone: 'green', tag: 'Sponsor 01', title: 'Spend vs progress', body: 'See whether the money is tracking with the work actually done.', to: '/sponsor' },
      { icon: ImageIcon, tone: 'slate', tag: 'Sponsor 02', title: 'Visual proof', body: 'Every milestone is backed by timestamped site photos you can browse.', to: '/sponsor' },
      { icon: ShieldCheck, tone: 'amber', tag: 'Sponsor 03', title: 'Release payment', body: 'Sign off to release a milestone once its stage is AI-verified complete.', to: '/sponsor' },
    ],
  },
  getReady: {
    eyebrow: 'Get ready', title: 'Two things to', accent: 'know.',
    cards: [
      { icon: Eye, tone: 'green', tag: 'Note 01', title: 'Read-only by design', body: 'You see the same live data the site team sees — nothing to manage.', to: '/sponsor' },
      { icon: DollarSign, tone: 'dark', tag: 'Note 02', title: 'You hold the release', body: 'Funds only move when you sign off — tied to verified progress.', to: '/sponsor' },
      { icon: FileText, tone: 'amber', tag: 'Note 03', title: 'Export anytime', body: 'Pull the full project history and reports as a single document.', to: '/gantt?tab=reports' },
    ],
  },
  final: {
    eyebrow: 'Next step', title: 'Into your', accent: 'money view.',
    headline: 'Open the sponsor view',
    body: 'Your home compares spend to progress on the projects shared with you, and lets you release payment milestones as each stage is verified.',
    actions: [{ label: 'Go to my view', icon: DollarSign, to: '/sponsor', variant: 'dark' }],
  },
};

// ─── Customer ─────────────────────────────────────────────────────────────────
const CUSTOMER: RoleDeck = {
  roleLabel: 'Customer · portal',
  eyebrowSuffix: (n) => (n > 0 ? `${n} propert${n === 1 ? 'y' : 'ies'} registered` : 'account ready'),
  finalRailLabel: 'Your portal',
  skipTo: '/customer',
  cover: {
    eyebrow: 'Welcome to SiteProof',
    badges: [{ tone: 'green', icon: Check, label: 'Account ready' }],
    title: 'Your properties &',
    accent: 'maintenance.',
    sub: 'View your registered properties, report a problem, and track every maintenance request through to completion — all in one place.',
    primary: { label: 'Go to my portal', icon: Wrench, to: '/customer', variant: 'dark' },
  },
  yourDay: {
    eyebrow: 'Your customer view', title: 'Properties &', accent: 'requests.',
    cards: [
      { icon: Wrench, tone: 'amber', tag: 'Portal 01', title: 'Report a problem', body: 'Lodge a new maintenance request for any of your registered properties in seconds.', to: '/customer' },
      { icon: Eye, tone: 'green', tag: 'Portal 02', title: 'Track my requests', body: 'See every open and past request — status, notes, and scheduled visits.', to: '/customer' },
      { icon: ShieldCheck, tone: 'slate', tag: 'Portal 03', title: 'Service history', body: 'A permanent record of every job completed at your properties.', to: '/customer' },
    ],
  },
  getReady: {
    eyebrow: 'Getting started', title: 'Two things to', accent: 'know.',
    cards: [
      { icon: UserRound, tone: 'green', tag: 'Note 01', title: 'Confirm your details', body: 'Make sure your contact details are up to date so we can reach you.', to: '/settings' },
      { icon: PlusCircle, tone: 'dark', tag: 'Note 02', title: 'Report a problem', body: "Use the portal to lodge any maintenance request — we'll take it from there.", to: '/customer' },
      { icon: Eye, tone: 'amber', tag: 'Note 03', title: 'Track progress', body: "We'll keep you updated as your request moves through scheduling and completion.", to: '/customer' },
    ],
  },
  final: {
    eyebrow: 'Next step', title: 'Into your', accent: 'portal.',
    headline: 'Open your portal',
    body: 'Your portal shows only your own properties and requests. Lodge a new job or check on an open one — we keep the status current as work progresses.',
    actions: [{ label: 'Go to my portal', icon: Wrench, to: '/customer', variant: 'dark' }],
  },
};

export const ROLE_DECKS: Partial<Record<SecurityGroup, RoleDeck>> = {
  worker: WORKER,
  project_manager: PROJECT_MANAGER,
  construction_mgr: CONSTRUCTION_MANAGER,
  company_admin: COMPANY_ADMIN,
  administrator: COMPANY_ADMIN, // deprecated alias — same deck as company admin
  dev: COMPANY_ADMIN,           // hidden superuser — reuse the admin deck
  supplier: SUPPLIER,
  stakeholder: STAKEHOLDER,
  customer: CUSTOMER,
};

// Brand mark + rail step labels (shared). The final step label comes from the
// role deck (`finalRailLabel`).
export const RAIL_STEPS = ['Welcome', 'The product', 'Your day', 'Project preview', 'Get ready', 'Why SiteProof'] as const;

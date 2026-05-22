// Per-role configuration for the editorial Home page (worker / stakeholder /
// supplier). The `<RoleHome />` shell is invariant — every variant picks its
// hero copy, explainer paragraph, action tiles, why-pillars, and accent set
// from the map below.
//
// Adding a new role:
//   1. Add the role to `SecurityGroup` in `types/index.ts` (already there
//      for the eight canonical groups).
//   2. Add a row here with the same shape.
//   3. (Optional) Add the role to `isFieldRole` in `lib/permissions.ts` so
//      it routes to /home instead of /dashboard.
//
// Voice notes — the explainer and pillar copy matches the existing in-repo
// voice (Pricing.tsx, README, claude_build_prog.md). Italic accents on
// "key" phrases get rendered via dangerouslySetInnerHTML in
// `WhatIsSiteProof`, so the strings here use `<em>...</em>` rather than
// markdown.

import type { SecurityGroup } from '../../types';
import type { LucideIcon } from 'lucide-react';
import {
  Camera, Pen, Inbox, FileText, Image as ImageIcon, GanttChartSquare,
  Eye, Shield, Archive, ShoppingCart, Truck, Receipt, Box,
} from 'lucide-react';

export type AccentTone = 'emerald' | 'slate' | 'amber' | 'blue';

export interface ActionTileSpec {
  /** Lucide icon component used in the tile and pillar — keeps the visual
   *  language consistent between sections. */
  icon: LucideIcon;
  title: string;
  /** One-line supporting copy. Plain text — no inline HTML. */
  sub: string;
  /** Destination URL. Project-scoped tiles should NOT embed `?project=` —
   *  the page resolves the active project from the store before navigation. */
  to: string;
  /** Per-tile accent. Index into the variant's `accents` triple. */
  accent: AccentTone;
}

export interface PillarSpec {
  icon: LucideIcon;
  title: string;
  body: string;
}

export interface RoleHomeVariant {
  /** Role label for the eyebrow. Falls under the same `EditorialPageHeader`
   *  eyebrow used on Gantt / Reports / Admin / Safety. */
  roleLabel: string;
  hero: {
    /** Right-shaped via `${n} project${n === 1 ? '' : 's'}`. */
    eyebrowSuffix: (n: number) => string;
    /** Display title (Fraunces serif). Should be punctuated to flow into the
     *  italic accent that comes after, e.g. `"On site,"` followed by an
     *  italic first name. */
    title: string;
    /** Sub-paragraph. `<em>…</em>` for accent words. */
    description: string;
    /** Optional pill button rendered in the EditorialPageHeader's `actions`
     *  slot. Workers get an "Open camera" shortcut; the read-only roles
     *  don't. */
    action?: { label: string; to: string };
  };
  /** Single paragraph that answers "what is SiteProof / what does this view
   *  give me". `<em>…</em>` allowed. */
  explainer: string;
  projects: { emptyCopy: string };
  tiles: [ActionTileSpec, ActionTileSpec, ActionTileSpec];
  /** Toggles the "Today's brief" assigned-tasks list. Worker only. */
  showAssignedTasks: boolean;
  pillars: [PillarSpec, PillarSpec, PillarSpec];
}

// ─── Worker ──────────────────────────────────────────────────────────────
const WORKER: RoleHomeVariant = {
  roleLabel: 'Field crew',
  hero: {
    eyebrowSuffix: (n) => `invited to ${n} project${n === 1 ? '' : 's'}`,
    title: 'On site,',
    description: 'One photo a day — <em>the rest writes itself.</em>',
    action: { label: 'Open camera', to: '/gantt?tab=uploads' },
  },
  explainer:
    'SiteProof is the <em>photo-first site logbook</em> for construction crews. ' +
    'Take one photo of your day’s work — we’ll match it to the right ' +
    'task on the Gantt, estimate progress with vision AI, and file a ' +
    '<em>permanent record for QA and liability</em>. The schedule moves with ' +
    'the build, not days behind it.',
  projects: {
    emptyCopy:
      'No projects assigned yet. A site manager will invite you when you’re added to a crew.',
  },
  tiles: [
    {
      icon: Camera,
      title: 'Photo QA',
      sub: 'Each photo bumps its task by 4–10%.',
      to: '/gantt?tab=uploads',
      accent: 'emerald',
    },
    {
      icon: Pen,
      title: 'Site Diary',
      sub: 'AI fills in weather, crew, and shorthand.',
      to: '/gantt?tab=site_diary',
      accent: 'slate',
    },
    {
      icon: Inbox,
      title: 'Inbox',
      sub: 'Confirm what the AI wasn’t sure about.',
      to: '/gantt?tab=review',
      accent: 'amber',
    },
  ],
  showAssignedTasks: true,
  pillars: [
    {
      icon: Camera,
      title: 'Photo QA over paperwork.',
      body: 'Vision AI estimates progress so you skip the “% done” form.',
    },
    {
      icon: Pen,
      title: 'A diary that writes itself.',
      body: 'Type four words; we’ll expand them with weather, crew, and the work that fits the day.',
    },
    {
      icon: Shield,
      title: 'Audit-grade record.',
      body: 'Every photo and analysis is timestamped, attributed, and exportable. Insurance-friendly.',
    },
  ],
};

// ─── Stakeholder ─────────────────────────────────────────────────────────
const STAKEHOLDER: RoleHomeVariant = {
  roleLabel: 'Stakeholder · client view',
  hero: {
    eyebrowSuffix: (n) => `${n} project${n === 1 ? '' : 's'} shared with you`,
    title: 'Project overview,',
    description: '<em>Visual proof</em> of what’s getting built — daily.',
  },
  explainer:
    'SiteProof gives stakeholders a <em>read-only window</em> into live ' +
    'construction. Every milestone is backed by a timestamped photo and an ' +
    'audit trail you can export at any time. No back-and-forth emails for ' +
    'status — <em>the dashboard is the status.</em>',
  projects: {
    emptyCopy:
      'No projects shared with you yet. Your PM will add you when reporting begins.',
  },
  tiles: [
    {
      icon: FileText,
      title: 'Latest weekly report',
      sub: 'PDF with photos, progress, and spend.',
      to: '/reports',
      accent: 'emerald',
    },
    {
      icon: ImageIcon,
      title: 'Photo gallery',
      sub: 'Every site photo, sorted by day.',
      to: '/gantt?tab=uploads',
      accent: 'blue',
    },
    {
      icon: GanttChartSquare,
      title: 'Schedule snapshot',
      sub: 'See what’s on, what’s next, what’s late.',
      to: '/gantt',
      accent: 'slate',
    },
  ],
  showAssignedTasks: false,
  pillars: [
    {
      icon: Eye,
      title: 'Transparency.',
      body: 'See the same data the site team sees, in real time.',
    },
    {
      icon: Shield,
      title: 'Accountability.',
      body: 'Photos and AI analyses are timestamped and attributed.',
    },
    {
      icon: Archive,
      title: 'Audit-grade record.',
      body: 'Export the project’s full history as a single PDF.',
    },
  ],
};

// ─── Supplier ────────────────────────────────────────────────────────────
const SUPPLIER: RoleHomeVariant = {
  roleLabel: 'Supplier · vendor view',
  hero: {
    eyebrowSuffix: (n) => `${n} project${n === 1 ? '' : 's'} linked to you`,
    title: 'Orders & deliveries,',
    description: '<em>Paperless POs.</em> Track to delivery, file to warranty.',
  },
  explainer:
    'SiteProof gives suppliers a <em>single view</em> of every open order, ' +
    'scheduled delivery, outstanding invoice, and active warranty — across ' +
    'every project you service. <em>No phone tag, no scanning POs.</em>',
  projects: {
    emptyCopy:
      'No projects linked yet. The PM will add your supplier account when the first PO drops.',
  },
  tiles: [
    {
      icon: ShoppingCart,
      title: 'Open orders',
      sub: 'Confirm POs awaiting your acceptance.',
      to: '/gantt?tab=supplier&section=orders',
      accent: 'amber',
    },
    {
      icon: Truck,
      title: 'Deliveries due',
      sub: 'Today’s and this week’s drops.',
      to: '/gantt?tab=supplier&section=deliveries',
      accent: 'emerald',
    },
    {
      icon: Receipt,
      title: 'Outstanding invoices',
      sub: 'What’s unpaid and what’s about to age.',
      to: '/gantt?tab=supplier&section=invoices',
      accent: 'slate',
    },
  ],
  showAssignedTasks: false,
  pillars: [
    {
      icon: Truck,
      title: 'On-time delivery.',
      body: 'See the schedule your work feeds; flag delays before they hit the Gantt.',
    },
    {
      icon: Box,
      title: 'Paperless POs.',
      body: 'Every order, every change, every signature — one timeline.',
    },
    {
      icon: Shield,
      title: 'Warranty tracking.',
      body: 'Auto-linked to the delivery so the right paperwork surfaces years later.',
    },
  ],
};

export const ROLE_HOME_VARIANTS: Partial<Record<SecurityGroup, RoleHomeVariant>> = {
  worker:      WORKER,
  stakeholder: STAKEHOLDER,
  supplier:    SUPPLIER,
};

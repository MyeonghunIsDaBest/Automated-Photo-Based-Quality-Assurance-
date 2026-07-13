import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RoleHome from '../pages/home/RoleHome';
import type { Profile, User, ProjectMember } from '../types';

// ─── Test fixtures ─────────────────────────────────────────────────────────
const ADMIN_USER: User = {
  id: 'user_admin',
  email: 'admin@siteproof.com',
  fullName: 'Jordan Casone',
  role: 'admin',
  securityGroup: 'company_admin',
};
const WORKER_USER: User = {
  id: 'user_worker',
  email: 'sam@siteproof.com',
  fullName: 'Sam Worker',
  role: 'subcontractor',
  securityGroup: 'worker',
};
const STAKEHOLDER_USER: User = {
  id: 'user_visitor',
  email: 'visitor@siteproof.com',
  fullName: 'Casey Visitor',
  role: 'stakeholder',
  securityGroup: 'stakeholder',
};
const SUPPLIER_USER: User = {
  id: 'user_supplier',
  email: 'sup@siteproof.com',
  fullName: 'Pat Supplier',
  role: 'subcontractor',
  securityGroup: 'supplier',
};
const makeProfile = (sg: User['securityGroup']): Profile => ({
  id: 'p1',
  email: 'x@x',
  securityGroup: sg!,
  firstName: '',
  lastName: '',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any);

let mockUser: User | null = WORKER_USER;
let mockProfile: Profile | null = makeProfile('worker');
let mockMemberships: ProjectMember[] = [];
let mockMembershipsLoading = false;

vi.mock('../store', () => ({
  useAppStore: (selector?: (s: unknown) => unknown) => {
    const state = {
      currentUser: mockUser,
      currentProfile: mockProfile,
      users: [ADMIN_USER, WORKER_USER, STAKEHOLDER_USER, SUPPLIER_USER],
    };
    return typeof selector === 'function' ? selector(state) : state;
  },
}));

vi.mock('../lib/hooks/useMyMemberships', () => ({
  useMyMemberships: () => ({
    memberships: mockMemberships,
    isLoading: mockMembershipsLoading,
    refresh: async () => undefined,
  }),
}));

vi.mock('../lib/hooks/useAutoAcceptInvites', () => ({
  useAutoAcceptInvites: () => undefined,
}));

// The project-preview slide reads useProjectsListStore. Stub it with an empty
// list — the deck should still render its "Your first project" preview.
vi.mock('../pages/projects/store', () => ({
  useProjectsListStore: (selector: (s: unknown) => unknown) =>
    selector({ projects: [], activeProjectId: null, setActiveProject: () => undefined }),
}));

function renderHome() {
  return render(
    <MemoryRouter>
      <RoleHome />
    </MemoryRouter>,
  );
}

// RoleHome is now the role-tailored Welcome deck: a 7-slide experience whose
// copy comes from `roleHomeConfig.ts` per security_group. All slides mount in
// the DOM at once (visibility is CSS-only), so every deck's slide copy is
// queryable in jsdom.
describe('RoleHome', () => {
  beforeEach(() => {
    mockMemberships = [];
    mockMembershipsLoading = false;
  });

  describe('worker variant', () => {
    beforeEach(() => {
      mockUser = WORKER_USER;
      mockProfile = makeProfile('worker');
    });

    it('renders the worker cover + product explainer + capability cards', () => {
      renderHome();
      // Worker cover hero ("You're set up," + italic accent "Worker.").
      expect(screen.getByText(/You're set up,/)).toBeInTheDocument();
      expect(screen.getByText('Worker.')).toBeInTheDocument();
      // Personalisation: the rail account footer carries the user's name.
      expect(screen.getByText('Sam Worker')).toBeInTheDocument();
      // Shared product-explainer slide.
      expect(screen.getByText(/What is SiteProof/i)).toBeInTheDocument();
      // The three worker "Your day" capability cards. Photo QA / Site Diary
      // also appear in the project-preview minis, so allow multiple matches.
      expect(screen.getAllByText('Photo QA').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Site Diary').length).toBeGreaterThan(0);
      expect(screen.getByText('Audit record')).toBeInTheDocument();
    });

    it('shows the empty-state copy when no memberships exist', () => {
      renderHome();
      // Rail footer sub-label from eyebrowSuffix(0)…
      expect(screen.getByText('no project yet')).toBeInTheDocument();
      // …and the cover badge for the unassigned worker.
      expect(screen.getByText(/No project assigned yet/i)).toBeInTheDocument();
    });

    it('mounts the worker-only "Get added to a crew" final slide', () => {
      renderHome();
      // Final-slide headline unique to the worker deck.
      expect(screen.getByText('Ask your project manager')).toBeInTheDocument();
      // "Get added" appears as both the final rail label and the slide title.
      expect(screen.getAllByText(/Get added/).length).toBeGreaterThan(0);
    });

    it('shows a "loading…" account sub-label while memberships fetch', () => {
      mockMembershipsLoading = true;
      renderHome();
      // The rail footer should say "loading…" — not "no project yet".
      expect(screen.getByText('loading…')).toBeInTheDocument();
      expect(screen.queryByText('no project yet')).not.toBeInTheDocument();
    });
  });

  describe('stakeholder variant', () => {
    beforeEach(() => {
      mockUser = STAKEHOLDER_USER;
      mockProfile = makeProfile('stakeholder');
    });

    it('renders the stakeholder cover + sponsor cards', () => {
      renderHome();
      expect(screen.getByText(/Your money,/)).toBeInTheDocument();
      expect(screen.getByText('Spend vs progress')).toBeInTheDocument();
      expect(screen.getByText('Visual proof')).toBeInTheDocument();
      expect(screen.getByText('Release payment')).toBeInTheDocument();
    });

    it('does not show the worker-only deck content', () => {
      renderHome();
      expect(screen.queryByText(/You're set up,/)).not.toBeInTheDocument();
      expect(
        screen.queryByText('Ask your project manager'),
      ).not.toBeInTheDocument();
    });
  });

  describe('supplier variant', () => {
    beforeEach(() => {
      mockUser = SUPPLIER_USER;
      mockProfile = makeProfile('supplier');
    });

    it('renders the supplier cover + vendor cards', () => {
      renderHome();
      expect(screen.getByText(/Orders & deliveries,/)).toBeInTheDocument();
      expect(screen.getByText('Respond to orders')).toBeInTheDocument();
      expect(screen.getByText('Deliveries')).toBeInTheDocument();
      expect(screen.getByText('Invoices')).toBeInTheDocument();
    });
  });

  describe('admin variant', () => {
    beforeEach(() => {
      mockUser = ADMIN_USER;
      mockProfile = makeProfile('company_admin');
    });

    // Admins are no longer bounced to /dashboard — they get their own
    // company-admin deck at /home.
    it('renders the company-admin deck (not another role\'s hero)', () => {
      renderHome();
      expect(screen.getByText(/Your whole company,/)).toBeInTheDocument();
      expect(screen.queryByText(/You're set up,/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Your money,/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Orders & deliveries,/)).not.toBeInTheDocument();
    });
  });

  describe('null profile (mid-session race)', () => {
    beforeEach(() => {
      mockUser = WORKER_USER;
      mockProfile = null;
    });

    // When `currentProfile` is null (e.g. cross-tab logout) no deck resolves
    // and RoleHome renders null — no deck DOM at all, and no redirect fired.
    it('renders nothing when the profile is null', () => {
      const { container } = renderHome();
      expect(container).toBeEmptyDOMElement();
      expect(screen.queryByText(/You're set up,/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Your money,/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Orders & deliveries,/)).not.toBeInTheDocument();
    });
  });
});

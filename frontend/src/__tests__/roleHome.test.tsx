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

// AssignedTasksMini reads from useFeatureStore + useProjectsListStore. Stub
// both with empty lists — the worker variant should still render its
// empty-state caption.
vi.mock('../store/features', () => ({
  useFeatureStore: (selector: (s: unknown) => unknown) =>
    selector({ tasks: [] }),
}));
vi.mock('../pages/projects/store', () => ({
  useProjectsListStore: (selector: (s: unknown) => unknown) =>
    selector({ projects: [], setActiveProject: () => undefined }),
}));

function renderHome() {
  return render(
    <MemoryRouter>
      <RoleHome />
    </MemoryRouter>,
  );
}

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

    it('renders the worker hero + explainer + three tiles', () => {
      renderHome();
      expect(screen.getByText(/On site,/)).toBeInTheDocument();
      // First name accent.
      expect(screen.getByText(/Sam\./)).toBeInTheDocument();
      // Explainer headline + key accent text.
      expect(screen.getByText(/What is SiteProof/i)).toBeInTheDocument();
      // The three worker action tiles each render their title.
      expect(screen.getByText('Photo QA')).toBeInTheDocument();
      expect(screen.getByText('Site Diary')).toBeInTheDocument();
      expect(screen.getByText('Inbox')).toBeInTheDocument();
    });

    it('shows the empty-state copy when no memberships exist', () => {
      renderHome();
      expect(
        screen.getByText(/No projects assigned yet/i),
      ).toBeInTheDocument();
    });

    it('mounts the worker-only "Today\'s brief" section', () => {
      renderHome();
      // The heading uses curly apostrophe.
      expect(screen.getByText(/Today.{1,3}s brief/i)).toBeInTheDocument();
    });

    it('shows a "loading projects…" eyebrow while memberships fetch', () => {
      mockMembershipsLoading = true;
      renderHome();
      // The eyebrow should say "loading projects…" — not "invited to 0 projects".
      expect(screen.getByText(/loading projects/i)).toBeInTheDocument();
      expect(screen.queryByText(/invited to 0 projects/i)).not.toBeInTheDocument();
    });
  });

  describe('stakeholder variant', () => {
    beforeEach(() => {
      mockUser = STAKEHOLDER_USER;
      mockProfile = makeProfile('stakeholder');
    });

    it('renders the stakeholder hero + tiles', () => {
      renderHome();
      expect(screen.getByText(/Project overview,/)).toBeInTheDocument();
      expect(screen.getByText('Latest weekly report')).toBeInTheDocument();
      expect(screen.getByText('Photo gallery')).toBeInTheDocument();
      expect(screen.getByText('Schedule snapshot')).toBeInTheDocument();
    });

    it("does not show the worker-only Today's brief", () => {
      renderHome();
      expect(screen.queryByText(/Today.{1,3}s brief/i)).not.toBeInTheDocument();
    });
  });

  describe('supplier variant', () => {
    beforeEach(() => {
      mockUser = SUPPLIER_USER;
      mockProfile = makeProfile('supplier');
    });

    it('renders the supplier hero + tiles', () => {
      renderHome();
      expect(screen.getByText(/Orders & deliveries,/)).toBeInTheDocument();
      expect(screen.getByText('Open orders')).toBeInTheDocument();
      expect(screen.getByText('Deliveries due')).toBeInTheDocument();
      expect(screen.getByText('Outstanding invoices')).toBeInTheDocument();
    });
  });

  describe('admin variant', () => {
    beforeEach(() => {
      mockUser = ADMIN_USER;
      mockProfile = makeProfile('company_admin');
    });

    it('bounces admins to /dashboard (renders no hero)', () => {
      // <Navigate> renders nothing tangible; we just assert the hero text
      // for a worker isn't on the page (admin gets the redirect).
      renderHome();
      expect(screen.queryByText(/On site,/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Project overview,/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Orders & deliveries,/)).not.toBeInTheDocument();
    });
  });

  describe('null profile (mid-session race)', () => {
    beforeEach(() => {
      mockUser = WORKER_USER;
      mockProfile = null;
    });

    // When `currentProfile` is null (e.g. cross-tab logout) RoleHome's
    // variant lookup returns undefined and the early-return triggers a
    // <Navigate /> to /dashboard. We just assert no variant hero text is
    // visible — both the worker hero AND the stakeholder/supplier ones
    // should be absent.
    it('renders no role hero when the profile is null', () => {
      renderHome();
      expect(screen.queryByText(/On site,/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Project overview,/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Orders & deliveries,/)).not.toBeInTheDocument();
    });
  });
});

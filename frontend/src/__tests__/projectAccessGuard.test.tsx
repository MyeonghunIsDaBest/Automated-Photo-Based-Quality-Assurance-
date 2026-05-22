import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useProjectAccessGuard } from '../lib/hooks/useProjectAccessGuard';
import type { Profile, User, ProjectMember } from '../types';

// The guard does its work via `useEffect` → `useNavigate` + `setNotification`.
// We spy on both, prime the store + memberships fixtures, then assert the
// expected behaviour per role / membership state.

const navigateSpy        = vi.fn();
const setNotificationSpy = vi.fn();

let mockUser: User | null = null;
let mockProfile: Profile | null = null;
let mockMemberships: ProjectMember[] = [];
let mockIsLoading = false;

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateSpy,
  };
});

vi.mock('../store', () => ({
  useAppStore: (selector: (s: unknown) => unknown) =>
    selector({
      currentUser: mockUser,
      currentProfile: mockProfile,
      setNotification: setNotificationSpy,
    }),
}));

vi.mock('../lib/hooks/useMyMemberships', () => ({
  useMyMemberships: () => ({
    memberships: mockMemberships,
    isLoading: mockIsLoading,
    refresh: async () => undefined,
  }),
}));

const wrapper = ({ children }: { children: ReactNode }) => (
  <MemoryRouter>{children}</MemoryRouter>
);

const makeUser = (sg: User['securityGroup']): User => ({
  id: 'u1',
  email: 'u@x',
  fullName: 'Test User',
  role: 'subcontractor',
  securityGroup: sg,
});
const makeProfile = (sg: NonNullable<User['securityGroup']>): Profile =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ({ id: 'p1', email: 'p@x', securityGroup: sg } as any);
const makeMembership = (projectId: string): ProjectMember => ({
  id: `mem_${projectId}`,
  projectId,
  userId: 'u1',
  invitedBy: null,
  invitedAt: '2026-04-01T00:00:00Z',
  acceptedAt: '2026-04-01T00:00:00Z',
  removedAt: null,
  notes: null,
});

describe('useProjectAccessGuard', () => {
  beforeEach(() => {
    navigateSpy.mockClear();
    setNotificationSpy.mockClear();
    mockMemberships = [];
    mockIsLoading = false;
  });

  it('no-ops when projectId is undefined', () => {
    mockUser = makeUser('worker');
    mockProfile = makeProfile('worker');
    renderHook(() => useProjectAccessGuard(undefined), { wrapper });
    expect(navigateSpy).not.toHaveBeenCalled();
    expect(setNotificationSpy).not.toHaveBeenCalled();
  });

  it('no-ops while memberships are still loading', () => {
    mockUser = makeUser('worker');
    mockProfile = makeProfile('worker');
    mockIsLoading = true;
    renderHook(() => useProjectAccessGuard('proj_x'), { wrapper });
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it('lets admins through regardless of membership', () => {
    mockUser = makeUser('company_admin');
    mockProfile = makeProfile('company_admin');
    mockMemberships = [];           // admin has no memberships seeded
    renderHook(() => useProjectAccessGuard('proj_x'), { wrapper });
    expect(navigateSpy).not.toHaveBeenCalled();
    expect(setNotificationSpy).not.toHaveBeenCalled();
  });

  it('lets PMs through regardless of membership', () => {
    mockUser = makeUser('project_manager');
    mockProfile = makeProfile('project_manager');
    renderHook(() => useProjectAccessGuard('proj_x'), { wrapper });
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it('lets a worker with an active membership through', () => {
    mockUser = makeUser('worker');
    mockProfile = makeProfile('worker');
    mockMemberships = [makeMembership('proj_x')];
    renderHook(() => useProjectAccessGuard('proj_x'), { wrapper });
    expect(navigateSpy).not.toHaveBeenCalled();
    expect(setNotificationSpy).not.toHaveBeenCalled();
  });

  it('redirects a worker without a matching membership to /home with a toast', () => {
    mockUser = makeUser('worker');
    mockProfile = makeProfile('worker');
    mockMemberships = [makeMembership('proj_other')];
    renderHook(() => useProjectAccessGuard('proj_x'), { wrapper });
    expect(setNotificationSpy).toHaveBeenCalledWith({
      type: 'info',
      message: expect.stringMatching(/not on this project/i),
    });
    expect(navigateSpy).toHaveBeenCalledWith('/home', { replace: true });
  });

  it('treats a stakeholder identically to a worker', () => {
    mockUser = makeUser('stakeholder');
    mockProfile = makeProfile('stakeholder');
    mockMemberships = [];
    renderHook(() => useProjectAccessGuard('proj_x'), { wrapper });
    expect(navigateSpy).toHaveBeenCalledWith('/home', { replace: true });
  });

  it('treats a soft-removed membership as no access', () => {
    mockUser = makeUser('worker');
    mockProfile = makeProfile('worker');
    mockMemberships = [{ ...makeMembership('proj_x'), removedAt: '2026-05-01T00:00:00Z' }];
    renderHook(() => useProjectAccessGuard('proj_x'), { wrapper });
    expect(navigateSpy).toHaveBeenCalledWith('/home', { replace: true });
  });

  // Mid-session race: profile briefly null. The guard should NOT redirect
  // even when memberships are empty — we don't know the role yet, so any
  // decision is premature. RequireAuth's spinner covers this window for
  // first load; this hook just needs to not over-fire.
  it('no-ops when currentProfile is null', () => {
    mockUser = null;
    mockProfile = null;
    mockMemberships = [];
    renderHook(() => useProjectAccessGuard('proj_x'), { wrapper });
    expect(navigateSpy).not.toHaveBeenCalled();
    expect(setNotificationSpy).not.toHaveBeenCalled();
  });
});

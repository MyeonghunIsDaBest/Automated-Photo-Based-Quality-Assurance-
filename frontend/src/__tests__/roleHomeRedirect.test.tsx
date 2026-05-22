import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import RoleHomeRedirect from '../pages/home/RoleHomeRedirect';
import type { Profile } from '../types';

// We use a tiny test app: index → RoleHomeRedirect, and explicit /home +
// /dashboard markers. After the redirect, the marker tells us where the
// component sent us. While `isAuthLoading` is true (or profile is null
// post-load) the redirect renders null, so neither marker shows up.

let mockIsAuthLoading = false;
let mockProfile: Profile | null = null;

vi.mock('../store', () => ({
  useAppStore: (selector: (s: unknown) => unknown) =>
    selector({
      isAuthLoading: mockIsAuthLoading,
      currentProfile: mockProfile,
    }),
}));

const makeProfile = (sg: NonNullable<Profile['securityGroup']>): Profile =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ({ id: 'p1', email: 'p@x', securityGroup: sg } as any);

function renderRedirectAt(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<RoleHomeRedirect />} />
        <Route path="/home" element={<div data-testid="home-route" />} />
        <Route path="/dashboard" element={<div data-testid="dashboard-route" />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RoleHomeRedirect', () => {
  beforeEach(() => {
    mockIsAuthLoading = false;
    mockProfile = null;
  });

  it('renders nothing while the session is still loading', () => {
    mockIsAuthLoading = true;
    mockProfile = null;
    const { queryByTestId } = renderRedirectAt('/');
    expect(queryByTestId('home-route')).toBeNull();
    expect(queryByTestId('dashboard-route')).toBeNull();
  });

  it('renders nothing when the session is loaded but profile is null', () => {
    // Belt-and-suspenders: shouldn't happen in the atomic refreshProfile
    // flow, but a cross-tab logout race could land here. We don't want to
    // bounce silently to /dashboard.
    mockIsAuthLoading = false;
    mockProfile = null;
    const { queryByTestId } = renderRedirectAt('/');
    expect(queryByTestId('home-route')).toBeNull();
    expect(queryByTestId('dashboard-route')).toBeNull();
  });

  it('routes field roles to /home', () => {
    mockProfile = makeProfile('worker');
    const { getByTestId } = renderRedirectAt('/');
    expect(getByTestId('home-route')).toBeInTheDocument();
  });

  it('routes admins to /dashboard', () => {
    mockProfile = makeProfile('company_admin');
    const { getByTestId } = renderRedirectAt('/');
    expect(getByTestId('dashboard-route')).toBeInTheDocument();
  });

  it('routes stakeholders to /home', () => {
    mockProfile = makeProfile('stakeholder');
    const { getByTestId } = renderRedirectAt('/');
    expect(getByTestId('home-route')).toBeInTheDocument();
  });

  it('routes suppliers to /home', () => {
    mockProfile = makeProfile('supplier');
    const { getByTestId } = renderRedirectAt('/');
    expect(getByTestId('home-route')).toBeInTheDocument();
  });
});

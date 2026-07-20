import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import RoleHomeRedirect from '../pages/home/RoleHomeRedirect';
import type { Profile } from '../types';

// P9.B: the Welcome deck retired from routing — every role lands on its REAL
// workspace: internal roles (admins/managers/PMs/workers/dev) → /dashboard,
// supplier → /supplier, stakeholder → /sponsor, customer → /customer.
// While `isAuthLoading` is true (or profile is null post-load) the redirect
// renders null, so no marker shows up.

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
        <Route path="/dashboard" element={<div data-testid="dashboard-route" />} />
        <Route path="/supplier" element={<div data-testid="supplier-route" />} />
        <Route path="/sponsor" element={<div data-testid="sponsor-route" />} />
        <Route path="/customer" element={<div data-testid="customer-route" />} />
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
    expect(queryByTestId('dashboard-route')).toBeNull();
  });

  it('renders nothing when the session is loaded but profile is null', () => {
    // Belt-and-suspenders: shouldn't happen in the atomic refreshProfile
    // flow, but a cross-tab logout race could land here. We don't want to
    // bounce silently anywhere on a stale null profile.
    mockIsAuthLoading = false;
    mockProfile = null;
    const { queryByTestId } = renderRedirectAt('/');
    expect(queryByTestId('dashboard-route')).toBeNull();
  });

  it('routes workers to the role-lensed /dashboard', () => {
    mockProfile = makeProfile('worker');
    const { getByTestId } = renderRedirectAt('/');
    expect(getByTestId('dashboard-route')).toBeInTheDocument();
  });

  it('routes admins to /dashboard', () => {
    mockProfile = makeProfile('company_admin');
    const { getByTestId } = renderRedirectAt('/');
    expect(getByTestId('dashboard-route')).toBeInTheDocument();
  });

  it('routes stakeholders to the sponsor cockpit', () => {
    mockProfile = makeProfile('stakeholder');
    const { getByTestId } = renderRedirectAt('/');
    expect(getByTestId('sponsor-route')).toBeInTheDocument();
  });

  it('routes suppliers to the supplier workspace', () => {
    mockProfile = makeProfile('supplier');
    const { getByTestId } = renderRedirectAt('/');
    expect(getByTestId('supplier-route')).toBeInTheDocument();
  });

  it('routes customers to the portal', () => {
    mockProfile = makeProfile('customer');
    const { getByTestId } = renderRedirectAt('/');
    expect(getByTestId('customer-route')).toBeInTheDocument();
  });
});

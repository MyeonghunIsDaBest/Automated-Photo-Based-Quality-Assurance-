import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { InviteMemberModal } from '../pages/projects/components/InviteMemberModal';
import type { User } from '../types';

// Mock the API helper so the test stays in-memory + assert it was called
// with the right arguments on submit.
const inviteSpy = vi.fn(async (projectId: string, userId: string, note?: string) => ({
  id: 'mem_new',
  projectId,
  userId,
  invitedBy: null,
  invitedAt: '2026-04-01T00:00:00Z',
  acceptedAt: null,
  removedAt: null,
  notes: note ?? null,
}));
vi.mock('../lib/api/projectMembers', () => ({
  inviteToProject: (projectId: string, userId: string, note?: string) =>
    inviteSpy(projectId, userId, note),
}));

const setNotificationSpy = vi.fn();
const USERS: User[] = [
  {
    id: 'user_alice',
    email: 'alice@x.com',
    fullName: 'Alice Worker',
    role: 'subcontractor',
    securityGroup: 'worker',
  },
  {
    id: 'user_bob',
    email: 'bob@x.com',
    fullName: 'Bob Stakeholder',
    role: 'stakeholder',
    securityGroup: 'stakeholder',
  },
  {
    id: 'user_existing',
    email: 'existing@x.com',
    fullName: 'Existing Member',
    role: 'subcontractor',
    securityGroup: 'worker',
  },
];
vi.mock('../store', () => ({
  useAppStore: (selector: (s: unknown) => unknown) =>
    selector({ users: USERS, setNotification: setNotificationSpy }),
}));

const onClose   = vi.fn();
const onInvited = vi.fn();

function renderModal(open = true) {
  return render(
    <InviteMemberModal
      open={open}
      projectId="proj_x"
      projectName="Hampstead Heights"
      existingMemberUserIds={new Set(['user_existing'])}
      onClose={onClose}
      onInvited={onInvited}
    />,
  );
}

describe('InviteMemberModal', () => {
  beforeEach(() => {
    inviteSpy.mockClear();
    setNotificationSpy.mockClear();
    onClose.mockClear();
    onInvited.mockClear();
  });

  it('renders nothing when closed', () => {
    const { container } = renderModal(false);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('hides users who are already members from the picker', () => {
    renderModal();
    expect(screen.getByText('Alice Worker')).toBeInTheDocument();
    expect(screen.getByText('Bob Stakeholder')).toBeInTheDocument();
    expect(screen.queryByText('Existing Member')).not.toBeInTheDocument();
  });

  it('filters the picker by name when searching', () => {
    renderModal();
    fireEvent.change(screen.getByPlaceholderText(/name or email/i), {
      target: { value: 'alice' },
    });
    expect(screen.getByText('Alice Worker')).toBeInTheDocument();
    expect(screen.queryByText('Bob Stakeholder')).not.toBeInTheDocument();
  });

  it('keeps the Send button disabled until a user is picked', () => {
    renderModal();
    const send = screen.getByRole('button', { name: /send invite/i });
    expect(send).toBeDisabled();
    fireEvent.click(screen.getByText('Alice Worker'));
    expect(send).not.toBeDisabled();
  });

  it('calls inviteToProject with the selected user + note on submit', async () => {
    renderModal();
    fireEvent.click(screen.getByText('Alice Worker'));
    fireEvent.change(screen.getByPlaceholderText(/why this person/i), {
      target: { value: 'Foreman, east elevation' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send invite/i }));
    // Wait for the async submit to settle.
    await Promise.resolve();
    expect(inviteSpy).toHaveBeenCalledWith('proj_x', 'user_alice', 'Foreman, east elevation');
  });
});

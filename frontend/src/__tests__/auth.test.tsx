import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Login from '../pages/Login';

const loginMock = vi.fn(async () => ({ error: null as string | null }));
const registerMock = vi.fn(async () => ({ error: null as string | null }));

vi.mock('../store', () => ({
  useAppStore: () => ({ login: loginMock, register: registerMock }),
}));

function renderLogin() {
  return render(
    <MemoryRouter>
      <Login />
    </MemoryRouter>
  );
}

describe('Login page', () => {
  beforeEach(() => {
    loginMock.mockClear();
    registerMock.mockClear();
  });

  it('renders sign-in heading by default', () => {
    renderLogin();
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(/sign/i);
    expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument();
  });

  it('calls login() with the entered credentials on submit', () => {
    const { container } = renderLogin();
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'jordan@casoneelectrical.com.au' },
    });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), {
      target: { value: 'hunter2x' },
    });
    const form = container.querySelector('form');
    expect(form).not.toBeNull();
    fireEvent.submit(form!);
    expect(loginMock).toHaveBeenCalledWith(
      'jordan@casoneelectrical.com.au',
      'hunter2x'
    );
  });

  it('switches to register mode and shows first/last name fields', () => {
    // The two "Create account" buttons (tab + footer link) both flip mode;
    // pick the first one for stability.
    renderLogin();
    const buttons = screen.getAllByRole('button', { name: /create account/i });
    fireEvent.click(buttons[0]);
    expect(screen.getByPlaceholderText('Jordan')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Casone')).toBeInTheDocument();
  });
});

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Login from '../pages/Login';

const loginMock = vi.fn(async () => ({ error: null as string | null }));
const registerMock = vi.fn(async () => ({ error: null as string | null }));

vi.mock('../store', () => ({
  useAppStore: () => ({ login: loginMock, register: registerMock }),
}));

// Spy on react-router-dom's navigate so we can assert where the form sends
// the user post-submit. The rest of react-router-dom (MemoryRouter, Routes,
// etc.) flows through normally.
const navigateSpy = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateSpy,
  };
});

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
    navigateSpy.mockClear();
  });

  it('renders sign-in heading by default', () => {
    renderLogin();
    // The signin-mode H2 reads "Welcome back." in the redesigned editorial
    // layout; the literal "Sign in" lives on the active tab + submit button.
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(/welcome back/i);
    expect(screen.getByRole('button', { name: /^sign in$/i })).toBeInTheDocument();
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

  // Regression: workers / stakeholders / suppliers used to land on /dashboard
  // because Login hard-coded the post-submit destination. Now it routes
  // through `/` so RoleHomeRedirect picks the right home per role.
  it('navigates to / (not /dashboard) on a successful sign-in', async () => {
    const { container } = renderLogin();
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'sam@siteproof.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), {
      target: { value: 'hunter2x' },
    });
    fireEvent.submit(container.querySelector('form')!);
    await waitFor(() => expect(navigateSpy).toHaveBeenCalled());
    expect(navigateSpy).toHaveBeenCalledWith('/', { replace: true });
    expect(navigateSpy).not.toHaveBeenCalledWith('/dashboard');
  });
});

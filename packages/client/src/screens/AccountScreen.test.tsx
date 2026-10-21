import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { UserProfile } from '@battleship/shared';
import { useStore } from '../lib/store';
import { api } from '../lib/api';
import { reconnectSocket } from '../lib/socket';
import AccountScreen from './AccountScreen';

vi.mock('../lib/api', () => ({
  api: { register: vi.fn(), login: vi.fn() },
  ApiRequestError: class extends Error {},
}));
vi.mock('../lib/socket', () => ({ reconnectSocket: vi.fn(), disconnectSocket: vi.fn(), connectSocket: vi.fn() }));

const guest: UserProfile = { id: 'user-me', displayName: 'Captain Nova', avatar: 'anchor', isGuest: true, username: null, createdAt: new Date().toISOString() };

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={['/account']}>
      <AccountScreen />
    </MemoryRouter>,
  );
}

function fillRegister({ username, password, confirm }: { username: string; password: string; confirm?: string }) {
  fireEvent.change(screen.getByLabelText(/^Username/), { target: { value: username } });
  fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: password } });
  fireEvent.change(screen.getByLabelText(/^Confirm password/), { target: { value: confirm ?? password } });
}

describe('AccountScreen', () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    useStore.setState({ user: guest, token: 'guest-token', authStatus: 'ready', game: null, toasts: [] });
  });

  it('shows a validation error for a short password and does not call the API', () => {
    renderScreen();
    fillRegister({ username: 'captain', password: 'short' });
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));
    expect(screen.getByText('Passwords need at least 8 characters.')).toBeInTheDocument();
    expect(api.register).not.toHaveBeenCalled();
  });

  it('flags mismatched password confirmation', () => {
    renderScreen();
    fillRegister({ username: 'captain', password: 'longenough1', confirm: 'longenough2' });
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));
    expect(screen.getByText('Passwords don’t match.')).toBeInTheDocument();
    expect(api.register).not.toHaveBeenCalled();
  });

  it('registers with a normalised username, stores the session and reconnects', async () => {
    const registered: UserProfile = { ...guest, isGuest: false, username: 'captain_nova' };
    vi.mocked(api.register).mockResolvedValue({ token: 'new-token', user: registered });
    renderScreen();

    fillRegister({ username: '  Captain_Nova ', password: 'longenough1' });
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => expect(api.register).toHaveBeenCalledWith({ username: 'captain_nova', password: 'longenough1' }));
    await waitFor(() => expect(useStore.getState().token).toBe('new-token'));
    expect(useStore.getState().user?.username).toBe('captain_nova');
    expect(reconnectSocket).toHaveBeenCalled();
  });

  it('maps a USERNAME_TAKEN error onto the username field', async () => {
    vi.mocked(api.register).mockRejectedValue(Object.assign(new Error('Username taken'), { code: 'USERNAME_TAKEN', status: 409 }));
    renderScreen();
    fillRegister({ username: 'captain', password: 'longenough1' });
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));
    expect(await screen.findByText('That username is already taken.')).toBeInTheDocument();
  });

  it('signs in from the Sign in tab', async () => {
    const registered: UserProfile = { ...guest, isGuest: false, username: 'captain' };
    vi.mocked(api.login).mockResolvedValue({ token: 'login-token', user: registered });
    renderScreen();
    fireEvent.click(screen.getByRole('tab', { name: 'Sign in' }));
    fireEvent.change(screen.getByLabelText(/^Username/), { target: { value: 'Captain' } });
    fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: 'longenough1' } });
    fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));
    await waitFor(() => expect(api.login).toHaveBeenCalledWith({ username: 'captain', password: 'longenough1' }));
    await waitFor(() => expect(useStore.getState().token).toBe('login-token'));
  });

  it('shows the signed-in panel instead of forms for registered users', () => {
    useStore.setState({ user: { ...guest, isGuest: false, username: 'nova' } });
    renderScreen();
    expect(screen.getByTestId('signed-in-panel')).toHaveTextContent('You’re signed in as @nova');
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });
});

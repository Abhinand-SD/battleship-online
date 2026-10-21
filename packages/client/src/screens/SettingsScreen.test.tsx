import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { UserProfile } from '@battleship/shared';
import { useStore } from '../lib/store';
import { api } from '../lib/api';
import SettingsScreen from './SettingsScreen';

vi.mock('../lib/api', () => ({
  api: { updateMe: vi.fn(), guest: vi.fn() },
  ApiRequestError: class extends Error {},
}));
vi.mock('../lib/socket', () => ({ reconnectSocket: vi.fn(), disconnectSocket: vi.fn(), connectSocket: vi.fn() }));

const user: UserProfile = { id: 'user-me', displayName: 'Captain Nova', avatar: 'anchor', isGuest: false, username: 'nova', createdAt: new Date().toISOString() };

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={['/settings']}>
      <SettingsScreen />
    </MemoryRouter>,
  );
}

describe('SettingsScreen', () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    useStore.setState({
      user,
      token: 'token',
      authStatus: 'ready',
      game: null,
      toasts: [],
      settings: { sound: true, volume: 0.6, reducedMotion: false, confirmShots: true },
    });
  });

  it('toggles sound through updateSettings with an accessible switch', () => {
    renderScreen();
    const toggle = screen.getByTestId('toggle-sound');
    expect(toggle).toHaveAttribute('role', 'switch');
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(toggle).toHaveAccessibleName('Sound effects');

    fireEvent.click(toggle);
    expect(useStore.getState().settings.sound).toBe(false);
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByLabelText('Volume')).toBeDisabled();

    fireEvent.click(toggle);
    expect(useStore.getState().settings.sound).toBe(true);
  });

  it('toggles gameplay settings', () => {
    renderScreen();
    fireEvent.click(screen.getByTestId('toggle-confirm-shots'));
    expect(useStore.getState().settings.confirmShots).toBe(false);
    fireEvent.click(screen.getByTestId('toggle-reduced-motion'));
    expect(useStore.getState().settings.reducedMotion).toBe(true);
  });

  it('saves the profile via api.updateMe and updates the store', async () => {
    vi.mocked(api.updateMe).mockResolvedValue({ user: { ...user, displayName: 'Admiral Nova', avatar: 'skull' } });
    renderScreen();

    const save = screen.getByRole('button', { name: /save profile/i });
    expect(save).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/^Display name/), { target: { value: '  Admiral Nova ' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Jolly Roger' }));
    expect(screen.getByRole('radio', { name: 'Jolly Roger' })).toHaveAttribute('aria-checked', 'true');
    expect(save).toBeEnabled();

    fireEvent.click(save);
    await waitFor(() => expect(api.updateMe).toHaveBeenCalledWith({ displayName: 'Admiral Nova', avatar: 'skull' }));
    await waitFor(() => expect(useStore.getState().user?.displayName).toBe('Admiral Nova'));
    expect(useStore.getState().toasts.some((t) => t.kind === 'success')).toBe(true);
  });

  it('shows a validation error instead of saving an invalid display name', () => {
    renderScreen();
    fireEvent.change(screen.getByLabelText(/^Display name/), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: /save profile/i }));
    expect(screen.getByText(/display names are 2–20 characters/i)).toBeInTheDocument();
    expect(api.updateMe).not.toHaveBeenCalled();
  });

  it('shows the sign-out flow for registered users and the account link for guests', () => {
    const { unmount } = renderScreen();
    expect(screen.getByText('@nova')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument();
    unmount();

    useStore.setState({ user: { ...user, isGuest: true, username: null } });
    renderScreen();
    expect(screen.getByRole('button', { name: /create account \/ sign in/i })).toBeInTheDocument();
  });
});

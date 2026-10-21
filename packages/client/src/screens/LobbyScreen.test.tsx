import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import LobbyScreen from './LobbyScreen';
import { useStore } from '../lib/store';
import type { GameSnapshot } from '@battleship/shared';
import { makePlayer } from '../test/fixtures';

function baseSnapshot(overrides: Partial<GameSnapshot>): GameSnapshot {
  const now = Date.now();
  return {
    gameId: 'game-1',
    roomCode: null,
    mode: 'QUICK',
    phase: 'PLACING_SHIPS',
    me: makePlayer(),
    opponent: makePlayer({ id: 'user-opp', displayName: 'Admiral Reef', avatar: 'skull' }),
    myBoard: { fleet: [], shots: [], sunk: [], hits: {} },
    enemyBoard: { shots: [], sunkShips: [], remaining: ['carrier', 'battleship', 'cruiser', 'submarine', 'destroyer'] },
    turn: null,
    moveNumber: 1,
    turnDeadline: null,
    countdownEndsAt: null,
    startedAt: null,
    endedAt: null,
    history: [],
    result: null,
    rematch: null,
    opponentReconnectDeadline: null,
    serverTime: now,
    ...overrides,
  };
}

vi.mock('../lib/socket', () => ({
  rt: { setReady: vi.fn(() => Promise.resolve({ ok: true })), leaveGame: vi.fn(() => Promise.resolve({ ok: true })), confirmFleet: vi.fn() },
  errorMessage: (err: unknown) => (err instanceof Error ? err.message : String(err)),
}));

import { rt } from '../lib/socket';

function lobbySnapshot(overrides: Partial<GameSnapshot> = {}) {
  return baseSnapshot({ mode: 'PRIVATE', phase: 'WAITING', roomCode: 'ABCDEF', opponent: null, ...overrides });
}

function renderLobby(game = lobbySnapshot()) {
  return render(
    <MemoryRouter initialEntries={['/game']}>
      <LobbyScreen game={game} />
    </MemoryRouter>,
  );
}

describe('LobbyScreen', () => {
  beforeEach(() => {
    useStore.setState({ settings: { ...useStore.getState().settings, sound: false, reducedMotion: true } });
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows the room code and my player slot, without an opponent slot while alone', () => {
    renderLobby();
    const code = screen.getByTestId('room-code');
    expect(code.textContent?.replace(/[^A-Z0-9]/g, '')).toBe('ABCDEF');
    expect(screen.getByTestId('lobby-player-me')).toHaveTextContent('Captain Nova');
    expect(screen.queryByTestId('lobby-player-opponent')).toBeNull();
    expect(screen.getByText(/waiting for a friend to join/i)).toBeInTheDocument();
    expect(screen.getByTestId('invite-link')).toHaveValue(`${window.location.origin}/join/ABCDEF`);
  });

  it('renders the opponent slot once someone joined', () => {
    renderLobby(lobbySnapshot({ opponent: makePlayer({ id: 'user-opp', displayName: 'Admiral Reef', avatar: 'skull', ready: true }) }));
    const slot = screen.getByTestId('lobby-player-opponent');
    expect(slot).toHaveTextContent('Admiral Reef');
    expect(slot).toHaveTextContent(/ready/i);
    expect(screen.queryByText(/waiting for a friend to join/i)).toBeNull();
  });

  it('ready-toggle asks the server to ready up, and to un-ready when already ready', async () => {
    renderLobby();
    const toggle = screen.getByTestId('ready-toggle');
    expect(toggle).toHaveTextContent('Ready up');
    fireEvent.click(toggle);
    await waitFor(() => expect(rt.setReady).toHaveBeenCalledWith(true));

    cleanup();
    renderLobby(lobbySnapshot({ me: makePlayer({ ready: true }) }));
    const unready = screen.getByTestId('ready-toggle');
    expect(unready).toHaveTextContent('Not ready');
    fireEvent.click(unready);
    await waitFor(() => expect(rt.setReady).toHaveBeenCalledWith(false));
  });

  it('locks the toggle and shows the countdown when the server scheduled the start', () => {
    renderLobby(lobbySnapshot({ opponent: makePlayer({ id: 'user-opp', ready: true }), me: makePlayer({ ready: true }), countdownEndsAt: Date.now() + 2600 }));
    expect(screen.queryByTestId('ready-toggle')).toBeNull();
    const banner = screen.getByTestId('lobby-countdown');
    expect(banner).toHaveTextContent(/starting in/i);
    expect(banner.getAttribute('data-seconds')).toBe('3');
  });

  it('leaving asks for confirmation before calling the server', async () => {
    renderLobby();
    fireEvent.click(screen.getByTestId('leave-room'));
    expect(rt.leaveGame).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByTestId('leave-confirm'));
    await waitFor(() => expect(rt.leaveGame).toHaveBeenCalledTimes(1));
  });
});

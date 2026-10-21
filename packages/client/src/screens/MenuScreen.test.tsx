import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { randomFleet, type GamePlayerInfo, type GameSnapshot, type UserProfile } from '@battleship/shared';
import { useStore } from '../lib/store';
import MenuScreen from './MenuScreen';

const { rt } = vi.hoisted(() => ({
  rt: {
    sync: vi.fn(),
    createRoom: vi.fn(),
    joinRoom: vi.fn(),
    joinQueue: vi.fn(),
    leaveQueue: vi.fn(),
    startPractice: vi.fn(),
    leaveGame: vi.fn(),
  },
}));

vi.mock('../lib/socket', () => ({ rt }));
vi.mock('../lib/api', () => ({
  api: { online: vi.fn(() => Promise.resolve({ onlineUsers: 7, activeGames: 2, queueLength: 1, connectedSockets: 7 })) },
}));

const user: UserProfile = { id: 'user-me', displayName: 'Captain Nova', avatar: 'anchor', isGuest: true, username: null, createdAt: new Date(0).toISOString() };

const me: GamePlayerInfo = { id: 'user-me', displayName: 'Captain Nova', avatar: 'anchor', isGuest: true, isAi: false, rating: 1000, connected: true, ready: false, fleetConfirmed: true };

/** Minimal snapshot for the menu (the shared `makeSnapshot` fixture uses a constant RNG that cannot place a fleet). */
function makeGame(phase: GameSnapshot['phase']): GameSnapshot {
  const now = Date.now();
  return {
    gameId: 'game-1',
    roomCode: null,
    mode: 'QUICK',
    phase,
    me,
    opponent: { ...me, id: 'user-opp', displayName: 'Admiral Reef', avatar: 'skull' },
    myBoard: { fleet: randomFleet(), shots: [], sunk: [], hits: {} },
    enemyBoard: { shots: [], sunkShips: [], remaining: ['carrier', 'battleship', 'cruiser', 'submarine', 'destroyer'] },
    turn: phase === 'IN_BATTLE' ? 'me' : null,
    moveNumber: 1,
    turnDeadline: null,
    countdownEndsAt: null,
    startedAt: now - 10_000,
    endedAt: phase === 'FINISHED' ? now : null,
    history: [],
    result: null,
    rematch: null,
    opponentReconnectDeadline: null,
    serverTime: now,
  };
}

function requestError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

function renderMenu(path = '/play') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <MenuScreen />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  for (const fn of Object.values(rt)) fn.mockReset().mockResolvedValue({ ok: true });
  useStore.setState({
    user,
    connection: 'connected',
    game: null,
    queue: { inQueue: false, since: null, searching: 0 },
    toasts: [],
    settings: { sound: false, volume: 0, reducedMotion: true, confirmShots: true },
  });
});

afterEach(() => {
  cleanup();
});

describe('MenuScreen', () => {
  it('renders the user header and all primary actions', () => {
    renderMenu();
    expect(screen.getByTestId('menu-display-name')).toHaveTextContent('Captain Nova');
    expect(screen.getByText('Guest')).toBeInTheDocument();
    expect(screen.getByTestId('menu-create-account')).toHaveAttribute('href', '/account');
    for (const id of ['menu-quick-match', 'menu-create-room', 'join-code-input', 'join-room', 'menu-practice']) {
      expect(screen.getByTestId(id)).toBeInTheDocument();
    }
  });

  it('quick match calls rt.joinQueue once even when double clicked', async () => {
    renderMenu();
    const button = screen.getByTestId('menu-quick-match');
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(rt.joinQueue).toHaveBeenCalledTimes(1));
    expect(rt.leaveGame).not.toHaveBeenCalled();
  });

  it('shows the searching state with a cancel button while in the queue', async () => {
    useStore.setState({ queue: { inQueue: true, since: Date.now() - 65_000, searching: 3 } });
    renderMenu();
    expect(screen.getByTestId('queue-searching')).toHaveTextContent(/searching for an opponent/i);
    expect(screen.getByTestId('queue-searching')).toHaveTextContent(/2 other players are searching/i);
    expect(screen.getByTestId('queue-searching')).toHaveTextContent('1:05');
    expect(screen.queryByTestId('menu-quick-match')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('queue-cancel'));
    await waitFor(() => expect(rt.leaveQueue).toHaveBeenCalledTimes(1));
  });

  it('normalises the room code and joins with it', async () => {
    renderMenu();
    const input = screen.getByTestId<HTMLInputElement>('join-code-input');
    fireEvent.change(input, { target: { value: 'abc-def' } });
    expect(input.value).toBe('ABC-DEF');
    fireEvent.click(screen.getByTestId('join-room'));
    await waitFor(() => expect(rt.joinRoom).toHaveBeenCalledWith('ABCDEF'));
  });

  it('accepts a pasted invite link', async () => {
    renderMenu();
    fireEvent.change(screen.getByTestId('join-code-input'), { target: { value: 'https://example.com/join/xyz-234?utm=1' } });
    fireEvent.click(screen.getByTestId('join-room'));
    await waitFor(() => expect(rt.joinRoom).toHaveBeenCalledWith('XYZ234'));
  });

  it('validates the code locally before sending it', async () => {
    renderMenu();
    fireEvent.change(screen.getByTestId('join-code-input'), { target: { value: 'ab' } });
    fireEvent.click(screen.getByTestId('join-room'));
    expect(await screen.findByText(/room codes are 6 characters long/i)).toBeInTheDocument();
    expect(rt.joinRoom).not.toHaveBeenCalled();
  });

  it('shows server join errors inline', async () => {
    rt.joinRoom.mockRejectedValueOnce(requestError('ROOM_NOT_FOUND', 'Room not found'));
    renderMenu();
    fireEvent.change(screen.getByTestId('join-code-input'), { target: { value: 'ABCDEF' } });
    fireEvent.click(screen.getByTestId('join-room'));
    expect(await screen.findByText(/no room with that code/i)).toBeInTheDocument();
  });

  it('practice flow starts a hard game', async () => {
    renderMenu();
    fireEvent.click(screen.getByTestId('menu-practice'));
    const medium = screen.getByTestId('practice-difficulty-medium');
    expect(medium).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByTestId('practice-difficulty-hard'));
    expect(screen.getByTestId('practice-difficulty-hard')).toHaveAttribute('aria-checked', 'true');
    expect(medium).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(screen.getByTestId('practice-start'));
    await waitFor(() => expect(rt.startPractice).toHaveBeenCalledWith('hard'));
  });

  it('opens the difficulty picker for ?practice=1 and auto-starts quick match for ?quick=1', async () => {
    renderMenu('/play?practice=1');
    expect(screen.getByTestId('practice-start')).toBeInTheDocument();
    cleanup();
    renderMenu('/play?quick=1');
    await waitFor(() => expect(rt.joinQueue).toHaveBeenCalledTimes(1));
  });

  it('leaves a finished game before starting a new one', async () => {
    useStore.setState({ game: makeGame('FINISHED') });
    renderMenu();
    fireEvent.click(screen.getByTestId('menu-create-room'));
    await waitFor(() => expect(rt.createRoom).toHaveBeenCalledTimes(1));
    expect(rt.leaveGame).toHaveBeenCalledTimes(1);
    expect(rt.leaveGame.mock.invocationCallOrder[0]).toBeLessThan(rt.createRoom.mock.invocationCallOrder[0]!);
  });

  it('blocks new games while a match is in progress and offers return / leave', async () => {
    useStore.setState({ game: makeGame('IN_BATTLE') });
    renderMenu('/play?quick=1');
    expect(screen.getByTestId('match-in-progress')).toHaveTextContent(/match in progress/i);
    expect(screen.getByTestId('menu-quick-match')).toBeDisabled();
    expect(screen.getByTestId('menu-create-room')).toBeDisabled();
    expect(screen.getByTestId('menu-practice')).toBeDisabled();
    expect(rt.joinQueue).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('menu-leave-match'));
    fireEvent.click(await screen.findByTestId('confirm-leave-match'));
    await waitFor(() => expect(rt.leaveGame).toHaveBeenCalledTimes(1));
  });

  it('disables actions and shows a hint while disconnected', () => {
    useStore.setState({ connection: 'connecting' });
    renderMenu();
    expect(screen.getByTestId('menu-offline-hint')).toBeInTheDocument();
    expect(screen.getByTestId('menu-quick-match')).toBeDisabled();
    expect(screen.getByTestId('join-room')).toBeDisabled();
    expect(screen.getByTestId('menu-practice')).toBeDisabled();
  });
});

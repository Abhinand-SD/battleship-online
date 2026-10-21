import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { randomFleet, validateFleet, type GameSnapshot } from '@battleship/shared';
import PlacementScreen from './PlacementScreen';
import { useStore } from '../lib/store';
import { makePlayer } from '../test/fixtures';

/** Deterministic PRNG (mulberry32): the shared fixture's constant rng can never produce a non-overlapping fleet. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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
  rt: { confirmFleet: vi.fn(() => Promise.resolve({ ok: true })), leaveGame: vi.fn(() => Promise.resolve({ ok: true })), setReady: vi.fn() },
  errorMessage: (err: unknown) => (err instanceof Error ? err.message : String(err)),
}));

import { rt } from '../lib/socket';

function placementSnapshot(overrides: Partial<GameSnapshot> = {}) {
  return baseSnapshot(overrides);
}

function renderPlacement(game = placementSnapshot()) {
  return render(
    <MemoryRouter initialEntries={['/game']}>
      <PlacementScreen game={game} />
    </MemoryRouter>,
  );
}

describe('PlacementScreen', () => {
  beforeEach(() => {
    useStore.setState({ settings: { ...useStore.getState().settings, sound: false, reducedMotion: true } });
    useStore.getState().setDraftFleet(randomFleet(seeded(42)));
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders the board and an enabled confirm button for the default valid draft, then confirms the 5-ship fleet', async () => {
    renderPlacement();
    expect(screen.getByTestId('placement-board')).toBeInTheDocument();
    expect(screen.getByTestId('randomize-fleet')).toBeInTheDocument();
    expect(screen.getAllByTestId(/^ship-(carrier|battleship|cruiser|submarine|destroyer)$/)).toHaveLength(5);

    const confirm = screen.getByTestId('confirm-fleet');
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);

    await waitFor(() => expect(rt.confirmFleet).toHaveBeenCalledTimes(1));
    const fleet = vi.mocked(rt.confirmFleet).mock.calls[0]?.[0];
    expect(fleet).toHaveLength(5);
    expect(validateFleet(fleet)).toEqual({ ok: true });
    // Optimistically locked until the server snapshot flips `fleetConfirmed`.
    await waitFor(() => expect(screen.getByTestId('waiting-for-opponent')).toBeInTheDocument());
  });

  it('disables confirm while the draft is incomplete and re-enables it after Randomize', async () => {
    useStore.setState({ draftFleet: [] });
    renderPlacement();
    const confirm = screen.getByTestId('confirm-fleet');
    expect(confirm).toBeDisabled();
    expect(screen.getByTestId('placement-validation')).toHaveTextContent('0 of 5 ships deployed');

    fireEvent.click(screen.getByTestId('randomize-fleet'));
    await waitFor(() => expect(screen.getByTestId('confirm-fleet')).toBeEnabled());
    // The store mirrors the draft so it survives a reload / rematch.
    expect(useStore.getState().draftFleet).toHaveLength(5);

    fireEvent.click(screen.getByTestId('reset-fleet'));
    await waitFor(() => expect(screen.getByTestId('confirm-fleet')).toBeDisabled());
    expect(useStore.getState().draftFleet).toHaveLength(0);
  });

  it('tap-to-place: selecting a ship in the tray and clicking a cell places it', async () => {
    useStore.setState({ draftFleet: [] });
    renderPlacement();
    fireEvent.click(screen.getByTestId('tray-destroyer'));
    expect(screen.getByTestId('tray-destroyer')).toHaveAttribute('aria-pressed', 'true');
    const cell = screen.getByTestId('placement-board').querySelector('[data-x="0"][data-y="0"]');
    expect(cell).not.toBeNull();
    fireEvent.click(cell!);
    await waitFor(() => expect(screen.getByTestId('ship-destroyer')).toBeInTheDocument());
    expect(screen.getByTestId('placement-validation')).toHaveTextContent('1 of 5 ships deployed');
  });

  it('shows the waiting state once my fleet is confirmed by the server', () => {
    renderPlacement(placementSnapshot({ me: makePlayer({ fleetConfirmed: true }), myBoard: { fleet: randomFleet(seeded(42)), shots: [], sunk: [], hits: {} } }));
    expect(screen.queryByTestId('confirm-fleet')).toBeNull();
    expect(screen.getByTestId('waiting-for-opponent')).toHaveTextContent(/waiting for opponent to deploy/i);
    expect(screen.getByTestId('placement-opponent')).toHaveTextContent('Admiral Reef');
  });

  it('shows the battle countdown when both fleets are in and the server scheduled the start', () => {
    renderPlacement(
      placementSnapshot({
        me: makePlayer({ fleetConfirmed: true }),
        opponent: makePlayer({ id: 'user-opp', fleetConfirmed: true }),
        countdownEndsAt: Date.now() + 2500,
      }),
    );
    const banner = screen.getByTestId('battle-countdown');
    expect(banner).toHaveTextContent(/battle starts in/i);
    expect(banner.getAttribute('data-seconds')).toBe('3');
  });
});

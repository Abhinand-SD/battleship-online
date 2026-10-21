import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { GameResult, GameSnapshot } from '@battleship/shared';

vi.mock('../lib/socket', () => ({
  rt: {
    attack: vi.fn(),
    forfeit: vi.fn(),
    rematch: vi.fn(),
    leaveGame: vi.fn(),
    sync: vi.fn(),
  },
  errorMessage: (err: unknown) => (err instanceof Error ? err.message : 'Something went wrong'),
  SocketRequestError: class SocketRequestError extends Error {},
}));

import { rt } from '../lib/socket';
import { useStore } from '../lib/store';
import { makePlayer } from '../test/fixtures';
import { makeBattleSnapshot as makeSnapshot } from '../components/battle/testFixtures';
import ResultsScreen from './ResultsScreen';

const rematch = vi.mocked(rt.rematch);
const leaveGame = vi.mocked(rt.leaveGame);

function makeResult(overrides: Partial<GameResult> = {}): GameResult {
  return {
    winner: 'me',
    reason: 'ALL_SUNK',
    durationMs: 272_000,
    stats: {
      me: { shots: 40, hits: 17, misses: 23, accuracy: 42.5, shipsSunk: 5, shipsLost: 2 },
      opponent: { shots: 39, hits: 9, misses: 30, accuracy: 23.1, shipsSunk: 2, shipsLost: 5 },
    },
    ratingChange: 14,
    achievements: ['first_victory'],
    ...overrides,
  };
}

function finished(overrides: Partial<GameSnapshot> = {}): GameSnapshot {
  return makeSnapshot({
    phase: 'FINISHED',
    turn: null,
    turnDeadline: null,
    endedAt: Date.now(),
    result: makeResult(),
    rematch: { requestedByMe: false, requestedByOpponent: false },
    ...overrides,
  });
}

function renderResults(game: GameSnapshot) {
  useStore.setState({
    game,
    user: { id: 'user-me', displayName: 'Captain Nova', avatar: 'anchor', isGuest: true, username: null, createdAt: new Date().toISOString() },
    settings: { sound: false, volume: 0, reducedMotion: true, confirmShots: false },
  });
  return render(
    <MemoryRouter initialEntries={['/game']}>
      <Routes>
        <Route path="/game" element={<ResultsScreen game={game} />} />
        <Route path="/play" element={<div data-testid="menu-screen">menu</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ResultsScreen', () => {
  afterEach(cleanup);
  beforeEach(() => {
    rematch.mockReset();
    leaveGame.mockReset();
    rematch.mockResolvedValue({ ok: true } as never);
    leaveGame.mockResolvedValue({ ok: true } as never);
  });

  it('renders a victory with the stats and requests a rematch', async () => {
    renderResults(finished());
    const banner = screen.getByTestId('result-banner');
    expect(banner).toHaveAttribute('data-result', 'victory');
    expect(banner).toHaveTextContent(/enemy fleet destroyed/i);
    expect(screen.getByTestId('stat-hits')).toHaveTextContent('17');
    expect(screen.getByTestId('stat-ships-sunk')).toHaveTextContent('5');
    expect(screen.getByTestId('stat-duration')).toHaveTextContent('4:32');
    expect(screen.getByTestId('rating-change')).toHaveTextContent('+14');
    expect(screen.getByTestId('achievement-first_victory')).toHaveTextContent(/first victory/i);
    // Read-only boards are present.
    expect(screen.getByTestId('enemy-board')).toBeInTheDocument();
    expect(screen.getByTestId('my-board')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('rematch-button'));
    await waitFor(() => expect(rematch).toHaveBeenCalledWith(true));
  });

  it('renders a defeat for the opponent winning', () => {
    renderResults(finished({ result: makeResult({ winner: 'opponent', reason: 'FORFEIT', ratingChange: -9, achievements: [] }) }));
    const banner = screen.getByTestId('result-banner');
    expect(banner).toHaveAttribute('data-result', 'defeat');
    expect(banner).toHaveTextContent(/you surrendered/i);
    expect(screen.getByTestId('rating-change')).toHaveTextContent('-9');
    expect(screen.queryByTestId('achievements')).not.toBeInTheDocument();
  });

  it('renders a draw for a cancelled match without a rating change', () => {
    renderResults(finished({ result: makeResult({ winner: null, reason: 'CANCELLED', ratingChange: undefined, achievements: undefined }) }));
    expect(screen.getByTestId('result-banner')).toHaveAttribute('data-result', 'draw');
    expect(screen.queryByTestId('rating-change')).not.toBeInTheDocument();
  });

  it('shows the waiting state with a cancel after I requested a rematch', async () => {
    renderResults(finished({ rematch: { requestedByMe: true, requestedByOpponent: false } }));
    expect(screen.getByTestId('rematch-button')).toBeDisabled();
    expect(screen.getByTestId('rematch-button')).toHaveTextContent(/waiting for opponent/i);
    fireEvent.click(screen.getByTestId('rematch-cancel'));
    await waitFor(() => expect(rematch).toHaveBeenCalledWith(false));
  });

  it('offers to accept an incoming rematch request', () => {
    renderResults(finished({ rematch: { requestedByMe: false, requestedByOpponent: true } }));
    expect(screen.getByTestId('rematch-button')).toHaveTextContent(/accept rematch/i);
    expect(screen.getByTestId('rematch-incoming')).toHaveTextContent(/admiral reef/i);
  });

  it('hides the rematch button when the opponent left', () => {
    renderResults(finished({ opponent: null, rematch: null }));
    expect(screen.queryByTestId('rematch-button')).not.toBeInTheDocument();
    expect(screen.getByTestId('opponent-left')).toBeInTheDocument();
  });

  it('shows "Play again" for practice and falls back when the server says the opponent left', async () => {
    renderResults(
      finished({
        mode: 'PRACTICE',
        opponent: makePlayer({ id: 'ai', displayName: 'Hard AI', isAi: true, aiDifficulty: 'hard' }),
        result: makeResult({ ratingChange: undefined }),
      }),
    );
    const button = screen.getByTestId('rematch-button');
    expect(button).toHaveTextContent(/play again/i);
    rematch.mockRejectedValueOnce(Object.assign(new Error('Your opponent has left'), { code: 'OPPONENT_LEFT' }));
    fireEvent.click(button);
    await waitFor(() => expect(screen.getByTestId('opponent-left')).toBeInTheDocument());
    expect(useStore.getState().toasts.some((t) => /opponent left/i.test(t.title))).toBe(true);
  });

  it('leaves the game and navigates to the menu', async () => {
    renderResults(finished());
    fireEvent.click(screen.getByTestId('back-to-menu'));
    await waitFor(() => expect(leaveGame).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId('menu-screen')).toBeInTheDocument());
  });

  it('still navigates to the menu when leaving fails', async () => {
    leaveGame.mockRejectedValueOnce(new Error('Not connected'));
    renderResults(finished());
    fireEvent.click(screen.getByTestId('back-to-menu'));
    await waitFor(() => expect(screen.getByTestId('menu-screen')).toBeInTheDocument());
  });
});

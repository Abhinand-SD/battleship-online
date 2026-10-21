import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { GameSnapshot } from '@battleship/shared';

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
import BattleScreen from './BattleScreen';

const attack = vi.mocked(rt.attack);
const forfeit = vi.mocked(rt.forfeit);

function renderBattle(game: GameSnapshot) {
  useStore.setState({
    game,
    user: { id: 'user-me', displayName: 'Captain Nova', avatar: 'anchor', isGuest: true, username: null, createdAt: new Date().toISOString() },
    settings: { sound: false, volume: 0, reducedMotion: true, confirmShots: false },
    serverOffset: 0,
  });
  return render(
    <MemoryRouter initialEntries={['/game']}>
      <BattleScreen game={game} />
    </MemoryRouter>,
  );
}

describe('BattleScreen', () => {
  afterEach(cleanup);
  beforeEach(() => {
    attack.mockReset();
    forfeit.mockReset();
    attack.mockResolvedValue({ ok: true, outcome: 'miss', gameOver: false });
    forfeit.mockResolvedValue({ ok: true } as never);
  });

  it('renders the turn indicator with data-turn="me" on my turn', () => {
    renderBattle(makeSnapshot());
    const indicator = screen.getByTestId('turn-indicator');
    expect(indicator).toHaveAttribute('data-turn', 'me');
    expect(indicator).toHaveTextContent(/your turn/i);
    expect(screen.getByTestId('turn-timer')).toBeInTheDocument();
  });

  it('renders data-turn="opponent" on the enemy turn and keeps the enemy board read only', () => {
    renderBattle(makeSnapshot({ turn: 'opponent' }));
    expect(screen.getByTestId('turn-indicator')).toHaveAttribute('data-turn', 'opponent');
    const cell = within(screen.getByTestId('enemy-board')).getAllByRole('gridcell')[0]!;
    fireEvent.click(cell);
    expect(attack).not.toHaveBeenCalled();
  });

  it('shows the battle countdown instead of a turn indicator while READY', () => {
    renderBattle(makeSnapshot({ phase: 'READY', turn: null, turnDeadline: null, countdownEndsAt: Date.now() + 3_000 }));
    expect(screen.queryByTestId('turn-indicator')).not.toBeInTheDocument();
    expect(screen.getByTestId('battle-countdown')).toHaveTextContent(/battle begins in/i);
  });

  it('hides the turn timer when there is no deadline (practice)', () => {
    renderBattle(makeSnapshot({ mode: 'PRACTICE', turnDeadline: null, opponent: makePlayer({ id: 'ai', displayName: 'Hard AI', isAi: true, aiDifficulty: 'hard' }) }));
    expect(screen.queryByTestId('turn-timer')).not.toBeInTheDocument();
    expect(screen.getByTestId('hud-player-opponent')).toHaveTextContent(/hard ai/i);
  });

  it('fires at an empty enemy cell with the current move number', async () => {
    renderBattle(makeSnapshot({ moveNumber: 7 }));
    const board = screen.getByTestId('enemy-board');
    const cell = board.querySelector<HTMLElement>('[data-state="empty"][data-x="3"][data-y="4"]');
    expect(cell).not.toBeNull();
    fireEvent.click(cell!);
    await waitFor(() => expect(attack).toHaveBeenCalledWith(3, 4, 7));
    expect(attack).toHaveBeenCalledTimes(1);
  });

  it('does not fire at a cell that was already attacked', () => {
    const game = makeSnapshot({ enemyBoard: { shots: [{ x: 0, y: 0, outcome: 'miss' }], sunkShips: [], remaining: ['carrier', 'battleship', 'cruiser', 'submarine', 'destroyer'] } });
    renderBattle(game);
    const cell = screen.getByTestId('enemy-board').querySelector<HTMLElement>('[data-x="0"][data-y="0"]')!;
    expect(cell).toHaveAttribute('data-state', 'miss');
    fireEvent.click(cell);
    expect(attack).not.toHaveBeenCalled();
  });

  it('opens a confirmation and forfeits when confirmed', async () => {
    renderBattle(makeSnapshot());
    fireEvent.click(screen.getByTestId('forfeit-button'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(forfeit).not.toHaveBeenCalled();
    const confirm = screen.getAllByRole('button', { name: /^(forfeit|surrender|confirm)/i }).at(-1)!;
    expect(confirm).toHaveAttribute('data-testid', 'forfeit-confirm');
    fireEvent.click(confirm);
    await waitFor(() => expect(forfeit).toHaveBeenCalledTimes(1));
  });

  it('shows the disconnect banner with the reconnect countdown', () => {
    renderBattle(
      makeSnapshot({
        opponent: makePlayer({ id: 'user-opp', displayName: 'Admiral Reef', connected: false }),
        opponentReconnectDeadline: Date.now() + 42_000,
      }),
    );
    expect(screen.getByTestId('opponent-disconnected')).toHaveTextContent(/opponent disconnected — they have 0:4\d to return/i);
  });

  it('lists shots newest first in the log', () => {
    const now = Date.now();
    renderBattle(
      makeSnapshot({
        moveNumber: 3,
        history: [
          { moveNumber: 1, by: 'me', x: 0, y: 0, outcome: 'miss', at: now - 2000 },
          { moveNumber: 2, by: 'opponent', x: 4, y: 4, outcome: 'hit', at: now - 1000 },
        ],
      }),
    );
    // Collapsed on phone-sized (jsdom) layouts; open it first.
    fireEvent.click(screen.getByRole('button', { name: /shot log/i }));
    const rows = screen.getAllByTestId('shot-log-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('#2');
    expect(rows[0]).toHaveTextContent('E5');
    expect(rows[1]).toHaveTextContent('A1');
  });
});

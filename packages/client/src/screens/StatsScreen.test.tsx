import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { PlayerStats, UserProfile } from '@battleship/shared';
import { useStore } from '../lib/store';
import { api } from '../lib/api';
import StatsScreen from './StatsScreen';

vi.mock('../lib/api', () => ({
  api: { myStats: vi.fn(), myMatches: vi.fn() },
  ApiRequestError: class extends Error {},
}));
vi.mock('../lib/socket', () => ({ reconnectSocket: vi.fn(), disconnectSocket: vi.fn(), connectSocket: vi.fn() }));

const user: UserProfile = { id: 'user-me', displayName: 'Captain Nova', avatar: 'anchor', isGuest: true, username: null, createdAt: new Date().toISOString() };

const stats: PlayerStats = {
  userId: 'user-me',
  gamesPlayed: 10,
  wins: 6,
  losses: 4,
  winRate: 60,
  shotsFired: 200,
  shotsHit: 90,
  accuracy: 45,
  shipsSunk: 27,
  currentStreak: 2,
  bestStreak: 4,
  practiceGames: 3,
  practiceWins: 1,
  rating: 1234,
  achievements: [
    { key: 'first_victory', name: 'First Victory', description: 'Win your first online match.', unlockedAt: new Date().toISOString() },
    { key: 'veteran', name: 'Veteran', description: 'Play 25 matches.', unlockedAt: null },
  ],
};

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={['/stats']}>
      <StatsScreen />
    </MemoryRouter>,
  );
}

describe('StatsScreen', () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    useStore.setState({ user, token: 'token', authStatus: 'ready', game: null });
    vi.mocked(api.myStats).mockResolvedValue({ stats, rank: 12 });
    vi.mocked(api.myMatches).mockResolvedValue({ matches: [] });
  });

  it('renders stat tiles, rating and rank from the stats response', async () => {
    renderScreen();
    expect(screen.getByTestId('stats-loading')).toBeInTheDocument();

    expect(await screen.findByTestId('stats-rating')).toHaveTextContent('1,234');
    expect(screen.getByTestId('stats-rank')).toHaveTextContent('#12');

    const tiles = within(screen.getByTestId('stat-tiles')).getAllByTestId('stat-tile');
    expect(tiles).toHaveLength(11);
    const tileByLabel = (label: string) => tiles.find((t) => within(t).queryByText(label))!;
    expect(tileByLabel('Games')).toHaveTextContent('10');
    expect(tileByLabel('Wins')).toHaveTextContent('6');
    expect(tileByLabel('Losses')).toHaveTextContent('4');
    expect(tileByLabel('Win rate')).toHaveTextContent('60%');
    expect(tileByLabel('Accuracy')).toHaveTextContent('45%');
    expect(tileByLabel('Shots fired')).toHaveTextContent('200');
    expect(tileByLabel('Ships sunk')).toHaveTextContent('27');
    expect(tileByLabel('Current streak')).toHaveTextContent('2W');
    expect(tileByLabel('Best streak')).toHaveTextContent('4');
    expect(tileByLabel('Practice games')).toHaveTextContent('3');
    expect(tileByLabel('Practice wins')).toHaveTextContent('1');

    const achievements = screen.getAllByTestId('achievement');
    expect(achievements).toHaveLength(2);
    expect(achievements[0]).toHaveAttribute('data-unlocked', 'true');
    expect(achievements[1]).toHaveAttribute('data-unlocked', 'false');

    // Guests are nudged to create an account.
    expect(screen.getByText(/create an account to keep your stats across devices/i)).toBeInTheDocument();
    expect(api.myMatches).toHaveBeenCalledWith(20);
  });

  it('shows an empty match-history state with a play CTA when there are no matches', async () => {
    renderScreen();
    expect(await screen.findByText('No matches yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /play a match/i })).toBeInTheDocument();
    expect(screen.queryAllByTestId('match-row')).toHaveLength(0);
  });

  it('shows "Unranked" and a retry button when stats fail', async () => {
    vi.mocked(api.myStats).mockRejectedValueOnce(new Error('boom'));
    renderScreen();
    expect(await screen.findByRole('alert')).toHaveTextContent('boom');
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });
});

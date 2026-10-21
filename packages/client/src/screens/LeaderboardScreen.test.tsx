import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { LeaderboardEntry, PlayerStats, UserProfile } from '@battleship/shared';
import { useStore } from '../lib/store';
import { api } from '../lib/api';
import LeaderboardScreen from './LeaderboardScreen';

vi.mock('../lib/api', () => ({
  api: { leaderboard: vi.fn(), myStats: vi.fn() },
  ApiRequestError: class extends Error {},
}));
vi.mock('../lib/socket', () => ({ reconnectSocket: vi.fn(), disconnectSocket: vi.fn(), connectSocket: vi.fn() }));

const me: UserProfile = { id: 'user-me', displayName: 'Captain Nova', avatar: 'anchor', isGuest: false, username: 'nova', createdAt: new Date().toISOString() };

function entry(overrides: Partial<LeaderboardEntry>): LeaderboardEntry {
  return {
    rank: 1,
    userId: 'u',
    displayName: 'Player',
    avatar: 'skull',
    isGuest: false,
    rating: 1000,
    wins: 1,
    losses: 0,
    gamesPlayed: 1,
    winRate: 100,
    accuracy: 50,
    ...overrides,
  };
}

const entries = [
  entry({ rank: 1, userId: 'u1', displayName: 'Admiral Reef', rating: 1500 }),
  entry({ rank: 2, userId: 'user-me', displayName: 'Captain Nova', rating: 1400, avatar: 'anchor' }),
  entry({ rank: 3, userId: 'u3', displayName: 'Deckhand Dan', rating: 1300, isGuest: true }),
];

const myStats: PlayerStats = {
  userId: 'user-me',
  gamesPlayed: 5,
  wins: 2,
  losses: 3,
  winRate: 40,
  shotsFired: 80,
  shotsHit: 30,
  accuracy: 37.5,
  shipsSunk: 8,
  currentStreak: -1,
  bestStreak: 1,
  rating: 980,
  practiceGames: 0,
  practiceWins: 0,
  achievements: [],
};

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={['/leaderboard']}>
      <LeaderboardScreen />
    </MemoryRouter>,
  );
}

describe('LeaderboardScreen', () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    useStore.setState({ user: me, token: 'token', authStatus: 'ready', game: null });
    vi.mocked(api.leaderboard).mockResolvedValue({ entries });
    vi.mocked(api.myStats).mockResolvedValue({ stats: myStats, rank: 2 });
  });

  it('renders a row per entry and highlights the current user', async () => {
    renderScreen();
    const rows = await screen.findAllByTestId('leaderboard-row');
    expect(rows).toHaveLength(3);
    expect(api.leaderboard).toHaveBeenCalledWith(50, 0);

    expect(rows[0]).toHaveTextContent('Admiral Reef');
    expect(rows[0]).toHaveTextContent('1,500');
    expect(rows[2]).toHaveTextContent('Guest');

    const mine = rows[1]!;
    expect(mine).toHaveAttribute('data-me', 'true');
    expect(mine).toHaveAttribute('aria-current', 'true');
    expect(within(mine).getByText('You')).toBeInTheDocument();
    expect(rows[0]).not.toHaveAttribute('data-me');
    expect(screen.queryByTestId('leaderboard-footer')).not.toBeInTheDocument();
  });

  it('shows the current user in a footer row when they are outside the list', async () => {
    vi.mocked(api.leaderboard).mockResolvedValue({ entries: entries.filter((e) => e.userId !== 'user-me') });
    vi.mocked(api.myStats).mockResolvedValue({ stats: myStats, rank: 57 });
    renderScreen();
    const footer = await screen.findByTestId('leaderboard-footer');
    const row = within(footer).getByTestId('leaderboard-row');
    expect(row).toHaveAttribute('data-me', 'true');
    expect(row).toHaveTextContent('Captain Nova');
    expect(row).toHaveTextContent('57');
    expect(row).toHaveTextContent('980');
  });

  it('shows an empty state when there are no entries', async () => {
    vi.mocked(api.leaderboard).mockResolvedValue({ entries: [] });
    renderScreen();
    expect(await screen.findByText('No ranked players yet')).toBeInTheDocument();
    await waitFor(() => expect(api.myStats).toHaveBeenCalled());
  });
});

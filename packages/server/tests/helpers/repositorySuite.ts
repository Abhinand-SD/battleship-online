/**
 * Behavioural test-suite shared by the in-memory and the Prisma repositories. Each test file supplies a
 * fresh (or truncated) Repositories instance per test via `getRepos`.
 */
import { describe, expect, it } from 'vitest';
import type { AiDifficulty } from '@battleship/shared';
import { UsernameTakenError } from '../../src/persistence/errors';
import type { MatchParticipantInput, MatchRecordInput, Repositories, UserRecord } from '../../src/persistence/types';

let seq = 0;

export function participant(overrides: Partial<MatchParticipantInput> & { userId: string | null }): MatchParticipantInput {
  return {
    isAi: false,
    displayName: 'Player',
    avatar: 'anchor',
    won: false,
    shots: 40,
    hits: 17,
    misses: 23,
    shipsSunk: 5,
    shipsLost: 2,
    ...overrides,
  };
}

export function aiParticipant(difficulty: AiDifficulty, overrides: Partial<MatchParticipantInput> = {}): MatchParticipantInput {
  return participant({
    userId: null,
    isAi: true,
    aiDifficulty: difficulty,
    displayName: `AI (${difficulty})`,
    avatar: 'radar',
    won: false,
    shots: 35,
    hits: 12,
    misses: 23,
    shipsSunk: 2,
    shipsLost: 5,
    ...overrides,
  });
}

export function matchInput(
  overrides: Partial<Omit<MatchRecordInput, 'participants'>> & { participants: [MatchParticipantInput, MatchParticipantInput] },
): MatchRecordInput {
  seq += 1;
  const endedAt = new Date(Date.UTC(2026, 0, 1, 12) + seq * 60_000);
  const startedAt = new Date(endedAt.getTime() - 300_000);
  const winner = overrides.participants.find((p) => p.won);
  return {
    id: `match_${seq}_${Math.random().toString(36).slice(2, 10)}`,
    mode: 'QUICK',
    startedAt,
    endedAt,
    durationMs: 300_000,
    winnerUserId: winner?.userId ?? null,
    endReason: 'ALL_SUNK',
    totalMoves: 75,
    ...overrides,
  };
}

/** A one-sided online match: `winner` beats `loser` with default counters. */
export function quickWin(winner: UserRecord, loser: UserRecord, extra: Partial<MatchParticipantInput> = {}): MatchRecordInput {
  return matchInput({
    participants: [
      participant({ userId: winner.id, displayName: winner.displayName, won: true, shipsLost: 2, ...extra }),
      participant({ userId: loser.id, displayName: loser.displayName, won: false, shots: 38, hits: 10, misses: 28, shipsSunk: 2, shipsLost: 5 }),
    ],
  });
}

export function repositorySuite(getRepos: () => Repositories): void {
  const guest = (name: string) => getRepos().users.createGuest({ displayName: name, avatar: 'anchor' });

  describe('users', () => {
    it('creates guests and accounts and finds them by id / username', async () => {
      const repos = getRepos();
      const g = await guest('Captain Nova');
      expect(g.id).toMatch(/^c[a-z0-9]{10,}$/);
      expect(g.isGuest).toBe(true);
      expect(g.username).toBeNull();
      expect(await repos.users.findById(g.id)).toEqual(g);

      const a = await repos.users.createAccount({ username: 'Sailor_One', passwordHash: 'hash', displayName: 'Sailor', avatar: 'helm' });
      expect(a.isGuest).toBe(false);
      expect(a.username).toBe('sailor_one');
      expect(await repos.users.findByUsername('SAILOR_ONE')).toEqual(a);
      expect(await repos.users.findByUsername('nobody')).toBeNull();
      expect(await repos.users.findById('missing')).toBeNull();

      const many = await repos.users.findManyByIds([g.id, a.id, 'missing', g.id]);
      expect(many.map((u) => u.id).sort()).toEqual([g.id, a.id].sort());
      expect(await repos.users.findManyByIds([])).toEqual([]);
    });

    it('rejects duplicate usernames', async () => {
      const repos = getRepos();
      await repos.users.createAccount({ username: 'taken', passwordHash: 'h', displayName: 'A', avatar: 'anchor' });
      await expect(
        repos.users.createAccount({ username: 'TAKEN', passwordHash: 'h', displayName: 'B', avatar: 'anchor' }),
      ).rejects.toBeInstanceOf(UsernameTakenError);
      const g = await guest('Guest');
      await expect(repos.users.upgradeToAccount(g.id, { username: 'taken', passwordHash: 'h' })).rejects.toBeInstanceOf(UsernameTakenError);
      expect((await repos.users.findById(g.id))?.isGuest).toBe(true);
    });

    it('upgrades a guest to an account keeping id, stats and history', async () => {
      const repos = getRepos();
      const g = await guest('Guest');
      const other = await guest('Other');
      await repos.matches.recordMatch(quickWin(g, other));

      const upgraded = await repos.users.upgradeToAccount(g.id, { username: 'NewName', passwordHash: 'hash2', displayName: 'Renamed' });
      expect(upgraded.id).toBe(g.id);
      expect(upgraded.isGuest).toBe(false);
      expect(upgraded.username).toBe('newname');
      expect(upgraded.passwordHash).toBe('hash2');
      expect(upgraded.displayName).toBe('Renamed');
      expect(upgraded.createdAt.getTime()).toBe(g.createdAt.getTime());
      expect((await repos.stats.getStats(g.id)).wins).toBe(1);
      expect(await repos.matches.listForUser(g.id, 10)).toHaveLength(1);
      expect(await repos.users.findByUsername('newname')).toEqual(upgraded);
    });

    it('updates profile fields and last seen', async () => {
      const repos = getRepos();
      const g = await guest('Guest');
      const updated = await repos.users.updateProfile(g.id, { avatar: 'kraken' });
      expect(updated.avatar).toBe('kraken');
      expect(updated.displayName).toBe('Guest');
      const renamed = await repos.users.updateProfile(g.id, { displayName: 'Admiral Reef' });
      expect(renamed.displayName).toBe('Admiral Reef');
      expect(renamed.avatar).toBe('kraken');

      await new Promise((r) => setTimeout(r, 5));
      await repos.users.touchLastSeen(g.id);
      const seen = await repos.users.findById(g.id);
      expect(seen!.lastSeenAt.getTime()).toBeGreaterThan(g.lastSeenAt.getTime());
      await expect(repos.users.touchLastSeen('missing')).resolves.toBeUndefined();
      await expect(repos.users.updateProfile('missing', { avatar: 'kraken' })).rejects.toThrow();
    });
  });

  describe('stats and matches', () => {
    it('returns default stats for new and unknown users', async () => {
      const repos = getRepos();
      const g = await guest('Guest');
      const stats = await repos.stats.getStats(g.id);
      expect(stats).toMatchObject({ userId: g.id, gamesPlayed: 0, wins: 0, losses: 0, rating: 1000, practiceGames: 0 });
      expect(await repos.stats.rankOf(g.id)).toBeNull();
      expect((await repos.stats.getStats('unknown')).rating).toBe(1000);
      const many = await repos.stats.getManyStats([g.id, 'unknown']);
      expect(many.get(g.id)?.userId).toBe(g.id);
      expect(many.get('unknown')?.rating).toBe(1000);
      expect(await repos.stats.leaderboard(10)).toEqual([]);
    });

    it('records an online match: counters, Elo, participants and achievements', async () => {
      const repos = getRepos();
      const a = await guest('Alice');
      const b = await guest('Bob');
      const input = matchInput({
        mode: 'PRIVATE',
        participants: [
          participant({ userId: a.id, displayName: 'Alice', won: true, shots: 40, hits: 17, misses: 23, shipsSunk: 5, shipsLost: 0 }),
          participant({ userId: b.id, displayName: 'Bob', won: false, shots: 35, hits: 12, misses: 23, shipsSunk: 0, shipsLost: 5 }),
        ],
      });
      const outcome = await repos.matches.recordMatch(input);
      expect(outcome.participants).toHaveLength(2);
      const oa = outcome.participants.find((p) => p.userId === a.id)!;
      const ob = outcome.participants.find((p) => p.userId === b.id)!;
      expect(oa).toMatchObject({ ratingBefore: 1000, ratingChange: 16, ratingAfter: 1016 });
      expect(ob).toMatchObject({ ratingBefore: 1000, ratingChange: -16, ratingAfter: 984 });
      expect([...oa.achievementsUnlocked].sort()).toEqual(['first_victory', 'flawless']);
      expect(ob.achievementsUnlocked).toEqual([]);

      const sa = await repos.stats.getStats(a.id);
      expect(sa).toMatchObject({ gamesPlayed: 1, wins: 1, losses: 0, shotsFired: 40, shotsHit: 17, shipsSunk: 5, currentStreak: 1, bestStreak: 1, rating: 1016, practiceGames: 0 });
      const sb = await repos.stats.getStats(b.id);
      expect(sb).toMatchObject({ gamesPlayed: 1, wins: 0, losses: 1, shotsFired: 35, shotsHit: 12, shipsSunk: 0, currentStreak: 0, bestStreak: 0, rating: 984 });

      const stored = await repos.matches.findById(input.id);
      expect(stored).not.toBeNull();
      expect(stored!.mode).toBe('PRIVATE');
      expect(stored!.endReason).toBe('ALL_SUNK');
      expect(stored!.winnerUserId).toBe(a.id);
      expect(stored!.endedAt.getTime()).toBe(input.endedAt.getTime());
      expect(stored!.participants.find((p) => p.userId === a.id)).toMatchObject({ won: true, ratingChange: 16, shots: 40, hits: 17 });
      expect(stored!.participants.find((p) => p.userId === b.id)).toMatchObject({ won: false, ratingChange: -16 });

      const unlocked = await repos.achievements.listForUser(a.id);
      expect(unlocked.map((u) => u.key).sort()).toEqual(['first_victory', 'flawless']);
      expect(unlocked.every((u) => u.unlockedAt instanceof Date)).toBe(true);
      expect(await repos.achievements.listForUser(b.id)).toEqual([]);

      expect(await repos.stats.rankOf(a.id)).toBe(1);
      expect(await repos.stats.rankOf(b.id)).toBe(2);
      expect(await repos.matches.findById('nope')).toBeNull();
    });

    it('records practice matches separately (no rating) and unlocks admiral only vs hard AI by sinking everything', async () => {
      const repos = getRepos();
      const a = await guest('Alice');
      const win = (difficulty: AiDifficulty, endReason: MatchRecordInput['endReason'] = 'ALL_SUNK') =>
        matchInput({
          mode: 'PRACTICE',
          endReason,
          participants: [participant({ userId: a.id, won: true, shots: 40, hits: 17, shipsLost: 1 }), aiParticipant(difficulty)],
        });

      const easy = await repos.matches.recordMatch(win('easy'));
      expect(easy.participants).toEqual([{ userId: a.id, ratingBefore: 1000, ratingChange: 0, ratingAfter: 1000, achievementsUnlocked: [] }]);
      const forfeit = await repos.matches.recordMatch(win('hard', 'FORFEIT'));
      expect(forfeit.participants[0]!.achievementsUnlocked).toEqual([]);
      const hard = await repos.matches.recordMatch(win('hard'));
      expect(hard.participants[0]!.achievementsUnlocked).toEqual(['admiral']);

      const stats = await repos.stats.getStats(a.id);
      expect(stats).toMatchObject({ practiceGames: 3, practiceWins: 3, gamesPlayed: 0, wins: 0, shotsFired: 0, rating: 1000, currentStreak: 0 });
      expect(await repos.stats.rankOf(a.id)).toBeNull();
      expect(await repos.stats.leaderboard(10)).toEqual([]);

      const matches = await repos.matches.listForUser(a.id, 10);
      expect(matches).toHaveLength(3);
      const ai = matches[0]!.participants.find((p) => p.isAi)!;
      expect(ai).toMatchObject({ userId: null, isAi: true, aiDifficulty: 'hard', ratingChange: null });
      expect(matches[0]!.participants.find((p) => !p.isAi)!.ratingChange).toBeNull();
    });

    it('ignores cancelled and duplicate matches', async () => {
      const repos = getRepos();
      const a = await guest('Alice');
      const b = await guest('Bob');
      const cancelled = matchInput({ endReason: 'CANCELLED', winnerUserId: null, participants: [participant({ userId: a.id }), participant({ userId: b.id })] });
      expect(await repos.matches.recordMatch(cancelled)).toEqual({ participants: [] });
      expect(await repos.matches.findById(cancelled.id)).toBeNull();
      expect((await repos.stats.getStats(a.id)).gamesPlayed).toBe(0);

      const real = quickWin(a, b);
      expect((await repos.matches.recordMatch(real)).participants).toHaveLength(2);
      expect(await repos.matches.recordMatch(real)).toEqual({ participants: [] });
      expect((await repos.stats.getStats(a.id)).gamesPlayed).toBe(1);
      expect(await repos.matches.listForUser(a.id, 10)).toHaveLength(1);
    });

    it('tracks streaks, hot_streak and comeback', async () => {
      const repos = getRepos();
      const a = await guest('Alice');
      const b = await guest('Bob');
      const first = await repos.matches.recordMatch(quickWin(a, b));
      expect(first.participants.find((p) => p.userId === a.id)!.achievementsUnlocked).toEqual(['first_victory']);
      const second = await repos.matches.recordMatch(quickWin(a, b));
      expect(second.participants.find((p) => p.userId === a.id)!.achievementsUnlocked).toEqual([]);
      const third = await repos.matches.recordMatch(quickWin(a, b, { shipsLost: 4 }));
      expect(third.participants.find((p) => p.userId === a.id)!.achievementsUnlocked.sort()).toEqual(['comeback', 'hot_streak']);
      expect(await repos.stats.getStats(a.id)).toMatchObject({ wins: 3, currentStreak: 3, bestStreak: 3 });

      await repos.matches.recordMatch(quickWin(b, a));
      expect(await repos.stats.getStats(a.id)).toMatchObject({ wins: 3, losses: 1, currentStreak: 0, bestStreak: 3 });
      expect(await repos.stats.getStats(b.id)).toMatchObject({ wins: 1, losses: 3, currentStreak: 1, bestStreak: 1 });
      // The three wins against a weakening opponent earn less each time; the ratings must stay mirrored.
      const sa = await repos.stats.getStats(a.id);
      const sb = await repos.stats.getStats(b.id);
      expect(Math.abs(sa.rating - 1000 + (sb.rating - 1000))).toBeLessThanOrEqual(2);
    });

    it('unlocks veteran on the 25th match across modes', async () => {
      const repos = getRepos();
      const a = await guest('Alice');
      const b = await guest('Bob');
      for (let i = 0; i < 24; i++) {
        const outcome = await repos.matches.recordMatch(
          matchInput({ mode: 'PRACTICE', participants: [participant({ userId: a.id, won: i % 2 === 0, shipsLost: 3 }), aiParticipant('easy')] }),
        );
        expect(outcome.participants[0]!.achievementsUnlocked).not.toContain('veteran');
      }
      const last = await repos.matches.recordMatch(quickWin(a, b));
      expect(last.participants.find((p) => p.userId === a.id)!.achievementsUnlocked.sort()).toEqual(['first_victory', 'veteran']);
      expect(await repos.stats.getStats(a.id)).toMatchObject({ practiceGames: 24, practiceWins: 12, gamesPlayed: 1 });
      expect((await repos.achievements.listForUser(a.id)).map((u) => u.key).sort()).toEqual(['first_victory', 'veteran']);
    });

    it('orders the leaderboard by rating then wins and computes ranks with limit/offset', async () => {
      const repos = getRepos();
      const a = await guest('Alice');
      const b = await guest('Bob');
      const c = await guest('Carol');
      const d = await guest('Dave');
      await repos.matches.recordMatch(quickWin(a, b));
      await repos.matches.recordMatch(quickWin(a, c));
      await repos.matches.recordMatch(quickWin(c, b));

      const board = await repos.stats.leaderboard(10);
      expect(board.map((row) => row.user.id)).toEqual([a.id, c.id, b.id]);
      expect(board.map((row) => row.stats.rating)).toEqual([...board.map((row) => row.stats.rating)].sort((x, y) => y - x));
      expect(board[0]!.user.displayName).toBe('Alice');
      expect(board[0]!.stats.wins).toBe(2);

      expect(await repos.stats.rankOf(a.id)).toBe(1);
      expect(await repos.stats.rankOf(c.id)).toBe(2);
      expect(await repos.stats.rankOf(b.id)).toBe(3);
      expect(await repos.stats.rankOf(d.id)).toBeNull();

      expect((await repos.stats.leaderboard(1)).map((r) => r.user.id)).toEqual([a.id]);
      expect((await repos.stats.leaderboard(1, 1)).map((r) => r.user.id)).toEqual([c.id]);
      expect((await repos.stats.leaderboard(5, 2)).map((r) => r.user.id)).toEqual([b.id]);
      expect(await repos.stats.leaderboard(5, 3)).toEqual([]);
    });

    it('lists matches for a user most recent first with a limit', async () => {
      const repos = getRepos();
      const a = await guest('Alice');
      const b = await guest('Bob');
      const c = await guest('Carol');
      const m1 = await (async () => { const m = quickWin(a, b); await repos.matches.recordMatch(m); return m; })();
      const m2 = await (async () => { const m = quickWin(b, a); await repos.matches.recordMatch(m); return m; })();
      const m3 = await (async () => { const m = quickWin(a, c); await repos.matches.recordMatch(m); return m; })();
      await repos.matches.recordMatch(quickWin(b, c));

      expect((await repos.matches.listForUser(a.id, 10)).map((m) => m.id)).toEqual([m3.id, m2.id, m1.id]);
      expect((await repos.matches.listForUser(a.id, 2)).map((m) => m.id)).toEqual([m3.id, m2.id]);
      expect((await repos.matches.listForUser(c.id, 10)).map((m) => m.participants.length)).toEqual([2, 2]);
      expect(await repos.matches.listForUser('nobody', 10)).toEqual([]);
    });
  });
}

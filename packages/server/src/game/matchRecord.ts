import type { MatchParticipantInput, MatchRecordInput } from '../persistence/types';
import type { FinishedParticipant, GameSession, PlayerIndex } from './GameSession';

/**
 * Builds the persistence input for a finished game, or null when nothing must be recorded
 * (cancelled games, or a game that never had two seats filled).
 */
export function buildMatchRecordInput(session: GameSession): MatchRecordInput | null {
  const result = session.result;
  if (!result || result.reason === 'CANCELLED') return null;
  const [p0, p1] = result.participants;
  if (!p0 || !p1) return null;

  const participant = (p: FinishedParticipant, idx: PlayerIndex): MatchParticipantInput => {
    const stats = session.statsFor(idx);
    const input: MatchParticipantInput = {
      userId: p.userId,
      isAi: p.isAi,
      displayName: p.displayName,
      avatar: p.avatar,
      won: result.winner === idx,
      shots: stats.shots,
      hits: stats.hits,
      misses: stats.misses,
      shipsSunk: stats.shipsSunk,
      shipsLost: stats.shipsLost,
    };
    if (p.aiDifficulty) input.aiDifficulty = p.aiDifficulty;
    return input;
  };

  const winnerUserId = result.winner === null ? null : (result.participants[result.winner]?.userId ?? null);
  const startedAt = session.startedAt ?? session.createdAt;
  const endedAt = session.endedAt ?? session.now();

  return {
    id: session.id,
    mode: session.mode,
    startedAt: new Date(startedAt),
    endedAt: new Date(endedAt),
    durationMs: result.durationMs,
    winnerUserId,
    endReason: result.reason,
    totalMoves: session.history.length,
    participants: [participant(p0, 0), participant(p1, 1)],
  };
}

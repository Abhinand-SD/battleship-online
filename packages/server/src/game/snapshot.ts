import {
  computeMatchStats,
  emptyEnemyView,
  emptyMyView,
  toEnemyBoardView,
  toMyBoardView,
  type GameEvent,
  type GamePlayerInfo,
  type GameResult,
  type GameSnapshot,
  type Perspective,
} from '@battleship/shared';
import { otherIndex, type GameSession, type PlayerIndex, type PlayerSlot, type SessionEvent } from './GameSession';
import { AI_PLAYER_ID } from './types';

export function playerInfo(slot: PlayerSlot): GamePlayerInfo {
  const info: GamePlayerInfo = {
    id: slot.userId ?? AI_PLAYER_ID,
    displayName: slot.displayName,
    avatar: slot.avatar,
    isGuest: slot.isGuest,
    isAi: slot.isAi,
    rating: slot.rating,
    connected: slot.connected,
    ready: slot.ready,
    fleetConfirmed: slot.board !== null,
  };
  if (slot.aiDifficulty) info.aiDifficulty = slot.aiDifficulty;
  return info;
}

/** Personalised snapshot for a human participant. Throws when the user is not seated in this game. */
export function buildSnapshot(session: GameSession, viewerUserId: string): GameSnapshot {
  const idx = session.indexOf(viewerUserId);
  if (idx === null) throw new Error(`User ${viewerUserId} is not a participant of game ${session.id}`);
  return buildSnapshotFor(session, idx);
}

/**
 * Builds the snapshot for the player in seat `idx`. The opponent's board goes through `toEnemyBoardView`,
 * which only ever exposes shots, sunk ships and remaining ship types: unsunk positions never leave the server.
 */
export function buildSnapshotFor(session: GameSession, idx: PlayerIndex): GameSnapshot {
  const me = session.players[idx];
  if (!me) throw new Error(`Seat ${idx} of game ${session.id} is empty`);
  const opponent = session.players[otherIndex(idx)];
  const rel = (p: PlayerIndex | null): Perspective | null => (p === null ? null : p === idx ? 'me' : 'opponent');
  const history = session.historyFor(idx);

  let result: GameResult | null = null;
  if (session.result) {
    result = {
      winner: rel(session.result.winner),
      reason: session.result.reason,
      durationMs: session.result.durationMs,
      stats: { me: computeMatchStats(history, 'me'), opponent: computeMatchStats(history, 'opponent') },
    };
    if (me.ratingChange !== null) result.ratingChange = me.ratingChange;
    if (me.achievements) result.achievements = [...me.achievements];
  }

  return {
    gameId: session.id,
    roomCode: session.roomCode,
    mode: session.mode,
    phase: session.phase,
    me: playerInfo(me),
    opponent: opponent ? playerInfo(opponent) : null,
    myBoard: me.board ? toMyBoardView(me.board) : emptyMyView(),
    enemyBoard: opponent?.board ? toEnemyBoardView(opponent.board) : emptyEnemyView(),
    turn: session.phase === 'IN_BATTLE' ? rel(session.turn) : null,
    moveNumber: session.moveNumber,
    turnDeadline: session.turnDeadline,
    countdownEndsAt: session.countdownEndsAt,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    history,
    result,
    rematch:
      session.phase === 'FINISHED' && opponent
        ? { requestedByMe: me.rematchRequested, requestedByOpponent: opponent.rematchRequested }
        : null,
    opponentReconnectDeadline: opponent?.reconnectDeadline ?? null,
    serverTime: session.now(),
  };
}

/** Converts an absolute session event into the viewer-relative wire event; null when the viewer should not get it. */
export function toGameEvent(event: SessionEvent, gameId: string, viewer: PlayerIndex): GameEvent | null {
  const rel = (p: PlayerIndex): Perspective => (p === viewer ? 'me' : 'opponent');
  switch (event.type) {
    case 'shot': {
      const ge: GameEvent = {
        type: 'shot',
        gameId,
        by: rel(event.attacker),
        x: event.x,
        y: event.y,
        outcome: event.outcome,
        moveNumber: event.moveNumber,
      };
      if (event.sunk) ge.sunk = event.sunk;
      return ge;
    }
    case 'turn':
      return { type: 'turn', gameId, turn: rel(event.turn), deadline: event.deadline, reason: event.reason };
    case 'phase':
      return { type: 'phase', gameId, phase: event.phase };
    case 'connection':
      if (event.player === viewer) return null;
      return { type: 'opponent_connection', gameId, connected: event.connected, reconnectDeadline: event.reconnectDeadline };
    case 'joined':
      return event.player === viewer ? null : { type: 'opponent_joined', gameId };
    case 'left':
      return event.player === viewer ? null : { type: 'opponent_left', gameId };
    case 'rematch_requested':
      return event.player === viewer ? null : { type: 'rematch_requested', gameId };
    case 'finished':
      return { type: 'finished', gameId, winner: event.winner === null ? null : rel(event.winner), reason: event.reason };
  }
}

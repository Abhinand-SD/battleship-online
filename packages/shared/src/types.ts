import type { AvatarId, ShipType } from './constants';

export type Orientation = 'horizontal' | 'vertical';

export interface Coord {
  x: number;
  y: number;
}

/** A ship anchored at (x, y) extending right (horizontal) or down (vertical). */
export interface ShipPlacement {
  type: ShipType;
  x: number;
  y: number;
  orientation: Orientation;
}

/** A complete fleet: exactly one of each ship type. */
export type Fleet = ShipPlacement[];

export type ShotOutcome = 'miss' | 'hit' | 'sunk';

/** A ship revealed to the opponent once sunk. */
export interface SunkShip {
  type: ShipType;
  cells: Coord[];
}

export interface Shot {
  x: number;
  y: number;
  outcome: ShotOutcome;
}

export type Perspective = 'me' | 'opponent';

export type GamePhase = 'WAITING' | 'PLACING_SHIPS' | 'READY' | 'IN_BATTLE' | 'FINISHED';

export type GameMode = 'QUICK' | 'PRIVATE' | 'PRACTICE';

export type AiDifficulty = 'easy' | 'medium' | 'hard';

export type EndReason =
  /** Every enemy ship was sunk. */
  | 'ALL_SUNK'
  /** A player explicitly surrendered or left an active battle. */
  | 'FORFEIT'
  /** A player skipped too many turns in a row. */
  | 'TIMEOUT'
  /** A player disconnected and never came back. */
  | 'ABANDONED'
  /** The match was cancelled before the battle started (no stats recorded). */
  | 'CANCELLED';

export interface PlayerPublicInfo {
  id: string;
  displayName: string;
  avatar: AvatarId | string;
  isGuest: boolean;
  isAi: boolean;
  aiDifficulty?: AiDifficulty;
  rating: number;
  connected: boolean;
}

export interface GamePlayerInfo extends PlayerPublicInfo {
  /** Lobby "ready" flag (WAITING phase of private rooms). */
  ready: boolean;
  /** Fleet confirmed and locked (PLACING_SHIPS phase). */
  fleetConfirmed: boolean;
}

export interface ShotRecord {
  moveNumber: number;
  by: Perspective;
  x: number;
  y: number;
  outcome: ShotOutcome;
  /** Set when the shot sank a ship. */
  sunk?: ShipType;
  at: number;
}

/** The viewing player's own board: full fleet knowledge plus incoming shots. */
export interface MyBoardView {
  /** Empty until the player confirmed their placement. */
  fleet: Fleet;
  /** Shots the opponent fired at this board. */
  shots: Shot[];
  /** Ship types that have been sunk on this board. */
  sunk: ShipType[];
  /** Per-ship hit counts. */
  hits: Partial<Record<ShipType, number>>;
}

/** The opponent's board as seen by the viewing player. Never contains unsunk ship positions. */
export interface EnemyBoardView {
  /** Shots the viewing player fired. */
  shots: Shot[];
  /** Ships the viewing player has sunk, with their revealed cells. */
  sunkShips: SunkShip[];
  /** Ship types still afloat. */
  remaining: ShipType[];
}

export interface MatchPlayerStats {
  shots: number;
  hits: number;
  misses: number;
  /** Accuracy in percent (0-100), rounded to one decimal. */
  accuracy: number;
  shipsSunk: number;
  shipsLost: number;
}

export interface GameResult {
  winner: Perspective | null;
  reason: EndReason;
  durationMs: number;
  stats: { me: MatchPlayerStats; opponent: MatchPlayerStats };
  /** Rating delta for the viewing player (undefined for practice / cancelled matches). */
  ratingChange?: number;
  /** Achievement keys unlocked by this match for the viewing player. */
  achievements?: string[];
}

/**
 * Personalised, server-authored snapshot of a game. Everything the client needs to render.
 * The snapshot for player A never includes the unsunk ship positions of player B.
 */
export interface GameSnapshot {
  gameId: string;
  /** Present for PRIVATE games (the room code / invite code). */
  roomCode: string | null;
  mode: GameMode;
  phase: GamePhase;
  me: GamePlayerInfo;
  opponent: GamePlayerInfo | null;
  myBoard: MyBoardView;
  enemyBoard: EnemyBoardView;
  /** Whose turn it is during IN_BATTLE, otherwise null. */
  turn: Perspective | null;
  /** The move number the next attack must carry (starts at 1). */
  moveNumber: number;
  /** Epoch ms when the current turn expires, or null. */
  turnDeadline: number | null;
  /** Epoch ms when the current countdown (lobby or battle start) ends, or null. */
  countdownEndsAt: number | null;
  /** Epoch ms when the battle started. */
  startedAt: number | null;
  /** Epoch ms when the game finished. */
  endedAt: number | null;
  history: ShotRecord[];
  result: GameResult | null;
  rematch: { requestedByMe: boolean; requestedByOpponent: boolean } | null;
  /** Epoch ms by which the disconnected opponent must reconnect, or null. */
  opponentReconnectDeadline: number | null;
  /** Server clock when the snapshot was produced, for client-side timer calibration. */
  serverTime: number;
}

/** Incremental event emitted alongside snapshots so the client can play animations/sounds. */
export type GameEvent =
  | {
      type: 'shot';
      gameId: string;
      by: Perspective;
      x: number;
      y: number;
      outcome: ShotOutcome;
      sunk?: SunkShip;
      moveNumber: number;
    }
  | { type: 'turn'; gameId: string; turn: Perspective; deadline: number | null; reason: 'shot' | 'timeout' | 'start' }
  | { type: 'phase'; gameId: string; phase: GamePhase }
  | { type: 'opponent_connection'; gameId: string; connected: boolean; reconnectDeadline: number | null }
  | { type: 'opponent_joined'; gameId: string }
  | { type: 'opponent_left'; gameId: string }
  | { type: 'rematch_requested'; gameId: string }
  | { type: 'finished'; gameId: string; winner: Perspective | null; reason: EndReason };

export interface QueueStatus {
  inQueue: boolean;
  /** Epoch ms when the player entered the queue. */
  since: number | null;
  /** Number of players currently searching (including this one). */
  searching: number;
}

/** Sent on connect / reconnect / explicit sync so the client can resume where it was. */
export interface SessionState {
  user: UserProfile;
  game: GameSnapshot | null;
  queue: QueueStatus;
  serverTime: number;
}

export interface UserProfile {
  id: string;
  displayName: string;
  avatar: AvatarId | string;
  isGuest: boolean;
  username: string | null;
  createdAt: string;
}

export interface PlayerStats {
  userId: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
  shotsFired: number;
  shotsHit: number;
  accuracy: number;
  shipsSunk: number;
  currentStreak: number;
  bestStreak: number;
  rating: number;
  practiceGames: number;
  practiceWins: number;
  achievements: AchievementProgress[];
}

export interface AchievementProgress {
  key: string;
  name: string;
  description: string;
  unlockedAt: string | null;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string;
  avatar: AvatarId | string;
  isGuest: boolean;
  rating: number;
  wins: number;
  losses: number;
  gamesPlayed: number;
  winRate: number;
  accuracy: number;
}

export interface MatchSummary {
  id: string;
  mode: GameMode;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  endReason: EndReason;
  won: boolean;
  opponent: { displayName: string; avatar: AvatarId | string; isAi: boolean; aiDifficulty?: AiDifficulty };
  shots: number;
  hits: number;
  accuracy: number;
  shipsSunk: number;
  shipsLost: number;
  ratingChange: number | null;
}

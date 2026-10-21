import { useCallback } from 'react';
import type { AiDifficulty } from '@battleship/shared';
import { rt } from '../../lib/socket';
import { toast, useStore } from '../../lib/store';
import { isErrorCode } from './errors';
import { friendlyError } from './friendlyError';
import { usePendingAction } from './usePendingAction';

export type MenuPending = 'quick' | 'cancel' | 'create' | 'join' | 'practice' | 'leave';

export type JoinResult = { ok: true } | { ok: false; message: string };

export interface MenuActions {
  /** Which request is in flight, if any. */
  pending: MenuPending | null;
  connected: boolean;
  /** A match exists and has not finished. */
  activeGame: boolean;
  /** New matches may be started (connected and no active match). */
  canStart: boolean;
  /** Why new matches cannot be started right now, or `null`. */
  blockedReason: string | null;
  startQuickMatch(): Promise<void>;
  cancelQuickMatch(): Promise<void>;
  createRoom(): Promise<void>;
  /** Resolves with the failure message for inline display; `undefined` when another action was already running. */
  joinRoom(code: string): Promise<JoinResult | undefined>;
  startPractice(difficulty: AiDifficulty): Promise<void>;
  leaveGame(): Promise<void>;
}

/** Re-fetches the session so the store catches up with a state the server already knows about. */
async function resync(): Promise<void> {
  try {
    await rt.sync();
  } catch {
    /* the next session:state push will catch us up */
  }
}

/** A finished match still occupies the session; leave it quietly before starting something new. */
async function leaveFinishedGame(): Promise<void> {
  const game = useStore.getState().game;
  if (game && game.phase === 'FINISHED') {
    try {
      await rt.leaveGame();
    } catch {
      /* already closed server-side; the start request will tell us if not */
    }
  }
}

/** Last line of defence (buttons are disabled too): refuse to start when offline or mid-match. */
function readyToStart(): boolean {
  const { connection, game } = useStore.getState();
  if (connection !== 'connected') {
    toast('warning', 'Not connected', 'Hold on while we reconnect to the game server.');
    return false;
  }
  if (game && game.phase !== 'FINISHED') {
    toast('info', 'Match in progress', 'Return to your current match or leave it first.');
    return false;
  }
  return true;
}

function report(title: string, err: unknown): void {
  toast('error', title, friendlyError(err));
  if (isErrorCode(err, 'ALREADY_IN_GAME', 'ALREADY_IN_QUEUE', 'NOT_IN_GAME', 'NOT_IN_QUEUE')) void resync();
}

/**
 * Every request the menu can make, with a single shared pending flag (one request at a time), the
 * "leave finished game first" rule and consistent error reporting. Navigation to `/game` is handled by
 * `GameNavigator` once the resulting snapshot reaches the store.
 */
export function useMenuActions(): MenuActions {
  const connection = useStore((s) => s.connection);
  const gamePhase = useStore((s) => s.game?.phase ?? null);
  const { pending, run } = usePendingAction<MenuPending>();

  const connected = connection === 'connected';
  const activeGame = gamePhase !== null && gamePhase !== 'FINISHED';
  const canStart = connected && !activeGame;
  const blockedReason = !connected
    ? 'Waiting for the connection to the game server…'
    : activeGame
      ? 'Finish or leave your current match before starting a new one.'
      : null;

  const startQuickMatch = useCallback(async () => {
    await run('quick', async () => {
      if (!readyToStart()) return;
      await leaveFinishedGame();
      try {
        await rt.joinQueue();
      } catch (err) {
        if (isErrorCode(err, 'ALREADY_IN_QUEUE')) return resync();
        report('Couldn’t start matchmaking', err);
      }
    });
  }, [run]);

  const cancelQuickMatch = useCallback(async () => {
    await run('cancel', async () => {
      try {
        await rt.leaveQueue();
      } catch (err) {
        if (isErrorCode(err, 'NOT_IN_QUEUE')) return resync();
        report('Couldn’t leave the queue', err);
      }
    });
  }, [run]);

  const createRoom = useCallback(async () => {
    await run('create', async () => {
      if (!readyToStart()) return;
      await leaveFinishedGame();
      try {
        await rt.createRoom();
      } catch (err) {
        report('Couldn’t create a room', err);
      }
    });
  }, [run]);

  const joinRoom = useCallback(
    (code: string) =>
      run('join', async (): Promise<JoinResult> => {
        const { connection: conn, game } = useStore.getState();
        if (conn !== 'connected') return { ok: false, message: 'Not connected to the game server yet.' };
        if (game && game.phase !== 'FINISHED') return { ok: false, message: 'Leave your current match before joining another room.' };
        await leaveFinishedGame();
        try {
          await rt.joinRoom(code);
          return { ok: true };
        } catch (err) {
          if (isErrorCode(err, 'ALREADY_IN_GAME')) void resync();
          return { ok: false, message: friendlyError(err, 'join') };
        }
      }),
    [run],
  );

  const startPractice = useCallback(
    async (difficulty: AiDifficulty) => {
      await run('practice', async () => {
        if (!readyToStart()) return;
        await leaveFinishedGame();
        try {
          await rt.startPractice(difficulty);
        } catch (err) {
          report('Couldn’t start practice', err);
        }
      });
    },
    [run],
  );

  const leaveGame = useCallback(async () => {
    await run('leave', async () => {
      try {
        await rt.leaveGame();
        toast('info', 'You left the match');
      } catch (err) {
        if (isErrorCode(err, 'NOT_IN_GAME')) return resync();
        report('Couldn’t leave the match', err);
      }
    });
  }, [run]);

  return { pending, connected, activeGame, canStart, blockedReason, startQuickMatch, cancelQuickMatch, createRoom, joinRoom, startPractice, leaveGame };
}

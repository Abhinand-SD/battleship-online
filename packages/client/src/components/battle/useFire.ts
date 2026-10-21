import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Coord, GameSnapshot, SessionState } from '@battleship/shared';
import { playSound } from '../../lib/audio';
import { errorMessage, rt } from '../../lib/socket';
import { toast, useStore } from '../../lib/store';
import { isTouchDevice } from '../../lib/utils';
import { canFire, isUntried } from './battleModel';

/** Error codes that only mean our view was stale; the next snapshot corrects it, so no toast. */
const SILENT_CODES = new Set(['NOT_YOUR_TURN', 'CELL_ALREADY_ATTACKED', 'STALE_MOVE']);

export interface FireController {
  /** Cell selected with the first tap in touch-confirm mode. */
  aim: Coord | null;
  /** Shot sent to the server and not yet acknowledged / reflected in a snapshot. */
  pending: Coord | null;
  /** True when a shot can be fired right now (my turn, nothing in flight). */
  ready: boolean;
  /** Touch device + "confirm shots" setting: first tap aims, second tap (or the Fire button) fires. */
  needsConfirm: boolean;
  /** Handle a cell activation (click, tap, keyboard). Decides between aiming and firing. */
  tap: (x: number, y: number) => void;
  /** Fire at the aimed cell (the "Fire at D7" button). */
  fireAim: () => void;
  clearAim: () => void;
}

function errorCode(err: unknown): string {
  return typeof err === 'object' && err !== null && 'code' in err ? String((err as { code: unknown }).code) : '';
}

/** Pulls a fresh session snapshot after the server told us our move was stale. Best effort. */
async function resync(): Promise<void> {
  try {
    const res = await rt.sync();
    const state: SessionState | undefined = res?.state;
    if (!state) return;
    const s = useStore.getState();
    s.setServerTime(state.serverTime);
    s.setUser(state.user);
    s.setGame(state.game);
    s.setQueue(state.queue);
  } catch {
    /* the regular game:state stream will catch us up */
  }
}

/**
 * Owns the client side of firing a shot: aim (touch confirm), the pending coordinate, the double-fire guard
 * and error handling around `rt.attack`. The server stays authoritative; this hook only renders intent.
 */
export function useFire(game: GameSnapshot): FireController {
  const confirmShots = useStore((s) => s.settings.confirmShots);
  const needsConfirm = useMemo(() => isTouchDevice() && confirmShots, [confirmShots]);

  const gameRef = useRef(game);
  gameRef.current = game;

  const [aim, setAimState] = useState<Coord | null>(null);
  const aimRef = useRef<Coord | null>(null);
  const setAim = useCallback((c: Coord | null) => {
    aimRef.current = c;
    setAimState(c);
  }, []);

  const [pending, setPendingState] = useState<Coord | null>(null);
  const pendingRef = useRef<{ x: number; y: number; moveNumber: number } | null>(null);
  const clearPending = useCallback(() => {
    pendingRef.current = null;
    setPendingState(null);
  }, []);

  // A new snapshot (move number advanced, turn passed, phase changed) resolves whatever was in flight.
  useEffect(() => {
    const p = pendingRef.current;
    if (p && (game.moveNumber !== p.moveNumber || game.turn !== 'me' || game.phase !== 'IN_BATTLE')) clearPending();
  }, [game.moveNumber, game.turn, game.phase, clearPending]);

  // Aiming only makes sense on my turn.
  useEffect(() => {
    if (game.turn !== 'me') setAim(null);
  }, [game.turn, setAim]);

  const fire = useCallback(
    async (x: number, y: number) => {
      const g = gameRef.current;
      if (!canFire(g, pendingRef.current) || !isUntried(g.enemyBoard, x, y)) return;
      const moveNumber = g.moveNumber;
      pendingRef.current = { x, y, moveNumber };
      setPendingState({ x, y });
      setAim(null);
      try {
        await rt.attack(x, y, moveNumber);
      } catch (err) {
        if (SILENT_CODES.has(errorCode(err))) {
          void resync();
        } else {
          playSound('error');
          toast('error', 'Shot not fired', errorMessage(err));
        }
      } finally {
        if (pendingRef.current?.moveNumber === moveNumber) clearPending();
      }
    },
    [setAim, clearPending],
  );

  const tap = useCallback(
    (x: number, y: number) => {
      const g = gameRef.current;
      if (!canFire(g, pendingRef.current) || !isUntried(g.enemyBoard, x, y)) return;
      if (!needsConfirm) {
        void fire(x, y);
        return;
      }
      const cur = aimRef.current;
      if (cur && cur.x === x && cur.y === y) {
        void fire(x, y);
      } else {
        playSound('click');
        setAim({ x, y });
      }
    },
    [needsConfirm, fire, setAim],
  );

  const fireAim = useCallback(() => {
    const a = aimRef.current;
    if (a) void fire(a.x, a.y);
  }, [fire]);

  const clearAim = useCallback(() => setAim(null), [setAim]);

  return { aim, pending, ready: canFire(game, pending), needsConfirm, tap, fireAim, clearAim };
}

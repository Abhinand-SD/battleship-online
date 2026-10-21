import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { BOARD_SIZE, type Coord, type ShipType } from '@battleship/shared';
import type { PlacementActions } from './usePlacement';

/** Resolves a viewport position to a board cell using the `[role="grid"]` element inside `root`, or null when outside. */
export function cellFromClient(root: HTMLElement | null, clientX: number, clientY: number): Coord | null {
  const el = root?.querySelector<HTMLElement>('[role="grid"]');
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  const px = (clientX - rect.left) / rect.width;
  const py = (clientY - rect.top) / rect.height;
  if (px < 0 || py < 0 || px >= 1 || py >= 1) return null;
  return { x: Math.floor(px * BOARD_SIZE), y: Math.floor(py * BOARD_SIZE) };
}

export interface BoardDrag {
  /** Starts a pointer drag of `ship`. `pointer` is the grabbed board cell (null when dragging from the tray). */
  start(ship: ShipType, pointer: Coord | null, e: ReactPointerEvent, grabIndex?: number): void;
  /** True once, right after a drag that actually moved; lets click handlers ignore the synthetic click that follows a drop. */
  consumeClickSuppression(): boolean;
  /** Resolves a pointer event to a board cell. */
  cellAt(e: { clientX: number; clientY: number }): Coord | null;
}

/**
 * Pointer-drag plumbing for the placement board. Listeners are attached to `window` for the lifetime of a drag so the
 * ghost keeps following the finger / mouse outside the board and a release anywhere ends the drag (mouse, pen and
 * touch behave identically). The reducer owns all the placement logic; this hook only translates pointer positions.
 */
export function useBoardDrag(rootRef: RefObject<HTMLElement | null>, actions: PlacementActions): BoardDrag {
  const active = useRef<{ pointerId: number; cleanup: () => void } | null>(null);
  const suppressClick = useRef(false);

  const cellAt = useCallback((e: { clientX: number; clientY: number }) => cellFromClient(rootRef.current, e.clientX, e.clientY), [rootRef]);

  const start = useCallback<BoardDrag['start']>(
    (ship, pointer, e, grabIndex) => {
      if (active.current) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const pointerId = e.pointerId;
      const startCell = pointer;
      let moved = false;
      actions.beginDrag(ship, pointer, grabIndex);

      const sameAsStart = (c: Coord | null) => (c === null ? startCell === null : startCell !== null && c.x === startCell.x && c.y === startCell.y);

      const onMove = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        const cell = cellAt(ev);
        if (!sameAsStart(cell)) moved = true;
        actions.dragTo(cell);
      };
      const finish = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onCancel);
        active.current = null;
      };
      const onUp = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        actions.dragTo(cellAt(ev));
        actions.endDrag();
        suppressClick.current = moved;
        finish();
      };
      const onCancel = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        actions.cancelDrag();
        finish();
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onCancel);
      active.current = { pointerId, cleanup: finish };
    },
    [actions, cellAt],
  );

  const consumeClickSuppression = useCallback(() => {
    const v = suppressClick.current;
    suppressClick.current = false;
    return v;
  }, []);

  // Never leave window listeners behind when the board unmounts mid-drag (e.g. the server moved the game on).
  useEffect(() => () => active.current?.cleanup(), []);

  return { start, consumeClickSuppression, cellAt };
}

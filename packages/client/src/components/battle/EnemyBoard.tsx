import { useCallback, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { BOARD_SIZE, coordKey, coordLabel, type Coord, type EnemyBoardView, type ShipPlacement } from '@battleship/shared';
import { Cell, type CellState } from '../board/Cell';
import { Grid } from '../board/Grid';
import { ShipSprite } from '../board/ShipSprite';
import { cn } from '../../lib/utils';
import { cellDescription, enemyCellMap, enemyPegs, sunkShipPlacement, type CellFlash } from './battleModel';
import { ShotPegs } from './ShotPegs';

export interface EnemyBoardProps {
  board: EnemyBoardView;
  /** Untried cells can be activated by click / tap / Enter / Space. */
  interactive?: boolean;
  /** Dim the board and ignore pointer input entirely (READY countdown). */
  disabled?: boolean;
  /** Sweep a radar line over the board (while the enemy is aiming). */
  scanning?: boolean;
  /** Cell currently aimed at (touch confirm mode). */
  aim?: Coord | null;
  /** Shot in flight: drawn with a pulsing ring until the server answers. */
  pending?: Coord | null;
  /** Last shot animation. */
  flash?: CellFlash | null;
  onCellActivate?: (x: number, y: number) => void;
  className?: string;
  testId?: string;
  ariaLabel?: string;
}

/**
 * The opponent's waters: shots, revealed sunk ships and the aiming / pending affordances. Shared by the
 * Battle screen (interactive) and the Results screen (read only).
 *
 * Keyboard: the board exposes a roving tab stop; arrow keys move between cells, Enter / Space activate.
 */
export function EnemyBoard({
  board,
  interactive = false,
  disabled = false,
  scanning = false,
  aim = null,
  pending = null,
  flash = null,
  onCellActivate,
  className,
  testId = 'enemy-board',
  ariaLabel = 'Enemy waters',
}: EnemyBoardProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [focus, setFocus] = useState<Coord>({ x: 0, y: 0 });
  const cellMap = useMemo(() => enemyCellMap(board), [board]);
  const pegs = useMemo(() => enemyPegs(board), [board]);
  const sunkPlacements = useMemo(
    () => board.sunkShips.map(sunkShipPlacement).filter((p): p is ShipPlacement => p !== null),
    [board.sunkShips],
  );
  const live = interactive && !disabled;

  const focusCell = useCallback((x: number, y: number) => {
    setFocus({ x, y });
    rootRef.current?.querySelector<HTMLElement>(`[data-x="${x}"][data-y="${y}"]`)?.focus();
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>, x: number, y: number) => {
    if (!live) return;
    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        focusCell(Math.max(0, x - 1), y);
        break;
      case 'ArrowRight':
        e.preventDefault();
        focusCell(Math.min(BOARD_SIZE - 1, x + 1), y);
        break;
      case 'ArrowUp':
        e.preventDefault();
        focusCell(x, Math.max(0, y - 1));
        break;
      case 'ArrowDown':
        e.preventDefault();
        focusCell(x, Math.min(BOARD_SIZE - 1, y + 1));
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        onCellActivate?.(x, y);
        break;
      default:
        break;
    }
  };

  const renderCell = (x: number, y: number) => {
    const base = cellMap.get(coordKey({ x, y })) ?? 'empty';
    const isAim = aim !== null && aim.x === x && aim.y === y;
    const isPending = pending !== null && pending.x === x && pending.y === y;
    const untried = base === 'empty';
    const fireable = live && untried && pending === null;
    const isFlash = flash !== null && flash.x === x && flash.y === y;
    const label = coordLabel({ x, y });
    const state: CellState = isAim || isPending ? 'aim' : base;
    return (
      <Cell
        key={isFlash && flash ? `flash-${flash.key}` : 'cell'}
        x={x}
        y={y}
        state={state}
        interactive={fireable}
        flash={isFlash && flash ? flash.kind : null}
        title={label}
        role="gridcell"
        aria-label={cellDescription(label, state, fireable)}
        aria-disabled={fireable ? undefined : true}
        tabIndex={live ? (focus.x === x && focus.y === y ? 0 : -1) : undefined}
        onFocus={live ? () => setFocus({ x, y }) : undefined}
        onKeyDown={live ? (e) => onKeyDown(e, x, y) : undefined}
        data-testid={isAim ? 'aim-cell' : isPending ? 'pending-cell' : undefined}
        className={cn(!fireable && untried && live && 'cursor-default')}
      >
        {isPending && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
            <span className="absolute inset-[12%] animate-sonar rounded-full border-2 border-accent" />
            <span className="h-[32%] w-[32%] animate-pulse-soft rounded-full bg-accent" />
          </span>
        )}
        {isAim && !isPending && <span className="pointer-events-none absolute inset-[36%] rounded-full bg-accent/90" aria-hidden />}
      </Cell>
    );
  };

  const overlay = (
    <>
      {sunkPlacements.map((p) => (
        <ShipSprite key={p.type} placement={p} sunk />
      ))}
      <ShotPegs pegs={pegs} />
    </>
  );

  return (
    <div ref={rootRef} className={cn('w-full', className)}>
      <Grid
        testId={testId}
        ariaLabel={ariaLabel}
        renderCell={renderCell}
        overlay={overlay}
        onCellClick={live ? onCellActivate : undefined}
        disabled={disabled}
        scanning={scanning}
      />
    </div>
  );
}

import { useMemo, type PointerEvent as ReactPointerEvent } from 'react';
import { SHIP_SPECS, coordKey, coordLabel, fleetCellMap, placementInsideBoard, type Fleet } from '@battleship/shared';
import { cn } from '../../lib/utils';
import { Cell, type CellState } from '../board/Cell';
import { Grid } from '../board/Grid';
import { ShipSprite } from '../board/ShipSprite';
import type { BoardDrag } from './useBoardDrag';
import type { PlacementModel } from './usePlacement';

export interface PlacementBoardProps {
  model: PlacementModel;
  /** Pointer-drag controller from `useBoardDrag` (owned by the screen so the tray can start drags too). */
  drag: BoardDrag;
  /** Cell keys currently flashing red after a rejected action. */
  flashCells: ReadonlySet<string>;
  /** Fleet is confirmed: render read-only. */
  locked?: boolean;
  /** Fleet to draw while locked (the server's copy once confirmed). Defaults to the draft. */
  lockedFleet?: Fleet;
  reducedMotion?: boolean;
  className?: string;
  testId?: string;
}

/**
 * The interactive deployment board. Drag ships (from the board or the tray), tap a cell to place the selected ship,
 * click a ship to select it, double-click to rotate. All rules live in `usePlacement`; this component only maps pointer
 * input to actions and the model to `Cell` / `ShipSprite` visuals.
 */
export function PlacementBoard({ model, drag: drag$, flashCells, locked = false, lockedFleet, reducedMotion = false, className, testId = 'placement-board' }: PlacementBoardProps) {
  const { actions, ghost, drag, selected } = model;

  const fleet = locked ? (lockedFleet ?? model.placed) : model.placed;
  const cellMap = useMemo(() => fleetCellMap(fleet), [fleet]);
  const ghostMap = useMemo(() => {
    const map = new Map<string, boolean>();
    if (ghost) for (const c of ghost.cells) map.set(coordKey(c), ghost.valid);
    return map;
  }, [ghost]);

  const draggingFromBoard = drag?.source === 'board' ? drag.type : null;

  const onCellPointerDown = (x: number, y: number, e: ReactPointerEvent) => {
    const ship = cellMap.get(coordKey({ x, y }));
    if (ship) drag$.start(ship, { x, y }, e);
  };
  const onCellPointerMove = (x: number, y: number, e: ReactPointerEvent) => {
    // Hover previews are a mouse affordance; on touch the finger would hide the preview anyway.
    if (!drag && e.pointerType === 'mouse') actions.hover({ x, y });
  };
  const onCellClick = (x: number, y: number) => {
    if (drag$.consumeClickSuppression()) return;
    const ship = cellMap.get(coordKey({ x, y }));
    if (ship) actions.select(ship);
    else if (selected) actions.placeAt(x, y);
  };

  const renderCell = (x: number, y: number) => {
    const key = coordKey({ x, y });
    const shipType = cellMap.get(key);
    const hidden = shipType !== undefined && shipType === draggingFromBoard;
    let state: CellState = shipType && !hidden ? 'ship' : 'empty';
    const ghostValid = ghostMap.get(key);
    if (ghostValid !== undefined) state = ghostValid ? 'preview-ok' : 'preview-bad';
    const flashing = flashCells.has(key);
    if (flashing) state = 'preview-bad';
    const label = coordLabel({ x, y });
    const description = shipType ? SHIP_SPECS[shipType].name : state === 'preview-ok' ? 'valid position' : state === 'preview-bad' ? 'blocked' : 'open water';
    return (
      <Cell
        x={x}
        y={y}
        state={state}
        interactive={!locked && (selected !== null || shipType !== undefined)}
        disabled={locked}
        className={cn(flashing && !reducedMotion && 'animate-pulse')}
        role="gridcell"
        aria-label={`${label}: ${description}`}
        title={label}
      />
    );
  };

  const overlay = (
    <>
      {fleet.map((p) => {
        const isDragging = draggingFromBoard === p.type;
        return (
          <ShipSprite
            key={p.type}
            placement={p}
            selected={!locked && selected === p.type && !isDragging}
            className={cn(isDragging && 'opacity-30', reducedMotion && 'transition-none')}
            onPointerDown={
              locked
                ? undefined
                : (e) => {
                    e.stopPropagation();
                    drag$.start(p.type, drag$.cellAt(e), e);
                  }
            }
            onClick={
              locked
                ? undefined
                : () => {
                    if (!drag$.consumeClickSuppression()) actions.select(p.type);
                  }
            }
            onDoubleClick={locked ? undefined : () => actions.rotate(p.type)}
          />
        );
      })}
      {!locked && ghost && placementInsideBoard(ghost.placement) && (
        <ShipSprite placement={ghost.placement} ghost invalid={!ghost.valid} className={cn(reducedMotion && 'transition-none')} />
      )}
    </>
  );

  return (
    <div className={cn('w-full', className)} data-dragging={drag ? drag.type : undefined}>
      <Grid
        testId={testId}
        ariaLabel={locked ? 'Your deployed fleet' : 'Deployment board'}
        renderCell={renderCell}
        overlay={overlay}
        disabled={locked}
        onCellPointerDown={onCellPointerDown}
        onCellPointerMove={onCellPointerMove}
        onPointerLeave={() => actions.hover(null)}
        onCellClick={onCellClick}
        boardClassName={cn(!locked && selected && 'shadow-glow')}
      />
    </div>
  );
}

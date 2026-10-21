import { useMemo } from 'react';
import { coordKey, coordLabel, fleetCellMap, type MyBoardView } from '@battleship/shared';
import { Cell } from '../board/Cell';
import { Grid } from '../board/Grid';
import { ShipSprite } from '../board/ShipSprite';
import { cellDescription, myCellMap, myPegs, type CellFlash } from './battleModel';
import { ShotPegs } from './ShotPegs';

export interface MyBoardProps {
  board: MyBoardView;
  /** Last incoming shot animation. */
  flash?: CellFlash | null;
  className?: string;
  testId?: string;
  ariaLabel?: string;
  showLabels?: boolean;
}

/**
 * My own waters: the full fleet as ship sprites (sunk hulls in red), incoming shots as miss / hit / sunk cells
 * with hit pegs drawn over the hulls. Never interactive. Shared by the Battle and Results screens.
 */
export function MyBoard({ board, flash = null, className, testId = 'my-board', ariaLabel = 'My fleet', showLabels = true }: MyBoardProps) {
  const fleetCells = useMemo(() => fleetCellMap(board.fleet), [board.fleet]);
  const cellMap = useMemo(() => myCellMap(board, fleetCells), [board, fleetCells]);
  const pegs = useMemo(() => myPegs(board, fleetCells), [board, fleetCells]);

  const renderCell = (x: number, y: number) => {
    const state = cellMap.get(coordKey({ x, y })) ?? 'empty';
    const isFlash = flash !== null && flash.x === x && flash.y === y;
    const label = coordLabel({ x, y });
    return (
      <Cell
        key={isFlash && flash ? `flash-${flash.key}` : 'cell'}
        x={x}
        y={y}
        state={state}
        flash={isFlash && flash ? flash.kind : null}
        title={label}
        role="gridcell"
        aria-label={cellDescription(label, state, false)}
      />
    );
  };

  const overlay = (
    <>
      {board.fleet.map((p) => (
        <ShipSprite key={p.type} placement={p} sunk={board.sunk.includes(p.type)} />
      ))}
      <ShotPegs pegs={pegs} />
    </>
  );

  return <Grid testId={testId} ariaLabel={ariaLabel} renderCell={renderCell} overlay={overlay} className={className} showLabels={showLabels} />;
}

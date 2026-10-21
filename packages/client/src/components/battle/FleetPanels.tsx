import { SHIP_TYPES, type EnemyBoardView, type MyBoardView } from '@battleship/shared';
import { cn } from '../../lib/utils';
import { ShipStatus } from '../board/ShipStatus';
import { shipsAfloat } from './battleModel';

interface PanelFrameProps {
  title: string;
  count: string;
  children: React.ReactNode;
  className?: string;
  testId: string;
}

function PanelFrame({ title, count, children, className, testId }: PanelFrameProps) {
  return (
    <section className={cn('glass rounded-2xl p-3 sm:p-4', className)} data-testid={testId} aria-label={title}>
      <header className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-ink-dim">{title}</h3>
        <span className="font-mono text-[11px] tabular-nums text-ink-muted">{count}</span>
      </header>
      {children}
    </section>
  );
}

/** My fleet roster: per-ship hit pips and sunk state. */
export function MyFleetPanel({ board, compact, className }: { board: MyBoardView; compact?: boolean; className?: string }) {
  return (
    <PanelFrame title="My fleet" count={`${shipsAfloat(board)}/${SHIP_TYPES.length} afloat`} className={className} testId="my-fleet-status">
      <ShipStatus hits={board.hits} sunk={board.sunk} compact={compact} />
    </PanelFrame>
  );
}

/** Enemy fleet roster: only sunk / afloat is known. */
export function EnemyFleetPanel({ board, compact, className }: { board: EnemyBoardView; compact?: boolean; className?: string }) {
  const sunk = board.sunkShips.map((s) => s.type);
  return (
    <PanelFrame title="Enemy fleet" count={`${board.remaining.length}/${SHIP_TYPES.length} remaining`} className={className} testId="enemy-fleet-status">
      <ShipStatus sunk={sunk} compact={compact} />
    </PanelFrame>
  );
}

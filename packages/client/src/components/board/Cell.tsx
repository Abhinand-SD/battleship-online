import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/utils';

export type CellState = 'empty' | 'ship' | 'hit' | 'miss' | 'sunk' | 'preview-ok' | 'preview-bad' | 'aim';

export interface CellProps extends HTMLAttributes<HTMLDivElement> {
  state?: CellState;
  interactive?: boolean;
  disabled?: boolean;
  /** Plays the hit flash / ripple animation once (key it on the shot to re-trigger). */
  flash?: 'hit' | 'miss' | null;
  children?: ReactNode;
  x: number;
  y: number;
}

const stateClass: Record<CellState, string> = {
  empty: '',
  ship: 'cell-ship',
  hit: 'cell-hit',
  miss: 'cell-miss',
  sunk: 'cell-sunk',
  'preview-ok': 'cell-preview-ok',
  'preview-bad': 'cell-preview-bad',
  aim: 'cell-aim',
};

/** One board cell. Visual states are shared between the placement and battle boards. */
export function Cell({ state = 'empty', interactive, disabled, flash, className, children, x, y, ...rest }: CellProps) {
  return (
    <div
      className={cn('cell', stateClass[state], interactive && !disabled && 'cell-interactive', disabled && 'cell-disabled', className)}
      data-x={x}
      data-y={y}
      data-state={state}
      {...rest}
    >
      {flash === 'hit' && <span className="pointer-events-none absolute inset-0 animate-hit-flash rounded-[18%]" />}
      {flash === 'miss' && <span className="pointer-events-none absolute inset-[20%] animate-ripple rounded-full border border-slate-300/70" />}
      {children}
    </div>
  );
}

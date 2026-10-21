import { useCallback, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { BOARD_SIZE, COLUMN_LABELS } from '@battleship/shared';
import { cn } from '../../lib/utils';

export interface GridProps {
  /** Renders the cell at (x, y). Use <Cell>. */
  renderCell: (x: number, y: number) => ReactNode;
  /** Absolutely positioned layer over the cells (ship sprites, overlays). Percent based: each cell is 10% x 10%. */
  overlay?: ReactNode;
  /** Pointer handlers resolved to grid coordinates (work for mouse and touch). */
  onCellPointerDown?: (x: number, y: number, e: ReactPointerEvent) => void;
  onCellPointerMove?: (x: number, y: number, e: ReactPointerEvent) => void;
  onCellPointerUp?: (x: number, y: number, e: ReactPointerEvent) => void;
  onPointerLeave?: () => void;
  onCellClick?: (x: number, y: number) => void;
  showLabels?: boolean;
  className?: string;
  /** Additional class for the square cell area. */
  boardClassName?: string;
  ariaLabel?: string;
  /** Dim + disable pointer events. */
  disabled?: boolean;
  /** Renders a subtle sweeping radar line over the board. */
  scanning?: boolean;
  testId?: string;
}

/**
 * Responsive 10x10 board with A-J / 1-10 labels. The cell area is a square that fills its container width;
 * use a max-width on the parent to size it. Coordinates for pointer events are resolved from the pointer
 * position so dragging works identically with mouse, pen and touch.
 */
export function Grid({
  renderCell,
  overlay,
  onCellPointerDown,
  onCellPointerMove,
  onCellPointerUp,
  onPointerLeave,
  onCellClick,
  showLabels = true,
  className,
  boardClassName,
  ariaLabel,
  disabled,
  scanning,
  testId,
}: GridProps) {
  const boardRef = useRef<HTMLDivElement>(null);

  const resolve = useCallback((e: ReactPointerEvent): { x: number; y: number } | null => {
    const el = boardRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    if (px < 0 || py < 0 || px >= 1 || py >= 1) return null;
    return { x: Math.floor(px * BOARD_SIZE), y: Math.floor(py * BOARD_SIZE) };
  }, []);

  const handler = (cb?: (x: number, y: number, e: ReactPointerEvent) => void) =>
    cb
      ? (e: ReactPointerEvent) => {
          const c = resolve(e);
          if (c) cb(c.x, c.y, e);
        }
      : undefined;

  const cells: ReactNode[] = [];
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      cells.push(
        <div key={`${x},${y}`} className="relative" onClick={onCellClick && !disabled ? () => onCellClick(x, y) : undefined}>
          {renderCell(x, y)}
        </div>,
      );
    }
  }

  return (
    <div className={cn('w-full select-none', className)} data-testid={testId}>
      <div
        className={cn('grid gap-0', showLabels ? 'grid-cols-[1.25rem_1fr] grid-rows-[1.25rem_1fr] sm:grid-cols-[1.5rem_1fr] sm:grid-rows-[1.5rem_1fr]' : 'grid-cols-1')}
      >
        {showLabels && <div />}
        {showLabels && (
          <div className="grid grid-cols-10 text-center font-mono text-[10px] font-semibold text-ink-dim sm:text-xs">
            {COLUMN_LABELS.split('').map((l) => (
              <span key={l} className="leading-5 sm:leading-6">
                {l}
              </span>
            ))}
          </div>
        )}
        {showLabels && (
          <div className="grid grid-rows-10 text-center font-mono text-[10px] font-semibold text-ink-dim sm:text-xs">
            {Array.from({ length: BOARD_SIZE }, (_, i) => (
              <span key={i} className="flex items-center justify-center">
                {i + 1}
              </span>
            ))}
          </div>
        )}
        <div
          ref={boardRef}
          role="grid"
          aria-label={ariaLabel}
          className={cn(
            'relative aspect-square w-full touch-none rounded-xl bg-ocean-900/60 p-[2px] shadow-[inset_0_0_0_1px_rgba(103,232,249,0.12)]',
            disabled && 'opacity-80',
            boardClassName,
          )}
          onPointerDown={disabled ? undefined : handler(onCellPointerDown)}
          onPointerMove={disabled ? undefined : handler(onCellPointerMove)}
          onPointerUp={disabled ? undefined : handler(onCellPointerUp)}
          onPointerLeave={disabled ? undefined : onPointerLeave}
          onPointerCancel={disabled ? undefined : onPointerLeave}
        >
          <div className="grid h-full w-full grid-cols-10 grid-rows-10 gap-[2px] sm:gap-[3px]">{cells}</div>
          {overlay && <div className="pointer-events-none absolute inset-[2px]">{overlay}</div>}
          {scanning && (
            <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl">
              <div className="h-1/3 w-full animate-scan bg-gradient-to-b from-transparent via-accent/10 to-accent/25" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

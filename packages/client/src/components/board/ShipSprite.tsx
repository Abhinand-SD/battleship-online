import { SHIP_SPECS, type ShipPlacement } from '@battleship/shared';
import { cn } from '../../lib/utils';

export interface ShipSpriteProps {
  placement: ShipPlacement;
  sunk?: boolean;
  /** Visual-only ghost (e.g. while dragging). */
  ghost?: boolean;
  invalid?: boolean;
  selected?: boolean;
  className?: string;
  onPointerDown?: (e: React.PointerEvent) => void;
  onClick?: () => void;
  onDoubleClick?: () => void;
}

/**
 * Draws a ship hull spanning its cells inside a <Grid overlay>. Positions are percentages so the sprite scales
 * with the board. Pointer events are enabled only when a handler is passed (so battle boards stay click-through).
 */
export function ShipSprite({ placement, sunk, ghost, invalid, selected, className, onPointerDown, onClick, onDoubleClick }: ShipSpriteProps) {
  const size = SHIP_SPECS[placement.type].size;
  const horizontal = placement.orientation === 'horizontal';
  const style = {
    left: `${placement.x * 10}%`,
    top: `${placement.y * 10}%`,
    width: `${(horizontal ? size : 1) * 10}%`,
    height: `${(horizontal ? 1 : size) * 10}%`,
  };
  const interactive = Boolean(onPointerDown || onClick || onDoubleClick);
  return (
    <div
      className={cn('absolute p-[6%] transition-[left,top,width,height] duration-150', interactive ? 'pointer-events-auto cursor-grab active:cursor-grabbing' : 'pointer-events-none', className)}
      style={style}
      onPointerDown={onPointerDown}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      data-ship={placement.type}
      data-testid={`ship-${placement.type}`}
    >
      <div
        className={cn(
          'relative h-full w-full rounded-full border transition-colors',
          ghost
            ? invalid
              ? 'border-rose-400/80 bg-rose-500/30'
              : 'border-emerald-300/80 bg-emerald-400/30'
            : sunk
              ? 'border-rose-300/70 bg-gradient-to-br from-rose-700/80 to-red-950/90'
              : 'border-accent-2/70 bg-gradient-to-br from-accent/60 to-accent-deep/80 shadow-[0_0_14px_rgba(34,211,238,0.25)]',
          selected && 'ring-2 ring-accent ring-offset-1 ring-offset-ocean-900',
        )}
      >
        {/* deck detail */}
        <div className={cn('absolute rounded-full bg-white/15', horizontal ? 'inset-y-[32%] left-[18%] right-[18%]' : 'inset-x-[32%] top-[18%] bottom-[18%]')} />
        <div className={cn('absolute rounded-full bg-ocean-950/40', horizontal ? 'inset-y-[38%] left-[42%] w-[16%]' : 'inset-x-[38%] top-[42%] h-[16%]')} />
      </div>
    </div>
  );
}

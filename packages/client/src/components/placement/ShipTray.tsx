import type { PointerEvent as ReactPointerEvent } from 'react';
import { Check } from 'lucide-react';
import { SHIP_SPECS, SHIP_TYPES, type ShipType } from '@battleship/shared';
import { cn } from '../../lib/utils';
import type { PlacementModel } from './usePlacement';

export interface ShipTrayProps {
  model: PlacementModel;
  /** Pointer-down on an unplaced ship: start dragging it onto the board. */
  onDragStart?: (ship: ShipType, e: ReactPointerEvent) => void;
  className?: string;
}

/** Fleet roster: tap a ship to select it (then tap the board to place / move it); unplaced ships can also be dragged out. */
export function ShipTray({ model, onDragStart, className }: ShipTrayProps) {
  const { placed, selected, actions, drag } = model;
  return (
    <ul className={cn('grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1', className)} aria-label="Fleet" data-testid="ship-tray">
      {SHIP_TYPES.map((type) => {
        const spec = SHIP_SPECS[type];
        const isPlaced = placed.some((s) => s.type === type);
        const isSelected = selected === type;
        const isDragging = drag?.type === type;
        return (
          <li key={type}>
            <button
              type="button"
              onClick={() => actions.select(type)}
              onPointerDown={!isPlaced && onDragStart ? (e) => onDragStart(type, e) : undefined}
              aria-pressed={isSelected}
              aria-label={`${spec.name}, ${spec.size} cells, ${isPlaced ? 'deployed' : 'not deployed'}`}
              data-testid={`tray-${type}`}
              data-placed={isPlaced}
              className={cn(
                'flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors',
                !isPlaced && 'touch-none cursor-grab active:cursor-grabbing',
                isSelected ? 'border-accent/70 bg-accent-soft shadow-glow' : 'border-line bg-white/[0.03] hover:border-accent/40 hover:bg-white/[0.05]',
                isDragging && 'opacity-50',
              )}
            >
              <span className="min-w-0">
                <span className={cn('block truncate text-sm font-semibold', isPlaced ? 'text-ink' : 'text-ink-muted')}>{spec.name}</span>
                <span className="block text-[11px] text-ink-dim">{isPlaced ? 'Deployed' : 'Tap, then tap the board'}</span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="flex gap-[3px]" aria-hidden>
                  {Array.from({ length: spec.size }, (_, i) => (
                    <span key={i} className={cn('h-2.5 w-2.5 rounded-sm', isPlaced ? 'bg-accent/70' : 'bg-ink-dim/40')} />
                  ))}
                </span>
                <span
                  className={cn('inline-flex h-5 w-5 items-center justify-center rounded-full border', isPlaced ? 'border-emerald-400/50 bg-emerald-400/15 text-emerald-300' : 'border-line text-transparent')}
                  aria-hidden
                >
                  <Check className="h-3 w-3" />
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

import { SHIP_SPECS, SHIP_TYPES, type ShipType } from '@battleship/shared';
import { cn } from '../../lib/utils';

export interface ShipStatusProps {
  /** Hit counts per ship (own fleet). Omit for the enemy fleet where only sunk/afloat is known. */
  hits?: Partial<Record<ShipType, number>>;
  sunk: ShipType[];
  title?: string;
  compact?: boolean;
  className?: string;
}

/** Fleet roster with per-ship damage pips. */
export function ShipStatus({ hits, sunk, title, compact, className }: ShipStatusProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {title && <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-dim">{title}</p>}
      {SHIP_TYPES.map((type) => {
        const spec = SHIP_SPECS[type];
        const isSunk = sunk.includes(type);
        const hitCount = isSunk ? spec.size : (hits?.[type] ?? 0);
        return (
          <div key={type} className={cn('flex items-center justify-between gap-3', isSunk && 'opacity-60')} data-testid={`ship-status-${type}`} data-sunk={isSunk}>
            <span className={cn('truncate text-xs', compact ? 'w-16' : 'w-20', isSunk ? 'text-rose-300 line-through' : 'text-ink-muted')}>{spec.name}</span>
            <span className="flex gap-[3px]">
              {Array.from({ length: spec.size }, (_, i) => (
                <span
                  key={i}
                  className={cn(
                    'h-2 rounded-sm transition-colors',
                    compact ? 'w-2' : 'w-2.5',
                    i < hitCount ? (isSunk ? 'bg-rose-500' : 'bg-hit') : hits ? 'bg-accent/60' : 'bg-ink-dim/50',
                  )}
                />
              ))}
            </span>
          </div>
        );
      })}
    </div>
  );
}

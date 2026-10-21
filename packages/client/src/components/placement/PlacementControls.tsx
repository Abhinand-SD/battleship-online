import { Check, RotateCw, Shuffle, Trash2 } from 'lucide-react';
import { SHIP_TYPES } from '@battleship/shared';
import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';
import type { PlacementModel } from './usePlacement';

export interface PlacementControlsProps {
  model: PlacementModel;
  onConfirm: () => void;
  confirming: boolean;
  touch: boolean;
  className?: string;
}

/** Rotate / Randomize / Reset / Confirm plus the validation line. */
export function PlacementControls({ model, onConfirm, confirming, touch, className }: PlacementControlsProps) {
  const { actions, placedCount, validation, canConfirm, selectedPlacement, orientation } = model;
  const total = SHIP_TYPES.length;
  const incomplete = placedCount < total;
  const message = incomplete
    ? `${placedCount} of ${total} ships deployed`
    : validation.ok
      ? 'All ships deployed. Confirm when you are happy with the layout.'
      : validation.reason;
  const rotateLabel = selectedPlacement ? `Rotate ${selectedPlacement.type}` : `Next ship: ${orientation}`;

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="grid grid-cols-3 gap-2">
        <Button variant="subtle" size="md" icon={<RotateCw className="h-4 w-4" />} onClick={() => actions.rotate()} aria-label={rotateLabel} title={touch ? rotateLabel : `${rotateLabel} (R)`} data-testid="rotate-ship">
          Rotate
        </Button>
        <Button variant="subtle" size="md" icon={<Shuffle className="h-4 w-4" />} onClick={() => actions.randomize()} aria-label="Randomize fleet" data-testid="randomize-fleet">
          Random
        </Button>
        <Button variant="subtle" size="md" icon={<Trash2 className="h-4 w-4" />} onClick={() => actions.reset()} disabled={placedCount === 0} aria-label="Clear the board" data-testid="reset-fleet">
          Reset
        </Button>
      </div>
      <p className={cn('text-xs', incomplete ? 'text-ink-muted' : validation.ok ? 'text-emerald-300' : 'text-rose-300')} role="status" aria-live="polite" data-testid="placement-validation">
        {message}
      </p>
      <Button size="lg" fullWidth icon={<Check className="h-5 w-5" />} onClick={onConfirm} disabled={!canConfirm} loading={confirming} data-testid="confirm-fleet">
        Confirm fleet
      </Button>
    </div>
  );
}

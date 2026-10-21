import { useMemo } from 'react';
import type { ShotRecord, ShotOutcome } from '@battleship/shared';
import { cn } from '../../lib/utils';
import { Badge, type BadgeTone } from '../ui/Badge';
import { historyRows, outcomeLabel } from './battleModel';
import { Collapsible } from './Collapsible';

const outcomeTone: Record<ShotOutcome, BadgeTone> = { miss: 'neutral', hit: 'hit', sunk: 'danger' };

export interface ShotLogProps {
  history: ShotRecord[];
  /** Phones: collapse the log behind a toggle to keep both boards on screen. */
  collapsible?: boolean;
  className?: string;
}

/** Scrollable shot history, newest first, with outcome badges. */
export function ShotLog({ history, collapsible = false, className }: ShotLogProps) {
  const rows = useMemo(() => historyRows(history), [history]);
  return (
    <Collapsible
      title="Shot log"
      summary={`${rows.length} ${rows.length === 1 ? 'shot' : 'shots'}`}
      alwaysOpen={!collapsible}
      defaultOpen={false}
      className={className}
      testId="shot-log"
    >
      {rows.length === 0 ? (
        <p className="py-2 text-center text-sm text-ink-dim">No shots fired yet.</p>
      ) : (
        <ol className="max-h-64 space-y-1 overflow-y-auto pr-1 lg:max-h-[22rem]" aria-label="Shots, newest first">
          {rows.map((r) => (
            <li
              key={r.moveNumber}
              className={cn(
                'flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs',
                r.by === 'me' ? 'bg-accent-soft/40' : 'bg-white/[0.03]',
              )}
              data-testid="shot-log-row"
              data-by={r.by}
            >
              <span className="w-7 shrink-0 font-mono text-[10px] tabular-nums text-ink-dim">#{r.moveNumber}</span>
              <span className={cn('w-12 shrink-0 font-semibold', r.by === 'me' ? 'text-accent' : 'text-ink-muted')}>{r.actor}</span>
              <span className="w-8 shrink-0 font-mono font-semibold text-ink">{r.coord}</span>
              <Badge tone={outcomeTone[r.outcome]} className="shrink-0 px-2 py-0 text-[9px]">
                {outcomeLabel(r.outcome)}
              </Badge>
              {r.sunkName && <span className="truncate text-ink-muted">{r.sunkName}</span>}
            </li>
          ))}
        </ol>
      )}
    </Collapsible>
  );
}

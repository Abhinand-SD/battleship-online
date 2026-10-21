import { coordKey } from '@battleship/shared';
import { cn } from '../../lib/utils';
import type { Peg } from './battleModel';

/**
 * Hit pegs rendered inside a <Grid overlay>, above ship sprites. Percent-positioned like ShipSprite so they
 * scale with the board. Purely decorative: the cells underneath carry the semantic state.
 */
export function ShotPegs({ pegs }: { pegs: Peg[] }) {
  if (pegs.length === 0) return null;
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      {pegs.map((p) => (
        <span
          key={coordKey(p)}
          className="absolute flex items-center justify-center"
          style={{ left: `${p.x * 10}%`, top: `${p.y * 10}%`, width: '10%', height: '10%' }}
          data-peg={p.tone}
        >
          <span
            className={cn(
              'h-[34%] w-[34%] rounded-full ring-1',
              p.tone === 'hit' ? 'bg-hit shadow-glow-hit ring-orange-100/80' : 'bg-rose-200 ring-rose-900/70',
            )}
          />
        </span>
      ))}
    </div>
  );
}

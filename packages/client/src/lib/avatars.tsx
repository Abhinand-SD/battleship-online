import {
  Anchor,
  Compass,
  Fish,
  Lighthouse,
  Radar,
  Rocket,
  Sailboat,
  Shell,
  Ship,
  ShipWheel,
  Skull,
  Star,
  type LucideIcon,
} from 'lucide-react';
import { AVATAR_IDS, type AvatarId } from '@battleship/shared';
import { cn } from './utils';

export const AVATAR_ICONS: Record<AvatarId, LucideIcon> = {
  anchor: Anchor,
  compass: Compass,
  helm: ShipWheel,
  lighthouse: Lighthouse,
  kraken: Shell,
  submarine: Ship,
  radar: Radar,
  torpedo: Rocket,
  wave: Sailboat,
  shark: Fish,
  skull: Skull,
  star: Star,
};

export const AVATAR_LABELS: Record<AvatarId, string> = {
  anchor: 'Anchor',
  compass: 'Compass',
  helm: 'Helm',
  lighthouse: 'Lighthouse',
  kraken: 'Kraken',
  submarine: 'Submarine',
  radar: 'Radar',
  torpedo: 'Torpedo',
  wave: 'Sailboat',
  shark: 'Shark',
  skull: 'Jolly Roger',
  star: 'Star',
};

const HUES: Record<AvatarId, string> = {
  anchor: 'from-cyan-500/70 to-blue-700/70',
  compass: 'from-teal-400/70 to-cyan-800/70',
  helm: 'from-amber-400/70 to-orange-700/70',
  lighthouse: 'from-yellow-300/70 to-amber-700/70',
  kraken: 'from-fuchsia-400/70 to-purple-800/70',
  submarine: 'from-emerald-400/70 to-teal-800/70',
  radar: 'from-lime-300/70 to-green-800/70',
  torpedo: 'from-orange-400/70 to-red-800/70',
  wave: 'from-sky-300/70 to-indigo-800/70',
  shark: 'from-slate-300/70 to-slate-700/70',
  skull: 'from-rose-400/70 to-rose-900/70',
  star: 'from-violet-300/70 to-indigo-800/70',
};

export function isAvatarId(v: string): v is AvatarId {
  return (AVATAR_IDS as readonly string[]).includes(v);
}

export interface AvatarProps {
  id: string;
  size?: number;
  className?: string;
  ring?: boolean;
  ai?: boolean;
}

/** Circular avatar rendered from a built-in icon with a per-avatar gradient. */
export function Avatar({ id, size = 40, className, ring = false, ai = false }: AvatarProps) {
  const key: AvatarId = isAvatarId(id) ? id : 'anchor';
  const Icon = AVATAR_ICONS[key];
  return (
    <div
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]',
        HUES[key],
        ring && 'ring-2 ring-accent/70 ring-offset-2 ring-offset-ocean-900',
        className,
      )}
      style={{ width: size, height: size }}
      aria-label={AVATAR_LABELS[key]}
      role="img"
    >
      <Icon style={{ width: size * 0.52, height: size * 0.52 }} strokeWidth={2.2} />
      {ai && (
        <span className="absolute -right-0.5 -bottom-0.5 rounded-full bg-ocean-900 px-1 font-mono text-[9px] leading-4 text-accent ring-1 ring-accent/60">
          AI
        </span>
      )}
    </div>
  );
}

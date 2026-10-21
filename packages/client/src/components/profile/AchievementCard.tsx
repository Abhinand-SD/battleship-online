import { Award, Lock } from 'lucide-react';
import type { AchievementProgress } from '@battleship/shared';
import { cn, relativeTime } from '../../lib/utils';

export function AchievementCard({ achievement }: { achievement: AchievementProgress }) {
  const unlocked = achievement.unlockedAt !== null;
  return (
    <li
      className={cn(
        'flex items-start gap-3 rounded-2xl border p-3 transition-colors',
        unlocked ? 'glass border-accent/30' : 'border-line bg-white/[0.02] text-ink-muted',
      )}
      data-testid="achievement"
      data-unlocked={unlocked}
    >
      <span
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
          unlocked ? 'bg-gradient-to-br from-amber-300/80 to-orange-600/80 text-ocean-950 shadow-glow' : 'bg-white/5 text-ink-dim',
        )}
        aria-hidden
      >
        {unlocked ? <Award className="h-5 w-5" /> : <Lock className="h-4 w-4" />}
      </span>
      <div className="min-w-0">
        <p className={cn('text-sm font-semibold', unlocked ? 'text-ink' : 'text-ink-muted')}>
          {achievement.name}
          <span className="sr-only">{unlocked ? ' (unlocked)' : ' (locked)'}</span>
        </p>
        <p className="mt-0.5 text-xs text-ink-muted">{achievement.description}</p>
        <p className="mt-1 text-[11px] uppercase tracking-wide text-ink-dim">
          {unlocked && achievement.unlockedAt ? `Unlocked ${relativeTime(achievement.unlockedAt)}` : 'Locked'}
        </p>
      </div>
    </li>
  );
}

import { motion } from 'motion/react';
import { Swords, Users, X, Zap } from 'lucide-react';
import { useStore } from '../../lib/store';
import { useElapsed } from '../../lib/time';
import { Button } from '../ui/Button';
import { Panel } from '../ui/Panel';
import { SonarPulse } from '../ui/Spinner';
import { revealIn } from './motion';
import type { MenuPending } from './useMenuActions';
import type { OnlineStats } from './useOnlineStats';

export interface QuickMatchCardProps {
  pending: MenuPending | null;
  canStart: boolean;
  blockedReason: string | null;
  stats: OnlineStats | null;
  onStart: () => void;
  onCancel: () => void;
}

/** `m:ss` from elapsed milliseconds, flooring so the counter never jumps ahead. */
function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Quick match card. The searching state is derived purely from `store.queue` (fed by `queue:status`
 * and `session:state`), so a reload while queued comes back in the same state.
 */
export function QuickMatchCard({ pending, canStart, blockedReason, stats, onStart, onCancel }: QuickMatchCardProps) {
  const queue = useStore((s) => s.queue);
  const elapsed = useElapsed(queue.inQueue ? queue.since : null);
  const others = Math.max(0, queue.searching - 1);

  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-accent" aria-hidden />
          Quick match
        </span>
      }
      subtitle="Get paired with the next available captain. Rated."
      className="flex flex-col"
      data-testid="card-quick-match"
    >
      {queue.inQueue ? (
        <motion.div {...revealIn} className="flex flex-1 flex-col gap-4" role="status" aria-live="polite" data-testid="queue-searching">
          <div className="flex items-center gap-3 rounded-xl border border-accent/30 bg-accent-soft/40 px-4 py-3">
            <SonarPulse className="ml-1 mr-1" />
            <div className="min-w-0 flex-1">
              <p className="font-display text-sm font-semibold text-ink">Searching for an opponent…</p>
              <p className="text-xs text-ink-muted">
                {others === 0 ? 'You are first in line.' : `${others} other ${others === 1 ? 'player is' : 'players are'} searching.`}
              </p>
            </div>
            <span className="font-mono text-lg tabular-nums text-accent" aria-label={`Searching for ${formatElapsed(elapsed)}`}>
              {formatElapsed(elapsed)}
            </span>
          </div>
          <p className="text-xs text-ink-dim">You’ll be moved to ship placement the moment a match is found. Feel free to browse the leaderboard meanwhile.</p>
          <div className="mt-auto">
            <Button variant="danger" fullWidth icon={<X className="h-4 w-4" aria-hidden />} loading={pending === 'cancel'} onClick={onCancel} data-testid="queue-cancel">
              Cancel search
            </Button>
          </div>
        </motion.div>
      ) : (
        <div className="flex flex-1 flex-col gap-4">
          <ul className="grid grid-cols-2 gap-2 text-xs text-ink-muted">
            <li className="rounded-xl border border-line bg-white/[0.03] px-3 py-2">
              <span className="block font-display text-base font-semibold text-ink">1 v 1</span>
              Real-time duel
            </li>
            <li className="rounded-xl border border-line bg-white/[0.03] px-3 py-2">
              <span className="block font-display text-base font-semibold text-ink">45 s</span>
              Per turn
            </li>
          </ul>
          {stats && (
            <p className="flex items-center gap-2 text-xs text-ink-muted" data-testid="quick-match-stats">
              <Users className="h-3.5 w-3.5 text-accent" aria-hidden />
              <span>
                <span className="font-semibold text-ink">{stats.onlineUsers}</span> online ·{' '}
                <span className="font-semibold text-ink">{stats.queueLength}</span> searching
              </span>
            </p>
          )}
          <div className="mt-auto flex flex-col gap-2">
            <Button
              size="lg"
              fullWidth
              icon={<Swords className="h-5 w-5" aria-hidden />}
              loading={pending === 'quick'}
              disabled={!canStart || (pending !== null && pending !== 'quick')}
              onClick={onStart}
              data-testid="menu-quick-match"
            >
              Find a match
            </Button>
            {!canStart && blockedReason && (
              <p className="text-center text-xs text-ink-dim" role="note">
                {blockedReason}
              </p>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}

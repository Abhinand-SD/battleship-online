import { useState } from 'react';
import { LogOut, Swords } from 'lucide-react';
import type { GameSnapshot } from '@battleship/shared';
import { Avatar } from '../../lib/avatars';
import { formatRoomCode } from '../../lib/utils';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';

export interface MatchInProgressBannerProps {
  game: GameSnapshot;
  leaving: boolean;
  onReturn: () => void;
  onLeave: () => Promise<void>;
}

const PHASE_LABEL: Record<GameSnapshot['phase'], string> = {
  WAITING: 'Waiting in the lobby',
  PLACING_SHIPS: 'Placing ships',
  READY: 'Battle starting',
  IN_BATTLE: 'Battle under way',
  FINISHED: 'Finished',
};

const MODE_LABEL: Record<GameSnapshot['mode'], string> = { QUICK: 'Quick match', PRIVATE: 'Private room', PRACTICE: 'Practice' };

/** Shown on the menu while a match is active: return to it, or leave it after confirming. */
export function MatchInProgressBanner({ game, leaving, onReturn, onLeave }: MatchInProgressBannerProps) {
  const [confirming, setConfirming] = useState(false);
  const inBattle = game.phase === 'IN_BATTLE' || game.phase === 'READY';
  const opponent = game.opponent;

  const confirmLeave = async () => {
    await onLeave();
    setConfirming(false);
  };

  return (
    <>
      <section
        className="glass-strong flex flex-col gap-4 rounded-2xl border-accent/40 p-4 sm:flex-row sm:items-center sm:p-5"
        aria-labelledby="match-in-progress-title"
        data-testid="match-in-progress"
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {opponent ? <Avatar id={opponent.avatar} size={44} ai={opponent.isAi} /> : <Avatar id={game.me.avatar} size={44} ring />}
          <div className="min-w-0">
            <p id="match-in-progress-title" className="font-display text-base font-semibold text-ink">
              You have a match in progress
            </p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted">
              <Badge tone="accent">{MODE_LABEL[game.mode]}</Badge>
              <span>{PHASE_LABEL[game.phase]}</span>
              {opponent && <span className="truncate">vs {opponent.displayName}</span>}
              {game.roomCode && <span className="font-mono">Room {formatRoomCode(game.roomCode)}</span>}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="ghost" icon={<LogOut className="h-4 w-4" aria-hidden />} onClick={() => setConfirming(true)} disabled={leaving} data-testid="menu-leave-match">
            Leave
          </Button>
          <Button icon={<Swords className="h-4 w-4" aria-hidden />} onClick={onReturn} className="flex-1 sm:flex-none" data-testid="menu-return-to-match">
            Return to match
          </Button>
        </div>
      </section>

      <Modal
        open={confirming}
        onClose={() => (leaving ? undefined : setConfirming(false))}
        locked={leaving}
        title="Leave this match?"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)} disabled={leaving}>
              Stay
            </Button>
            <Button variant="danger" loading={leaving} onClick={() => void confirmLeave()} data-testid="confirm-leave-match">
              Leave match
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-muted">
          {inBattle
            ? 'The battle has started, so leaving counts as a forfeit and your opponent wins.'
            : game.mode === 'PRIVATE'
              ? 'Your opponent will be sent back to the lobby and the room stays open for them.'
              : 'The match will be cancelled. No statistics are recorded.'}
        </p>
      </Modal>
    </>
  );
}

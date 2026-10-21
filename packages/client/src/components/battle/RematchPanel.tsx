import { useCallback, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ChartColumn, Handshake, LogOut, RotateCcw, Swords, Trophy, UserX, X } from 'lucide-react';
import type { GameSnapshot } from '@battleship/shared';
import { errorMessage, rt } from '../../lib/socket';
import { toast } from '../../lib/store';
import { Button } from '../ui/Button';
import { Panel } from '../ui/Panel';
import { SonarPulse } from '../ui/Spinner';
import { opponentName } from './battleModel';
import { errorCode, rematchState } from './resultsModel';

/** Rematch controls (state driven by `game.rematch`), back to menu, and links to stats / leaderboard. */
export function RematchPanel({ game, className }: { game: GameSnapshot; className?: string }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [gone, setGone] = useState(false);

  const state = gone ? 'unavailable' : rematchState(game);
  const name = opponentName(game);

  const rematch = useCallback(async (accept: boolean) => {
    setBusy(true);
    try {
      await rt.rematch(accept);
    } catch (err) {
      if (errorCode(err) === 'OPPONENT_LEFT') {
        setGone(true);
        toast('warning', 'Opponent left', 'A rematch is no longer possible. Start a new match from the menu.');
      } else {
        toast('error', accept ? 'Rematch failed' : 'Could not cancel', errorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  }, []);

  const backToMenu = useCallback(async () => {
    setLeaving(true);
    try {
      await rt.leaveGame();
    } catch {
      /* the room may already be gone; the menu is the right place either way */
    } finally {
      navigate('/play');
    }
  }, [navigate]);

  return (
    <Panel title="What next?" className={className} data-testid="rematch-panel" data-state={state}>
      <div className="space-y-3">
        {state === 'unavailable' && (
          <div className="flex items-center gap-2 rounded-xl border border-line bg-white/[0.03] px-3 py-2.5 text-sm text-ink-muted" data-testid="opponent-left">
            <UserX className="h-4 w-4 shrink-0" aria-hidden />
            <span>Opponent left — no rematch available.</span>
          </div>
        )}

        {state === 'practice' && (
          <Button size="lg" fullWidth icon={<RotateCcw className="h-4 w-4" aria-hidden />} loading={busy} onClick={() => void rematch(true)} data-testid="rematch-button">
            Play again
          </Button>
        )}

        {state === 'idle' && (
          <Button size="lg" fullWidth icon={<Swords className="h-4 w-4" aria-hidden />} loading={busy} onClick={() => void rematch(true)} data-testid="rematch-button">
            Rematch
          </Button>
        )}

        {state === 'incoming' && (
          <>
            <p className="text-center text-sm text-ink-muted" data-testid="rematch-incoming">
              <span className="font-semibold text-ink">{name}</span> wants a rematch
            </p>
            <Button
              size="lg"
              fullWidth
              icon={<Handshake className="h-4 w-4" aria-hidden />}
              loading={busy}
              onClick={() => void rematch(true)}
              className="animate-pulse-soft shadow-glow-strong"
              data-testid="rematch-button"
            >
              Accept rematch
            </Button>
          </>
        )}

        {state === 'waiting' && (
          <>
            <Button size="lg" fullWidth disabled sound={false} data-testid="rematch-button" aria-live="polite">
              <SonarPulse className="mr-1" />
              Waiting for opponent…
            </Button>
            <Button variant="ghost" size="sm" fullWidth icon={<X className="h-3.5 w-3.5" aria-hidden />} loading={busy} onClick={() => void rematch(false)} data-testid="rematch-cancel">
              Cancel request
            </Button>
          </>
        )}

        <Button variant="secondary" size="lg" fullWidth icon={<LogOut className="h-4 w-4" aria-hidden />} loading={leaving} onClick={() => void backToMenu()} data-testid="back-to-menu">
          Back to menu
        </Button>

        <div className="grid grid-cols-2 gap-2 pt-1">
          <Link to="/stats" className="inline-flex h-10 items-center justify-center gap-2 rounded-xl text-sm text-ink-muted hover:bg-white/5 hover:text-ink" data-testid="link-stats">
            <ChartColumn className="h-4 w-4" aria-hidden />
            My stats
          </Link>
          <Link to="/leaderboard" className="inline-flex h-10 items-center justify-center gap-2 rounded-xl text-sm text-ink-muted hover:bg-white/5 hover:text-ink" data-testid="link-leaderboard">
            <Trophy className="h-4 w-4" aria-hidden />
            Leaderboard
          </Link>
        </div>
      </div>
    </Panel>
  );
}

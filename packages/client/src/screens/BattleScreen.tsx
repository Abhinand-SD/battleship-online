import { useCallback, useMemo, useState } from 'react';
import type { GameSnapshot } from '@battleship/shared';
import { errorMessage, rt } from '../lib/socket';
import { toast } from '../lib/store';
import { cn } from '../lib/utils';
import { PageShell } from '../components/ui/PageShell';
import { BattleBanners } from '../components/battle/BattleBanners';
import { BattleHud } from '../components/battle/BattleHud';
import { EnemyBoard } from '../components/battle/EnemyBoard';
import { FireBar } from '../components/battle/FireBar';
import { EnemyFleetPanel, MyFleetPanel } from '../components/battle/FleetPanels';
import { ForfeitDialog } from '../components/battle/ForfeitDialog';
import { MyBoard } from '../components/battle/MyBoard';
import { ShotLog } from '../components/battle/ShotLog';
import { latestShot, shotFlash } from '../components/battle/battleModel';
import { useFire } from '../components/battle/useFire';
import { DESKTOP_QUERY, useMediaQuery } from '../components/battle/useMediaQuery';

function BoardTitle({ children, hint, emphasised }: { children: string; hint?: string; emphasised?: boolean }) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-2 px-0.5">
      <h2 className={cn('font-display text-sm font-semibold uppercase tracking-wider', emphasised ? 'text-accent' : 'text-ink-muted')}>{children}</h2>
      {hint && <span className="truncate text-[11px] text-ink-dim">{hint}</span>}
    </div>
  );
}

/**
 * READY + IN_BATTLE. Everything shown here is derived from the server snapshot: the client renders intent
 * (aim / pending) and sends attacks, the server decides the outcome.
 */
export default function BattleScreen({ game }: { game: GameSnapshot }) {
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const fire = useFire(game);

  const latest = useMemo(() => latestShot(game.history), [game.history]);
  const enemyFlash = useMemo(() => shotFlash(latest, 'me'), [latest]);
  const myFlash = useMemo(() => shotFlash(latest, 'opponent'), [latest]);

  const inBattle = game.phase === 'IN_BATTLE';
  const myTurn = inBattle && game.turn === 'me';
  const practice = game.mode === 'PRACTICE';

  const [forfeitOpen, setForfeitOpen] = useState(false);
  const [forfeiting, setForfeiting] = useState(false);
  const confirmForfeit = useCallback(async () => {
    setForfeiting(true);
    try {
      await rt.forfeit();
      setForfeitOpen(false);
    } catch (err) {
      toast('error', 'Could not forfeit', errorMessage(err));
    } finally {
      setForfeiting(false);
    }
  }, []);

  const fireBarVisible = fire.needsConfirm && fire.aim !== null;
  const enemyHint = !inBattle ? 'Standing by' : myTurn ? (fire.needsConfirm ? 'Tap a cell, then confirm' : 'Pick a cell to fire') : 'Waiting for the enemy';

  return (
    <PageShell width="xl" className={cn('space-y-4', fireBarVisible && 'pb-28')}>
      <BattleHud game={game} onForfeit={() => setForfeitOpen(true)} />
      <BattleBanners game={game} />

      <div className="grid gap-4 lg:grid-cols-12 lg:gap-6">
        {/* Enemy waters: the primary board. */}
        <div className="lg:col-span-7">
          <BoardTitle emphasised hint={enemyHint}>
            Enemy waters
          </BoardTitle>
          <div className={cn('mx-auto w-full max-w-[34rem] rounded-2xl transition-shadow duration-300', myTurn && 'shadow-glow')}>
            <EnemyBoard
              board={game.enemyBoard}
              interactive={myTurn}
              disabled={!inBattle}
              scanning={inBattle && game.turn === 'opponent'}
              aim={fire.aim}
              pending={fire.pending}
              flash={enemyFlash}
              onCellActivate={fire.tap}
            />
          </div>
          {desktop && <EnemyFleetPanel board={game.enemyBoard} className="mt-4" />}
        </div>

        {/* My fleet + status. Phones: board at ~55% width with the rosters beside it, so both boards stay visible. */}
        <div className="lg:col-span-5">
          <div className="flex items-start gap-3 lg:block">
            <div className="w-[55%] shrink-0 lg:w-full">
              <BoardTitle hint={desktop ? `${game.myBoard.shots.length} incoming shots` : undefined}>My fleet</BoardTitle>
              <MyBoard board={game.myBoard} flash={myFlash} />
            </div>
            <div className="min-w-0 flex-1 space-y-3 pt-6 lg:mt-4 lg:space-y-4 lg:pt-0">
              <MyFleetPanel board={game.myBoard} compact={!desktop} />
              {!desktop && <EnemyFleetPanel board={game.enemyBoard} compact />}
            </div>
          </div>
          <ShotLog history={game.history} collapsible={!desktop} className="mt-4" />
        </div>
      </div>

      <FireBar fire={fire} />
      <ForfeitDialog open={forfeitOpen} busy={forfeiting} onClose={() => setForfeitOpen(false)} onConfirm={() => void confirmForfeit()} practice={practice} />
    </PageShell>
  );
}

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { CircleCheck, Keyboard, LogOut, Move, Swords } from 'lucide-react';
import type { GameSnapshot, ShipType } from '@battleship/shared';
import { Avatar } from '../lib/avatars';
import { errorMessage, rt } from '../lib/socket';
import { toast, useStore } from '../lib/store';
import { useCountdown } from '../lib/time';
import { cn, isTouchDevice } from '../lib/utils';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { PageShell } from '../components/ui/PageShell';
import { Panel } from '../components/ui/Panel';
import { SonarPulse } from '../components/ui/Spinner';
import { CountdownBanner } from '../components/lobby/CountdownBanner';
import { LeaveGameModal } from '../components/lobby/LeaveGameModal';
import { PlayerSlot, type SlotStatus } from '../components/lobby/PlayerSlot';
import { modeLabel } from '../components/lobby/gameMeta';
import { useCountdownSounds } from '../components/lobby/useCountdownSounds';
import { PlacementBoard } from '../components/placement/PlacementBoard';
import { PlacementControls } from '../components/placement/PlacementControls';
import { ShipTray } from '../components/placement/ShipTray';
import { usePlacement, type PlacementModel } from '../components/placement/usePlacement';
import { usePlacementFeedback } from '../components/placement/usePlacementFeedback';
import { useBoardDrag } from '../components/placement/useBoardDrag';

function deployStatus(player: GameSnapshot['me']): SlotStatus {
  if (player.fleetConfirmed) return { tone: 'success', label: 'Deployed' };
  if (!player.connected) return { tone: 'warning', label: 'Reconnecting' };
  return { tone: 'neutral', label: 'Placing ships' };
}

/** Global keyboard shortcuts while the board is editable: R rotates, arrows nudge, Escape deselects / cancels a drag. */
function useKeyboardShortcuts(model: PlacementModel, enabled: boolean): void {
  const modelRef = useRef(model);
  modelRef.current = model;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const { actions, drag, selectedPlacement } = modelRef.current;
      const nudge = (dx: number, dy: number) => {
        if (!selectedPlacement) return;
        e.preventDefault();
        actions.nudge(dx, dy);
      };
      switch (e.key) {
        case 'r':
        case 'R':
          e.preventDefault();
          actions.rotate();
          break;
        case 'ArrowUp':
          nudge(0, -1);
          break;
        case 'ArrowDown':
          nudge(0, 1);
          break;
        case 'ArrowLeft':
          nudge(-1, 0);
          break;
        case 'ArrowRight':
          nudge(1, 0);
          break;
        case 'Escape':
          if (drag) actions.cancelDrag();
          else actions.select(null);
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}

/** PLACING_SHIPS phase: arrange the fleet on top of `usePlacement`, confirm it, then wait for the opponent. */
export default function PlacementScreen({ game }: { game: GameSnapshot }) {
  const reducedMotion = useStore((s) => s.settings.reducedMotion);
  const setDraftFleet = useStore((s) => s.setDraftFleet);
  // The persisted draft seeds the board once; from then on the reducer is the source of truth and the store mirrors it.
  const initialDraft = useRef(useStore.getState().draftFleet);
  const model = usePlacement(initialDraft.current);
  const flashCells = usePlacementFeedback(model.feedback);

  const [confirming, setConfirming] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  // The drag controller lives here so the tray can start a drag that the board's window listeners then follow.
  const boardAreaRef = useRef<HTMLDivElement>(null);
  const boardDrag = useBoardDrag(boardAreaRef, model.actions);
  const touch = isTouchDevice();

  const locked = game.me.fleetConfirmed || submitted;
  const remaining = useCountdown(game.countdownEndsAt);
  const seconds = useCountdownSounds(remaining);
  const opponent = game.opponent;

  useEffect(() => setDraftFleet(model.placed), [model.placed, setDraftFleet]);
  // A rematch reuses this screen with a new game id: the fresh game needs a fresh confirmation.
  useEffect(() => setSubmitted(false), [game.gameId]);
  useKeyboardShortcuts(model, !locked);

  const confirm = async () => {
    if (!model.canConfirm || locked || confirming) return;
    setConfirming(true);
    try {
      await rt.confirmFleet(model.placed);
      setSubmitted(true);
    } catch (err) {
      toast('error', 'Fleet rejected', errorMessage(err));
    } finally {
      setConfirming(false);
    }
  };

  /** Drag out of the tray: the ghost appears as soon as the pointer crosses onto the board. */
  const onTrayDragStart = (ship: ShipType, e: ReactPointerEvent) => boardDrag.start(ship, null, e, 0);

  const lockedFleet = game.me.fleetConfirmed && game.myBoard.fleet.length > 0 ? game.myBoard.fleet : model.placed;

  return (
    <PageShell title="Deploy" width="lg">
      <div className="mx-auto flex max-w-5xl flex-col gap-5">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <Badge tone="accent">{modeLabel(game)}</Badge>
              {game.roomCode && <Badge tone="neutral">Room {game.roomCode}</Badge>}
            </div>
            <h1 className="font-display text-2xl font-bold sm:text-3xl">{locked ? 'Fleet deployed' : 'Deploy your fleet'}</h1>
            <p className="mt-1 text-sm text-ink-muted">
              {locked ? 'Your ships are locked in. The battle begins as soon as both fleets are ready.' : 'Position all five ships, then confirm. Your opponent never sees this board.'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {opponent && (
              <div className="flex items-center gap-2 rounded-full border border-line bg-white/5 py-1 pl-1 pr-3" data-testid="opponent-chip" title={opponent.displayName}>
                <Avatar id={opponent.avatar} size={26} ai={opponent.isAi} />
                <span className="max-w-[7rem] truncate text-xs font-semibold">{opponent.displayName}</span>
                <span className={cn('h-2 w-2 rounded-full', opponent.fleetConfirmed ? 'bg-emerald-400' : opponent.connected ? 'animate-pulse-soft bg-accent' : 'animate-pulse-soft bg-amber-400')} aria-hidden />
                <span className="sr-only">{opponent.fleetConfirmed ? 'deployed' : opponent.connected ? 'placing ships' : 'reconnecting'}</span>
              </div>
            )}
            <Button variant="ghost" size="sm" icon={<LogOut className="h-4 w-4" />} onClick={() => setLeaveOpen(true)} data-testid="leave-game">
              Leave
            </Button>
          </div>
        </header>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
          <div ref={boardAreaRef} className="mx-auto w-full max-w-[34rem] lg:mx-0">
            <PlacementBoard model={model} drag={boardDrag} flashCells={flashCells} locked={locked} lockedFleet={lockedFleet} reducedMotion={reducedMotion} />
            {!locked && (
              <p className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-center text-xs text-ink-dim" data-testid="placement-legend">
                <span className="inline-flex items-center gap-1.5">
                  <Move className="h-3.5 w-3.5" aria-hidden /> Drag to move
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Keyboard className="h-3.5 w-3.5" aria-hidden /> {touch ? 'Double-tap to rotate' : 'Double-click or R to rotate · Arrows nudge'}
                </span>
              </p>
            )}
          </div>

          <aside className="flex flex-col gap-4">
            {locked ? (
              <>
                <Panel strong>
                  <div className="flex items-center gap-3">
                    <CircleCheck className="h-8 w-8 shrink-0 text-emerald-300" aria-hidden />
                    <div>
                      <p className="font-display text-base font-semibold">Your fleet is locked in</p>
                      <p className="text-xs text-ink-muted">{lockedFleet.length} ships in position.</p>
                    </div>
                  </div>
                </Panel>
                {seconds !== null ? (
                  <CountdownBanner seconds={seconds} prefix="Battle starts in" doneLabel="To battle stations!" reducedMotion={reducedMotion} testId="battle-countdown" />
                ) : (
                  <Panel>
                    <div className="flex items-center gap-3" role="status" aria-live="polite" data-testid="waiting-for-opponent">
                      <SonarPulse className="ml-1" />
                      <p className="text-sm text-ink-muted">{opponent?.fleetConfirmed ? 'Both fleets ready — starting the battle…' : 'Waiting for opponent to deploy…'}</p>
                    </div>
                  </Panel>
                )}
                {opponent && <PlayerSlot player={opponent} caption="Opponent" status={deployStatus(opponent)} highlight={opponent.fleetConfirmed} testId="placement-opponent" />}
              </>
            ) : (
              <>
                <Panel title="Your fleet" subtitle={touch ? 'Tap a ship, then tap the board' : 'Click a ship, then click the board — or drag it out'}>
                  <ShipTray model={model} onDragStart={onTrayDragStart} />
                </Panel>
                <Panel strong>
                  <PlacementControls model={model} onConfirm={() => void confirm()} confirming={confirming} touch={touch} />
                </Panel>
                {opponent && (
                  <div className="flex items-center gap-2 px-1 text-xs text-ink-dim">
                    <Swords className="h-3.5 w-3.5" aria-hidden />
                    <span>
                      {opponent.fleetConfirmed ? `${opponent.displayName} is ready and waiting for you.` : `${opponent.displayName} is placing ships too.`}
                    </span>
                  </div>
                )}
              </>
            )}
          </aside>
        </div>
      </div>

      <LeaveGameModal open={leaveOpen} onClose={() => setLeaveOpen(false)} mode={game.mode} stage="placement" />
    </PageShell>
  );
}

import { useEffect, useState } from 'react';
import { Check, Hand, LogOut, Ship, Users } from 'lucide-react';
import { motion } from 'motion/react';
import type { GameSnapshot } from '@battleship/shared';
import { errorMessage, rt } from '../lib/socket';
import { toast, useStore } from '../lib/store';
import { useCountdown } from '../lib/time';
import { cn, isTouchDevice } from '../lib/utils';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { PageShell } from '../components/ui/PageShell';
import { Panel } from '../components/ui/Panel';
import { CountdownBanner } from '../components/lobby/CountdownBanner';
import { InvitePanel } from '../components/lobby/InvitePanel';
import { LeaveGameModal } from '../components/lobby/LeaveGameModal';
import { EmptySlot, PlayerSlot, type SlotStatus } from '../components/lobby/PlayerSlot';
import { modeLabel } from '../components/lobby/gameMeta';
import { useCountdownSounds } from '../components/lobby/useCountdownSounds';

function readyStatus(ready: boolean): SlotStatus {
  return ready ? { tone: 'success', label: 'Ready' } : { tone: 'neutral', label: 'Not ready' };
}

/** Private-room lobby (WAITING phase): share the code, wait for a friend, ready up, countdown into placement. */
export default function LobbyScreen({ game }: { game: GameSnapshot }) {
  const reducedMotion = useStore((s) => s.settings.reducedMotion);
  const [busy, setBusy] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);

  const remaining = useCountdown(game.countdownEndsAt);
  const seconds = useCountdownSounds(remaining);
  const countingDown = seconds !== null;

  const me = game.me;
  const opponent = game.opponent;
  const code = game.roomCode ?? '';
  const touch = isTouchDevice();

  // A fresh server snapshot can flip `ready` from either side; never leave the button stuck in "busy".
  useEffect(() => setBusy(false), [me.ready]);

  const toggleReady = async () => {
    setBusy(true);
    try {
      await rt.setReady(!me.ready);
    } catch (err) {
      toast('error', me.ready ? 'Could not cancel ready' : 'Could not ready up', errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const slotMotion = reducedMotion ? {} : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 } };

  return (
    <PageShell title="Lobby" width="lg">
      <div className="mx-auto flex max-w-5xl flex-col gap-5">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="mb-1.5 flex items-center gap-2">
              <Badge tone="accent">{modeLabel(game)}</Badge>
              {!game.me.connected && <Badge tone="warning">Reconnecting…</Badge>}
            </div>
            <h1 className="font-display text-2xl font-bold sm:text-3xl">{opponent ? 'Your opponent is here' : 'Waiting for a friend'}</h1>
            <p className="mt-1 text-sm text-ink-muted">
              {opponent ? 'Ready up when you are. The match starts a few seconds after you are both ready.' : 'Send the room code or the invite link to whoever you want to play.'}
            </p>
          </div>
          <Button variant="ghost" size="sm" icon={<LogOut className="h-4 w-4" />} onClick={() => setLeaveOpen(true)} data-testid="leave-room">
            Leave room
          </Button>
        </header>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          {code ? (
            <InvitePanel code={code} />
          ) : (
            <Panel strong title="Private room">
              <p className="text-sm text-ink-muted">Waiting for the server to issue a room code…</p>
            </Panel>
          )}

          <div className="flex flex-col gap-4">
            <Panel
              title={
                <span className="inline-flex items-center gap-2">
                  <Users className="h-4 w-4 text-accent" aria-hidden /> Players
                </span>
              }
              subtitle={opponent ? '2 of 2 seats taken' : '1 of 2 seats taken'}
            >
              <div className="flex flex-col gap-3">
                <motion.div {...slotMotion}>
                  <PlayerSlot player={me} caption="You" status={readyStatus(me.ready)} highlight={me.ready} testId="lobby-player-me" />
                </motion.div>
                {opponent ? (
                  <motion.div key={opponent.id} {...slotMotion}>
                    <PlayerSlot player={opponent} caption="Opponent" status={readyStatus(opponent.ready)} highlight={opponent.ready} testId="lobby-player-opponent" />
                  </motion.div>
                ) : (
                  <EmptySlot message="Waiting for a friend to join…" />
                )}
              </div>
            </Panel>

            {countingDown ? (
              <CountdownBanner seconds={seconds} prefix="Starting in" doneLabel="Deploying fleets…" reducedMotion={reducedMotion} testId="lobby-countdown" />
            ) : (
              <Panel strong>
                <div className="flex flex-col gap-3">
                  <Button
                    size="lg"
                    fullWidth
                    variant={me.ready ? 'secondary' : 'primary'}
                    icon={me.ready ? <Hand className="h-5 w-5" /> : <Check className="h-5 w-5" />}
                    onClick={() => void toggleReady()}
                    loading={busy}
                    aria-pressed={me.ready}
                    data-testid="ready-toggle"
                  >
                    {me.ready ? 'Not ready' : 'Ready up'}
                  </Button>
                  <p className={cn('text-center text-xs', opponent ? 'text-ink-muted' : 'text-ink-dim')} aria-live="polite">
                    {!opponent
                      ? 'You can ready up now; the countdown begins once your friend joins and is ready too.'
                      : me.ready && !opponent.ready
                        ? `Waiting for ${opponent.displayName} to ready up…`
                        : !me.ready && opponent.ready
                          ? `${opponent.displayName} is ready. Your move!`
                          : 'Both players must be ready to start.'}
                  </p>
                </div>
              </Panel>
            )}

            <div className="flex items-start gap-3 rounded-2xl border border-line bg-white/[0.02] p-3 text-xs text-ink-muted">
              <Ship className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
              <p>
                <span className="font-semibold text-ink">Up next: deploy your fleet.</span> Drag ships around the board, {touch ? 'double-tap' : 'double-click or press R'} to rotate, then
                confirm. A random layout is ready if you are in a hurry.
              </p>
            </div>
          </div>
        </div>
      </div>

      <LeaveGameModal open={leaveOpen} onClose={() => setLeaveOpen(false)} mode={game.mode} stage="lobby" />
    </PageShell>
  );
}

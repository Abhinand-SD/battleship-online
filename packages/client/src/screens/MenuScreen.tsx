import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { motion, MotionConfig } from 'motion/react';
import { BarChart3, Settings, Trophy, UserPlus, WifiOff, type LucideIcon } from 'lucide-react';
import { useStore } from '../lib/store';
import { Avatar } from '../lib/avatars';
import { Badge } from '../components/ui/Badge';
import { PageShell } from '../components/ui/PageShell';
import { FriendsCard } from '../components/menu/FriendsCard';
import { MatchInProgressBanner } from '../components/menu/MatchInProgressBanner';
import { PracticeCard } from '../components/menu/PracticeCard';
import { QuickMatchCard } from '../components/menu/QuickMatchCard';
import { readMenuIntent, type MenuIntent } from '../components/menu/intent';
import { riseIn, staggerContainer, useMotionMode } from '../components/menu/motion';
import { useMenuActions } from '../components/menu/useMenuActions';
import { useOnlineStats } from '../components/menu/useOnlineStats';

const NAV_TILES: readonly { to: string; label: string; hint: string; icon: LucideIcon; testId: string }[] = [
  { to: '/stats', label: 'Your stats', hint: 'Record & achievements', icon: BarChart3, testId: 'nav-stats' },
  { to: '/leaderboard', label: 'Leaderboard', hint: 'Top-rated captains', icon: Trophy, testId: 'nav-leaderboard' },
  { to: '/settings', label: 'Settings', hint: 'Sound, motion, profile', icon: Settings, testId: 'nav-settings' },
];

/** Main hub: quick match, private rooms, practice, plus the user header and navigation tiles. */
export default function MenuScreen() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const user = useStore((s) => s.user);
  const game = useStore((s) => s.game);
  const connection = useStore((s) => s.connection);
  const motionMode = useMotionMode();
  const stats = useOnlineStats();
  const actions = useMenuActions();

  const [practiceOpen, setPracticeOpen] = useState(false);
  const friendsRef = useRef<HTMLDivElement>(null);
  const joinInputRef = useRef<HTMLInputElement>(null);
  const handledIntent = useRef<MenuIntent | null>(null);

  const intent = readMenuIntent(searchParams);
  const activeGame = game !== null && game.phase !== 'FINISHED';
  const { startQuickMatch } = actions;

  // Landing-page intents (`/play?quick=1` etc.) are handled once, then removed from the URL so a reload
  // does not repeat them. `quick` waits until the socket is connected.
  useEffect(() => {
    if (!intent || handledIntent.current === intent) return;
    if (intent === 'quick') {
      if (connection !== 'connected') return;
      handledIntent.current = intent;
      const { game: current, queue } = useStore.getState();
      const busy = current !== null && current.phase !== 'FINISHED';
      if (!busy && !queue.inQueue) void startQuickMatch();
    } else if (intent === 'friends') {
      handledIntent.current = intent;
      friendsRef.current?.scrollIntoView?.({ behavior: motionMode === 'always' ? 'auto' : 'smooth', block: 'start' });
      joinInputRef.current?.focus({ preventScroll: true });
    } else {
      handledIntent.current = intent;
      setPracticeOpen(true);
    }
    setSearchParams({}, { replace: true });
  }, [intent, connection, motionMode, startQuickMatch, setSearchParams]);

  return (
    <MotionConfig reducedMotion={motionMode}>
      <PageShell title="Play" width="lg">
        <motion.div variants={staggerContainer} initial="hidden" animate="show" className="flex flex-col gap-5 sm:gap-6">
          {user && (
            <motion.header variants={riseIn} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar id={user.avatar} size={52} ring />
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-widest text-ink-dim">Welcome aboard</p>
                  <h1 className="flex min-w-0 flex-wrap items-center gap-2 font-display text-2xl font-bold leading-tight">
                    <span className="truncate" data-testid="menu-display-name">
                      {user.displayName}
                    </span>
                    {user.isGuest && <Badge tone="neutral">Guest</Badge>}
                  </h1>
                </div>
              </div>
              {user.isGuest ? (
                <Link
                  to="/account"
                  className="inline-flex items-center gap-2 self-start rounded-xl border border-line-strong bg-accent-soft/40 px-3 py-2 text-sm font-medium text-ink transition-colors hover:border-accent/60 hover:bg-accent-soft sm:self-auto"
                  data-testid="menu-create-account"
                >
                  <UserPlus className="h-4 w-4 text-accent" aria-hidden />
                  <span>
                    Create account <span className="hidden text-ink-muted sm:inline">· keep your stats</span>
                  </span>
                </Link>
              ) : (
                <Link to="/account" className="self-start text-sm text-ink-muted hover:text-ink sm:self-auto">
                  Manage account
                </Link>
              )}
            </motion.header>
          )}

          {connection !== 'connected' && (
            <motion.p
              variants={riseIn}
              role="status"
              className="flex items-center gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200"
              data-testid="menu-offline-hint"
            >
              <WifiOff className="h-4 w-4 shrink-0" aria-hidden />
              {connection === 'connecting' || connection === 'disconnected'
                ? 'Reconnecting to the game server… matchmaking unlocks as soon as we are back online.'
                : 'Not connected to the game server. Matchmaking is paused until the connection is restored.'}
            </motion.p>
          )}

          {activeGame && game && (
            <motion.div variants={riseIn}>
              <MatchInProgressBanner game={game} leaving={actions.pending === 'leave'} onReturn={() => navigate('/game')} onLeave={actions.leaveGame} />
            </motion.div>
          )}

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <motion.div variants={riseIn} className="flex min-w-0">
              <QuickMatchCard
                pending={actions.pending}
                canStart={actions.canStart}
                blockedReason={actions.blockedReason}
                stats={stats}
                onStart={() => void actions.startQuickMatch()}
                onCancel={() => void actions.cancelQuickMatch()}
              />
            </motion.div>
            <motion.div variants={riseIn} ref={friendsRef} className="flex min-w-0 scroll-mt-20">
              <FriendsCard
                pending={actions.pending}
                canStart={actions.canStart}
                blockedReason={actions.blockedReason}
                onCreate={() => void actions.createRoom()}
                onJoin={actions.joinRoom}
                joinInputRef={joinInputRef}
              />
            </motion.div>
            <motion.div variants={riseIn} className="flex min-w-0 md:col-span-2 lg:col-span-1">
              <PracticeCard
                open={practiceOpen}
                pending={actions.pending}
                canStart={actions.canStart}
                blockedReason={actions.blockedReason}
                onOpen={() => setPracticeOpen(true)}
                onClose={() => setPracticeOpen(false)}
                onStart={(difficulty) => void actions.startPractice(difficulty)}
              />
            </motion.div>
          </div>

          <motion.nav variants={riseIn} aria-label="More" className="grid grid-cols-3 gap-2 sm:gap-3">
            {NAV_TILES.map((tile) => (
              <Link
                key={tile.to}
                to={tile.to}
                className="glass flex min-w-0 flex-col items-center gap-1.5 rounded-2xl px-2 py-3 text-center transition-colors hover:border-accent/50 sm:flex-row sm:items-center sm:gap-3 sm:px-4 sm:text-left"
                data-testid={tile.testId}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
                  <tile.icon className="h-4 w-4" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-xs font-semibold sm:text-sm">{tile.label}</span>
                  <span className="hidden truncate text-xs text-ink-muted sm:block">{tile.hint}</span>
                </span>
              </Link>
            ))}
          </motion.nav>
        </motion.div>
      </PageShell>
    </MotionConfig>
  );
}

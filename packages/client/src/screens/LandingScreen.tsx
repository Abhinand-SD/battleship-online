import { Link, useNavigate } from 'react-router';
import { motion, MotionConfig } from 'motion/react';
import { ArrowRight, BarChart3, Bot, Link2, Settings, Swords, Trophy, Users, Zap, type LucideIcon } from 'lucide-react';
import { useStore } from '../lib/store';
import { Avatar } from '../lib/avatars';
import { cn } from '../lib/utils';
import { Button } from '../components/ui/Button';
import { ConnectionStatus } from '../components/ui/ConnectionStatus';
import { Logo, LogoMark } from '../components/ui/Logo';
import { PageShell } from '../components/ui/PageShell';
import { SonarPulse } from '../components/ui/Spinner';
import { riseIn, staggerContainer, useMotionMode } from '../components/menu/motion';
import { useOnlineStats } from '../components/menu/useOnlineStats';

interface Feature {
  icon: LucideIcon;
  title: string;
  text: string;
}

const FEATURES: readonly Feature[] = [
  { icon: Link2, title: 'Private rooms', text: 'Create a room, send the invite link, and your friend drops straight into the lobby.' },
  { icon: Zap, title: 'Quick match', text: 'One tap pairs you with the next captain in the queue. Rated, with a 45-second shot clock.' },
  { icon: Bot, title: 'Three AI admirals', text: 'Easy fires at random, Medium hunts around hits, Hard targets by probability.' },
  { icon: Trophy, title: 'Stats & leaderboard', text: 'Accuracy, streaks, rating and achievements, tracked across every match you play.' },
];

/** Decorative mini board for the hero on larger screens. */
const PREVIEW: readonly string[] = [
  '......', '.SSS..', '....X.', '.o..X.', '...oS.', 'o.....',
];

function PreviewBoard() {
  return (
    <div aria-hidden className="relative mx-auto w-full max-w-[20rem]">
      <div className="absolute -inset-6 rounded-[2rem] bg-accent/10 blur-2xl" />
      <div className="glass relative rounded-2xl p-4">
        <div className="mb-3 flex items-center justify-between text-[10px] font-semibold uppercase tracking-widest text-ink-dim">
          <span>Enemy waters</span>
          <span className="flex items-center gap-1 text-accent">
            <SonarPulse /> Your turn
          </span>
        </div>
        <div className="grid grid-cols-6 gap-1.5">
          {PREVIEW.flatMap((row, y) =>
            row.split('').map((c, x) => (
              <div key={`${x}-${y}`} className={cn('cell', c === 'S' && 'cell-ship', c === 'X' && 'cell-hit', c === 'o' && 'cell-miss')} />
            )),
          )}
        </div>
      </div>
    </div>
  );
}

export default function LandingScreen() {
  const navigate = useNavigate();
  const user = useStore((s) => s.user);
  const game = useStore((s) => s.game);
  const motionMode = useMotionMode();
  const stats = useOnlineStats();
  const activeGame = game !== null && game.phase !== 'FINISHED';

  return (
    <MotionConfig reducedMotion={motionMode}>
      <PageShell hideNav width="xl">
        <header className="flex h-16 items-center justify-between gap-3">
          <Link to="/" aria-label="Battleship Online home" className="shrink-0">
            <Logo compact className="sm:hidden" />
            <Logo className="max-sm:hidden" />
          </Link>
          <nav aria-label="Secondary" className="flex items-center gap-2 sm:gap-3">
            <ConnectionStatus compact className="sm:hidden" />
            <ConnectionStatus className="max-sm:hidden" />
            <Link to="/leaderboard" className="hidden text-sm text-ink-muted hover:text-ink md:inline">
              Leaderboard
            </Link>
            {user && (
              <Link
                to="/account"
                className="flex items-center gap-2 rounded-full border border-line bg-white/5 py-1 pl-1 pr-3 text-xs font-semibold hover:border-accent/50"
                aria-label={`Account: ${user.displayName}`}
              >
                <Avatar id={user.avatar} size={26} />
                <span className="max-w-[6rem] truncate">{user.displayName}</span>
              </Link>
            )}
          </nav>
        </header>

        <motion.section
          variants={staggerContainer}
          initial="hidden"
          animate="show"
          className="grid items-center gap-10 py-8 sm:py-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:gap-14"
          aria-labelledby="hero-title"
        >
          <div className="flex min-w-0 flex-col items-start gap-6">
            <motion.span variants={riseIn} className="inline-flex items-center gap-2 rounded-full border border-line bg-white/[0.04] px-3 py-1 text-xs font-medium text-ink-muted">
              <LogoMark size={18} />
              Free · no download · plays in your browser
            </motion.span>
            <motion.h1 variants={riseIn} id="hero-title" className="font-display text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
              Battleship <span className="text-accent text-glow">Online</span>
            </motion.h1>
            <motion.p variants={riseIn} className="max-w-xl text-base leading-relaxed text-ink-muted sm:text-lg">
              Sink the enemy fleet before they sink yours. Real-time one-on-one naval combat against friends, strangers or the AI, with
              reconnection, stats and a global leaderboard.
            </motion.p>

            {activeGame && (
              <motion.div variants={riseIn} className="glass-strong flex w-full flex-col gap-3 rounded-2xl border-accent/40 p-4 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <SonarPulse className="ml-1" />
                  <div className="min-w-0">
                    <p className="font-display text-sm font-semibold">You have a match in progress</p>
                    <p className="truncate text-xs text-ink-muted">{game.opponent ? `vs ${game.opponent.displayName}` : 'Your room is waiting for an opponent'}</p>
                  </div>
                </div>
                <Button size="lg" icon={<Swords className="h-5 w-5" aria-hidden />} onClick={() => navigate('/game')} data-testid="landing-return-to-match">
                  Return to match
                </Button>
              </motion.div>
            )}

            <motion.div variants={riseIn} className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap">
              <Button size="xl" icon={<Zap className="h-5 w-5" aria-hidden />} onClick={() => navigate('/play?quick=1')} data-testid="cta-play-online" className="w-full sm:w-auto">
                Play online
              </Button>
              <Button size="xl" variant="secondary" icon={<Users className="h-5 w-5" aria-hidden />} onClick={() => navigate('/play?friends=1')} data-testid="cta-play-friends" className="w-full sm:w-auto">
                Play with friends
              </Button>
              <Button size="xl" variant="subtle" icon={<Bot className="h-5 w-5" aria-hidden />} onClick={() => navigate('/play?practice=1')} data-testid="cta-practice" className="w-full sm:w-auto">
                Practice vs AI
              </Button>
            </motion.div>

            {stats && (
              <motion.p
                variants={riseIn}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-line bg-white/[0.03] px-3 py-2 text-xs text-ink-muted"
                data-testid="online-strip"
                aria-live="polite"
              >
                <span className="inline-flex items-center gap-2">
                  <SonarPulse />
                  <span className="font-semibold text-ink">{stats.onlineUsers}</span> {stats.onlineUsers === 1 ? 'captain' : 'captains'} online
                </span>
                <span>
                  <span className="font-semibold text-ink">{stats.activeGames}</span> {stats.activeGames === 1 ? 'battle' : 'battles'} under way
                </span>
                <span>
                  <span className="font-semibold text-ink">{stats.queueLength}</span> searching
                </span>
              </motion.p>
            )}
          </div>

          <motion.div variants={riseIn} className="hidden lg:block">
            <PreviewBoard />
          </motion.div>
        </motion.section>

        <section aria-labelledby="how-title" className="py-6 sm:py-10">
          <h2 id="how-title" className="mb-4 text-xs font-semibold uppercase tracking-widest text-ink-dim">
            How it works
          </h2>
          <motion.ul variants={staggerContainer} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.2 }} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <motion.li key={f.title} variants={riseIn} className="glass flex min-w-0 gap-3 rounded-2xl p-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
                  <f.icon className="h-5 w-5" aria-hidden />
                </span>
                <div className="min-w-0">
                  <h3 className="font-display text-sm font-semibold">{f.title}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-ink-muted">{f.text}</p>
                </div>
              </motion.li>
            ))}
          </motion.ul>
        </section>

        <footer className="mt-4 flex flex-col gap-4 border-t border-line/60 py-6 text-sm text-ink-muted sm:flex-row sm:items-center sm:justify-between">
          <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2">
            <Link to="/leaderboard" className="inline-flex items-center gap-1.5 hover:text-ink">
              <Trophy className="h-4 w-4" aria-hidden /> Leaderboard
            </Link>
            <Link to="/stats" className="inline-flex items-center gap-1.5 hover:text-ink">
              <BarChart3 className="h-4 w-4" aria-hidden /> Your stats
            </Link>
            <Link to="/settings" className="inline-flex items-center gap-1.5 hover:text-ink">
              <Settings className="h-4 w-4" aria-hidden /> Settings
            </Link>
          </nav>
          <Link to="/play" className="inline-flex items-center gap-1 text-accent hover:underline">
            Open the play menu <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </footer>
      </PageShell>
    </MotionConfig>
  );
}

import { useMemo } from 'react';
import { motion } from 'motion/react';
import { Handshake, Skull, Trophy } from 'lucide-react';
import type { GameSnapshot } from '@battleship/shared';
import { cn, formatClock } from '../../lib/utils';
import { modeLabel, opponentName } from './battleModel';
import { resultHeadline, resultKind, resultTitle, type ResultKind } from './resultsModel';
import { useReducedMotionPref } from './useReducedMotionPref';

const PARTICLE_COUNT = 36;
const PARTICLE_COLORS = ['#22d3ee', '#5eead4', '#ff6a3d', '#fbbf24', '#e6edf7', '#a78bfa'];

/** Deterministic PRNG so the particle layout is stable across re-renders (mulberry32). */
function seeded(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

interface Particle {
  left: number;
  size: number;
  color: string;
  delay: number;
  duration: number;
  drift: number;
  rotate: number;
  round: boolean;
}

function makeParticles(seed: number): Particle[] {
  const rnd = seeded(seed);
  return Array.from({ length: PARTICLE_COUNT }, () => ({
    left: rnd() * 100,
    size: 5 + rnd() * 6,
    color: PARTICLE_COLORS[Math.floor(rnd() * PARTICLE_COLORS.length)] ?? '#22d3ee',
    delay: rnd() * 1.6,
    duration: 2.6 + rnd() * 1.8,
    drift: (rnd() - 0.5) * 80,
    rotate: (rnd() - 0.5) * 720,
    round: rnd() > 0.6,
  }));
}

/** Subtle falling particles behind the victory banner. Decorative only; skipped under reduced motion. */
function Confetti({ seed }: { seed: number }) {
  const particles = useMemo(() => makeParticles(seed), [seed]);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl" aria-hidden data-testid="confetti">
      {particles.map((p, i) => (
        <motion.span
          key={i}
          className="absolute top-0 block"
          style={{ left: `${p.left}%`, width: p.size, height: p.size * (p.round ? 1 : 0.55), background: p.color, borderRadius: p.round ? 999 : 2, opacity: 0 }}
          initial={{ y: -16, x: 0, rotate: 0, opacity: 0 }}
          animate={{ y: 420, x: p.drift, rotate: p.rotate, opacity: [0, 0.9, 0.9, 0] }}
          transition={{ delay: p.delay, duration: p.duration, ease: 'easeIn', repeat: 1, repeatDelay: 0.4 }}
        />
      ))}
    </div>
  );
}

const kindStyles: Record<ResultKind, { frame: string; icon: string; title: string }> = {
  victory: { frame: 'border-accent/50 shadow-glow-strong', icon: 'from-accent to-accent-deep text-ocean-950', title: 'text-accent text-glow' },
  defeat: { frame: 'border-rose-500/40', icon: 'from-rose-400 to-rose-800 text-white', title: 'text-rose-300' },
  draw: { frame: 'border-line-strong', icon: 'from-slate-300 to-slate-600 text-ocean-950', title: 'text-ink' },
};

const kindIcon = { victory: Trophy, defeat: Skull, draw: Handshake } as const;

/** Hero banner: result kind, headline by end reason, and the match context line. */
export function ResultHero({ game }: { game: GameSnapshot }) {
  const result = game.result;
  const kind = resultKind(result);
  const reduced = useReducedMotionPref();
  const styles = kindStyles[kind];
  const Icon = kindIcon[kind];
  const seed = useMemo(() => Array.from(game.gameId).reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) | 0, 7), [game.gameId]);
  const context = [
    `vs ${opponentName(game)}`,
    modeLabel(game),
    result && result.reason !== 'CANCELLED' ? formatClock(result.durationMs) : null,
  ].filter(Boolean);

  return (
    <motion.section
      className={cn('glass-strong relative overflow-hidden rounded-2xl border px-5 py-7 text-center sm:px-8 sm:py-9', styles.frame)}
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 18, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 26 }}
      data-testid="result-banner"
      data-result={kind}
      data-reason={result?.reason ?? 'CANCELLED'}
      aria-labelledby="result-title"
    >
      {kind === 'victory' && !reduced && <Confetti seed={seed} />}
      <motion.div
        className={cn('relative mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br shadow-glow sm:h-20 sm:w-20', styles.icon)}
        initial={reduced ? false : { scale: 0.6, rotate: -12, opacity: 0 }}
        animate={{ scale: 1, rotate: 0, opacity: 1 }}
        transition={{ delay: 0.12, type: 'spring', stiffness: 320, damping: 18 }}
        aria-hidden
      >
        <Icon className="h-8 w-8 sm:h-10 sm:w-10" strokeWidth={2.2} />
      </motion.div>
      <p className={cn('relative font-display text-xs font-semibold uppercase tracking-[0.3em]', styles.title)}>{resultTitle(result)}</p>
      <h1 id="result-title" className="relative mt-2 font-display text-2xl font-bold text-ink sm:text-4xl">
        {resultHeadline(result)}
      </h1>
      <p className="relative mt-3 text-sm text-ink-muted">{context.join(' · ')}</p>
    </motion.section>
  );
}

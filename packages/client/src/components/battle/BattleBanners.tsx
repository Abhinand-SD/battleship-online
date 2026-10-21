import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Anchor, Swords, WifiOff } from 'lucide-react';
import type { GameSnapshot } from '@battleship/shared';
import { useCountdown } from '../../lib/time';
import { cn, formatClock } from '../../lib/utils';
import { firstTurnLabel, latestShot, sunkBannerText } from './battleModel';
import { useReducedMotionPref } from './useReducedMotionPref';

const FIRST_TURN_MS = 2_500;
const SUNK_MS = 2_000;

type Tone = 'accent' | 'hit' | 'warning';

interface Banner {
  id: string;
  tone: Tone;
  text: string;
  testId: string;
}

const toneClass: Record<Tone, string> = {
  accent: 'border-accent/40 bg-accent-soft text-ink',
  hit: 'border-hit/50 bg-hit/15 text-orange-100',
  warning: 'border-amber-400/40 bg-amber-400/10 text-amber-100',
};

const toneIcon: Record<Tone, typeof Anchor> = { accent: Swords, hit: Anchor, warning: WifiOff };

/**
 * Transient battle notices derived from the snapshot stream:
 * who fires first (battle start), a ship sinking (keyed on the move number) and an opponent disconnection
 * with the time they have left to return.
 */
export function useBattleBanners(game: GameSnapshot): Banner[] {
  const [first, setFirst] = useState<string | null>(null);
  const [sunk, setSunk] = useState<{ key: number; text: string } | null>(null);

  // "You fire first" only when the battle actually starts in front of us (not after a reload mid-battle).
  const historyLen = game.history.length;
  useEffect(() => {
    if (game.phase !== 'IN_BATTLE' || historyLen > 0) return;
    const label = firstTurnLabel(game.turn);
    if (!label) return;
    setFirst(label);
    const id = window.setTimeout(() => setFirst(null), FIRST_TURN_MS);
    return () => window.clearTimeout(id);
    // Re-run only when the battle (re)starts, not on every turn change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.gameId, game.phase]);

  const latest = latestShot(game.history);
  const latestMove = latest?.moveNumber ?? 0;
  const seenMove = useRef(latestMove);
  useEffect(() => {
    if (latestMove === seenMove.current) return;
    seenMove.current = latestMove;
    const text = sunkBannerText(latest);
    if (!text) return;
    setSunk({ key: latestMove, text });
    const id = window.setTimeout(() => setSunk((cur) => (cur?.key === latestMove ? null : cur)), SUNK_MS);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestMove]);

  const disconnected = game.opponent != null && !game.opponent.connected;
  const reconnectMs = useCountdown(disconnected ? game.opponentReconnectDeadline : null, 500);

  const banners: Banner[] = [];
  if (disconnected) {
    banners.push({
      id: 'disconnected',
      tone: 'warning',
      testId: 'opponent-disconnected',
      text:
        reconnectMs != null
          ? `Opponent disconnected — they have ${formatClock(reconnectMs)} to return`
          : 'Opponent disconnected — waiting for them to return',
    });
  }
  if (sunk) banners.push({ id: `sunk-${sunk.key}`, tone: 'hit', text: sunk.text, testId: 'sunk-banner' });
  if (first) banners.push({ id: 'first-turn', tone: 'accent', text: first, testId: 'first-turn-banner' });
  return banners;
}

/** Stack of animated banners above the boards. */
export function BattleBanners({ game, className }: { game: GameSnapshot; className?: string }) {
  const banners = useBattleBanners(game);
  const reduced = useReducedMotionPref();
  return (
    <div className={cn('flex flex-col gap-2', className)} aria-live="polite" aria-atomic="false">
      <AnimatePresence initial={false}>
        {banners.map((b) => {
          const Icon = toneIcon[b.tone];
          return (
            <motion.div
              key={b.id}
              role="status"
              data-testid={b.testId}
              className={cn('flex items-center justify-center gap-2 rounded-xl border px-4 py-2 text-center text-sm font-semibold backdrop-blur-sm', toneClass[b.tone])}
              initial={reduced ? { opacity: 0 } : { opacity: 0, y: -10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden />
              <span>{b.text}</span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

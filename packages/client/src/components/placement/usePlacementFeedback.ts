import { useEffect, useRef, useState } from 'react';
import { coordKey } from '@battleship/shared';
import { playSound } from '../../lib/audio';
import type { Feedback } from './usePlacement';

const NONE: ReadonlySet<string> = new Set();

/**
 * Turns reducer feedback into sound + a short red flash: accepted placements play 'place', rejected ones play
 * 'error' and return the affected cell keys for `flashMs`. Keyed on `feedback.seq` so identical consecutive
 * rejections still flash again.
 */
export function usePlacementFeedback(feedback: Feedback | null, flashMs = 450): ReadonlySet<string> {
  const [flash, setFlash] = useState<ReadonlySet<string>>(NONE);
  const lastSeq = useRef(0);

  useEffect(() => {
    if (!feedback || feedback.seq === lastSeq.current) return;
    lastSeq.current = feedback.seq;
    if (feedback.kind === 'placed') {
      playSound('place');
      setFlash(NONE);
      return;
    }
    playSound('error');
    setFlash(new Set(feedback.cells.map(coordKey)));
    const id = window.setTimeout(() => setFlash(NONE), flashMs);
    return () => window.clearTimeout(id);
  }, [feedback, flashMs]);

  return flash;
}

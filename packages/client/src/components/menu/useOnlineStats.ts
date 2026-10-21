import { useEffect, useState } from 'react';
import { api } from '../../lib/api';

export interface OnlineStats {
  onlineUsers: number;
  activeGames: number;
  queueLength: number;
}

/**
 * Polls `GET /api/stats/online`. Returns `null` until the first successful response and again after
 * any failure, so callers simply hide the strip when there is nothing reliable to show. Polling pauses
 * while the tab is hidden and refreshes as soon as it becomes visible again.
 */
export function useOnlineStats(intervalMs = 15_000): OnlineStats | null {
  const [stats, setStats] = useState<OnlineStats | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      try {
        const res = await api.online();
        if (active) setStats({ onlineUsers: res.onlineUsers, activeGames: res.activeGames, queueLength: res.queueLength });
      } catch {
        if (active) setStats(null);
      }
    };
    void load();
    const id = window.setInterval(() => void load(), intervalMs);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      active = false;
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [intervalMs]);

  return stats;
}

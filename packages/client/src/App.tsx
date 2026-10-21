import { useEffect, useRef, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router';
import { api, ApiRequestError } from './lib/api';
import { connectSocket, reconnectSocket } from './lib/socket';
import { useStore } from './lib/store';
import { Backdrop } from './components/ui/Backdrop';
import { Toasts } from './components/ui/Toasts';
import { Spinner } from './components/ui/Spinner';
import LandingScreen from './screens/LandingScreen';
import MenuScreen from './screens/MenuScreen';
import GameScreen from './screens/GameScreen';
import JoinScreen from './screens/JoinScreen';
import StatsScreen from './screens/StatsScreen';
import LeaderboardScreen from './screens/LeaderboardScreen';
import SettingsScreen from './screens/SettingsScreen';
import AccountScreen from './screens/AccountScreen';
import NotFoundScreen from './screens/NotFoundScreen';

/**
 * Ensures the visitor has an identity (guest token or account), then opens the realtime connection.
 * Guest identities are created automatically on first visit.
 */
function useBootstrap(): void {
  const token = useStore((s) => s.token);
  const authStatus = useStore((s) => s.authStatus);
  const connection = useStore((s) => s.connection);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const store = useStore.getState();
    store.setAuthStatus('loading');
    (async () => {
      try {
        if (store.token) {
          try {
            const { user } = await api.me();
            store.setUser(user);
            store.setAuthStatus('ready');
          } catch (err) {
            if (err instanceof ApiRequestError && (err.status === 401 || err.status === 404)) {
              store.clearAuth();
              const res = await api.guest();
              store.setAuth(res.token, res.user);
            } else {
              throw err;
            }
          }
        } else {
          const res = await api.guest();
          store.setAuth(res.token, res.user);
        }
      } catch (err) {
        store.setAuthStatus('error', err instanceof Error ? err.message : 'Unable to reach the server');
      }
    })();
  }, []);

  // (Re)connect whenever a token becomes available / changes.
  useEffect(() => {
    if (authStatus === 'ready' && token) reconnectSocket();
  }, [token, authStatus]);

  // If the server rejected the token (e.g. secret rotated), get a fresh guest identity.
  useEffect(() => {
    if (connection !== 'unauthorized') return;
    const store = useStore.getState();
    store.clearAuth();
    void api.guest().then((res) => {
      store.setAuth(res.token, res.user);
      connectSocket();
    });
  }, [connection]);
}

/** Navigates to the game when a new match starts and back to the menu when it disappears. */
function GameNavigator() {
  const gameId = useStore((s) => s.game?.gameId ?? null);
  const phase = useStore((s) => s.game?.phase ?? null);
  const location = useLocation();
  const navigate = useNavigate();
  const prevGameId = useRef<string | null>(null);
  const prevPhase = useRef<string | null>(null);

  useEffect(() => {
    const onGameRoute = location.pathname.startsWith('/game');
    const isNewGame = gameId !== prevGameId.current;
    const startedPlaying = phase !== prevPhase.current && (phase === 'PLACING_SHIPS' || phase === 'IN_BATTLE');
    if (gameId && !onGameRoute && (isNewGame || startedPlaying) && !location.pathname.startsWith('/join')) {
      navigate('/game');
    }
    if (!gameId && onGameRoute && prevGameId.current) {
      navigate('/play');
    }
    prevGameId.current = gameId;
    prevPhase.current = phase;
  }, [gameId, phase, location.pathname, navigate]);
  return null;
}

function BootGate({ children }: { children: ReactNode }) {
  const authStatus = useStore((s) => s.authStatus);
  const authError = useStore((s) => s.authError);
  if (authStatus === 'error') {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="font-display text-xl font-semibold">Can’t reach the game server</p>
        <p className="max-w-sm text-sm text-ink-muted">{authError}</p>
        <button className="rounded-xl border border-line px-4 py-2 text-sm hover:border-accent/60" onClick={() => window.location.reload()}>
          Retry
        </button>
      </div>
    );
  }
  if (authStatus !== 'ready') {
    return (
      <div className="flex min-h-dvh items-center justify-center" data-testid="boot-loading">
        <Spinner size={56} />
      </div>
    );
  }
  return <>{children}</>;
}

export default function App() {
  useBootstrap();
  return (
    <>
      <Backdrop />
      <Toasts />
      <BootGate>
        <GameNavigator />
        <Routes>
          <Route path="/" element={<LandingScreen />} />
          <Route path="/play" element={<MenuScreen />} />
          <Route path="/game" element={<GameScreen />} />
          <Route path="/join/:code" element={<JoinScreen />} />
          <Route path="/stats" element={<StatsScreen />} />
          <Route path="/leaderboard" element={<LeaderboardScreen />} />
          <Route path="/settings" element={<SettingsScreen />} />
          <Route path="/account" element={<AccountScreen />} />
          <Route path="/menu" element={<Navigate to="/play" replace />} />
          <Route path="*" element={<NotFoundScreen />} />
        </Routes>
      </BootGate>
    </>
  );
}

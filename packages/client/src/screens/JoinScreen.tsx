import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { errorMessage, rt } from '../lib/socket';
import { toast, useStore } from '../lib/store';
import { PageShell } from '../components/ui/PageShell';
import { Spinner } from '../components/ui/Spinner';
import { Button } from '../components/ui/Button';
import { formatRoomCode } from '../lib/utils';

/** Deep link target for invite URLs: /join/ABC123 joins the room once connected. */
export default function JoinScreen() {
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const connection = useStore((s) => s.connection);
  const game = useStore((s) => s.game);
  const [error, setError] = useState<string | null>(null);
  const attempted = useRef(false);
  const normalized = code.toUpperCase().replace(/[^A-Z0-9]/g, '');

  useEffect(() => {
    if (connection !== 'connected' || attempted.current) return;
    if (game && game.roomCode === normalized) {
      navigate('/game', { replace: true });
      return;
    }
    attempted.current = true;
    (async () => {
      try {
        if (game && game.phase === 'FINISHED') await rt.leaveGame();
        await rt.joinRoom(normalized);
        navigate('/game', { replace: true });
      } catch (err) {
        setError(errorMessage(err));
        toast('error', 'Could not join room', errorMessage(err));
      }
    })();
  }, [connection, normalized, navigate, game]);

  return (
    <PageShell back="/play" width="md">
      <div className="flex flex-col items-center justify-center gap-5 py-20 text-center">
        {error ? (
          <>
            <p className="font-display text-xl font-semibold">Couldn’t join room {formatRoomCode(normalized)}</p>
            <p className="max-w-sm text-sm text-ink-muted">{error}</p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => navigate('/play')}>
                Back to menu
              </Button>
              <Button
                onClick={() => {
                  attempted.current = false;
                  setError(null);
                }}
              >
                Try again
              </Button>
            </div>
          </>
        ) : (
          <>
            <Spinner size={56} />
            <p className="font-display text-lg">Joining room {formatRoomCode(normalized)}…</p>
            <p className="text-sm text-ink-muted">{connection === 'connected' ? 'Entering the lobby' : 'Connecting to the game server'}</p>
          </>
        )}
      </div>
    </PageShell>
  );
}

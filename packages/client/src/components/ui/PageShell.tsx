import type { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { ArrowLeft, Swords } from 'lucide-react';
import { useStore } from '../../lib/store';
import { Avatar } from '../../lib/avatars';
import { cn } from '../../lib/utils';
import { ConnectionStatus } from './ConnectionStatus';
import { Logo } from './Logo';
import { Button } from './Button';

export interface PageShellProps {
  children: ReactNode;
  /** Back link target; renders a back arrow when set. */
  back?: string;
  title?: ReactNode;
  /** Max width class for the content column. */
  width?: 'md' | 'lg' | 'xl' | 'full';
  className?: string;
  hideNav?: boolean;
}

const widths = { md: 'max-w-3xl', lg: 'max-w-5xl', xl: 'max-w-7xl', full: 'max-w-none' };

/** Standard page layout: top bar (logo, return-to-match, profile chip, connection) + content column. */
export function PageShell({ children, back, title, width = 'lg', className, hideNav }: PageShellProps) {
  const user = useStore((s) => s.user);
  const game = useStore((s) => s.game);
  const location = useLocation();
  const navigate = useNavigate();
  const inGameRoute = location.pathname.startsWith('/game');
  const showReturn = game && !inGameRoute && game.phase !== 'FINISHED';

  return (
    <div className="flex min-h-dvh flex-col">
      {!hideNav && (
        <header className="sticky top-0 z-40 border-b border-line/60 bg-ocean-950/70 backdrop-blur-md">
          <div className={cn('mx-auto flex h-14 items-center justify-between gap-3 px-4', widths[width])}>
            <div className="flex min-w-0 items-center gap-2">
              {back ? (
                <button onClick={() => navigate(back)} className="rounded-lg p-1.5 text-ink-muted hover:bg-white/5 hover:text-ink" aria-label="Back">
                  <ArrowLeft className="h-5 w-5" />
                </button>
              ) : null}
              <Link to="/" className="shrink-0">
                <Logo compact className="sm:hidden" />
                <Logo className="max-sm:hidden" />
              </Link>
              {title && <span className="hidden truncate text-sm text-ink-muted md:inline">/ {title}</span>}
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              {showReturn && (
                <Button size="sm" variant="secondary" icon={<Swords className="h-3.5 w-3.5" />} onClick={() => navigate('/game')} data-testid="return-to-match">
                  <span className="hidden sm:inline">Return to match</span>
                  <span className="sm:hidden">Match</span>
                </Button>
              )}
              <ConnectionStatus compact className="sm:hidden" />
              <ConnectionStatus className="max-sm:hidden" />
              {user && (
                <Link to="/settings" className="flex items-center gap-2 rounded-full border border-line bg-white/5 py-1 pl-1 pr-3 hover:border-accent/50" data-testid="profile-chip">
                  <Avatar id={user.avatar} size={26} />
                  <span className="max-w-[7rem] truncate text-xs font-semibold">{user.displayName}</span>
                </Link>
              )}
            </div>
          </div>
        </header>
      )}
      <main className={cn('mx-auto w-full flex-1 px-4 py-5 sm:py-8 safe-bottom', widths[width], className)}>{children}</main>
    </div>
  );
}

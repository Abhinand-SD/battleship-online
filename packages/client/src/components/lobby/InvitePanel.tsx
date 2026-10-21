import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Link2, Share2 } from 'lucide-react';
import { toast } from '../../lib/store';
import { copyToClipboard, formatRoomCode, inviteUrl } from '../../lib/utils';
import { Button } from '../ui/Button';
import { Panel } from '../ui/Panel';

type Copied = 'code' | 'link' | null;

function canWebShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

/** Room code (large, copyable) plus the invite link with copy / native share actions. */
export function InvitePanel({ code }: { code: string }) {
  const [copied, setCopied] = useState<Copied>(null);
  const timer = useRef<number | null>(null);
  const link = inviteUrl(code);
  const shareSupported = canWebShare();

  useEffect(() => {
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  const copy = async (what: Exclude<Copied, null>) => {
    const ok = await copyToClipboard(what === 'code' ? code : link);
    if (!ok) {
      toast('error', 'Copy failed', 'Select the text and copy it manually.');
      return;
    }
    setCopied(what);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(null), 1800);
  };

  const share = async () => {
    try {
      await navigator.share({ title: 'Battleship Online', text: `Join my Battleship room with code ${formatRoomCode(code)}`, url: link });
    } catch (err) {
      // The user dismissing the share sheet is not an error worth reporting.
      if (err instanceof DOMException && err.name === 'AbortError') return;
      await copy('link');
    }
  };

  return (
    <Panel strong title="Invite a friend" subtitle="Share the room code or the link. The match starts when you are both ready.">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-line bg-ocean-900/60 p-4 sm:flex-row sm:justify-between">
          <div className="text-center sm:text-left">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-dim">Room code</p>
            <p className="text-glow mt-1 select-all font-mono text-4xl font-bold tracking-[0.2em] text-accent sm:text-5xl" data-testid="room-code" aria-label={`Room code ${code.split('').join(' ')}`}>
              {formatRoomCode(code)}
            </p>
          </div>
          <Button
            variant={copied === 'code' ? 'secondary' : 'primary'}
            icon={copied === 'code' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            onClick={() => void copy('code')}
            aria-label="Copy room code"
            data-testid="copy-room-code"
          >
            {copied === 'code' ? 'Copied' : 'Copy code'}
          </Button>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-dim">Invite link</p>
          <div className="flex min-w-0 items-center gap-2 rounded-xl border border-line bg-ocean-900/70 px-3 py-2">
            <Link2 className="h-4 w-4 shrink-0 text-ink-dim" aria-hidden />
            <input
              readOnly
              value={link}
              aria-label="Invite link"
              data-testid="invite-link"
              className="min-w-0 flex-1 truncate bg-transparent font-mono text-xs text-ink-muted focus:outline-none"
              onFocus={(e) => e.currentTarget.select()}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon={copied === 'link' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              onClick={() => void copy('link')}
              aria-label="Copy invite link"
              data-testid="copy-invite-link"
            >
              {copied === 'link' ? 'Link copied' : 'Copy link'}
            </Button>
            {shareSupported && (
              <Button variant="secondary" size="sm" icon={<Share2 className="h-3.5 w-3.5" />} onClick={() => void share()} aria-label="Share invite" data-testid="share-invite">
                Share
              </Button>
            )}
          </div>
        </div>
      </div>
    </Panel>
  );
}

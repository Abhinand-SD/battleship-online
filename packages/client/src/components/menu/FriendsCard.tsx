import { useId, useState, type FormEvent, type RefObject } from 'react';
import { ArrowRight, Hash, Link2, Plus } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Panel } from '../ui/Panel';
import { describeRoomCodeProblem, extractRoomCode, formatRoomCodeInput } from './roomCode';
import type { JoinResult, MenuPending } from './useMenuActions';

export interface FriendsCardProps {
  pending: MenuPending | null;
  canStart: boolean;
  blockedReason: string | null;
  onCreate: () => void;
  onJoin: (code: string) => Promise<JoinResult | undefined>;
  /** Lets the screen focus the code field when arriving with `?friends=1`. */
  joinInputRef?: RefObject<HTMLInputElement | null>;
}

/** Private rooms: create one (invite link is shown in the lobby) or join with a code / pasted invite link. */
export function FriendsCard({ pending, canStart, blockedReason, onCreate, onJoin, joinInputRef }: FriendsCardProps) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const busy = pending !== null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const problem = describeRoomCodeProblem(code);
    if (problem) {
      setError(problem);
      joinInputRef?.current?.focus();
      return;
    }
    setError(null);
    const result = await onJoin(code);
    if (result && !result.ok) setError(result.message);
  };

  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <Link2 className="h-4 w-4 text-accent" aria-hidden />
          Play with friends
        </span>
      }
      subtitle="Private rooms with a 6-character code and a shareable invite link."
      className="flex flex-col"
      data-testid="card-friends"
    >
      <div className="flex flex-1 flex-col gap-4">
        <Button
          size="lg"
          fullWidth
          variant="primary"
          icon={<Plus className="h-5 w-5" aria-hidden />}
          loading={pending === 'create'}
          disabled={!canStart || (busy && pending !== 'create')}
          onClick={onCreate}
          data-testid="menu-create-room"
        >
          Create private room
        </Button>

        <div className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-wider text-ink-dim" aria-hidden>
          <span className="h-px flex-1 bg-line" />
          or join a room
          <span className="h-px flex-1 bg-line" />
        </div>

        <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-3" aria-label="Join a private room">
          <Input
            ref={joinInputRef}
            id={inputId}
            name="roomCode"
            label="Room code"
            placeholder="ABC-DEF or paste an invite link"
            value={formatRoomCodeInput(code)}
            onChange={(e) => {
              setCode(extractRoomCode(e.target.value));
              if (error) setError(null);
            }}
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            inputMode="text"
            enterKeyHint="go"
            aria-invalid={error ? true : undefined}
            error={error}
            hint={error ? undefined : 'Codes look like ABC-DEF. Invite links work too.'}
            leading={<Hash className="h-4 w-4" aria-hidden />}
            className="font-mono text-base uppercase tracking-[0.2em] placeholder:font-sans placeholder:normal-case placeholder:tracking-normal"
            data-testid="join-code-input"
          />
          <Button
            type="submit"
            variant="secondary"
            fullWidth
            iconRight={<ArrowRight className="h-4 w-4" aria-hidden />}
            loading={pending === 'join'}
            disabled={!canStart || (busy && pending !== 'join')}
            data-testid="join-room"
          >
            Join room
          </Button>
        </form>

        {!canStart && blockedReason && (
          <p className="text-center text-xs text-ink-dim" role="note">
            {blockedReason}
          </p>
        )}
      </div>
    </Panel>
  );
}

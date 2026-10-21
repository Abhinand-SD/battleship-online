import { useState } from 'react';
import { LogOut } from 'lucide-react';
import type { GameMode } from '@battleship/shared';
import { errorMessage, rt } from '../../lib/socket';
import { toast } from '../../lib/store';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';

export interface LeaveGameModalProps {
  open: boolean;
  onClose: () => void;
  mode: GameMode;
  /** 'lobby' = WAITING room, 'placement' = PLACING_SHIPS. Changes the wording. */
  stage: 'lobby' | 'placement';
}

function copyFor(mode: GameMode, stage: 'lobby' | 'placement'): { title: string; body: string; confirm: string } {
  if (mode === 'QUICK') {
    return {
      title: 'Leave the match?',
      body: 'Leaving a quick match now counts as a forfeit and your opponent is sent back to the menu.',
      confirm: 'Forfeit and leave',
    };
  }
  if (mode === 'PRACTICE') {
    return { title: 'Leave practice?', body: 'Your practice game will be discarded and you will return to the menu.', confirm: 'Leave practice' };
  }
  return {
    title: stage === 'lobby' ? 'Leave the room?' : 'Leave the match?',
    body:
      stage === 'lobby'
        ? 'You will return to the menu. Your friend keeps the room and can wait for someone else.'
        : 'The match will be cancelled before it starts and you will return to the menu.',
    confirm: 'Leave room',
  };
}

/** Confirmation dialog around `rt.leaveGame()`. The server clears the game, which navigates back to the menu. */
export function LeaveGameModal({ open, onClose, mode, stage }: LeaveGameModalProps) {
  const [busy, setBusy] = useState(false);
  const text = copyFor(mode, stage);

  const leave = async () => {
    setBusy(true);
    try {
      await rt.leaveGame();
      onClose();
    } catch (err) {
      toast('error', 'Could not leave', errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onClose}
      title={text.title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Stay
          </Button>
          <Button variant="danger" icon={<LogOut className="h-4 w-4" />} onClick={() => void leave()} loading={busy} data-testid="leave-confirm">
            {text.confirm}
          </Button>
        </>
      }
    >
      <p className="text-sm text-ink-muted">{text.body}</p>
    </Modal>
  );
}

import { Flag } from 'lucide-react';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';

export interface ForfeitDialogProps {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
  /** Practice games have no rating at stake; the copy adapts. */
  practice: boolean;
}

/** Confirmation before surrendering the match. The confirm button's name starts with "Forfeit". */
export function ForfeitDialog({ open, busy, onClose, onConfirm, practice }: ForfeitDialogProps) {
  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onClose}
      locked={busy}
      size="sm"
      title="Forfeit the match?"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy} data-testid="forfeit-cancel">
            Keep fighting
          </Button>
          <Button variant="danger" onClick={onConfirm} loading={busy} icon={<Flag className="h-4 w-4" aria-hidden />} data-testid="forfeit-confirm">
            Forfeit match
          </Button>
        </>
      }
    >
      <p className="text-sm text-ink-muted">
        {practice
          ? 'The practice match ends immediately and counts as a loss. Your rating is not affected.'
          : 'You will concede the match. It counts as a loss and your rating will drop accordingly.'}
      </p>
    </Modal>
  );
}

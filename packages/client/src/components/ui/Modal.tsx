import { useEffect, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface ModalProps {
  open: boolean;
  onClose?: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  /** Prevent closing via backdrop / escape. */
  locked?: boolean;
}

const sizes = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-2xl' };

export function Modal({ open, onClose, title, children, footer, size = 'md', locked = false }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !locked) onClose?.();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, locked, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ocean-950/70 p-3 backdrop-blur-sm sm:items-center sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !locked) onClose?.();
          }}
          role="dialog"
          aria-modal="true"
        >
          <motion.div
            className={cn('glass-strong w-full rounded-2xl p-5 sm:p-6', sizes[size])}
            initial={{ y: 24, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 16, opacity: 0, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          >
            {(title || (!locked && onClose)) && (
              <div className="mb-4 flex items-center justify-between gap-4">
                {title ? <h2 className="font-display text-lg font-semibold">{title}</h2> : <span />}
                {!locked && onClose && (
                  <button onClick={onClose} className="rounded-lg p-1.5 text-ink-muted hover:bg-white/5 hover:text-ink" aria-label="Close">
                    <X className="h-5 w-5" />
                  </button>
                )}
              </div>
            )}
            <div>{children}</div>
            {footer && <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

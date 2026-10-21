import { useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import { useStore, type Toast } from '../../lib/store';
import { cn } from '../../lib/utils';

const icons = { info: Info, success: CheckCircle2, warning: AlertTriangle, error: XCircle } as const;
const tones = {
  info: 'border-accent/40 text-accent',
  success: 'border-emerald-400/40 text-emerald-300',
  warning: 'border-amber-400/40 text-amber-300',
  error: 'border-rose-500/40 text-rose-300',
} as const;

function ToastItem({ toast }: { toast: Toast }) {
  const dismiss = useStore((s) => s.dismissToast);
  useEffect(() => {
    const id = window.setTimeout(() => dismiss(toast.id), toast.ttl);
    return () => window.clearTimeout(id);
  }, [toast.id, toast.ttl, dismiss]);
  const Icon = icons[toast.kind];
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.96 }}
      className={cn('glass-strong pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border px-4 py-3', tones[toast.kind])}
      role="status"
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">{toast.title}</p>
        {toast.message && <p className="mt-0.5 text-xs text-ink-muted">{toast.message}</p>}
      </div>
      <button onClick={() => dismiss(toast.id)} className="text-ink-dim hover:text-ink" aria-label="Dismiss">
        ×
      </button>
    </motion.div>
  );
}

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-3 sm:items-end sm:px-5">
      <AnimatePresence>
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} />
        ))}
      </AnimatePresence>
    </div>
  );
}

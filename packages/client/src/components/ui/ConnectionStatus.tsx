import { Wifi, WifiOff } from 'lucide-react';
import { useStore } from '../../lib/store';
import { cn } from '../../lib/utils';

const labels = {
  idle: 'Offline',
  connecting: 'Connecting…',
  connected: 'Connected',
  disconnected: 'Reconnecting…',
  unauthorized: 'Signed out',
} as const;

export function ConnectionStatus({ compact = false, className }: { compact?: boolean; className?: string }) {
  const status = useStore((s) => s.connection);
  const ok = status === 'connected';
  const warn = status === 'connecting' || status === 'disconnected';
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 text-xs font-medium', ok ? 'text-emerald-300' : warn ? 'text-amber-300' : 'text-rose-300', className)}
      title={labels[status]}
      data-testid="connection-status"
      data-status={status}
    >
      <span className={cn('relative inline-flex h-2 w-2 rounded-full', ok ? 'bg-emerald-400' : warn ? 'bg-amber-400 animate-pulse-soft' : 'bg-rose-400')} />
      {!compact && (ok ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />)}
      {!compact && <span>{labels[status]}</span>}
    </span>
  );
}

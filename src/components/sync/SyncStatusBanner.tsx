import { Cloud, CloudOff, Loader2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSync } from '@/contexts/SyncContext';

export default function SyncStatusBanner() {
  const { status, message, pendingChanges, isOnline } = useSync();

  if (status === 'unconfigured') return null;

  const show =
    !isOnline ||
    status === 'syncing' ||
    status === 'error' ||
    pendingChanges;

  if (!show) return null;

  let icon = <Cloud className="w-3.5 h-3.5 shrink-0" />;
  let text = message ?? 'All changes saved locally';
  let tone = 'bg-muted/80 text-muted-foreground border-border';

  if (!isOnline || status === 'offline') {
    icon = <CloudOff className="w-3.5 h-3.5 shrink-0" />;
    text = 'Offline — working from local storage';
    tone = 'bg-amber-500/10 text-amber-900 dark:text-amber-100 border-amber-500/20';
  } else if (status === 'syncing') {
    icon = <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" />;
    text = message ?? 'Syncing to cloud…';
    tone = 'bg-primary/10 text-primary border-primary/20';
  } else if (status === 'error') {
    icon = <AlertCircle className="w-3.5 h-3.5 shrink-0" />;
    text = message ?? 'Cloud sync failed';
    tone = 'bg-destructive/10 text-destructive border-destructive/20';
  } else if (status === 'no-auth' && pendingChanges) {
    icon = <CloudOff className="w-3.5 h-3.5 shrink-0" />;
    text =
      message ??
      'Cloud sign-in required — sign out, then sign in with the same email/password as Supabase Auth';
    tone = 'bg-amber-500/10 text-amber-900 dark:text-amber-100 border-amber-500/20';
  } else if (pendingChanges) {
    text = 'Local changes pending — will sync when online';
    tone = 'bg-muted/80 text-muted-foreground border-border';
  }

  return (
    <div
      className={cn(
        'flex items-center justify-center gap-2 px-3 py-1.5 text-xs border-b',
        tone
      )}
      role="status"
    >
      {icon}
      <span className="truncate">{text}</span>
    </div>
  );
}

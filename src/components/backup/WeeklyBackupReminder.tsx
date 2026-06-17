import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import { backupStorage } from '@/lib/storage';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const REMINDER_DISMISSED_KEY = 'oilshop_backup_reminder_dismissed_at';

function getReminderDismissedAt(): number | null {
  const raw = sessionStorage.getItem(REMINDER_DISMISSED_KEY);
  return raw ? Number(raw) : null;
}

function dismissReminderForSession(): void {
  sessionStorage.setItem(REMINDER_DISMISSED_KEY, String(Date.now()));
}

export default function WeeklyBackupReminder() {
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    if (!backupStorage.isBackupDue()) return;

    const dismissedAt = getReminderDismissedAt();
    if (dismissedAt && Date.now() - dismissedAt < 24 * 60 * 60 * 1000) return;

    setShowBanner(true);

    toast('Weekly backup reminder', {
      description: 'Export your shop data to keep a safe offline copy.',
      duration: 12000,
      action: {
        label: 'Download now',
        onClick: () => {
          backupStorage.download();
          setShowBanner(false);
        },
      },
    });
  }, []);

  if (!showBanner) return null;

  const lastBackup = backupStorage.getLastBackupAt();
  const lastBackupLabel = lastBackup
    ? lastBackup.toLocaleDateString()
    : 'Never';

  return (
    <div className="mx-4 lg:mx-6 mt-3 rounded-lg border border-amber-300/60 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
          Time for your weekly backup
        </p>
        <p className="text-xs text-amber-800/80 dark:text-amber-200/80 mt-0.5">
          Last export: {lastBackupLabel}. Download a backup file to protect your data.
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button
          size="sm"
          variant="outline"
          className="border-amber-400/60"
          onClick={() => {
            backupStorage.download();
            setShowBanner(false);
          }}
        >
          <Download className="w-4 h-4 mr-1.5" />
          Export backup
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          aria-label="Dismiss backup reminder"
          onClick={() => {
            dismissReminderForSession();
            setShowBanner(false);
          }}
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

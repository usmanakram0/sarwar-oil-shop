import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  getLastVerifiedAt,
  pushLocalDataToSupabase,
  pushUnsyncedToSupabase,
  verifySyncWithCloud,
  type SyncVerificationResult,
} from '@/lib/offline/syncEngine';
import { useSync } from '@/contexts/SyncContext';
import { toast } from 'sonner';

export default function SyncHealthPanel() {
  const { isOnline, status } = useSync();
  const [verification, setVerification] = useState<SyncVerificationResult | null>(
    null
  );
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const lastVerifiedAt = getLastVerifiedAt();

  const runVerify = useCallback(async () => {
    if (!isOnline) {
      toast.error('You are offline — connect to verify cloud sync');
      return;
    }

    setLoading(true);
    const result = await verifySyncWithCloud();
    setVerification(result);
    setLoading(false);

    if (result.ok) {
      toast.success('All local records verified in cloud');
    } else if (result.unsynced.length > 0) {
      toast.error(
        `${result.unsynced.length} record(s) not found in cloud — see list below`
      );
    }
  }, [isOnline]);

  useEffect(() => {
    if (isOnline) void runVerify();
  }, [isOnline, runVerify]);

  const handleUploadAll = async () => {
    setSyncing(true);
    const result = await pushLocalDataToSupabase();
    setVerification(result.verification ?? null);
    setSyncing(false);

    if (result.emergencyBackupSaved) {
      toast.warning('Emergency backup downloaded because upload failed');
    }

    if (result.ok) {
      toast.success(result.message || 'Synced to cloud');
      return;
    }

    toast.error(result.message || 'Sync failed');
  };

  const handleUploadUnsynced = async () => {
    if (!verification || verification.unsynced.length === 0) return;

    setSyncing(true);
    const result = await pushUnsyncedToSupabase(verification.unsynced);
    setVerification(result.verification ?? null);
    setSyncing(false);

    if (result.emergencyBackupSaved) {
      toast.warning('Emergency backup downloaded because upload failed');
    }

    if (result.ok) {
      toast.success(result.message || 'Unsynced records uploaded');
      return;
    }

    toast.error(result.message || 'Upload failed');
  };

  const busy = loading || syncing || status === 'syncing';
  const allSynced = verification?.ok === true;
  const unsynced = verification?.unsynced ?? [];

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium text-sm">Sync status</p>
        {allSynced ? (
          <Badge className="bg-success text-success-foreground text-xs gap-1">
            <CheckCircle2 className="w-3 h-3" />
            All synced
          </Badge>
        ) : (
          <Badge variant="destructive" className="text-xs gap-1">
            <AlertTriangle className="w-3 h-3" />
            {unsynced.length > 0
              ? `${unsynced.length} not in cloud`
              : 'Not verified'}
          </Badge>
        )}
      </div>

      {lastVerifiedAt && (
        <p className="text-xs text-muted-foreground">
          Last verified: {new Date(lastVerifiedAt).toLocaleString()}
        </p>
      )}

      {verification && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted-foreground border-b">
                <th className="text-left py-1 pr-2 font-medium">Table</th>
                <th className="text-right py-1 px-2 font-medium">Device</th>
                <th className="text-right py-1 pl-2 font-medium">Cloud</th>
              </tr>
            </thead>
            <tbody>
              {verification.counts.map((row) => {
                const mismatch = row.local !== row.cloud;
                return (
                  <tr key={row.table} className="border-b border-border/50">
                    <td className="py-1 pr-2">{row.label}</td>
                    <td
                      className={`text-right py-1 px-2 ${mismatch ? 'text-destructive font-medium' : ''}`}
                    >
                      {row.local}
                    </td>
                    <td
                      className={`text-right py-1 pl-2 ${mismatch ? 'text-destructive font-medium' : ''}`}
                    >
                      {row.cloud}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {unsynced.length > 0 && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-2 space-y-1 max-h-40 overflow-y-auto">
          <p className="text-xs font-medium text-destructive">
            Not in cloud ({unsynced.length})
          </p>
          {unsynced.map((record) => (
            <p key={`${record.table}-${record.id}`} className="text-xs">
              {record.label}{' '}
              <span className="text-muted-foreground">({record.table})</span>
            </p>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          disabled={busy || !isOnline}
          onClick={runVerify}
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Verifying…
            </>
          ) : (
            <>
              <RefreshCw className="w-4 h-4 mr-2" />
              Verify again
            </>
          )}
        </Button>

        {unsynced.length > 0 ? (
          <Button
            size="sm"
            className="w-full"
            disabled={busy || !isOnline}
            onClick={handleUploadUnsynced}
          >
            {syncing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Uploading unsynced…
              </>
            ) : (
              `Upload ${unsynced.length} unsynced record(s)`
            )}
          </Button>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            className="w-full"
            disabled={busy || !isOnline}
            onClick={handleUploadAll}
          >
            {syncing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Uploading…
              </>
            ) : (
              'Upload to cloud now'
            )}
          </Button>
        )}
      </div>
    </div>
  );
}

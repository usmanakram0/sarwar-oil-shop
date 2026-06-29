import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, CloudDownload, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  getLastVerifiedAt,
  pushLocalDataToSupabase,
  pushUnsyncedToSupabase,
  verifySyncWithCloud,
  type SyncVerificationResult,
} from '@/lib/offline/syncEngine';
import { getPendingCloudDeletionCount } from '@/lib/offline/syncDeletions';
import { useSync } from '@/contexts/SyncContext';
import { getSession } from '@/lib/auth';
import { isLocalTenantDataEmpty } from '@/lib/storage';
import { toast } from 'sonner';

function verificationErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return 'Could not verify cloud sync';
}

export default function SyncHealthPanel() {
  const { isOnline, status, pullFromCloud } = useSync();
  const tenantId = getSession()?.tenantId;
  const [verification, setVerification] = useState<SyncVerificationResult | null>(
    null
  );
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const verifyRequestId = useRef(0);
  const lastVerifiedAt = getLastVerifiedAt();

  const runVerify = useCallback(
    async (options?: { showLoading?: boolean; showToasts?: boolean }) => {
      const showLoading = options?.showLoading !== false;
      const showToasts = options?.showToasts !== false;

      if (!isOnline) {
        if (showToasts) {
          toast.error('You are offline — connect to verify cloud sync');
        }
        return;
      }

      const requestId = verifyRequestId.current + 1;
      verifyRequestId.current = requestId;

      if (showLoading) {
        setLoading(true);
      }

      try {
        const result = await verifySyncWithCloud();
        if (verifyRequestId.current !== requestId) return;

        setVerification(result);

        if (!showToasts) return;

        if (result.error) {
          toast.error(result.error);
          return;
        }

        if (result.ok) {
          toast.success('Device and cloud are fully in sync');
        } else if (result.cloudHasMoreRecords && isLocalTenantDataEmpty()) {
          toast.info('Cloud has your shop data — download it to this device');
        } else if (result.cloudHasMoreRecords) {
          toast.info(
            'Cloud has extra records — upload to sync deletions from this device'
          );
        } else if (result.unsynced.length > 0) {
          toast.error(
            `${result.unsynced.length} record(s) not found in cloud — see list below`
          );
        }
      } catch (error) {
        if (verifyRequestId.current !== requestId) return;

        const message = verificationErrorMessage(error);
        setVerification((current) =>
          current ?? {
            ok: false,
            uploadComplete: false,
            countsMatch: false,
            cloudHasMoreRecords: false,
            verifiedAt: new Date().toISOString(),
            counts: [],
            unsynced: [],
            error: message,
          }
        );
        if (showToasts) {
          toast.error(message);
        }
      } finally {
        if (verifyRequestId.current === requestId && showLoading) {
          setLoading(false);
        }
      }
    },
    [isOnline]
  );

  useEffect(() => {
    if (isOnline && tenantId) {
      void runVerify({ showLoading: false, showToasts: false });
    }
  }, [isOnline, tenantId, runVerify]);

  const handleUploadAll = async () => {
    if (isLocalTenantDataEmpty()) {
      toast.info('Nothing on this device to upload — use Download from cloud instead');
      return;
    }

    setSyncing(true);
    try {
      const result = await pushLocalDataToSupabase();
      setVerification(result.verification ?? null);

      if (result.emergencyBackupSaved) {
        toast.warning('Emergency backup downloaded because upload failed');
      }

      if (result.ok) {
        toast.success(result.message || 'Synced to cloud');
        return;
      }

      toast.error(result.message || 'Sync failed');
    } catch (error) {
      toast.error(verificationErrorMessage(error));
    } finally {
      setSyncing(false);
    }
  };

  const handleUploadUnsynced = async () => {
    if (!verification || verification.unsynced.length === 0) return;

    setSyncing(true);
    try {
      const result = await pushUnsyncedToSupabase(verification.unsynced);
      setVerification(result.verification ?? null);

      if (result.emergencyBackupSaved) {
        toast.warning('Emergency backup downloaded because upload failed');
      }

      if (result.ok) {
        toast.success(result.message || 'Unsynced records uploaded');
        return;
      }

      toast.error(result.message || 'Upload failed');
    } catch (error) {
      toast.error(verificationErrorMessage(error));
    } finally {
      setSyncing(false);
    }
  };

  const handleDownloadFromCloud = async () => {
    setSyncing(true);
    try {
      const result = await pullFromCloud(false);

      if (result.ok) {
        toast.success(result.message || 'Downloaded shop data from cloud');
        await runVerify({ showLoading: false, showToasts: false });
        return;
      }

      toast.error(result.message || 'Could not download from cloud');
    } catch (error) {
      toast.error(verificationErrorMessage(error));
    } finally {
      setSyncing(false);
    }
  };

  const panelSyncing = syncing || status === 'syncing';
  const busy = loading || panelSyncing;
  const hasVerificationError = Boolean(verification?.error);
  const unsynced = verification?.unsynced ?? [];
  const pendingDeletions = getPendingCloudDeletionCount();
  const hasCloudExtraRows =
    verification?.counts.some((row) => row.cloud > row.local) ?? false;
  const needsCloudDownload =
    verification != null &&
    verification.uploadComplete &&
    verification.cloudHasMoreRecords &&
    isLocalTenantDataEmpty();
  const needsDeletionUpload =
    verification != null &&
    verification.cloudHasMoreRecords &&
    !isLocalTenantDataEmpty() &&
    (pendingDeletions > 0 || hasCloudExtraRows);
  const allSynced = verification?.ok === true && !hasVerificationError;

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium text-sm">Sync status</p>
        {loading && !verification ? (
          <Badge variant="secondary" className="text-xs gap-1">
            <Loader2 className="w-3 h-3 animate-spin" />
            Checking…
          </Badge>
        ) : allSynced ? (
          <Badge className="bg-success text-success-foreground text-xs gap-1">
            <CheckCircle2 className="w-3 h-3" />
            All synced
          </Badge>
        ) : (
          <Badge variant="destructive" className="text-xs gap-1">
            <AlertTriangle className="w-3 h-3" />
            {hasVerificationError
              ? 'Sync error'
              : needsCloudDownload
                ? 'Download needed'
                : needsDeletionUpload
                  ? 'Upload to sync deletions'
                  : unsynced.length > 0
                    ? `${unsynced.length} not in cloud`
                    : verification?.cloudHasMoreRecords
                      ? 'Cloud has more data'
                      : verification
                        ? 'Counts differ'
                        : 'Not checked yet'}
          </Badge>
        )}
      </div>

      {verification?.error && (
        <p className="text-xs text-destructive">{verification.error}</p>
      )}

      {needsCloudDownload && (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          Your shop data is safe in the cloud (from another device). This device is
          empty — download from cloud. Do not use Upload; it cannot copy cloud data
          to this device.
        </p>
      )}

      {needsDeletionUpload && !needsCloudDownload && (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          {pendingDeletions > 0
            ? `${pendingDeletions} deleted record(s) on this device still need to be removed from cloud. Upload to sync deletions.`
            : 'Cloud has extra records that were deleted on this device. Upload to remove them from cloud.'}
        </p>
      )}

      {verification?.cloudHasMoreRecords &&
        verification.uploadComplete &&
        pendingDeletions === 0 &&
        !isLocalTenantDataEmpty() &&
        !needsCloudDownload && (
          <p className="text-xs text-muted-foreground">
            Cloud has more records than this device — another device may have added
            data. Download only if you want to replace this device with cloud data.
          </p>
        )}

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
          onClick={() => runVerify()}
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

        {needsCloudDownload ? (
          <Button
            size="sm"
            className="w-full"
            disabled={busy || !isOnline}
            onClick={handleDownloadFromCloud}
          >
            {panelSyncing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Downloading…
              </>
            ) : (
              <>
                <CloudDownload className="w-4 h-4 mr-2" />
                Download from cloud
              </>
            )}
          </Button>
        ) : needsDeletionUpload || unsynced.length > 0 ? (
          unsynced.length > 0 ? (
            <Button
              size="sm"
              className="w-full"
              disabled={busy || !isOnline}
              onClick={handleUploadUnsynced}
            >
              {panelSyncing ? (
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
              size="sm"
              className="w-full"
              disabled={busy || !isOnline || isLocalTenantDataEmpty()}
              onClick={handleUploadAll}
            >
              {panelSyncing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Uploading deletions…
                </>
              ) : (
                'Upload to sync deletions'
              )}
            </Button>
          )
        ) : (
          <Button
            variant="secondary"
            size="sm"
            className="w-full"
            disabled={busy || !isOnline || isLocalTenantDataEmpty()}
            onClick={handleUploadAll}
          >
            {panelSyncing ? (
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

import { useEffect } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import {
  DATA_RECOVERED_EVENT,
  recoverTenantDataIfNeeded,
} from '@/lib/persistence/dataRecovery';
import { flushPendingWrites } from '@/lib/persistence/shopStorage';
import { clearStorageCache, flushLocalDataSnapshot, STORAGE_QUOTA_EVENT } from '@/lib/storage';

export default function DataPersistenceGuard() {
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    if (!isAuthenticated) return;

    void recoverTenantDataIfNeeded().then((result) => {
      if (result.recovered) {
        clearStorageCache();
        toast.success(result.message ?? 'Your local shop data was restored');
      }
    });

    const onRecovered = () => {
      clearStorageCache();
      toast.success('Recovered shop data from a local safety copy');
    };

    const flush = () => {
      flushLocalDataSnapshot();
      void flushPendingWrites();
    };

    const onQuota = () => {
      toast.error('Device storage is full', {
        description: 'Export a backup from Settings, then free space on this device.',
        duration: 10000,
      });
    };

    window.addEventListener(DATA_RECOVERED_EVENT, onRecovered);
    window.addEventListener(STORAGE_QUOTA_EVENT, onQuota);
    window.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush();
    });

    return () => {
      window.removeEventListener(DATA_RECOVERED_EVENT, onRecovered);
      window.removeEventListener(STORAGE_QUOTA_EVENT, onQuota);
      window.removeEventListener('beforeunload', flush);
    };
  }, [isAuthenticated]);

  return null;
}

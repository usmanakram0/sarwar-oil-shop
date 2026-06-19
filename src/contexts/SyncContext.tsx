import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AUTH_CHANGED_EVENT, getSession } from '@/lib/auth';
import { hasSupabaseSession } from '@/lib/supabase/authBridge';
import { isSupabaseConfigured } from '@/lib/supabase/client';
import {
  SYNC_DIRTY_EVENT,
  SYNC_STATUS_EVENT,
  type SyncStatusPayload,
  isTenantDataDirty,
} from '@/lib/offline/syncMeta';
import { getLastSyncedAt, pushLocalDataToSupabase, runSyncIfNeeded } from '@/lib/offline/syncEngine';

interface SyncContextValue {
  status: SyncStatusPayload['state'];
  message?: string;
  lastSyncedAt: string | null;
  pendingChanges: boolean;
  isOnline: boolean;
  syncNow: () => Promise<{ ok: boolean; message?: string }>;
}

const SyncContext = createContext<SyncContextValue | null>(null);

const DEBOUNCE_MS = 2500;
const ONLINE_SYNC_DELAY_MS = 4000;

export function SyncProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SyncStatusPayload['state']>(
    isSupabaseConfigured ? 'idle' : 'unconfigured'
  );
  const [message, setMessage] = useState<string | undefined>();
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(() => getLastSyncedAt());
  const [pendingChanges, setPendingChanges] = useState(() => isTenantDataDirty());
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyStatus = useCallback((payload: SyncStatusPayload) => {
    setStatus(payload.state);
    setMessage(payload.message);
    if (payload.lastSyncedAt) setLastSyncedAt(payload.lastSyncedAt);
  }, []);

  const queueSync = useCallback((delayMs = DEBOUNCE_MS) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void runSyncIfNeeded().then(() => {
        setPendingChanges(isTenantDataDirty());
        setLastSyncedAt(getLastSyncedAt());
      });
    }, delayMs);
  }, []);

  const syncNow = useCallback(async () => {
    const result = await pushLocalDataToSupabase();
    setPendingChanges(isTenantDataDirty());
    setLastSyncedAt(getLastSyncedAt());
    return result;
  }, []);

  useEffect(() => {
    const onStatus = (e: Event) => {
      const detail = (e as CustomEvent<SyncStatusPayload>).detail;
      if (detail) applyStatus(detail);
    };
    const onDirty = () => {
      setPendingChanges(true);
      if (navigator.onLine) queueSync();
    };
    const onOnline = () => {
      setIsOnline(true);
      applyStatus({
        state: 'idle',
        message: 'Back online — local data is safe, cloud upload will retry shortly',
      });
      queueSync(ONLINE_SYNC_DELAY_MS);
    };
    const onOffline = () => {
      setIsOnline(false);
      applyStatus({ state: 'offline', message: 'Working offline — changes saved locally' });
    };
    const onAuth = () => {
      if (navigator.onLine && isTenantDataDirty()) queueSync();
    };

    window.addEventListener(SYNC_STATUS_EVENT, onStatus);
    window.addEventListener(SYNC_DIRTY_EVENT, onDirty);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener(AUTH_CHANGED_EVENT, onAuth);

    if (!isSupabaseConfigured) {
      applyStatus({ state: 'unconfigured', message: 'Add VITE_SUPABASE_* to .env.local' });
    } else if (!navigator.onLine) {
      applyStatus({ state: 'offline' });
    } else if (getSession()) {
      void hasSupabaseSession().then(hasCloudSession => {
        if (!hasCloudSession && !isTenantDataDirty()) {
          applyStatus({ state: 'idle' });
        }
      });
    }

    return () => {
      window.removeEventListener(SYNC_STATUS_EVENT, onStatus);
      window.removeEventListener(SYNC_DIRTY_EVENT, onDirty);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener(AUTH_CHANGED_EVENT, onAuth);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [applyStatus, queueSync]);

  useEffect(() => {
    if (!pendingChanges || !isOnline) return;
    if (status !== 'offline' && status !== 'error') return;

    const retryTimer = window.setInterval(() => {
      if (navigator.onLine && isTenantDataDirty()) {
        queueSync(1500);
      }
    }, 45000);

    return () => window.clearInterval(retryTimer);
  }, [pendingChanges, isOnline, status, queueSync]);

  const value = useMemo(
    () => ({
      status,
      message,
      lastSyncedAt,
      pendingChanges,
      isOnline,
      syncNow,
    }),
    [status, message, lastSyncedAt, pendingChanges, isOnline, syncNow]
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncContextValue {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync must be used within SyncProvider');
  return ctx;
}

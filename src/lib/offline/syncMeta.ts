export const SYNC_DIRTY_KEY = 'oilshop_sync_dirty';
export const SYNC_DIRTY_EVENT = 'oilshop-sync-dirty';
export const SYNC_STATUS_EVENT = 'oilshop-sync-status';

export type SyncStatusPayload = {
  state: 'idle' | 'syncing' | 'success' | 'error' | 'offline' | 'no-auth' | 'unconfigured';
  message?: string;
  lastSyncedAt?: string;
};

export function markTenantDataDirty(): void {
  try {
    localStorage.setItem(SYNC_DIRTY_KEY, '1');
    window.dispatchEvent(new Event(SYNC_DIRTY_EVENT));
  } catch {
    /* ignore quota errors */
  }
}

export function clearTenantDataDirty(): void {
  localStorage.removeItem(SYNC_DIRTY_KEY);
}

export function isTenantDataDirty(): boolean {
  return localStorage.getItem(SYNC_DIRTY_KEY) === '1';
}

export function emitSyncStatus(payload: SyncStatusPayload): void {
  window.dispatchEvent(
    new CustomEvent(SYNC_STATUS_EVENT, { detail: payload })
  );
}

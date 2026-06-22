import {
  getIndexedDbQuota,
  idbDelete,
  idbGet,
  idbGetKeysByPrefix,
  idbSet,
} from '@/lib/persistence/shopIndexedDb';

const TENANT_PREFIX = 'tenant_';
const LEGACY_BACKUP_SUFFIX = '__bak';
const AUTOSAVE_KEY_PART = '_autosave_v';

let hydratedTenantId: string | null = null;
let hydratePromise: Promise<void> | null = null;
const memoryStore = new Map<string, string>();
const pendingWrites = new Map<string, string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

export class ShopStorageNotReadyError extends Error {
  constructor() {
    super('Shop storage is not ready yet');
    this.name = 'ShopStorageNotReadyError';
  }
}

export function isShopStorageHydrated(): boolean {
  return hydratedTenantId !== null;
}

export function getHydratedTenantId(): string | null {
  return hydratedTenantId;
}

function tenantPrefix(tenantId: string): string {
  return `${TENANT_PREFIX}${tenantId}_`;
}

function scheduleFlush(): void {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushPendingWrites();
  }, 100);
}

export async function flushPendingWrites(): Promise<void> {
  if (pendingWrites.size === 0) return;

  const entries = [...pendingWrites.entries()];
  pendingWrites.clear();

  for (const [key, value] of entries) {
    await idbSet(key, value);
  }
}

function queueWrite(key: string, value: string): void {
  memoryStore.set(key, value);
  pendingWrites.set(key, value);
  scheduleFlush();
}

export function readShopRaw(key: string): string | null {
  return memoryStore.get(key) ?? null;
}

export function writeShopRaw(key: string, value: string): void {
  queueWrite(key, value);
}

export function readShopJson<T>(key: string, fallback: T): T {
  const raw = readShopRaw(key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeShopJson<T>(key: string, value: T): void {
  writeShopRaw(key, JSON.stringify(value));
}

function removeLegacyLocalKeys(tenantId: string): void {
  const prefix = tenantPrefix(tenantId);
  const keysToRemove: string[] = [];

  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key) continue;
    if (key.startsWith(prefix)) keysToRemove.push(key);
    if (key.startsWith(prefix) && key.endsWith(LEGACY_BACKUP_SUFFIX)) {
      keysToRemove.push(key);
    }
    if (key.includes(AUTOSAVE_KEY_PART) && key.startsWith(TENANT_PREFIX + tenantId)) {
      keysToRemove.push(key);
    }
  }

  for (const key of [...new Set(keysToRemove)]) {
    localStorage.removeItem(key);
  }
}

async function migrateLegacyLocalStorage(tenantId: string): Promise<void> {
  const prefix = tenantPrefix(tenantId);
  const migrations: Array<{ key: string; value: string }> = [];

  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(prefix)) continue;
    if (key.endsWith(LEGACY_BACKUP_SUFFIX)) continue;
    if (key.includes(AUTOSAVE_KEY_PART)) continue;
    const value = localStorage.getItem(key);
    if (value) migrations.push({ key, value });
  }

  for (const { key, value } of migrations) {
    await idbSet(key, value);
  }

  removeLegacyLocalKeys(tenantId);
}

export async function hydrateShopStorage(tenantId: string): Promise<void> {
  if (hydratedTenantId === tenantId && !hydratePromise) return;

  if (hydratePromise && hydratedTenantId === tenantId) {
    await hydratePromise;
    return;
  }

  hydratedTenantId = tenantId;
  memoryStore.clear();
  pendingWrites.clear();

  hydratePromise = (async () => {
    await migrateLegacyLocalStorage(tenantId);

    const prefix = tenantPrefix(tenantId);
    const keys = await idbGetKeysByPrefix(prefix);

    for (const key of keys) {
      if (key.endsWith(LEGACY_BACKUP_SUFFIX) || key.includes(AUTOSAVE_KEY_PART)) {
        await idbDelete(key);
        continue;
      }
      const value = await idbGet(key);
      if (value) memoryStore.set(key, value);
    }
  })();

  try {
    await hydratePromise;
  } finally {
    hydratePromise = null;
  }
}

export function resetShopStorageSession(): void {
  void flushPendingWrites();
  hydratedTenantId = null;
  memoryStore.clear();
  pendingWrites.clear();
}

export async function getShopStorageUsage(tenantId: string): Promise<{
  used: number;
  total: number;
  percentage: number;
}> {
  const quota = await getIndexedDbQuota();
  const prefix = tenantPrefix(tenantId);
  let used = 0;

  for (const [key, value] of memoryStore.entries()) {
    if (key.startsWith(prefix) && !key.includes(AUTOSAVE_KEY_PART)) {
      used += (key.length + value.length) * 2;
    }
  }

  if (used === 0) {
    const keys = await idbGetKeysByPrefix(prefix);
    for (const key of keys) {
      if (key.includes(AUTOSAVE_KEY_PART)) continue;
      const value = await idbGet(key);
      if (value) used += (key.length + value.length) * 2;
    }
  }

  const total = quota.total;
  return {
    used: used || quota.used,
    total,
    percentage: total > 0 ? Math.min(100, (used / total) * 100) : 0,
  };
}

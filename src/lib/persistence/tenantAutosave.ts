import { getCurrentTenantId } from '@/lib/auth';
import { readJsonValue, safeSetItem } from '@/lib/persistence/safeLocalStore';

const AUTOSAVE_VERSION = 1;
const DEBOUNCE_MS = 1500;

export interface TenantAutosavePayload {
  version: number;
  savedAt: string;
  products: unknown[];
  customers: unknown[];
  suppliers: unknown[];
  invoices: unknown[];
  payments: unknown[];
  customerLedgers: unknown[];
  stockPurchases: unknown[];
  supplierPayments: unknown[];
  settings: unknown;
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let pendingSnapshot: (() => TenantAutosavePayload) | null = null;

function autosaveKey(tenantId: string): string {
  return `tenant_${tenantId}_autosave_v${AUTOSAVE_VERSION}`;
}

export function scheduleTenantAutosave(buildSnapshot: () => TenantAutosavePayload): void {
  pendingSnapshot = buildSnapshot;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    if (!pendingSnapshot) return;
    flushTenantAutosave(pendingSnapshot);
    pendingSnapshot = null;
  }, DEBOUNCE_MS);
}

export function flushTenantAutosave(
  buildSnapshot?: () => TenantAutosavePayload,
): void {
  const builder = buildSnapshot ?? pendingSnapshot;
  if (!builder) return;

  try {
    const tenantId = getCurrentTenantId();
    const payload = builder();
    safeSetItem(autosaveKey(tenantId), JSON.stringify(payload));
  } catch {
    /* never block UI writes */
  }
}

export function readTenantAutosave(tenantId: string): TenantAutosavePayload | null {
  const raw = readJsonValue<TenantAutosavePayload | null>(
    autosaveKey(tenantId),
    null,
  );
  if (!raw || raw.version !== AUTOSAVE_VERSION) return null;
  if (!Array.isArray(raw.products)) return null;
  return raw;
}

export function listTenantIdsWithAutosave(): string[] {
  const prefix = 'tenant_';
  const suffix = `_autosave_v${AUTOSAVE_VERSION}`;
  const ids = new Set<string>();

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(prefix) || !key.endsWith(suffix)) continue;
    const tenantId = key.slice(prefix.length, key.length - suffix.length);
    if (tenantId) ids.add(tenantId);
  }

  return [...ids];
}

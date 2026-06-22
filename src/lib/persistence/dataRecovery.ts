import { getSession } from '@/lib/auth';
import {
  flushPendingWrites,
  hydrateShopStorage,
  readShopJson,
  writeShopRaw,
} from '@/lib/persistence/shopStorage';
import {
  readTenantAutosave,
  type TenantAutosavePayload,
} from '@/lib/persistence/tenantAutosave';

export const DATA_RECOVERED_EVENT = 'oilshop-data-recovered';

export interface DataRecoveryResult {
  recovered: boolean;
  source?: 'autosave' | 'indexeddb';
  message?: string;
}

const DATA_KEYS = [
  'products',
  'customers',
  'suppliers',
  'invoices',
  'payments',
  'customerLedgers',
  'stockPurchases',
  'supplierPayments',
] as const;

type DataKey = (typeof DATA_KEYS)[number];

function scopedKey(tenantId: string, key: string): string {
  return `tenant_${tenantId}_${key}`;
}

function countRecords(tenantId: string): number {
  let total = 0;
  for (const key of DATA_KEYS) {
    const rows = readShopJson<unknown[]>(scopedKey(tenantId, key), []);
    total += rows.length;
  }
  return total;
}

function restoreFromAutosave(
  tenantId: string,
  autosave: TenantAutosavePayload,
): void {
  const map: Record<DataKey, unknown[]> = {
    products: autosave.products,
    customers: autosave.customers,
    suppliers: autosave.suppliers,
    invoices: autosave.invoices,
    payments: autosave.payments,
    customerLedgers: autosave.customerLedgers,
    stockPurchases: autosave.stockPurchases,
    supplierPayments: autosave.supplierPayments,
  };

  for (const key of DATA_KEYS) {
    writeShopRaw(scopedKey(tenantId, key), JSON.stringify(map[key] ?? []));
  }

  if (autosave.settings) {
    writeShopRaw(
      scopedKey(tenantId, 'settings'),
      JSON.stringify(autosave.settings),
    );
  }

  void flushPendingWrites();
}

/** Restore tenant data from IndexedDB autosave when primary keys are empty. */
export async function recoverTenantDataIfNeeded(): Promise<DataRecoveryResult> {
  const session = getSession();
  if (!session) return { recovered: false };

  const tenantId = session.tenantId;
  await hydrateShopStorage(tenantId);

  const recordCount = countRecords(tenantId);
  if (recordCount > 0) return { recovered: false };

  const autosave = readTenantAutosave(tenantId);
  if (!autosave) return { recovered: false };

  const autosaveCount =
    autosave.products.length +
    autosave.customers.length +
    autosave.invoices.length +
    autosave.stockPurchases.length;

  if (autosaveCount === 0) return { recovered: false };

  restoreFromAutosave(tenantId, autosave);
  window.dispatchEvent(new Event(DATA_RECOVERED_EVENT));

  return {
    recovered: true,
    source: 'indexeddb',
    message: `Restored your shop data from a local safety copy (${autosave.savedAt})`,
  };
}

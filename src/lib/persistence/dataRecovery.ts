import { getSession } from '@/lib/auth';
import {
  readTenantAutosave,
  type TenantAutosavePayload,
} from '@/lib/persistence/tenantAutosave';
import { readJsonValue, safeSetItem } from '@/lib/persistence/safeLocalStore';

export const DATA_RECOVERED_EVENT = 'oilshop-data-recovered';

export interface DataRecoveryResult {
  recovered: boolean;
  source?: 'autosave' | 'backup';
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
    const rows = readJsonValue<unknown[]>(scopedKey(tenantId, key), []);
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
    safeSetItem(scopedKey(tenantId, key), JSON.stringify(map[key] ?? []));
  }

  if (autosave.settings) {
    safeSetItem(
      scopedKey(tenantId, 'settings'),
      JSON.stringify(autosave.settings),
    );
  }
}

/** Restore tenant data from autosave when primary keys are empty or missing. */
export function recoverTenantDataIfNeeded(): DataRecoveryResult {
  const session = getSession();
  if (!session) return { recovered: false };

  const tenantId = session.tenantId;
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
    source: 'autosave',
    message: `Restored your shop data from a local safety copy (${autosave.savedAt})`,
  };
}

import { getSession } from '@/lib/auth';
import { isSupabaseConfigured, supabase } from '@/lib/supabase/client';
import {
  assertTenantIsolation,
  getLocalTenantIdForSync,
} from '@/lib/offline/cloudTenant';
import { fetchCloudIds } from '@/lib/offline/syncCloudIds';
import {
  customerStorage,
  invoiceStorage,
  paymentStorage,
  productStorage,
  stockPurchaseStorage,
  supplierPaymentStorage,
  supplierStorage,
} from '@/lib/storage';
import { withTimeout } from '@/lib/offline/network';
import {
  SYNC_TABLE_LABELS,
  SYNC_TABLE_ORDER,
  type SyncTableName,
  type SyncVerificationResult,
  type TableSyncCounts,
  type UnsyncedRecord,
} from '@/lib/offline/syncTypes';

const LAST_VERIFIED_KEY_PREFIX = 'oilshop_last_verified_at_';

function lastVerifiedStorageKey(tenantId: string): string {
  return `${LAST_VERIFIED_KEY_PREFIX}${tenantId}`;
}

function getLocalRecords(table: SyncTableName): Array<{ id: string; label: string }> {
  switch (table) {
    case 'products':
      return productStorage.getAll().map((p) => ({ id: p.id, label: p.name }));
    case 'customers':
      return customerStorage.getAll().map((c) => ({ id: c.id, label: c.name }));
    case 'suppliers':
      return supplierStorage.getAll().map((s) => ({ id: s.id, label: s.name }));
    case 'invoices':
      return invoiceStorage
        .getAll()
        .map((i) => ({ id: i.id, label: i.invoiceNumber }));
    case 'payments':
      return paymentStorage.getAll().map((p) => ({
        id: p.id,
        label: p.invoiceNumber ? `Payment · ${p.invoiceNumber}` : p.note || p.id,
      }));
    case 'stock_purchases':
      return stockPurchaseStorage
        .getAll()
        .map((p) => ({ id: p.id, label: p.slipNumber }));
    case 'supplier_payments':
      return supplierPaymentStorage.getAll().map((p) => ({
        id: p.id,
        label: p.slipNumber ? `Payment · ${p.slipNumber}` : p.note || p.id,
      }));
    default:
      return [];
  }
}

export function getLastVerifiedAt(): string | null {
  const tenantId = getLocalTenantIdForSync();
  if (!tenantId) return null;
  return localStorage.getItem(lastVerifiedStorageKey(tenantId));
}

function buildVerificationResult(
  counts: TableSyncCounts[],
  unsynced: UnsyncedRecord[],
  verifiedAt: string,
  error?: string,
): SyncVerificationResult {
  const localTotal = counts.reduce((sum, row) => sum + row.local, 0);
  const cloudTotal = counts.reduce((sum, row) => sum + row.cloud, 0);
  const uploadComplete = unsynced.length === 0;
  const countsMatch = counts.every((row) => row.local === row.cloud);
  const cloudHasMoreRecords = cloudTotal > localTotal;

  const result: SyncVerificationResult = {
    ok: uploadComplete && countsMatch && !error,
    uploadComplete,
    countsMatch,
    cloudHasMoreRecords,
    verifiedAt,
    counts,
    unsynced,
    error,
  };

  if (result.ok) {
    const tenantId = getLocalTenantIdForSync();
    if (tenantId) {
      localStorage.setItem(lastVerifiedStorageKey(tenantId), verifiedAt);
    }
  }

  return result;
}

export async function verifyLocalVsCloud(): Promise<SyncVerificationResult> {
  const verifiedAt = new Date().toISOString();
  const session = getSession();
  const emptyCounts = SYNC_TABLE_ORDER.map((table) => ({
    table,
    label: SYNC_TABLE_LABELS[table],
    local: getLocalRecords(table).length,
    cloud: 0,
  }));

  if (!isSupabaseConfigured || !supabase || !session) {
    return buildVerificationResult(emptyCounts, [], verifiedAt);
  }

  const isolation = await assertTenantIsolation();
  if (!isolation.ok) {
    return buildVerificationResult(emptyCounts, [], verifiedAt, isolation.message);
  }

  const tenantId = isolation.tenantId;
  const counts: TableSyncCounts[] = [];
  const unsynced: UnsyncedRecord[] = [];

  for (const table of SYNC_TABLE_ORDER) {
    const localRecords = getLocalRecords(table);
    const cloudIds = await withTimeout(
      fetchCloudIds(table, tenantId),
      20000,
      `Timed out reading ${table} from cloud`,
    );

    counts.push({
      table,
      label: SYNC_TABLE_LABELS[table],
      local: localRecords.length,
      cloud: cloudIds.size,
    });

    for (const record of localRecords) {
      if (!cloudIds.has(record.id)) {
        unsynced.push({
          table,
          id: record.id,
          label: record.label,
        });
      }
    }
  }

  return buildVerificationResult(counts, unsynced, verifiedAt);
}

export function groupUnsyncedByTable(
  unsynced: UnsyncedRecord[],
): Partial<Record<SyncTableName, string[]>> {
  const grouped: Partial<Record<SyncTableName, string[]>> = {};
  for (const record of unsynced) {
    if (!grouped[record.table]) grouped[record.table] = [];
    grouped[record.table]!.push(record.id);
  }
  return grouped;
}

import { getSession } from '@/lib/auth';
import { isSupabaseConfigured, supabase } from '@/lib/supabase/client';
import {
  customerStorage,
  invoiceStorage,
  paymentStorage,
  productStorage,
  stockPurchaseStorage,
  supplierPaymentStorage,
  supplierStorage,
} from '@/lib/storage';
import { withNetworkRetry } from '@/lib/offline/network';
import {
  SYNC_TABLE_LABELS,
  SYNC_TABLE_ORDER,
  type SyncTableName,
  type SyncVerificationResult,
  type TableSyncCounts,
  type UnsyncedRecord,
} from '@/lib/offline/syncTypes';

const LAST_VERIFIED_KEY = 'oilshop_last_verified_at';

async function fetchCloudIds(table: SyncTableName): Promise<Set<string>> {
  if (!supabase) return new Set();

  const result = await withNetworkRetry(async () => {
    const response = await supabase!.from(table).select('id');
    if (response.error) throw new Error(`${table}: ${response.error.message}`);
    return response;
  });

  const ids = new Set<string>();
  for (const row of result.data ?? []) {
    const id = (row as { id?: string }).id;
    if (id) ids.add(id);
  }
  return ids;
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
  return localStorage.getItem(LAST_VERIFIED_KEY);
}

export async function verifyLocalVsCloud(): Promise<SyncVerificationResult> {
  const verifiedAt = new Date().toISOString();

  if (!isSupabaseConfigured || !supabase || !getSession()) {
    return {
      ok: false,
      verifiedAt,
      counts: SYNC_TABLE_ORDER.map((table) => ({
        table,
        label: SYNC_TABLE_LABELS[table],
        local: getLocalRecords(table).length,
        cloud: 0,
      })),
      unsynced: [],
    };
  }

  const counts: TableSyncCounts[] = [];
  const unsynced: UnsyncedRecord[] = [];

  for (const table of SYNC_TABLE_ORDER) {
    const localRecords = getLocalRecords(table);
    const cloudIds = await fetchCloudIds(table);

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

  const result: SyncVerificationResult = {
    ok: unsynced.length === 0,
    verifiedAt,
    counts,
    unsynced,
  };

  if (result.ok) {
    localStorage.setItem(LAST_VERIFIED_KEY, verifiedAt);
  }

  return result;
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

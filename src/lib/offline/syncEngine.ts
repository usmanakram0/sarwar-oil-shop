import { SHOP_NAME } from '@/lib/shop';
import { getSession, reconnectCloudSession } from '@/lib/auth';
import { isSupabaseConfigured, supabase } from '@/lib/supabase/client';
import {
  backupStorage,
  customerStorage,
  getLocalTenantRecordSummary,
  invoiceStorage,
  isLocalTenantDataEmpty,
  paymentStorage,
  productStorage,
  replaceTenantDataFromCloud,
  settingsStorage,
  stockPurchaseStorage,
  supplierPaymentStorage,
  supplierStorage,
  type Customer,
  type Invoice,
  type Payment,
  type Product,
  type ShopSettings,
  type StockPurchase,
  type Supplier,
  type SupplierPayment,
} from '@/lib/storage';
import {
  countCloudSnapshotRecords,
  fetchTenantSnapshotFromCloud,
} from '@/lib/offline/cloudPull';
import { assertTenantIsolation } from '@/lib/offline/cloudTenant';
import {
  clearTenantDataDirty,
  emitSyncStatus,
  isTenantDataDirty,
  markTenantDataDirty,
} from '@/lib/offline/syncMeta';
import {
  formatCloudSyncError,
  isRetryableNetworkError,
  waitForNetworkReady,
  withNetworkRetry,
  withTimeout,
} from '@/lib/offline/network';
import {
  applyPendingCloudDeletions,
  getPendingCloudDeletions,
  reconcileCloudDeletionsWithLocal,
} from '@/lib/offline/syncDeletions';
import { flushPendingWrites } from '@/lib/persistence/shopStorage';
import {
  groupUnsyncedByTable,
  verifyLocalVsCloud,
} from '@/lib/offline/syncVerification';
import {
  SYNC_TABLE_LABELS,
  SYNC_TABLE_ORDER,
  type SyncPushResult,
  type SyncTableName,
  type SyncVerificationResult,
  type UnsyncedRecord,
} from '@/lib/offline/syncTypes';

const CHUNK = 80;

async function upsertChunk(
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string = 'id,tenant_id'
): Promise<void> {
  if (!supabase || rows.length === 0) return;
  await withNetworkRetry(async () => {
    const { error } = await supabase!.from(table).upsert(rows, { onConflict });
    if (error) throw new Error(`${table}: ${error.message}`);
  });
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function mapProduct(p: Product, tenantId: string) {
  return {
    id: p.id,
    tenant_id: tenantId,
    name: p.name,
    product_type: p.productType ?? 'oil',
    carton_size: p.cartonSize ?? null,
    price_per_liter: p.pricePerLiter,
    stock: p.stock,
    category: p.category ?? '',
    created_at: p.createdAt,
    updated_at: p.updatedAt,
  };
}

function mapCustomer(c: Customer, tenantId: string) {
  return {
    id: c.id,
    tenant_id: tenantId,
    name: c.name,
    phone: c.phone,
    address: c.address,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
  };
}

function mapSupplier(s: Supplier, tenantId: string) {
  return {
    id: s.id,
    tenant_id: tenantId,
    name: s.name,
    phone: s.phone,
    address: s.address,
    created_at: s.createdAt,
    updated_at: s.updatedAt,
  };
}

function mapInvoice(inv: Invoice, tenantId: string) {
  return {
    id: inv.id,
    tenant_id: tenantId,
    invoice_number: inv.invoiceNumber,
    customer_id: inv.customerId,
    customer_name: inv.customerName,
    items: inv.items,
    subtotal: inv.subtotal,
    discount: inv.discount,
    tax: inv.tax,
    total: inv.total,
    paid_amount: inv.paidAmount,
    remaining_amount: inv.remainingAmount,
    payment_method: inv.paymentMethod,
    status: inv.status,
    daily_slip_number: inv.dailySlipNumber ?? null,
    edited_at: inv.editedAt ?? null,
    created_at: inv.createdAt,
    updated_at: inv.updatedAt,
  };
}

function mapPayment(p: Payment, tenantId: string) {
  return {
    id: p.id,
    tenant_id: tenantId,
    customer_id: p.customerId,
    customer_name: p.customerName,
    invoice_id: p.invoiceId ?? null,
    invoice_number: p.invoiceNumber ?? null,
    amount: p.amount,
    type: p.type,
    note: p.note,
    created_at: p.createdAt,
  };
}

function mapStockPurchase(p: StockPurchase, tenantId: string) {
  return {
    id: p.id,
    tenant_id: tenantId,
    slip_number: p.slipNumber,
    supplier_id: p.supplierId,
    supplier_name: p.supplierName,
    vehicle_number: p.vehicleNumber,
    vehicle_driver: p.vehicleDriver,
    vehicle_type: p.vehicleType,
    items: p.items,
    total: p.total,
    paid_amount: p.paidAmount,
    remaining_amount: p.remainingAmount,
    payment_method: p.paymentMethod,
    status: p.status,
    note: p.note,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
  };
}

function mapSupplierPayment(p: SupplierPayment, tenantId: string) {
  return {
    id: p.id,
    tenant_id: tenantId,
    supplier_id: p.supplierId,
    supplier_name: p.supplierName,
    purchase_id: p.purchaseId ?? null,
    slip_number: p.slipNumber ?? null,
    amount: p.amount,
    type: p.type,
    note: p.note,
    created_at: p.createdAt,
  };
}

function mapSettings(s: ShopSettings, tenantId: string) {
  return {
    tenant_id: tenantId,
    shop_name: SHOP_NAME,
    shop_address: s.shopAddress,
    shop_phone: s.shopPhone,
    tax_rate: 0,
    currency: 'Rs',
    thank_you_message: s.thankYouMessage,
    updated_at: new Date().toISOString(),
  };
}

async function pushTable(
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string = 'id,tenant_id'
): Promise<void> {
  for (const part of chunk(rows, CHUNK)) {
    await upsertChunk(table, part, onConflict);
  }
}

function mapTableRows(
  table: SyncTableName,
  tenantId: string,
  ids?: Set<string>
): Record<string, unknown>[] {
  const filter = <T extends { id: string }>(rows: T[]) =>
    ids ? rows.filter((row) => ids.has(row.id)) : rows;

  switch (table) {
    case 'products':
      return filter(productStorage.getAll()).map((p) => mapProduct(p, tenantId));
    case 'customers':
      return filter(customerStorage.getAll()).map((c) => mapCustomer(c, tenantId));
    case 'suppliers':
      return filter(supplierStorage.getAll()).map((s) => mapSupplier(s, tenantId));
    case 'invoices':
      return filter(invoiceStorage.getAll()).map((i) => mapInvoice(i, tenantId));
    case 'payments':
      return filter(paymentStorage.getAll()).map((p) => mapPayment(p, tenantId));
    case 'stock_purchases':
      return filter(stockPurchaseStorage.getAll()).map((p) =>
        mapStockPurchase(p, tenantId)
      );
    case 'supplier_payments':
      return filter(supplierPaymentStorage.getAll()).map((p) =>
        mapSupplierPayment(p, tenantId)
      );
    default:
      return [];
  }
}

async function pushTables(
  tenantId: string,
  tables: SyncTableName[],
  idsByTable?: Partial<Record<SyncTableName, string[]>>
): Promise<void> {
  const isFullPush = !idsByTable || Object.keys(idsByTable).length === 0;
  const pendingBeforeSync = getPendingCloudDeletions();

  await flushPendingWrites();
  await applyPendingCloudDeletions(tenantId, [...SYNC_TABLE_ORDER]);

  for (const table of tables) {
    const idList = idsByTable?.[table];
    const idSet = idList ? new Set(idList) : undefined;
    await pushTable(table, mapTableRows(table, tenantId, idSet));
  }

  const tablesToReconcile = isFullPush
    ? [...SYNC_TABLE_ORDER]
    : SYNC_TABLE_ORDER.filter(
        (table) => (pendingBeforeSync[table]?.length ?? 0) > 0,
      );

  for (const table of tablesToReconcile) {
    const localIds = new Set(
      mapTableRows(table, tenantId).map((row) => String(row.id)),
    );
    await reconcileCloudDeletionsWithLocal(tenantId, table, localIds);
  }

  const shouldPushSettings =
    !idsByTable || Object.keys(idsByTable).length === 0;
  if (shouldPushSettings) {
    await upsertChunk(
      'shop_settings',
      [mapSettings(settingsStorage.get(), tenantId)],
      'tenant_id'
    );
  }
}

function saveEmergencyBackup(reason: string): boolean {
  try {
    backupStorage.downloadEmergency(reason);
    return true;
  } catch {
    return false;
  }
}

let syncInFlight = false;

async function ensureCloudAuthSession(): Promise<{
  ok: boolean;
  message?: string;
}> {
  if (!isSupabaseConfigured || !supabase) {
    return { ok: false, message: 'Supabase is not configured (.env.local)' };
  }
  if (!navigator.onLine) {
    emitSyncStatus({ state: 'offline', message: 'No internet connection' });
    return { ok: false, message: 'Offline' };
  }

  const networkReady = await waitForNetworkReady();
  if (!networkReady) {
    emitSyncStatus({
      state: 'offline',
      message: 'Internet not ready yet — will retry shortly',
    });
    return { ok: false, message: 'Internet not ready' };
  }

  const session = getSession();
  if (!session) {
    emitSyncStatus({ state: 'no-auth', message: 'Sign in to sync' });
    return { ok: false, message: 'Not logged in' };
  }

  let hasCloudAuth = false;
  try {
    const { data: authData } = await supabase.auth.getSession();
    hasCloudAuth = Boolean(authData.session);
  } catch {
    hasCloudAuth = false;
  }

  if (!hasCloudAuth) {
    const reconnect = await reconnectCloudSession();
    try {
      const { data: retryAuth } = await supabase.auth.getSession();
      hasCloudAuth = Boolean(retryAuth.session);
    } catch {
      hasCloudAuth = false;
    }
    if (!hasCloudAuth) {
      emitSyncStatus({
        state: 'no-auth',
        message:
          reconnect.message ??
          'Cloud sign-in required — sign out, then sign in again with the same email/password',
      });
      return {
        ok: false,
        message: reconnect.message ?? 'No Supabase session',
      };
    }
  }

  const isolation = await assertTenantIsolation();
  if (!isolation.ok) {
    emitSyncStatus({ state: 'error', message: isolation.message });
    return { ok: false, message: isolation.message };
  }

  return { ok: true };
}

function cloudRecordTotal(
  verification: Awaited<ReturnType<typeof verifyLocalVsCloud>>
): number {
  return verification.counts.reduce((sum, row) => sum + row.cloud, 0);
}

/**
 * Download this account's shop data from Supabase into localStorage.
 * By default only runs when local data is empty unless `force` is true.
 */
export async function pullLocalDataFromSupabase(options?: {
  force?: boolean;
}): Promise<{ ok: boolean; message?: string; recordCount?: number }> {
  const auth = await ensureCloudAuthSession();
  if (!auth.ok) return { ok: false, message: auth.message };

  const force = options?.force === true;
  if (!force && !isLocalTenantDataEmpty()) {
    return {
      ok: false,
      message: 'Local shop data already exists on this device',
    };
  }

  if (force && !isLocalTenantDataEmpty()) {
    const verification = await verifyLocalVsCloud();
    const localTotal = getLocalTenantRecordSummary().total;
    const cloudTotal = cloudRecordTotal(verification);
    if (localTotal > cloudTotal) {
      return {
        ok: false,
        message: `This device has ${localTotal} records but cloud only has ${cloudTotal}. Upload to cloud first — do not replace local data.`,
      };
    }
  }

  if (syncInFlight) {
    return { ok: false, message: 'Sync already in progress' };
  }

  syncInFlight = true;
  emitSyncStatus({
    state: 'syncing',
    message: force
      ? 'Replacing local data from cloud…'
      : 'Downloading shop data from cloud…',
  });

  try {
    const snapshot = await fetchTenantSnapshotFromCloud();
    const recordCount = countCloudSnapshotRecords(snapshot);

    if (recordCount === 0) {
      emitSyncStatus({
        state: 'idle',
        message: 'No cloud shop data found for this account yet',
      });
      return {
        ok: true,
        message: 'No cloud data found for this account',
        recordCount: 0,
      };
    }

    replaceTenantDataFromCloud(snapshot);

    const lastPulledAt = new Date().toISOString();
    localStorage.setItem('oilshop_last_pulled_at', lastPulledAt);
    emitSyncStatus({
      state: 'success',
      message: `Downloaded ${recordCount} records from cloud`,
      lastSyncedAt: getLastSyncedAt() ?? undefined,
    });

    return {
      ok: true,
      message: `Downloaded ${recordCount} records from cloud`,
      recordCount,
    };
  } catch (e) {
    const tableMatch =
      e instanceof Error ? e.message.match(/^([a-z_]+):/) : null;
    const table = tableMatch?.[1];
    const message = formatCloudSyncError(e, table);
    emitSyncStatus({
      state: isRetryableNetworkError(e) ? 'offline' : 'error',
      message,
    });
    return { ok: false, message };
  } finally {
    syncInFlight = false;
  }
}

/** True when this device has no local shop data and cloud download may be offered. */
export function shouldOfferCloudDownload(): boolean {
  if (!isSupabaseConfigured || !navigator.onLine || !getSession()) return false;
  return isLocalTenantDataEmpty();
}

/**
 * @deprecated Cloud download never runs automatically — the user must confirm first.
 */
export async function runPullIfNeeded(): Promise<void> {
  return;
}

async function runPushWithVerification(options: {
  tables: SyncTableName[];
  idsByTable?: Partial<Record<SyncTableName, string[]>>;
  statusMessage: string;
}): Promise<SyncPushResult> {
  const auth = await ensureCloudAuthSession();
  if (!auth.ok) return { ok: false, message: auth.message };

  const schema = await checkCloudSchemaReady();
  if (!schema.ok) {
    emitSyncStatus({ state: 'error', message: schema.message });
    return { ok: false, message: schema.message };
  }

  if (syncInFlight) {
    return { ok: false, message: 'Sync already in progress — wait a moment and try again' };
  }

  syncInFlight = true;
  emitSyncStatus({ state: 'syncing', message: options.statusMessage });

  const session = getSession()!;
  const tenantId = session.tenantId;

  try {
    await withTimeout(
      pushTables(tenantId, options.tables, options.idsByTable),
      180000,
      'Cloud upload timed out — check your connection and try again',
    );

    const verification = await verifyLocalVsCloud();

    if (!verification.uploadComplete) {
      const message = `${verification.unsynced.length} record(s) still not in cloud after upload. See Settings → Sync status.`;
      const emergencyBackupSaved = saveEmergencyBackup('sync-incomplete');
      emitSyncStatus({ state: 'error', message });
      markTenantDataDirty();
      return {
        ok: false,
        message,
        verification,
        emergencyBackupSaved,
      };
    }

    if (verification.cloudHasMoreRecords) {
      if (isLocalTenantDataEmpty()) {
        clearTenantDataDirty();
        const message =
          'Your shop data is in the cloud — download it to this device from Settings.';
        emitSyncStatus({ state: 'idle', message });
        return {
          ok: true,
          message,
          verification,
        };
      }

      const extraCloudRecords = verification.counts.reduce(
        (sum, row) => sum + Math.max(0, row.cloud - row.local),
        0,
      );
      const message =
        extraCloudRecords > 0
          ? `Cloud still has ${extraCloudRecords} record(s) deleted on this device. Open Settings → Upload to sync deletions.`
          : 'Cloud has more data than this device. Open Settings → Sync status.';
      markTenantDataDirty();
      emitSyncStatus({ state: 'error', message });
      return {
        ok: false,
        message,
        verification,
      };
    }

    if (!verification.countsMatch) {
      const message =
        'Upload finished but device and cloud counts still differ. Verify in Settings → Sync status.';
      emitSyncStatus({ state: 'error', message });
      markTenantDataDirty();
      return {
        ok: false,
        message,
        verification,
      };
    }

    clearTenantDataDirty();
    const lastSyncedAt = new Date().toISOString();
    localStorage.setItem('oilshop_last_synced_at', lastSyncedAt);
    emitSyncStatus({
      state: 'success',
      message: 'Synced and verified with cloud',
      lastSyncedAt,
    });
    return {
      ok: true,
      message: 'Synced and verified with cloud',
      verification,
    };
  } catch (e) {
    const tableMatch =
      e instanceof Error ? e.message.match(/^([a-z_]+):/) : null;
    const table = tableMatch?.[1];
    const message = formatCloudSyncError(e, table);
    const emergencyBackupSaved = saveEmergencyBackup('sync-error');
    const verification = await verifyLocalVsCloud().catch(() => undefined);
    emitSyncStatus({
      state: isRetryableNetworkError(e) ? 'offline' : 'error',
      message,
    });
    markTenantDataDirty();
    return {
      ok: false,
      message,
      verification,
      emergencyBackupSaved,
    };
  } finally {
    syncInFlight = false;
  }
}

/**
 * Push all local tenant data to Supabase (offline-first: local is source of truth).
 */
export async function pushLocalDataToSupabase(): Promise<SyncPushResult> {
  return runPushWithVerification({
    tables: [...SYNC_TABLE_ORDER],
    statusMessage: 'Uploading local data…',
  });
}

/** Push only records that verification reported as missing from cloud. */
export async function pushUnsyncedToSupabase(
  unsynced: UnsyncedRecord[]
): Promise<SyncPushResult> {
  if (unsynced.length === 0) {
    const verification = await verifyLocalVsCloud();
    return {
      ok: verification.ok,
      message: verification.ok
        ? 'All records already in cloud'
        : 'Nothing to upload',
      verification,
    };
  }

  const idsByTable = groupUnsyncedByTable(unsynced);
  const tables = SYNC_TABLE_ORDER.filter((table) => idsByTable[table]?.length);

  return runPushWithVerification({
    tables,
    idsByTable,
    statusMessage: `Uploading ${unsynced.length} unsynced record(s)…`,
  });
}

function emptyVerificationResult(
  verifiedAt: string,
  error?: string,
): SyncVerificationResult {
  const counts: SyncVerificationResult['counts'] = [
    {
      table: 'products',
      label: SYNC_TABLE_LABELS.products,
      local: productStorage.getAll().length,
      cloud: 0,
    },
    {
      table: 'customers',
      label: SYNC_TABLE_LABELS.customers,
      local: customerStorage.getAll().length,
      cloud: 0,
    },
    {
      table: 'suppliers',
      label: SYNC_TABLE_LABELS.suppliers,
      local: supplierStorage.getAll().length,
      cloud: 0,
    },
    {
      table: 'invoices',
      label: SYNC_TABLE_LABELS.invoices,
      local: invoiceStorage.getAll().length,
      cloud: 0,
    },
    {
      table: 'payments',
      label: SYNC_TABLE_LABELS.payments,
      local: paymentStorage.getAll().length,
      cloud: 0,
    },
    {
      table: 'stock_purchases',
      label: SYNC_TABLE_LABELS.stock_purchases,
      local: stockPurchaseStorage.getAll().length,
      cloud: 0,
    },
    {
      table: 'supplier_payments',
      label: SYNC_TABLE_LABELS.supplier_payments,
      local: supplierPaymentStorage.getAll().length,
      cloud: 0,
    },
  ];

  return {
    ok: false,
    uploadComplete: false,
    countsMatch: false,
    cloudHasMoreRecords: false,
    verifiedAt,
    counts,
    unsynced: [],
    error,
  };
}

export async function verifySyncWithCloud(): Promise<SyncVerificationResult> {
  const verifiedAt = new Date().toISOString();

  try {
    const auth = await withTimeout(
      ensureCloudAuthSession(),
      30000,
      'Cloud sign-in check timed out — try again',
    );
    if (!auth.ok) {
      const localOnly = await verifyLocalVsCloud().catch(() => null);
      if (localOnly) {
        return {
          ...localOnly,
          ok: false,
          verifiedAt,
          error: auth.message,
        };
      }
      return emptyVerificationResult(verifiedAt, auth.message);
    }

    return await withTimeout(
      verifyLocalVsCloud(),
      120000,
      'Cloud verification timed out — check your connection and try again',
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Cloud verification failed';
    return emptyVerificationResult(verifiedAt, message);
  }
}

export async function runSyncIfNeeded(): Promise<void> {
  if (!isSupabaseConfigured) {
    emitSyncStatus({ state: 'unconfigured' });
    return;
  }
  if (!navigator.onLine) {
    emitSyncStatus({ state: 'offline' });
    return;
  }
  if (!getSession()) return;
  if (!isTenantDataDirty()) return;
  if (isLocalTenantDataEmpty()) {
    clearTenantDataDirty();
    return;
  }
  await pushLocalDataToSupabase();
}

/** Mark dirty and try sync when online (debounced by SyncProvider). */
export function scheduleSyncAfterLocalChange(): void {
  markTenantDataDirty();
}

export function getLastSyncedAt(): string | null {
  return localStorage.getItem('oilshop_last_synced_at');
}

export function getLastPulledAt(): string | null {
  return localStorage.getItem('oilshop_last_pulled_at');
}

export type { SyncPushResult, SyncVerificationResult, UnsyncedRecord } from '@/lib/offline/syncTypes';
export { getLastVerifiedAt } from '@/lib/offline/syncVerification';

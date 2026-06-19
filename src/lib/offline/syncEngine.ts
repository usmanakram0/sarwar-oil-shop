import { SHOP_NAME } from '@/lib/shop';
import { getSession, reconnectCloudSession } from '@/lib/auth';
import { isSupabaseConfigured, supabase } from '@/lib/supabase/client';
import {
  customerStorage,
  invoiceStorage,
  paymentStorage,
  productStorage,
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
} from '@/lib/offline/network';

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

let syncInFlight = false;

/**
 * Push all local tenant data to Supabase (offline-first: local is source of truth).
 */
export async function pushLocalDataToSupabase(): Promise<{
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
      message: 'Internet not ready yet — local data is safe, will retry upload',
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

  if (syncInFlight) {
    return { ok: false, message: 'Sync already in progress' };
  }

  syncInFlight = true;
  emitSyncStatus({ state: 'syncing', message: 'Uploading local data…' });

  const tenantId = session.tenantId;

  try {
    await pushTable(
      'products',
      productStorage.getAll().map(p => mapProduct(p, tenantId))
    );
    await pushTable(
      'customers',
      customerStorage.getAll().map(c => mapCustomer(c, tenantId))
    );
    await pushTable(
      'suppliers',
      supplierStorage.getAll().map(s => mapSupplier(s, tenantId))
    );
    await pushTable(
      'invoices',
      invoiceStorage.getAll().map(i => mapInvoice(i, tenantId))
    );
    await pushTable(
      'payments',
      paymentStorage.getAll().map(p => mapPayment(p, tenantId))
    );
    await pushTable(
      'stock_purchases',
      stockPurchaseStorage.getAll().map(p => mapStockPurchase(p, tenantId))
    );
    await pushTable(
      'supplier_payments',
      supplierPaymentStorage.getAll().map(p => mapSupplierPayment(p, tenantId))
    );
    await upsertChunk(
      'shop_settings',
      [mapSettings(settingsStorage.get(), tenantId)],
      'tenant_id'
    );

    clearTenantDataDirty();
    const lastSyncedAt = new Date().toISOString();
    localStorage.setItem('oilshop_last_synced_at', lastSyncedAt);
    emitSyncStatus({ state: 'success', message: 'Synced to cloud', lastSyncedAt });
    return { ok: true, message: 'Synced' };
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
  await pushLocalDataToSupabase();
}

/** Mark dirty and try sync when online (debounced by SyncProvider). */
export function scheduleSyncAfterLocalChange(): void {
  markTenantDataDirty();
}

export function getLastSyncedAt(): string | null {
  return localStorage.getItem('oilshop_last_synced_at');
}

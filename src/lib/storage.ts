// Storage abstraction layer — offline-first; cloud sync via syncEngine
import { getCurrentTenantId } from '@/lib/auth';
import { clearTenantDataDirty, markTenantDataDirty } from '@/lib/offline/syncMeta';
import {
  flushTenantAutosave,
  scheduleTenantAutosave,
  type TenantAutosavePayload,
} from '@/lib/persistence/tenantAutosave';
import {
  LocalStorageQuotaError,
  readJsonValue,
  safeSetItem,
} from '@/lib/persistence/safeLocalStore';
import {
  type HistoricalEntryOptions,
  resolveOrderTimestamp,
} from '@/lib/historicalEntry';
import {
  invalidateAllShopQueries,
  invalidateShopQueries,
  storageKeyToScopes,
} from '@/lib/query/invalidate';
import {
  isInvoiceClosed,
  type InvoiceCloseOptions,
} from '@/lib/invoiceLifecycle';
import { isWalkingCustomer } from '@/lib/walkingCustomer';
import { getNextDailySlipNumber } from '@/lib/dailySlipNumber';
import {
  normalizeProductType,
  type CartonSize,
  type ProductType,
} from '@/lib/productTypes';
import {
  applyStockDeltasToProducts,
  buildStockDeltaMap,
  roundStockLevel,
  validateStockOut,
} from '@/lib/stockMovement';

export type { ProductType, CartonSize };

export interface Product {
  id: string;
  name: string;
  productType?: ProductType;
  cartonSize?: CartonSize;
  pricePerLiter: number;
  stock: number;
  category?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  address: string;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceItem {
  productId: string;
  productName: string;
  productType?: ProductType;
  cartonSize?: CartonSize;
  pricePerLiter: number;       // actual product price
  appliedPrice: number;        // price used for this invoice (flexible)
  quantity: number;
  total: number;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  items: InvoiceItem[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paidAmount: number;
  remainingAmount: number;
  paymentMethod: 'cash' | 'card' | 'credit';
  status: 'paid' | 'pending' | 'partial' | 'cancelled' | 'returned';
  createdAt: string;
  updatedAt: string;
  /** Backfilled from old written records */
  historical?: boolean;
  /** Daily slip counter (#01, #02…) — resets each calendar day; not the voucher number */
  dailySlipNumber?: number;
  /** Set when the invoice is returned or voided */
  closedAt?: string;
  /** Set when the invoice was corrected after creation */
  editedAt?: string;
  /** Whether stock was put back into containers when closed */
  stockRestoredOnClose?: boolean;
  closureNote?: string;
}

/** Discount stored as a fixed amount; legacy invoices may still use a percentage in `discount`. */
export function getInvoiceDiscountAmount(
  invoice: Pick<Invoice, 'subtotal' | 'discount' | 'total'>
): number {
  if (invoice.discount <= 0) return 0;

  const totalWithAmountDiscount = invoice.subtotal - invoice.discount;
  if (Math.abs(totalWithAmountDiscount - invoice.total) < 0.01) {
    return invoice.discount;
  }

  return (invoice.subtotal * invoice.discount) / 100;
}

export interface Payment {
  id: string;
  customerId: string;
  customerName: string;
  invoiceId?: string;
  invoiceNumber?: string;
  amount: number;
  type: 'credit' | 'debit';  // credit = customer pays, debit = customer owes (invoice)
  note: string;
  createdAt: string;
  /** Manual credit that should not adjust invoice paid amounts */
  skipInvoiceAllocation?: boolean;
  receiptNumber?: string;
  paymentMethod?: 'cash' | 'card' | 'credit';
}

export function isManualLedgerEntry(payment: Payment): boolean {
  return !payment.invoiceId;
}

function applyManualPaymentToInvoices(customerId: string, amount: number): void {
  let remaining = amount;
  const invoices = invoiceStorage
    .getAll()
    .filter(
      (invoice) =>
        invoice.customerId === customerId &&
        (invoice.status === 'pending' || invoice.status === 'partial'),
    )
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );

  for (const invoice of invoices) {
    if (remaining <= 0) break;
    const invoiceRemaining = invoice.total - (invoice.paidAmount || 0);
    if (invoiceRemaining <= 0) continue;
    const payForThis = Math.min(remaining, invoiceRemaining);
    const paidAmount = (invoice.paidAmount || 0) + payForThis;
    const remainingAmount = invoice.total - paidAmount;
    invoiceStorage.update(invoice.id, {
      paidAmount,
      remainingAmount,
      status: remainingAmount <= 0 ? 'paid' : 'partial',
    });
    remaining -= payForThis;
  }
}

function reverseManualPaymentAllocation(
  customerId: string,
  amount: number,
): void {
  let remaining = amount;
  const invoices = invoiceStorage
    .getAll()
    .filter(
      (invoice) =>
        invoice.customerId === customerId && (invoice.paidAmount || 0) > 0,
    )
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

  for (const invoice of invoices) {
    if (remaining <= 0) break;
    const paidAmount = invoice.paidAmount || 0;
    const remove = Math.min(remaining, paidAmount);
    const newPaidAmount = paidAmount - remove;
    const remainingAmount = invoice.total - newPaidAmount;
    let status: Invoice['status'] = 'pending';
    if (newPaidAmount > 0) {
      status = remainingAmount <= 0 ? 'paid' : 'partial';
    }
    invoiceStorage.update(invoice.id, {
      paidAmount: newPaidAmount,
      remainingAmount: Math.max(0, remainingAmount),
      status,
    });
    remaining -= remove;
  }
}

export interface CustomerLedger {
  id: string;
  customerId: string;
  customerName: string;
  createdAt: string;
  updatedAt: string;
}

export interface Supplier {
  id: string;
  name: string;
  phone: string;
  address: string;
  createdAt: string;
  updatedAt: string;
}

export interface StockPurchaseItem {
  productId: string;
  productName: string;
  productType?: ProductType;
  cartonSize?: CartonSize;
  category?: string;
  quantity: number;
  pricePerLiter: number;
  total: number;
}

export interface StockPurchase {
  id: string;
  slipNumber: string;
  supplierId: string;
  supplierName: string;
  vehicleNumber: string;
  vehicleDriver: string;
  vehicleType: string;
  items: StockPurchaseItem[];
  total: number;
  paidAmount: number;
  remainingAmount: number;
  paymentMethod: 'cash' | 'card' | 'credit';
  status: 'paid' | 'pending' | 'partial';
  note: string;
  createdAt: string;
  updatedAt: string;
  /** Backfilled from old written records */
  historical?: boolean;
}

export interface SupplierPayment {
  id: string;
  supplierId: string;
  supplierName: string;
  purchaseId?: string;
  slipNumber?: string;
  amount: number;
  type: 'debit' | 'credit'; // debit = we owe supplier, credit = we paid
  note: string;
  createdAt: string;
}

export interface ShopSettings {
  shopAddress: string;
  shopPhone: string;
  thankYouMessage: string;
  printerName: string;
}

const DEFAULT_SETTINGS: ShopSettings = {
  shopAddress: '',
  shopPhone: '',
  thankYouMessage: 'Thank you for your business!',
  printerName: '',
};

function normalizeSettings(
  raw: Partial<ShopSettings> & { shopName?: string; taxRate?: number; currency?: string }
): ShopSettings {
  const {
    currency: _currency,
    shopName: _shopName,
    taxRate: _taxRate,
    ...rest
  } = raw;
  return { ...DEFAULT_SETTINGS, ...rest };
}

const BACKUP_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

const listCache = new Map<string, unknown[]>();
let settingsCacheKey = '';
let settingsCache: ShopSettings | null = null;
const storageRecoveredKeys = new Set<string>();

export function clearStorageCache(): void {
  listCache.clear();
  settingsCacheKey = '';
  settingsCache = null;
  invalidateAllShopQueries();
}

function buildTenantAutosaveSnapshot(): TenantAutosavePayload {
  const readList = <T,>(key: string): T[] => {
    const cacheKey = scopedKey(key);
    const cached = listCache.get(cacheKey);
    if (cached) return cached as T[];
    return readJsonValue<T[]>(cacheKey, []);
  };

  const settingsKey = scopedKey('settings');
  const settings =
    settingsCacheKey === settingsKey && settingsCache
      ? settingsCache
      : readJsonValue<ShopSettings>(settingsKey, DEFAULT_SETTINGS);

  return {
    version: 1,
    savedAt: new Date().toISOString(),
    products: readList<Product>('products'),
    customers: readList<Customer>('customers'),
    suppliers: readList<Supplier>('suppliers'),
    invoices: readList<Invoice>('invoices'),
    payments: readList<Payment>('payments'),
    customerLedgers: readList<CustomerLedger>('customerLedgers'),
    stockPurchases: readList<StockPurchase>('stockPurchases'),
    supplierPayments: readList<SupplierPayment>('supplierPayments'),
    settings,
  };
}

function notifyStorageRecovered(key: string): void {
  if (storageRecoveredKeys.has(key)) return;
  storageRecoveredKeys.add(key);
  console.warn(`[storage] Recovered "${key}" from local backup`);
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

function generateInvoiceNumber(orderDate?: string, manualNumber?: string): string {
  if (manualNumber?.trim()) return manualNumber.trim().toUpperCase();
  const ref = orderDate ? new Date(`${orderDate}T12:00:00`) : new Date();
  const y = ref.getFullYear().toString().slice(-2);
  const m = (ref.getMonth() + 1).toString().padStart(2, '0');
  const d = ref.getDate().toString().padStart(2, '0');
  const seq = (getAll<Invoice>('invoices').length + 1).toString().padStart(4, '0');
  return `INV-${y}${m}${d}-${seq}`;
}

function generatePurchaseSlipNumber(orderDate?: string, manualNumber?: string): string {
  if (manualNumber?.trim()) return manualNumber.trim().toUpperCase();
  const ref = orderDate ? new Date(`${orderDate}T12:00:00`) : new Date();
  const y = ref.getFullYear().toString().slice(-2);
  const m = (ref.getMonth() + 1).toString().padStart(2, '0');
  const d = ref.getDate().toString().padStart(2, '0');
  const seq = (getAll<StockPurchase>('stockPurchases').length + 1).toString().padStart(4, '0');
  return `PUR-${y}${m}${d}-${seq}`;
}

function generateLedgerReceiptNumber(orderDate?: string): string {
  const ref = orderDate ? new Date(`${orderDate}T12:00:00`) : new Date();
  const y = ref.getFullYear().toString().slice(-2);
  const m = (ref.getMonth() + 1).toString().padStart(2, '0');
  const d = ref.getDate().toString().padStart(2, '0');
  const seq = (getAll<Payment>('payments').length + 1).toString().padStart(4, '0');
  return `RCP-${y}${m}${d}-${seq}`;
}

function applyStockLines(
  lines: { productId: string; quantity: number }[],
  direction: 'in' | 'out',
  options?: { skipValidation?: boolean },
): void {
  if (lines.length === 0) return;
  const products = getAll<Product>('products');
  const deltas = buildStockDeltaMap(lines, direction);
  const updated = applyStockDeltasToProducts(products, deltas, options);
  setAll('products', updated);
}

function scopedKey(key: string): string {
  return `tenant_${getCurrentTenantId()}_${key}`;
}

function getAll<T>(key: string): T[] {
  const cacheKey = scopedKey(key);
  const cached = listCache.get(cacheKey);
  if (cached) return cached as T[];

  const parsed = readJsonValue<T[]>(cacheKey, [], {
    onRecovered: () => notifyStorageRecovered(key),
  });
  listCache.set(cacheKey, parsed);
  return parsed;
}

function setAll<T>(key: string, data: T[]): void {
  const cacheKey = scopedKey(key);
  try {
    safeSetItem(cacheKey, JSON.stringify(data));
  } catch (error) {
    if (error instanceof LocalStorageQuotaError) {
      window.dispatchEvent(new Event(STORAGE_QUOTA_EVENT));
    }
    throw error;
  }
  listCache.set(cacheKey, data);
  markTenantDataDirty();
  scheduleTenantAutosave(buildTenantAutosaveSnapshot);
  const scopes = storageKeyToScopes(key);
  if (scopes.length > 0) {
    invalidateShopQueries(scopes);
  }
}

function setAllSilent<T>(key: string, data: T[]): void {
  const cacheKey = scopedKey(key);
  safeSetItem(cacheKey, JSON.stringify(data));
  listCache.set(cacheKey, data);
  const scopes = storageKeyToScopes(key);
  if (scopes.length > 0) {
    invalidateShopQueries(scopes);
  }
}

export interface TenantCloudSnapshot {
  products: Product[];
  customers: Customer[];
  suppliers: Supplier[];
  invoices: Invoice[];
  payments: Payment[];
  stockPurchases: StockPurchase[];
  supplierPayments: SupplierPayment[];
  settings: ShopSettings;
}

/** True when this tenant has no shop records saved locally yet. */
export function isLocalTenantDataEmpty(): boolean {
  try {
    return (
      productStorage.getAll().length === 0 &&
      customerStorage.getAll().length === 0 &&
      invoiceStorage.getAll().length === 0 &&
      paymentStorage.getAll().length === 0 &&
      stockPurchaseStorage.getAll().length === 0 &&
      supplierStorage.getAll().length === 0
    );
  } catch {
    return true;
  }
}

/** Replace local tenant data from a cloud download without marking unsynced changes. */
export function replaceTenantDataFromCloud(snapshot: TenantCloudSnapshot): void {
  setAllSilent('products', snapshot.products);
  setAllSilent('customers', snapshot.customers);
  setAllSilent('suppliers', snapshot.suppliers);
  setAllSilent('invoices', snapshot.invoices);
  setAllSilent('payments', snapshot.payments);
  setAllSilent('stockPurchases', snapshot.stockPurchases);
  setAllSilent('supplierPayments', snapshot.supplierPayments);

  const settingsKey = scopedKey('settings');
  const settings = normalizeSettings(snapshot.settings);
  safeSetItem(settingsKey, JSON.stringify(settings));
  settingsCacheKey = settingsKey;
  settingsCache = settings;

  scheduleTenantAutosave(buildTenantAutosaveSnapshot);
  flushTenantAutosave(buildTenantAutosaveSnapshot);
  clearTenantDataDirty();
  clearStorageCache();
}

function cascadeSupplierName(supplierId: string, newName: string): void {
  const purchases = getAll<StockPurchase>('stockPurchases');
  let purchasesChanged = false;
  purchases.forEach(pur => {
    if (pur.supplierId === supplierId) {
      pur.supplierName = newName;
      pur.updatedAt = new Date().toISOString();
      purchasesChanged = true;
    }
  });
  if (purchasesChanged) setAll('stockPurchases', purchases);

  const payments = getAll<SupplierPayment>('supplierPayments');
  let paymentsChanged = false;
  payments.forEach(p => {
    if (p.supplierId === supplierId) {
      p.supplierName = newName;
      paymentsChanged = true;
    }
  });
  if (paymentsChanged) setAll('supplierPayments', payments);
}

function getStorageUsage(): { used: number; total: number; percentage: number } {
  let total = 0;
  const prefix = `tenant_${getCurrentTenantId()}_`;
  for (const key in localStorage) {
    if (Object.prototype.hasOwnProperty.call(localStorage, key) && key.startsWith(prefix)) {
      total += localStorage.getItem(key)!.length * 2;
    }
  }
  const maxSize = 5 * 1024 * 1024;
  return { used: total, total: maxSize, percentage: (total / maxSize) * 100 };
}

// Products
export const productStorage = {
  getAll: (): Product[] => getAll<Product>('products'),
  getById: (id: string): Product | undefined => getAll<Product>('products').find(p => p.id === id),
  add: (product: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>): Product => {
    const products = getAll<Product>('products');
    const productType = normalizeProductType(product.productType);
    const stock = roundStockLevel(
      { productType },
      product.stock,
    );
    const newProduct: Product = {
      ...product,
      productType,
      cartonSize: productType === 'carton' ? product.cartonSize : undefined,
      category: product.category ?? '',
      stock,
      id: generateId(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    products.push(newProduct);
    setAll('products', products);
    return newProduct;
  },
  update: (id: string, updates: Partial<Product>): Product | undefined => {
    const products = getAll<Product>('products');
    const idx = products.findIndex(p => p.id === id);
    if (idx === -1) return undefined;
    const current = products[idx];
    const productType = normalizeProductType(updates.productType ?? current.productType);
    const nextStock =
      updates.stock !== undefined
        ? roundStockLevel({ productType }, updates.stock)
        : current.stock;
    products[idx] = {
      ...current,
      ...updates,
      productType,
      stock: nextStock,
      updatedAt: new Date().toISOString(),
    };
    setAll('products', products);
    return products[idx];
  },
  delete: (id: string): boolean => {
    const products = getAll<Product>('products');
    const filtered = products.filter(p => p.id !== id);
    if (filtered.length === products.length) return false;
    setAll('products', filtered);
    return true;
  },
  updateStock: (id: string, quantityChange: number): boolean => {
    try {
      const products = getAll<Product>('products');
      const updated = applyStockDeltasToProducts(
        products,
        new Map([[id, quantityChange]]),
      );
      setAll('products', updated);
      return true;
    } catch {
      return false;
    }
  },
  applyStockMovements: (
    lines: { productId: string; quantity: number }[],
    direction: 'in' | 'out',
    options?: { skipValidation?: boolean },
  ): void => {
    applyStockLines(lines, direction, options);
  },
};

// Customers
export const customerStorage = {
  getAll: (): Customer[] => getAll<Customer>('customers'),
  getById: (id: string): Customer | undefined => getAll<Customer>('customers').find(c => c.id === id),
  add: (customer: Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>): Customer => {
    const customers = getAll<Customer>('customers');
    const newCustomer: Customer = { ...customer, id: generateId(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    customers.push(newCustomer);
    setAll('customers', customers);
    return newCustomer;
  },
  update: (id: string, updates: Partial<Customer>): Customer | undefined => {
    const customers = getAll<Customer>('customers');
    const idx = customers.findIndex(c => c.id === id);
    if (idx === -1) return undefined;
    customers[idx] = { ...customers[idx], ...updates, updatedAt: new Date().toISOString() };
    setAll('customers', customers);
    return customers[idx];
  },
  delete: (id: string): boolean => {
    const customers = getAll<Customer>('customers');
    const filtered = customers.filter(c => c.id !== id);
    if (filtered.length === customers.length) return false;
    setAll('customers', filtered);
    return true;
  },
};

// Invoices
function syncInvoiceLedgerEntries(invoice: Invoice, timestamp: string): void {
  if (isWalkingCustomer(invoice.customerId)) return;

  const balanceBefore = paymentStorage.getCustomerBalance(invoice.customerId);
  const advanceAvailable =
    balanceBefore.balance < 0 ? Math.abs(balanceBefore.balance) : 0;
  const advanceApplied = Math.min(advanceAvailable, invoice.total);
  const isHistorical = Boolean(invoice.historical);
  const editedSuffix = invoice.editedAt ? ' (edited)' : '';

  paymentStorage.add(
    {
      customerId: invoice.customerId,
      customerName: invoice.customerName,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      amount: invoice.total,
      type: 'debit',
      note: isHistorical
        ? `Historical order ${invoice.invoiceNumber}${editedSuffix}`
        : `Invoice ${invoice.invoiceNumber}${editedSuffix}`,
    },
    timestamp,
  );

  if (advanceApplied > 0) {
    paymentStorage.add(
      {
        customerId: invoice.customerId,
        customerName: invoice.customerName,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        amount: advanceApplied,
        type: 'credit',
        note: `Advance applied to ${invoice.invoiceNumber}${editedSuffix}`,
      },
      timestamp,
    );
  }

  if (invoice.paidAmount > 0) {
    paymentStorage.add(
      {
        customerId: invoice.customerId,
        customerName: invoice.customerName,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        amount: invoice.paidAmount,
        type: 'credit',
        note: isHistorical
          ? `Historical payment for ${invoice.invoiceNumber}${editedSuffix}`
          : `Payment for ${invoice.invoiceNumber}${editedSuffix}`,
        paymentMethod: invoice.paymentMethod,
      },
      timestamp,
    );
  }
}

export const invoiceStorage = {
  getAll: (): Invoice[] => getAll<Invoice>('invoices'),
  getById: (id: string): Invoice | undefined => getAll<Invoice>('invoices').find(i => i.id === id),
  add: (
    invoice: Omit<Invoice, 'id' | 'invoiceNumber' | 'createdAt' | 'updatedAt' | 'historical' | 'dailySlipNumber'>,
    options?: HistoricalEntryOptions
  ): Invoice => {
    const timestamp = resolveOrderTimestamp(options?.orderDate);
    const isHistorical = Boolean(options?.orderDate || options?.skipStockUpdate);
    const invoices = getAll<Invoice>('invoices');
    const slipDate = new Date(timestamp);
    const newInvoice: Invoice = {
      ...invoice,
      id: generateId(),
      invoiceNumber: generateInvoiceNumber(options?.orderDate, options?.manualNumber),
      createdAt: timestamp,
      updatedAt: timestamp,
      historical: isHistorical,
      dailySlipNumber: isHistorical
        ? undefined
        : getNextDailySlipNumber(invoices, slipDate),
    };
    const stockLines = invoice.items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
    }));
    const shouldUpdateStock = !options?.skipStockUpdate;

    if (shouldUpdateStock) {
      applyStockLines(stockLines, 'out');
    }

    try {
      invoices.push(newInvoice);
      setAll('invoices', invoices);
    } catch (error) {
      if (shouldUpdateStock) {
        applyStockLines(stockLines, 'in', { skipValidation: true });
      }
      throw error;
    }
    syncInvoiceLedgerEntries(newInvoice, timestamp);
    return newInvoice;
  },
  update: (id: string, updates: Partial<Invoice>): Invoice | undefined => {
    const invoices = getAll<Invoice>('invoices');
    const idx = invoices.findIndex(i => i.id === id);
    if (idx === -1) return undefined;
    invoices[idx] = { ...invoices[idx], ...updates, updatedAt: new Date().toISOString() };
    setAll('invoices', invoices);
    return invoices[idx];
  },
  editInvoice: (
    id: string,
    updates: Pick<
      Invoice,
      | 'customerId'
      | 'customerName'
      | 'items'
      | 'subtotal'
      | 'discount'
      | 'tax'
      | 'total'
      | 'paidAmount'
      | 'remainingAmount'
      | 'paymentMethod'
      | 'status'
    >,
  ): Invoice => {
    const invoices = getAll<Invoice>('invoices');
    const idx = invoices.findIndex((invoice) => invoice.id === id);
    if (idx === -1) {
      throw new Error('Invoice not found');
    }

    const existing = invoices[idx];
    if (isInvoiceClosed(existing)) {
      throw new Error('Cannot edit a closed invoice');
    }

    const oldCustomerId = existing.customerId;
    const oldStockLines = existing.items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
    }));
    const newStockLines = updates.items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
    }));
    const shouldUpdateStock = !existing.historical;
    let stockRestored = false;

    if (shouldUpdateStock) {
      applyStockLines(oldStockLines, 'in', { skipValidation: true });
      stockRestored = true;
    }

    try {
      if (shouldUpdateStock) {
        validateStockOut(getAll<Product>('products'), newStockLines);
        applyStockLines(newStockLines, 'out');
      }

      paymentStorage.removeByInvoiceId(id);

      if (oldCustomerId && oldCustomerId !== updates.customerId) {
        customerLedgerStorage.touch(oldCustomerId);
      }

      const editedAt = new Date().toISOString();
      const updatedInvoice: Invoice = {
        ...existing,
        ...updates,
        editedAt,
        updatedAt: editedAt,
      };

      invoices[idx] = updatedInvoice;
      setAll('invoices', invoices);
      syncInvoiceLedgerEntries(updatedInvoice, existing.createdAt);
      customerLedgerStorage.touch(updates.customerId);
      return updatedInvoice;
    } catch (error) {
      if (stockRestored) {
        applyStockLines(oldStockLines, 'out', { skipValidation: true });
      }
      throw error;
    }
  },
  closeInvoice: (id: string, options: InvoiceCloseOptions): Invoice | undefined => {
    const invoices = getAll<Invoice>('invoices');
    const idx = invoices.findIndex(i => i.id === id);
    if (idx === -1) return undefined;

    const invoice = invoices[idx];
    if (isInvoiceClosed(invoice)) return undefined;

    const shouldRestoreStock = options.restoreStock && !invoice.historical;
    if (shouldRestoreStock) {
      applyStockLines(
        invoice.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
        })),
        'in',
        { skipValidation: true },
      );
    }

    paymentStorage.removeByInvoiceId(id);

    const status = options.mode === 'return' ? 'returned' : 'cancelled';
    const closureNote =
      options.mode === 'return'
        ? `Customer returned order ${invoice.invoiceNumber}`
        : `Voided mistaken invoice ${invoice.invoiceNumber}`;

    const closedAt = new Date().toISOString();
    invoices[idx] = {
      ...invoice,
      status,
      remainingAmount: 0,
      closedAt,
      stockRestoredOnClose: shouldRestoreStock,
      closureNote,
      updatedAt: closedAt,
    };
    setAll('invoices', invoices);
    return invoices[idx];
  },
  /** @deprecated Use closeInvoice — kept for compatibility */
  delete: (id: string): boolean => {
    return Boolean(
      invoiceStorage.closeInvoice(id, { mode: 'void', restoreStock: true })
    );
  },
  recordPayment: (invoiceId: string, amount: number): Invoice | undefined => {
    const invoices = getAll<Invoice>('invoices');
    const idx = invoices.findIndex(i => i.id === invoiceId);
    if (idx === -1) return undefined;
    const inv = invoices[idx];
    if (isInvoiceClosed(inv)) return undefined;
    inv.paidAmount = (inv.paidAmount || 0) + amount;
    inv.remainingAmount = inv.total - inv.paidAmount;
    if (inv.remainingAmount <= 0) {
      inv.status = 'paid';
      inv.remainingAmount = 0;
    } else {
      inv.status = 'partial';
    }
    inv.updatedAt = new Date().toISOString();
    invoices[idx] = inv;
    setAll('invoices', invoices);
    if (!isWalkingCustomer(inv.customerId)) {
      paymentStorage.add({
        customerId: inv.customerId,
        customerName: inv.customerName,
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        amount,
        type: 'credit',
        note: `Payment for ${inv.invoiceNumber}`,
        receiptNumber: generateLedgerReceiptNumber(),
        paymentMethod: inv.paymentMethod,
      });
    }
    return inv;
  },
};

// Payments (Ledger entries)
export const paymentStorage = {
  getAll: (): Payment[] => getAll<Payment>('payments'),
  getById: (id: string): Payment | undefined =>
    getAll<Payment>('payments').find((payment) => payment.id === id),
  getByCustomer: (customerId: string): Payment[] =>
    getAll<Payment>('payments').filter(p => p.customerId === customerId),
  add: (payment: Omit<Payment, 'id' | 'createdAt'>, createdAt?: string): Payment => {
    const payments = getAll<Payment>('payments');
    const at = createdAt ?? new Date().toISOString();
    const newPayment: Payment = { ...payment, id: generateId(), createdAt: at };
    payments.push(newPayment);
    setAll('payments', payments);
    customerLedgerStorage.touch(payment.customerId);
    return newPayment;
  },
  removeByInvoiceId: (invoiceId: string): void => {
    const payments = getAll<Payment>('payments');
    const filtered = payments.filter(p => p.invoiceId !== invoiceId);
    if (filtered.length === payments.length) return;
    setAll('payments', filtered);
  },
  updateManualEntry: (
    id: string,
    updates: {
      amount?: number;
      note?: string;
      createdAt?: string;
      paymentMethod?: Payment['paymentMethod'];
    },
  ): Payment | undefined => {
    const payments = getAll<Payment>('payments');
    const idx = payments.findIndex((payment) => payment.id === id);
    if (idx === -1) return undefined;

    const existing = payments[idx];
    if (!isManualLedgerEntry(existing)) return undefined;

    const amount = updates.amount ?? existing.amount;
    const note = updates.note ?? existing.note;
    const createdAt = updates.createdAt ?? existing.createdAt;
    const paymentMethod = updates.paymentMethod ?? existing.paymentMethod;

    if (amount <= 0) {
      throw new Error('Amount must be greater than zero');
    }

    if (
      existing.type === 'credit' &&
      !existing.skipInvoiceAllocation &&
      amount !== existing.amount
    ) {
      reverseManualPaymentAllocation(existing.customerId, existing.amount);
      applyManualPaymentToInvoices(existing.customerId, amount);
    }

    const updated: Payment = {
      ...existing,
      amount,
      note: note.trim() || existing.note,
      createdAt,
      paymentMethod,
    };
    payments[idx] = updated;
    setAll('payments', payments);
    customerLedgerStorage.touch(existing.customerId);
    return updated;
  },
  deleteManualEntry: (id: string): Payment | undefined => {
    const payments = getAll<Payment>('payments');
    const idx = payments.findIndex((payment) => payment.id === id);
    if (idx === -1) return undefined;

    const existing = payments[idx];
    if (!isManualLedgerEntry(existing)) return undefined;

    if (existing.type === 'credit' && !existing.skipInvoiceAllocation) {
      reverseManualPaymentAllocation(existing.customerId, existing.amount);
    }

    payments.splice(idx, 1);
    setAll('payments', payments);
    customerLedgerStorage.touch(existing.customerId);
    return existing;
  },
  getCustomerBalance: (customerId: string): { totalDebit: number; totalCredit: number; balance: number } => {
    const payments = getAll<Payment>('payments').filter(p => p.customerId === customerId);
    const totalDebit = payments.filter(p => p.type === 'debit').reduce((s, p) => s + p.amount, 0);
    const totalCredit = payments.filter(p => p.type === 'credit').reduce((s, p) => s + p.amount, 0);
    return { totalDebit, totalCredit, balance: totalDebit - totalCredit }; // positive = customer owes
  },
  addManualPayment: (
    customerId: string,
    customerName: string,
    amount: number,
    note: string,
    options?: {
      orderDate?: string;
      applyToInvoices?: boolean;
      paymentMethod?: Payment['paymentMethod'];
    }
  ): Payment => {
    const timestamp = resolveOrderTimestamp(options?.orderDate);
    const skipInvoiceAllocation = options?.applyToInvoices === false;
    const payment = paymentStorage.add(
      {
        customerId,
        customerName,
        amount,
        type: 'credit',
        note: note || 'Manual payment',
        skipInvoiceAllocation,
        receiptNumber: generateLedgerReceiptNumber(options?.orderDate),
        paymentMethod: options?.paymentMethod || 'cash',
      },
      timestamp,
    );
    if (skipInvoiceAllocation) return payment;

    applyManualPaymentToInvoices(customerId, amount);
    return payment;
  },
  /** Old ledger row without a linked invoice (opening balance, old order total, old payment). */
  addHistoricalLedgerEntry: (
    customerId: string,
    customerName: string,
    amount: number,
    type: 'debit' | 'credit',
    note: string,
    orderDate?: string,
    options?: { receiptNumber?: string },
  ): Payment => {
    const timestamp = resolveOrderTimestamp(orderDate);
    const defaultNote =
      type === 'debit'
        ? 'Old balance from previous records'
        : 'Old payment from previous records';
    return paymentStorage.add({
      customerId,
      customerName,
      amount,
      type,
      note: note.trim() || defaultNote,
      ...(options?.receiptNumber ? { receiptNumber: options.receiptNumber } : {}),
    }, timestamp);
  },
  addLedgerEntry: (
    customerId: string,
    customerName: string,
    amount: number,
    type: 'debit' | 'credit',
    note: string,
    options?: {
      orderDate?: string;
      applyToInvoices?: boolean;
      paymentMethod?: Payment['paymentMethod'];
    },
  ): Payment => {
    if (type === 'credit') {
      return paymentStorage.addManualPayment(
        customerId,
        customerName,
        amount,
        note,
        options,
      );
    }
    return paymentStorage.addHistoricalLedgerEntry(
      customerId,
      customerName,
      amount,
      'debit',
      note,
      options?.orderDate,
      { receiptNumber: generateLedgerReceiptNumber(options?.orderDate) },
    );
  },
};

export const customerLedgerStorage = {
  getAll: (): CustomerLedger[] =>
    getAll<CustomerLedger>('customerLedgers').sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    ),
  getByCustomerId: (customerId: string): CustomerLedger | undefined =>
    getAll<CustomerLedger>('customerLedgers').find(
      (ledger) => ledger.customerId === customerId,
    ),
  hasForCustomer: (customerId: string): boolean =>
    Boolean(customerLedgerStorage.getByCustomerId(customerId)),
  create: (
    customerId: string,
    customerName: string,
  ): CustomerLedger | undefined => {
    if (customerLedgerStorage.hasForCustomer(customerId)) return undefined;
    const ledgers = getAll<CustomerLedger>('customerLedgers');
    const now = new Date().toISOString();
    const ledger: CustomerLedger = {
      id: generateId(),
      customerId,
      customerName,
      createdAt: now,
      updatedAt: now,
    };
    ledgers.push(ledger);
    setAll('customerLedgers', ledgers);
    return ledger;
  },
  touch: (customerId: string): void => {
    const ledgers = getAll<CustomerLedger>('customerLedgers');
    const idx = ledgers.findIndex((ledger) => ledger.customerId === customerId);
    if (idx === -1) return;
    ledgers[idx] = {
      ...ledgers[idx],
      updatedAt: new Date().toISOString(),
    };
    setAll('customerLedgers', ledgers);
  },
};

// Suppliers (dealers)
export const supplierStorage = {
  getAll: (): Supplier[] => getAll<Supplier>('suppliers'),
  getById: (id: string): Supplier | undefined => getAll<Supplier>('suppliers').find(s => s.id === id),
  add: (supplier: Omit<Supplier, 'id' | 'createdAt' | 'updatedAt'>): Supplier => {
    const suppliers = getAll<Supplier>('suppliers');
    const newSupplier: Supplier = {
      ...supplier,
      id: generateId(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    suppliers.push(newSupplier);
    setAll('suppliers', suppliers);
    return newSupplier;
  },
  update: (id: string, updates: Partial<Supplier>): Supplier | undefined => {
    const suppliers = getAll<Supplier>('suppliers');
    const idx = suppliers.findIndex(s => s.id === id);
    if (idx === -1) return undefined;
    const previousName = suppliers[idx].name;
    suppliers[idx] = { ...suppliers[idx], ...updates, updatedAt: new Date().toISOString() };
    setAll('suppliers', suppliers);
    if (updates.name && updates.name.trim() !== previousName) {
      cascadeSupplierName(id, updates.name.trim());
    }
    return suppliers[idx];
  },
  delete: (id: string): boolean => {
    const purchases = getAll<StockPurchase>('stockPurchases').filter(p => p.supplierId === id);
    if (purchases.length > 0) return false;
    const suppliers = getAll<Supplier>('suppliers');
    const filtered = suppliers.filter(s => s.id !== id);
    if (filtered.length === suppliers.length) return false;
    setAll('suppliers', filtered);
    return true;
  },
};

// Stock purchases (oil in from dealers)
export const stockPurchaseStorage = {
  getAll: (): StockPurchase[] => getAll<StockPurchase>('stockPurchases'),
  getById: (id: string): StockPurchase | undefined =>
    getAll<StockPurchase>('stockPurchases').find(p => p.id === id),
  add: (
    purchase: Omit<StockPurchase, 'id' | 'slipNumber' | 'createdAt' | 'updatedAt' | 'historical'>,
    options?: HistoricalEntryOptions
  ): StockPurchase => {
    const timestamp = resolveOrderTimestamp(options?.orderDate);
    const isHistorical = Boolean(options?.orderDate || options?.skipStockUpdate);
    const purchases = getAll<StockPurchase>('stockPurchases');
    const stockLines = purchase.items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
    }));
    const shouldUpdateStock = !options?.skipStockUpdate;

    if (shouldUpdateStock) {
      applyStockLines(stockLines, 'in', { skipValidation: true });
    }

    const resolvedItems = purchase.items.map((item) => {
      const product = productStorage.getById(item.productId);
      return {
        ...item,
        productId: item.productId,
        productName: product?.name ?? item.productName,
        productType: product?.productType ?? item.productType ?? 'oil',
        cartonSize: product?.cartonSize ?? item.cartonSize,
        category: product?.category ?? item.category ?? '',
      };
    });
    const newPurchase: StockPurchase = {
      ...purchase,
      items: resolvedItems,
      id: generateId(),
      slipNumber: generatePurchaseSlipNumber(options?.orderDate, options?.manualNumber),
      createdAt: timestamp,
      updatedAt: timestamp,
      historical: isHistorical,
    };
    purchases.push(newPurchase);

    try {
      setAll('stockPurchases', purchases);
    } catch (error) {
      if (shouldUpdateStock) {
        applyStockLines(stockLines, 'out');
      }
      throw error;
    }

    supplierPaymentStorage.add({
      supplierId: purchase.supplierId,
      supplierName: purchase.supplierName,
      purchaseId: newPurchase.id,
      slipNumber: newPurchase.slipNumber,
      amount: purchase.total,
      type: 'debit',
      note: isHistorical
        ? `Historical purchase ${newPurchase.slipNumber}`
        : `Purchase ${newPurchase.slipNumber}`,
    }, timestamp);
    if (purchase.paidAmount > 0) {
      supplierPaymentStorage.add({
        supplierId: purchase.supplierId,
        supplierName: purchase.supplierName,
        purchaseId: newPurchase.id,
        slipNumber: newPurchase.slipNumber,
        amount: purchase.paidAmount,
        type: 'credit',
        note: isHistorical
          ? `Historical payment for ${newPurchase.slipNumber}`
          : `Payment for ${newPurchase.slipNumber}`,
      }, timestamp);
    }
    return newPurchase;
  },
  update: (id: string, updates: Partial<StockPurchase>): StockPurchase | undefined => {
    const purchases = getAll<StockPurchase>('stockPurchases');
    const idx = purchases.findIndex(p => p.id === id);
    if (idx === -1) return undefined;
    purchases[idx] = { ...purchases[idx], ...updates, updatedAt: new Date().toISOString() };
    setAll('stockPurchases', purchases);
    return purchases[idx];
  },
  delete: (id: string): boolean => {
    const purchases = getAll<StockPurchase>('stockPurchases');
    const purchase = purchases.find(p => p.id === id);
    if (!purchase) return false;
    if (!purchase.historical) {
      applyStockLines(
        purchase.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
        })),
        'out',
      );
    }
    setAll('stockPurchases', purchases.filter(p => p.id !== id));
    return true;
  },
  recordPayment: (purchaseId: string, amount: number): StockPurchase | undefined => {
    const purchases = getAll<StockPurchase>('stockPurchases');
    const idx = purchases.findIndex(p => p.id === purchaseId);
    if (idx === -1) return undefined;
    const pur = purchases[idx];
    pur.paidAmount = (pur.paidAmount || 0) + amount;
    pur.remainingAmount = Math.max(0, pur.total - pur.paidAmount);
    pur.status = pur.remainingAmount <= 0 ? 'paid' : 'partial';
    pur.updatedAt = new Date().toISOString();
    purchases[idx] = pur;
    setAll('stockPurchases', purchases);
    supplierPaymentStorage.add({
      supplierId: pur.supplierId,
      supplierName: pur.supplierName,
      purchaseId: pur.id,
      slipNumber: pur.slipNumber,
      amount,
      type: 'credit',
      note: `Payment for ${pur.slipNumber}`,
    });
    return pur;
  },
};

// Supplier payments (amount owed to / paid to dealers)
export const supplierPaymentStorage = {
  getAll: (): SupplierPayment[] => getAll<SupplierPayment>('supplierPayments'),
  getBySupplier: (supplierId: string): SupplierPayment[] =>
    getAll<SupplierPayment>('supplierPayments').filter(p => p.supplierId === supplierId),
  add: (payment: Omit<SupplierPayment, 'id' | 'createdAt'>, createdAt?: string): SupplierPayment => {
    const payments = getAll<SupplierPayment>('supplierPayments');
    const at = createdAt ?? new Date().toISOString();
    const newPayment: SupplierPayment = {
      ...payment,
      id: generateId(),
      createdAt: at,
    };
    payments.push(newPayment);
    setAll('supplierPayments', payments);
    return newPayment;
  },
  getSupplierBalance: (supplierId: string): { totalDebit: number; totalCredit: number; balance: number } => {
    const payments = getAll<SupplierPayment>('supplierPayments').filter(p => p.supplierId === supplierId);
    const totalDebit = payments.filter(p => p.type === 'debit').reduce((s, p) => s + p.amount, 0);
    const totalCredit = payments.filter(p => p.type === 'credit').reduce((s, p) => s + p.amount, 0);
    return { totalDebit, totalCredit, balance: totalDebit - totalCredit };
  },
};

// Settings
export const settingsStorage = {
  get: (): ShopSettings => {
    const cacheKey = scopedKey('settings');
    if (settingsCacheKey === cacheKey && settingsCache) return settingsCache;

    const parsed = readJsonValue<
      Partial<ShopSettings> & { shopName?: string; currency?: string }
    >(cacheKey, DEFAULT_SETTINGS, {
      onRecovered: () => notifyStorageRecovered('settings'),
    });
    const merged = normalizeSettings(parsed);
    settingsCacheKey = cacheKey;
    settingsCache = merged;
    return merged;
  },
  update: (updates: Partial<ShopSettings>): ShopSettings => {
    const { shopName: _shopName, taxRate: _taxRate, ...safeUpdates } = updates as Partial<ShopSettings> & {
      shopName?: string;
      taxRate?: number;
    };
    const current = settingsStorage.get();
    const updated = { ...current, ...safeUpdates };
    const cacheKey = scopedKey('settings');
    safeSetItem(cacheKey, JSON.stringify(updated));
    settingsCacheKey = cacheKey;
    settingsCache = updated;
    markTenantDataDirty();
    scheduleTenantAutosave(buildTenantAutosaveSnapshot);
    invalidateShopQueries('settings');
    return updated;
  },
};

// Backup & Restore
export const backupStorage = {
  getLastBackupAt: (): Date | null => {
    const raw = localStorage.getItem(scopedKey('last_backup_at'));
    if (!raw) return null;
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date;
  },
  markBackupCompleted: (): void => {
    localStorage.setItem(scopedKey('last_backup_at'), new Date().toISOString());
  },
  isBackupDue: (): boolean => {
    const last = backupStorage.getLastBackupAt();
    if (!last) return true;
    return Date.now() - last.getTime() >= BACKUP_INTERVAL_MS;
  },
  download: (): void => {
    const data = backupStorage.export();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `oil-shop-backup-${new Date().toISOString().split('T')[0]}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    backupStorage.markBackupCompleted();
  },
  export: (): string => {
    const data = {
      products: productStorage.getAll(),
      customers: customerStorage.getAll(),
      suppliers: supplierStorage.getAll(),
      invoices: invoiceStorage.getAll(),
      payments: paymentStorage.getAll(),
      customerLedgers: customerLedgerStorage.getAll(),
      stockPurchases: stockPurchaseStorage.getAll(),
      supplierPayments: supplierPaymentStorage.getAll(),
      settings: settingsStorage.get(),
      exportedAt: new Date().toISOString(),
    };
    return JSON.stringify(data, null, 2);
  },
  import: (jsonString: string): { success: boolean; message: string } => {
    try {
      const data = JSON.parse(jsonString);
      if (!data.products || !data.customers || !data.invoices) {
        return { success: false, message: 'Invalid backup file format' };
      }
      setAll('products', data.products);
      setAll('customers', data.customers);
      if (data.suppliers) setAll('suppliers', data.suppliers);
      setAll('invoices', data.invoices);
      if (data.payments) setAll('payments', data.payments);
      if (data.customerLedgers) setAll('customerLedgers', data.customerLedgers);
      if (data.stockPurchases) setAll('stockPurchases', data.stockPurchases);
      if (data.supplierPayments) setAll('supplierPayments', data.supplierPayments);
      if (data.settings) {
        const settings = normalizeSettings(
          data.settings as Partial<ShopSettings> & { shopName?: string; currency?: string }
        );
        safeSetItem(scopedKey('settings'), JSON.stringify(settings));
        settingsCacheKey = scopedKey('settings');
        settingsCache = settings;
      }
      scheduleTenantAutosave(buildTenantAutosaveSnapshot);
      flushTenantAutosave(buildTenantAutosaveSnapshot);
      invalidateAllShopQueries();
      return { success: true, message: 'Data restored successfully' };
    } catch {
      return { success: false, message: 'Failed to parse backup file' };
    }
  },
  getStorageUsage,
};

export const SETTINGS_UPDATED_EVENT = 'oilshop-settings-updated';
export const STORAGE_QUOTA_EVENT = 'oilshop-storage-quota';

export function notifySettingsUpdated(): void {
  window.dispatchEvent(new Event(SETTINGS_UPDATED_EVENT));
}

/** Force-write the debounced local safety snapshot (e.g. before tab close). */
export function flushLocalDataSnapshot(): void {
  flushTenantAutosave(buildTenantAutosaveSnapshot);
}

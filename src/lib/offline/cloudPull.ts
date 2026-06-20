import type {
  Customer,
  Invoice,
  InvoiceItem,
  Payment,
  Product,
  ShopSettings,
  StockPurchase,
  StockPurchaseItem,
  Supplier,
  SupplierPayment,
  TenantCloudSnapshot,
} from '@/lib/storage';
import { normalizeProductType, type CartonSize, type ProductType } from '@/lib/productTypes';
import { supabase } from '@/lib/supabase/client';
import { withNetworkRetry } from '@/lib/offline/network';

function asString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (value == null) return fallback;
  return String(value);
}

function asNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asPaymentMethod(value: unknown): 'cash' | 'card' | 'credit' {
  if (value === 'card' || value === 'credit') return value;
  return 'cash';
}

function asInvoiceStatus(value: unknown): Invoice['status'] {
  if (
    value === 'paid' ||
    value === 'pending' ||
    value === 'partial' ||
    value === 'cancelled' ||
    value === 'returned'
  ) {
    return value;
  }
  return 'pending';
}

function asPurchaseStatus(value: unknown): StockPurchase['status'] {
  if (value === 'paid' || value === 'partial') return value;
  return 'pending';
}

function asLedgerType(value: unknown): 'credit' | 'debit' {
  return value === 'debit' ? 'debit' : 'credit';
}

function mapInvoiceItems(value: unknown): InvoiceItem[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const row = item as Record<string, unknown>;
    const productType = normalizeProductType(row.productType as ProductType | undefined);
    return {
      productId: asString(row.productId),
      productName: asString(row.productName),
      productType,
      cartonSize: row.cartonSize as CartonSize | undefined,
      pricePerLiter: asNumber(row.pricePerLiter),
      appliedPrice: asNumber(row.appliedPrice ?? row.pricePerLiter),
      quantity: asNumber(row.quantity),
      total: asNumber(row.total),
    };
  });
}

function mapStockItems(value: unknown): StockPurchaseItem[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const row = item as Record<string, unknown>;
    return {
      productId: asString(row.productId),
      productName: asString(row.productName),
      productType: row.productType as ProductType | undefined,
      cartonSize: row.cartonSize as CartonSize | undefined,
      category: asString(row.category),
      quantity: asNumber(row.quantity),
      pricePerLiter: asNumber(row.pricePerLiter),
      total: asNumber(row.total),
    };
  });
}

function unmapProduct(row: Record<string, unknown>): Product {
  const productType = normalizeProductType(row.product_type as ProductType | undefined);
  return {
    id: asString(row.id),
    name: asString(row.name),
    productType,
    cartonSize: row.carton_size as CartonSize | undefined,
    pricePerLiter: asNumber(row.price_per_liter),
    stock: asNumber(row.stock),
    category: asString(row.category),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
  };
}

function unmapCustomer(row: Record<string, unknown>): Customer {
  return {
    id: asString(row.id),
    name: asString(row.name),
    phone: asString(row.phone),
    address: asString(row.address),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
  };
}

function unmapSupplier(row: Record<string, unknown>): Supplier {
  return {
    id: asString(row.id),
    name: asString(row.name),
    phone: asString(row.phone),
    address: asString(row.address),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
  };
}

function unmapInvoice(row: Record<string, unknown>): Invoice {
  return {
    id: asString(row.id),
    invoiceNumber: asString(row.invoice_number),
    customerId: asString(row.customer_id),
    customerName: asString(row.customer_name),
    items: mapInvoiceItems(row.items),
    subtotal: asNumber(row.subtotal),
    discount: asNumber(row.discount),
    tax: asNumber(row.tax),
    total: asNumber(row.total),
    paidAmount: asNumber(row.paid_amount),
    remainingAmount: asNumber(row.remaining_amount),
    paymentMethod: asPaymentMethod(row.payment_method),
    status: asInvoiceStatus(row.status),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
  };
}

function unmapPayment(row: Record<string, unknown>): Payment {
  const invoiceId = asString(row.invoice_id);
  return {
    id: asString(row.id),
    customerId: asString(row.customer_id),
    customerName: asString(row.customer_name),
    invoiceId: invoiceId || undefined,
    invoiceNumber: asString(row.invoice_number) || undefined,
    amount: asNumber(row.amount),
    type: asLedgerType(row.type),
    note: asString(row.note),
    createdAt: asString(row.created_at),
    paymentMethod: asPaymentMethod(row.payment_method),
  };
}

function unmapStockPurchase(row: Record<string, unknown>): StockPurchase {
  return {
    id: asString(row.id),
    slipNumber: asString(row.slip_number),
    supplierId: asString(row.supplier_id),
    supplierName: asString(row.supplier_name),
    vehicleNumber: asString(row.vehicle_number),
    vehicleDriver: asString(row.vehicle_driver),
    vehicleType: asString(row.vehicle_type),
    items: mapStockItems(row.items),
    total: asNumber(row.total),
    paidAmount: asNumber(row.paid_amount),
    remainingAmount: asNumber(row.remaining_amount),
    paymentMethod: asPaymentMethod(row.payment_method),
    status: asPurchaseStatus(row.status),
    note: asString(row.note),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
  };
}

function unmapSupplierPayment(row: Record<string, unknown>): SupplierPayment {
  const purchaseId = asString(row.purchase_id);
  const slipNumber = asString(row.slip_number);
  return {
    id: asString(row.id),
    supplierId: asString(row.supplier_id),
    supplierName: asString(row.supplier_name),
    purchaseId: purchaseId || undefined,
    slipNumber: slipNumber || undefined,
    amount: asNumber(row.amount),
    type: asLedgerType(row.type),
    note: asString(row.note),
    createdAt: asString(row.created_at),
  };
}

function unmapSettings(row: Record<string, unknown> | null): ShopSettings {
  if (!row) {
    return {
      shopAddress: '',
      shopPhone: '',
      thankYouMessage: 'Thank you for your business!',
      printerName: '',
    };
  }

  return {
    shopAddress: asString(row.shop_address),
    shopPhone: asString(row.shop_phone),
    thankYouMessage:
      asString(row.thank_you_message) || 'Thank you for your business!',
    printerName: '',
  };
}

async function fetchTenantRows(table: string): Promise<Record<string, unknown>[]> {
  if (!supabase) return [];
  const result = await withNetworkRetry(async () => {
    const response = await supabase!.from(table).select('*');
    if (response.error) throw new Error(`${table}: ${response.error.message}`);
    return response;
  });
  return (result.data ?? []) as Record<string, unknown>[];
}

export async function fetchTenantSnapshotFromCloud(): Promise<TenantCloudSnapshot> {
  const [
    productRows,
    customerRows,
    supplierRows,
    invoiceRows,
    paymentRows,
    stockRows,
    supplierPaymentRows,
    settingsRows,
  ] = await Promise.all([
    fetchTenantRows('products'),
    fetchTenantRows('customers'),
    fetchTenantRows('suppliers'),
    fetchTenantRows('invoices'),
    fetchTenantRows('payments'),
    fetchTenantRows('stock_purchases'),
    fetchTenantRows('supplier_payments'),
    fetchTenantRows('shop_settings'),
  ]);

  return {
    products: productRows.map(unmapProduct),
    customers: customerRows.map(unmapCustomer),
    suppliers: supplierRows.map(unmapSupplier),
    invoices: invoiceRows.map(unmapInvoice),
    payments: paymentRows.map(unmapPayment),
    stockPurchases: stockRows.map(unmapStockPurchase),
    supplierPayments: supplierPaymentRows.map(unmapSupplierPayment),
    settings: unmapSettings(settingsRows[0] ?? null),
  };
}

export function countCloudSnapshotRecords(snapshot: TenantCloudSnapshot): number {
  return (
    snapshot.products.length +
    snapshot.customers.length +
    snapshot.suppliers.length +
    snapshot.invoices.length +
    snapshot.payments.length +
    snapshot.stockPurchases.length +
    snapshot.supplierPayments.length
  );
}

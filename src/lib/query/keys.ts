/** Central query keys — all shop data is offline-first (localStorage). */
export const queryKeys = {
  root: ['shop'] as const,
  products: ['shop', 'products'] as const,
  product: (id: string) => ['shop', 'products', id] as const,
  customers: ['shop', 'customers'] as const,
  customer: (id: string) => ['shop', 'customers', id] as const,
  suppliers: ['shop', 'suppliers'] as const,
  supplier: (id: string) => ['shop', 'suppliers', id] as const,
  invoices: ['shop', 'invoices'] as const,
  invoice: (id: string) => ['shop', 'invoices', id] as const,
  payments: ['shop', 'payments'] as const,
  customerPayments: (customerId: string) => ['shop', 'payments', 'customer', customerId] as const,
  customerBalance: (customerId: string) => ['shop', 'ledger', 'balance', customerId] as const,
  customerLedgers: ['shop', 'customerLedgers'] as const,
  customerInvoices: (customerId: string) => ['shop', 'invoices', 'customer', customerId] as const,
  stockPurchases: ['shop', 'stockPurchases'] as const,
  stockPurchase: (id: string) => ['shop', 'stockPurchases', id] as const,
  supplierPayments: ['shop', 'supplierPayments'] as const,
  supplierPaymentsBySupplier: (supplierId: string) =>
    ['shop', 'supplierPayments', 'supplier', supplierId] as const,
  supplierBalance: (supplierId: string) =>
    ['shop', 'supplierLedger', 'balance', supplierId] as const,
  settings: ['shop', 'settings'] as const,
  dashboard: ['shop', 'dashboard'] as const,
};

export type ShopStorageKey =
  | 'products'
  | 'customers'
  | 'suppliers'
  | 'invoices'
  | 'payments'
  | 'customerLedgers'
  | 'stockPurchases'
  | 'supplierPayments';

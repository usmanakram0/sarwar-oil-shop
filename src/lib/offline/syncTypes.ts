export type SyncTableName =
  | 'products'
  | 'customers'
  | 'suppliers'
  | 'invoices'
  | 'payments'
  | 'stock_purchases'
  | 'supplier_payments';

export const SYNC_TABLE_ORDER: SyncTableName[] = [
  'products',
  'customers',
  'suppliers',
  'invoices',
  'payments',
  'stock_purchases',
  'supplier_payments',
];

export const SYNC_TABLE_LABELS: Record<SyncTableName, string> = {
  products: 'Products',
  customers: 'Customers',
  suppliers: 'Suppliers',
  invoices: 'Invoices',
  payments: 'Payments',
  stock_purchases: 'Stock purchases',
  supplier_payments: 'Supplier payments',
};

export interface UnsyncedRecord {
  table: SyncTableName;
  id: string;
  label: string;
}

export interface TableSyncCounts {
  table: SyncTableName;
  label: string;
  local: number;
  cloud: number;
}

export interface SyncVerificationResult {
  ok: boolean;
  verifiedAt: string;
  counts: TableSyncCounts[];
  unsynced: UnsyncedRecord[];
}

export interface SyncPushResult {
  ok: boolean;
  message?: string;
  verification?: SyncVerificationResult;
  emergencyBackupSaved?: boolean;
}

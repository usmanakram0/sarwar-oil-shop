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
  /** Every local record exists in cloud (upload succeeded). */
  uploadComplete: boolean;
  /** Device and cloud have the same record counts per table. */
  countsMatch: boolean;
  /** Cloud has more records than this device (download may be needed). */
  cloudHasMoreRecords: boolean;
  verifiedAt: string;
  counts: TableSyncCounts[];
  unsynced: UnsyncedRecord[];
  error?: string;
}

export interface SyncPushResult {
  ok: boolean;
  message?: string;
  verification?: SyncVerificationResult;
  emergencyBackupSaved?: boolean;
}

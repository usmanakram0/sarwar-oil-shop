import type { Invoice } from '@/lib/storage';

export type InvoiceCloseMode = 'return' | 'void';

export interface InvoiceCloseOptions {
  mode: InvoiceCloseMode;
  /** When true, oil quantities are added back to product stock (ignored for old/historical records). */
  restoreStock: boolean;
}

export function isInvoiceClosed(invoice: Pick<Invoice, 'status'>): boolean {
  return invoice.status === 'returned' || invoice.status === 'cancelled';
}

export function isActiveSale(invoice: Pick<Invoice, 'status'>): boolean {
  return !isInvoiceClosed(invoice);
}

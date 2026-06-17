/** Helpers for entering old orders, ledger rows, and stock records with past dates. */

export type HistoricalEntryOptions = {
  /** YYYY-MM-DD from a date input */
  orderDate?: string;
  /** Do not change product stock (past orders already fulfilled) */
  skipStockUpdate?: boolean;
  /** Voucher / slip number from old written records */
  manualNumber?: string;
};

export function formatDateInputValue(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Parse YYYY-MM-DD to ISO at local noon (stable for ledger sorting). */
export function parseOrderDate(dateStr: string): string | null {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const date = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function validateOrderDate(dateStr: string): { valid: boolean; message?: string } {
  if (!dateStr) {
    return { valid: false, message: 'Please select an order date' };
  }
  const parsed = parseOrderDate(dateStr);
  if (!parsed) {
    return { valid: false, message: 'Invalid date' };
  }
  const date = new Date(parsed);
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  if (date.getTime() > today.getTime()) {
    return { valid: false, message: 'Date cannot be in the future' };
  }
  const minYear = 1990;
  if (date.getFullYear() < minYear) {
    return { valid: false, message: `Date must be ${minYear} or later` };
  }
  return { valid: true };
}

export function resolveOrderTimestamp(orderDate?: string): string {
  if (!orderDate) return new Date().toISOString();
  return parseOrderDate(orderDate) ?? new Date().toISOString();
}

export function isPastDate(dateStr: string): boolean {
  const parsed = parseOrderDate(dateStr);
  if (!parsed) return false;
  const today = formatDateInputValue();
  return dateStr < today;
}

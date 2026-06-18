import type { Customer, CustomerLedger, Invoice, Payment } from '@/lib/storage';
import { isWalkingCustomer } from '@/lib/walkingCustomer';

export interface LedgerCustomerRow {
  customerId: string;
  customerName: string;
  lastActivityAt: string;
  /** True when ledger was created manually and has no invoices/payments yet */
  isManualOnly: boolean;
}

export function buildLedgerCustomerList(
  customers: Customer[],
  payments: Payment[],
  invoices: Invoice[],
  manualLedgers: CustomerLedger[],
): LedgerCustomerRow[] {
  const map = new Map<string, LedgerCustomerRow>();

  const upsert = (customerId: string, customerName: string, at: string) => {
    if (isWalkingCustomer(customerId)) return;

    const resolvedName =
      customers.find((customer) => customer.id === customerId)?.name ||
      customerName;
    const existing = map.get(customerId);

    if (!existing) {
      map.set(customerId, {
        customerId,
        customerName: resolvedName,
        lastActivityAt: at,
        isManualOnly: false,
      });
      return;
    }

    existing.customerName = resolvedName;
    existing.isManualOnly = false;
    if (new Date(at) > new Date(existing.lastActivityAt)) {
      existing.lastActivityAt = at;
    }
  };

  for (const payment of payments) {
    upsert(payment.customerId, payment.customerName, payment.createdAt);
  }

  for (const invoice of invoices) {
    upsert(invoice.customerId, invoice.customerName, invoice.createdAt);
  }

  for (const ledger of manualLedgers) {
    if (map.has(ledger.customerId)) continue;

    const resolvedName =
      customers.find((customer) => customer.id === ledger.customerId)?.name ||
      ledger.customerName;

    map.set(ledger.customerId, {
      customerId: ledger.customerId,
      customerName: resolvedName,
      lastActivityAt: ledger.updatedAt,
      isManualOnly: true,
    });
  }

  return Array.from(map.values()).sort(
    (a, b) =>
      new Date(b.lastActivityAt).getTime() -
      new Date(a.lastActivityAt).getTime(),
  );
}

export function filterLedgerCustomers(
  rows: LedgerCustomerRow[],
  customers: Customer[],
  search: string,
): LedgerCustomerRow[] {
  const term = search.toLowerCase().trim();
  if (!term) return rows;

  return rows.filter((row) => {
    const customer = customers.find((c) => c.id === row.customerId);
    const name = customer?.name || row.customerName;
    const phone = customer?.phone || '';
    return (
      name.toLowerCase().includes(term) || phone.toLowerCase().includes(term)
    );
  });
}

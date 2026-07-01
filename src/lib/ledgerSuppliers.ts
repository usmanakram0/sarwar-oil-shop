import type { StockPurchase, Supplier, SupplierPayment } from '@/lib/storage';

export interface LedgerSupplierRow {
  supplierId: string;
  supplierName: string;
  lastActivityAt: string;
}

export function buildLedgerSupplierList(
  suppliers: Supplier[],
  payments: SupplierPayment[],
  purchases: StockPurchase[],
): LedgerSupplierRow[] {
  const map = new Map<string, LedgerSupplierRow>();

  const upsert = (supplierId: string, supplierName: string, at: string) => {
    const resolvedName =
      suppliers.find((supplier) => supplier.id === supplierId)?.name ||
      supplierName;
    const existing = map.get(supplierId);

    if (!existing) {
      map.set(supplierId, {
        supplierId,
        supplierName: resolvedName,
        lastActivityAt: at,
      });
      return;
    }

    existing.supplierName = resolvedName;
    if (new Date(at) > new Date(existing.lastActivityAt)) {
      existing.lastActivityAt = at;
    }
  };

  for (const payment of payments) {
    upsert(payment.supplierId, payment.supplierName, payment.createdAt);
  }

  for (const purchase of purchases) {
    upsert(purchase.supplierId, purchase.supplierName, purchase.createdAt);
  }

  for (const supplier of suppliers) {
    if (map.has(supplier.id)) continue;
    map.set(supplier.id, {
      supplierId: supplier.id,
      supplierName: supplier.name,
      lastActivityAt: supplier.updatedAt,
    });
  }

  return Array.from(map.values()).sort(
    (a, b) =>
      new Date(b.lastActivityAt).getTime() -
      new Date(a.lastActivityAt).getTime(),
  );
}

export function filterLedgerSuppliers(
  rows: LedgerSupplierRow[],
  suppliers: Supplier[],
  search: string,
): LedgerSupplierRow[] {
  const term = search.toLowerCase().trim();
  if (!term) return rows;

  return rows.filter((row) => {
    const supplier = suppliers.find((s) => s.id === row.supplierId);
    const name = supplier?.name || row.supplierName;
    const phone = supplier?.phone || '';
    return (
      name.toLowerCase().includes(term) || phone.toLowerCase().includes(term)
    );
  });
}

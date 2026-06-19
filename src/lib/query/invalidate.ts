import { queryClient } from '@/lib/query/client';
import { queryKeys, type ShopStorageKey } from '@/lib/query/keys';

export type InvalidationScope =
  | ShopStorageKey
  | 'settings'
  | 'dashboard'
  | 'ledger'
  | 'all';

const STORAGE_KEY_TO_SCOPE: Record<ShopStorageKey, InvalidationScope[]> = {
  products: ['products', 'dashboard', 'ledger'],
  customers: ['customers', 'dashboard', 'ledger'],
  suppliers: ['suppliers', 'stockPurchases', 'supplierPayments'],
  invoices: ['invoices', 'payments', 'products', 'dashboard', 'ledger'],
  payments: ['payments', 'invoices', 'dashboard', 'ledger'],
  customerLedgers: ['customerLedgers', 'ledger'],
  stockPurchases: ['stockPurchases', 'products', 'supplierPayments', 'dashboard'],
  supplierPayments: ['supplierPayments', 'stockPurchases', 'dashboard'],
};

const SCOPE_TO_QUERY_KEYS: Record<InvalidationScope, readonly (readonly unknown[])[]> = {
  products: [queryKeys.products, queryKeys.dashboard],
  customers: [queryKeys.customers, queryKeys.dashboard, queryKeys.root],
  suppliers: [queryKeys.suppliers],
  invoices: [queryKeys.invoices, queryKeys.dashboard],
  payments: [queryKeys.payments, queryKeys.dashboard, queryKeys.root],
  customerLedgers: [queryKeys.customerLedgers, queryKeys.root],
  stockPurchases: [queryKeys.stockPurchases, queryKeys.dashboard],
  supplierPayments: [queryKeys.supplierPayments],
  settings: [queryKeys.settings],
  dashboard: [queryKeys.dashboard],
  ledger: [queryKeys.payments, queryKeys.invoices, queryKeys.customers, queryKeys.customerLedgers, queryKeys.root],
  all: [queryKeys.root],
};

export function storageKeyToScopes(key: string): InvalidationScope[] {
  if (key in STORAGE_KEY_TO_SCOPE) {
    return STORAGE_KEY_TO_SCOPE[key as ShopStorageKey];
  }
  return [];
}

function uniqueQueryKeys(scopes: InvalidationScope[]): (readonly unknown[])[] {
  const seen = new Set<string>();
  const keys: (readonly unknown[])[] = [];

  for (const scope of scopes) {
    const entries = SCOPE_TO_QUERY_KEYS[scope] ?? [];
    for (const queryKey of entries) {
      const serialized = JSON.stringify(queryKey);
      if (seen.has(serialized)) continue;
      seen.add(serialized);
      keys.push(queryKey);
    }
  }

  return keys;
}

/** Invalidate related queries after local data changes (offline-first). */
export function invalidateShopQueries(
  scope: InvalidationScope | InvalidationScope[]
): void {
  try {
    const scopes = Array.isArray(scope) ? scope : [scope];
    const queryKeysToInvalidate = uniqueQueryKeys(scopes);

    for (const queryKey of queryKeysToInvalidate) {
      void queryClient.invalidateQueries({ queryKey });
    }

    if (scopes.includes('all')) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.root });
    }

    if (
      scopes.some(s =>
        ['invoices', 'payments', 'customers', 'ledger'].includes(s)
      )
    ) {
      void queryClient.invalidateQueries({
        predicate: (query) => {
          const root = query.queryKey[0];
          const second = query.queryKey[1];
          if (root !== 'shop') return false;
          return (
            second === 'payments' ||
            second === 'invoices' ||
            second === 'ledger' ||
            second === 'customerLedgers'
          );
        },
      });
    }

    if (scopes.some(s => ['products', 'stockPurchases'].includes(s))) {
      void queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey[0] === 'shop' && query.queryKey[1] === 'products',
      });
    }
  } catch {
    /* never crash the app on cache invalidation */
  }
}

export function invalidateAllShopQueries(): void {
  invalidateShopQueries('all');
}

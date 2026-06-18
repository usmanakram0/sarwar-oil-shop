import { useQuery } from '@tanstack/react-query';
import {
  customerStorage,
  customerLedgerStorage,
  invoiceStorage,
  paymentStorage,
  productStorage,
  settingsStorage,
  stockPurchaseStorage,
  supplierStorage,
  type Customer,
  type CustomerLedger,
  type Invoice,
  type Payment,
  type Product,
  type ShopSettings,
  type StockPurchase,
  type Supplier,
} from '@/lib/storage';
import { queryKeys } from '@/lib/query/keys';
import { safeArray, safeQueryFn } from '@/lib/query/safe';

const OFFLINE_QUERY_OPTIONS = {
  networkMode: 'always' as const,
  retry: false as const,
  refetchOnWindowFocus: false as const,
  refetchOnReconnect: false as const,
};

export function useProductsQuery() {
  return useQuery({
    queryKey: queryKeys.products,
    queryFn: safeQueryFn(() => productStorage.getAll(), [] as Product[]),
    placeholderData: [] as Product[],
    ...OFFLINE_QUERY_OPTIONS,
  });
}

export function useProductsList() {
  const query = useProductsQuery();
  return {
    ...query,
    products: safeArray(query.data),
  };
}

export function useCustomersQuery() {
  return useQuery({
    queryKey: queryKeys.customers,
    queryFn: safeQueryFn(() => customerStorage.getAll(), [] as Customer[]),
    placeholderData: [] as Customer[],
    ...OFFLINE_QUERY_OPTIONS,
  });
}

export function useCustomersList() {
  const query = useCustomersQuery();
  return {
    ...query,
    customers: safeArray(query.data),
  };
}

export function useCustomerQuery(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.customer(id ?? ''),
    queryFn: safeQueryFn(() => (id ? customerStorage.getById(id) : undefined), undefined),
    enabled: Boolean(id),
    ...OFFLINE_QUERY_OPTIONS,
  });
}

export function useSuppliersQuery() {
  return useQuery({
    queryKey: queryKeys.suppliers,
    queryFn: safeQueryFn(() => supplierStorage.getAll(), [] as Supplier[]),
    placeholderData: [] as Supplier[],
    ...OFFLINE_QUERY_OPTIONS,
  });
}

export function useSuppliersList() {
  const query = useSuppliersQuery();
  return {
    ...query,
    suppliers: safeArray(query.data),
  };
}

export function useSupplierQuery(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.supplier(id ?? ''),
    queryFn: safeQueryFn(() => (id ? supplierStorage.getById(id) : undefined), undefined),
    enabled: Boolean(id),
    ...OFFLINE_QUERY_OPTIONS,
  });
}

export function useInvoicesQuery() {
  return useQuery({
    queryKey: queryKeys.invoices,
    queryFn: safeQueryFn(() => invoiceStorage.getAll(), [] as Invoice[]),
    placeholderData: [] as Invoice[],
    ...OFFLINE_QUERY_OPTIONS,
  });
}

export function useInvoicesList() {
  const query = useInvoicesQuery();
  return {
    ...query,
    invoices: safeArray(query.data),
  };
}

export function useInvoiceQuery(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.invoice(id ?? ''),
    queryFn: safeQueryFn(() => (id ? invoiceStorage.getById(id) : undefined), undefined),
    enabled: Boolean(id),
    ...OFFLINE_QUERY_OPTIONS,
  });
}

export function useCustomerInvoicesQuery(customerId: string) {
  return useQuery({
    queryKey: queryKeys.customerInvoices(customerId),
    queryFn: safeQueryFn(() => {
      if (!customerId) return [] as Invoice[];
      return invoiceStorage
        .getAll()
        .filter(i => i.customerId === customerId)
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
    }, [] as Invoice[]),
    enabled: Boolean(customerId),
    placeholderData: [] as Invoice[],
    ...OFFLINE_QUERY_OPTIONS,
  });
}

export function usePaymentsQuery() {
  return useQuery({
    queryKey: queryKeys.payments,
    queryFn: safeQueryFn(() => paymentStorage.getAll(), [] as Payment[]),
    placeholderData: [] as Payment[],
    ...OFFLINE_QUERY_OPTIONS,
  });
}

export function useCustomerPaymentsQuery(customerId: string) {
  return useQuery({
    queryKey: queryKeys.customerPayments(customerId),
    queryFn: safeQueryFn(() => {
      if (!customerId) return [] as Payment[];
      return paymentStorage.getByCustomer(customerId);
    }, [] as Payment[]),
    enabled: Boolean(customerId),
    placeholderData: [] as Payment[],
    ...OFFLINE_QUERY_OPTIONS,
  });
}

export function useCustomerBalanceQuery(customerId: string) {
  return useQuery({
    queryKey: queryKeys.customerBalance(customerId),
    queryFn: safeQueryFn(() => {
      if (!customerId) {
        return { totalDebit: 0, totalCredit: 0, balance: 0 };
      }
      return paymentStorage.getCustomerBalance(customerId);
    }, { totalDebit: 0, totalCredit: 0, balance: 0 }),
    enabled: Boolean(customerId),
    placeholderData: { totalDebit: 0, totalCredit: 0, balance: 0 },
    ...OFFLINE_QUERY_OPTIONS,
  });
}

export function useCustomerLedgersQuery() {
  return useQuery({
    queryKey: queryKeys.customerLedgers,
    queryFn: safeQueryFn(() => customerLedgerStorage.getAll(), [] as CustomerLedger[]),
    placeholderData: [] as CustomerLedger[],
    ...OFFLINE_QUERY_OPTIONS,
  });
}

export function useCustomerLedgersList() {
  const query = useCustomerLedgersQuery();
  return {
    ...query,
    ledgers: safeArray(query.data),
  };
}

export function useStockPurchasesQuery() {
  return useQuery({
    queryKey: queryKeys.stockPurchases,
    queryFn: safeQueryFn(() => stockPurchaseStorage.getAll(), [] as StockPurchase[]),
    placeholderData: [] as StockPurchase[],
    ...OFFLINE_QUERY_OPTIONS,
  });
}

export function useStockPurchasesList() {
  const query = useStockPurchasesQuery();
  return {
    ...query,
    purchases: safeArray(query.data),
  };
}

export function useStockPurchaseQuery(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.stockPurchase(id ?? ''),
    queryFn: safeQueryFn(() => (id ? stockPurchaseStorage.getById(id) : undefined), undefined),
    enabled: Boolean(id),
    ...OFFLINE_QUERY_OPTIONS,
  });
}

export function useSettingsQuery() {
  return useQuery({
    queryKey: queryKeys.settings,
    queryFn: safeQueryFn(() => settingsStorage.get(), {
      shopAddress: '',
      shopPhone: '',
      thankYouMessage: 'Thank you for your business!',
    } as ShopSettings),
    ...OFFLINE_QUERY_OPTIONS,
  });
}

export function useDashboardQuery() {
  return useQuery({
    queryKey: queryKeys.dashboard,
    queryFn: safeQueryFn(
      () => ({
        invoices: invoiceStorage.getAll(),
        products: productStorage.getAll(),
        customers: customerStorage.getAll(),
      }),
      { invoices: [] as Invoice[], products: [] as Product[], customers: [] as Customer[] }
    ),
    placeholderData: {
      invoices: [] as Invoice[],
      products: [] as Product[],
      customers: [] as Customer[],
    },
    ...OFFLINE_QUERY_OPTIONS,
  });
}

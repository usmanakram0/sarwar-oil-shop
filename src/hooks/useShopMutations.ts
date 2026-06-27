import { useMutation } from '@tanstack/react-query';
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
import {
  type HistoricalEntryOptions,
  resolveOrderTimestamp,
} from '@/lib/historicalEntry';
import { type InvoiceCloseOptions } from '@/lib/invoiceLifecycle';
import { applyDailySlipRenumbering } from '@/lib/dailySlipNumber';
import {
  applyStockDeltasToProducts,
  buildStockDeltaMap,
} from '@/lib/stockMovement';
import { queryClient } from '@/lib/query/client';
import { queryKeys } from '@/lib/query/keys';
import { invalidateShopQueries } from '@/lib/query/invalidate';
import {
  appendListItem,
  beginOptimisticUpdate,
  removeListItem,
  replaceOptimisticItem,
  rollbackOptimisticUpdate,
  setSingleEntity,
  tempId,
  updateListItem,
} from '@/lib/query/optimistic';

function applyInvoicePaymentOptimistic(invoiceId: string, amount: number): Invoice | undefined {
  let updated: Invoice | undefined;
  updateListItem<Invoice>(queryKeys.invoices, invoiceId, inv => {
    const paidAmount = (inv.paidAmount || 0) + amount;
    const remainingAmount = Math.max(0, inv.total - paidAmount);
    const status = remainingAmount <= 0 ? 'paid' : 'partial';
    updated = {
      ...inv,
      paidAmount,
      remainingAmount,
      status,
      updatedAt: new Date().toISOString(),
    };
    return updated;
  });
  return updated;
}

function applyPurchasePaymentOptimistic(
  purchaseId: string,
  amount: number
): StockPurchase | undefined {
  let updated: StockPurchase | undefined;
  updateListItem<StockPurchase>(queryKeys.stockPurchases, purchaseId, pur => {
    const paidAmount = (pur.paidAmount || 0) + amount;
    const remainingAmount = Math.max(0, pur.total - paidAmount);
    const status = remainingAmount <= 0 ? 'paid' : 'partial';
    updated = {
      ...pur,
      paidAmount,
      remainingAmount,
      status,
      updatedAt: new Date().toISOString(),
    };
    return updated;
  });
  return updated;
}

function appendPaymentToCaches(payment: Payment, customerId: string): void {
  appendListItem(queryKeys.payments, payment);
  appendListItem(queryKeys.customerPayments(customerId), payment);
  queryClient.setQueryData(
    queryKeys.customerBalance(customerId),
    (old: { totalDebit: number; totalCredit: number; balance: number } | undefined) => {
      const prev = old ?? { totalDebit: 0, totalCredit: 0, balance: 0 };
      if (payment.type === 'debit') {
        return {
          totalDebit: prev.totalDebit + payment.amount,
          totalCredit: prev.totalCredit,
          balance: prev.balance + payment.amount,
        };
      }
      return {
        totalDebit: prev.totalDebit,
        totalCredit: prev.totalCredit + payment.amount,
        balance: prev.balance - payment.amount,
      };
    }
  );
}

function removePaymentFromCaches(payment: Payment): void {
  removeListItem<Payment>(queryKeys.payments, payment.id);
  removeListItem<Payment>(queryKeys.customerPayments(payment.customerId), payment.id);
  queryClient.setQueryData(
    queryKeys.customerBalance(payment.customerId),
    paymentStorage.getCustomerBalance(payment.customerId),
  );
}

function replacePaymentInCaches(updated: Payment): void {
  updateListItem<Payment>(queryKeys.payments, updated.id, () => updated);
  updateListItem<Payment>(
    queryKeys.customerPayments(updated.customerId),
    updated.id,
    () => updated,
  );
  queryClient.setQueryData(
    queryKeys.customerBalance(updated.customerId),
    paymentStorage.getCustomerBalance(updated.customerId),
  );
}

export function useProductMutations() {
  const add = useMutation({
    mutationFn: (data: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>) =>
      productStorage.add(data),
    onMutate: async data => {
      const ctx = await beginOptimisticUpdate([queryKeys.products, queryKeys.dashboard]);
      appendListItem(queryKeys.products, {
        ...data,
        id: tempId(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } satisfies Product);
      return ctx;
    },
    onSuccess: created => replaceOptimisticItem(queryKeys.products, created),
    onError: (_e, _v, ctx) => rollbackOptimisticUpdate(ctx),
  });

  const update = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: Partial<Omit<Product, 'id' | 'createdAt' | 'updatedAt'>>;
    }) => {
      const result = productStorage.update(id, data);
      if (!result) throw new Error('Product not found');
      return result;
    },
    onMutate: async ({ id, data }) => {
      const ctx = await beginOptimisticUpdate([queryKeys.products, queryKeys.dashboard]);
      updateListItem<Product>(queryKeys.products, id, p => ({
        ...p,
        ...data,
        updatedAt: new Date().toISOString(),
      }));
      return ctx;
    },
    onError: (_e, _v, ctx) => rollbackOptimisticUpdate(ctx),
  });

  const remove = useMutation({
    mutationFn: (id: string) => {
      const ok = productStorage.delete(id);
      if (!ok) throw new Error('Product not found');
    },
    onMutate: async id => {
      const ctx = await beginOptimisticUpdate([queryKeys.products, queryKeys.dashboard]);
      removeListItem(queryKeys.products, id);
      return ctx;
    },
    onError: (_e, _v, ctx) => rollbackOptimisticUpdate(ctx),
  });

  return { add, update, remove };
}

export function useCustomerMutations() {
  const add = useMutation({
    mutationFn: (data: Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>) =>
      customerStorage.add(data),
    onMutate: async data => {
      const ctx = await beginOptimisticUpdate([queryKeys.customers, queryKeys.dashboard]);
      appendListItem(queryKeys.customers, {
        ...data,
        id: tempId(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } satisfies Customer);
      return ctx;
    },
    onSuccess: created => replaceOptimisticItem(queryKeys.customers, created),
    onError: (_e, _v, ctx) => rollbackOptimisticUpdate(ctx),
  });

  const update = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: Partial<Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>>;
    }) => {
      const result = customerStorage.update(id, data);
      if (!result) throw new Error('Customer not found');
      return result;
    },
    onMutate: async ({ id, data }) => {
      const ctx = await beginOptimisticUpdate([queryKeys.customers, queryKeys.dashboard]);
      updateListItem<Customer>(queryKeys.customers, id, c => ({
        ...c,
        ...data,
        updatedAt: new Date().toISOString(),
      }));
      return ctx;
    },
    onError: (_e, _v, ctx) => rollbackOptimisticUpdate(ctx),
  });

  const remove = useMutation({
    mutationFn: (id: string) => {
      const ok = customerStorage.delete(id);
      if (!ok) throw new Error('Customer not found');
    },
    onMutate: async id => {
      const ctx = await beginOptimisticUpdate([queryKeys.customers, queryKeys.dashboard]);
      removeListItem(queryKeys.customers, id);
      return ctx;
    },
    onError: (_e, _v, ctx) => rollbackOptimisticUpdate(ctx),
  });

  return { add, update, remove };
}

export function useSupplierMutations() {
  const add = useMutation({
    mutationFn: (data: Omit<Supplier, 'id' | 'createdAt' | 'updatedAt'>) =>
      supplierStorage.add(data),
    onMutate: async data => {
      const ctx = await beginOptimisticUpdate([queryKeys.suppliers]);
      appendListItem(queryKeys.suppliers, {
        ...data,
        id: tempId(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } satisfies Supplier);
      return ctx;
    },
    onSuccess: created => replaceOptimisticItem(queryKeys.suppliers, created),
    onError: (_e, _v, ctx) => rollbackOptimisticUpdate(ctx),
  });

  const update = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: Partial<Omit<Supplier, 'id' | 'createdAt' | 'updatedAt'>>;
    }) => {
      const result = supplierStorage.update(id, data);
      if (!result) throw new Error('Supplier not found');
      return result;
    },
    onMutate: async ({ id, data }) => {
      const ctx = await beginOptimisticUpdate([queryKeys.suppliers]);
      updateListItem<Supplier>(queryKeys.suppliers, id, s => ({
        ...s,
        ...data,
        updatedAt: new Date().toISOString(),
      }));
      return ctx;
    },
    onError: (_e, _v, ctx) => rollbackOptimisticUpdate(ctx),
  });

  const remove = useMutation({
    mutationFn: (id: string) => {
      const ok = supplierStorage.delete(id);
      if (!ok) throw new Error('Cannot delete supplier with existing purchases');
    },
    onMutate: async id => {
      const ctx = await beginOptimisticUpdate([queryKeys.suppliers]);
      removeListItem(queryKeys.suppliers, id);
      return ctx;
    },
    onError: (_e, _v, ctx) => rollbackOptimisticUpdate(ctx),
  });

  return { add, update, remove };
}

export function useInvoiceMutations() {
  const create = useMutation({
    mutationFn: ({
      invoice,
      options,
    }: {
      invoice: Omit<
        Invoice,
        'id' | 'invoiceNumber' | 'createdAt' | 'updatedAt' | 'historical' | 'dailySlipNumber'
      >;
      options?: HistoricalEntryOptions;
    }) => invoiceStorage.add(invoice, options),
    onMutate: async ({ invoice, options }) => {
      const ctx = await beginOptimisticUpdate([
        queryKeys.invoices,
        queryKeys.products,
        queryKeys.payments,
        queryKeys.dashboard,
      ]);
      const timestamp = resolveOrderTimestamp(options?.orderDate);
      const isHistorical = Boolean(options?.orderDate || options?.skipStockUpdate);
      appendListItem(queryKeys.invoices, {
        ...invoice,
        id: tempId(),
        invoiceNumber: options?.manualNumber?.trim() || '…',
        createdAt: timestamp,
        updatedAt: timestamp,
        historical: isHistorical,
      } satisfies Invoice);

      if (!options?.skipStockUpdate) {
        queryClient.setQueryData<Product[]>(queryKeys.products, (old) => {
          const deltas = buildStockDeltaMap(
            invoice.items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
            })),
            'out',
          );
          return applyStockDeltasToProducts(old ?? [], deltas);
        });
      }
      return ctx;
    },
    onSuccess: created => replaceOptimisticItem(queryKeys.invoices, created),
    onError: (_e, _v, ctx) => rollbackOptimisticUpdate(ctx),
  });

  const edit = useMutation({
    mutationFn: ({
      id,
      invoice,
    }: {
      id: string;
      invoice: Pick<
        Invoice,
        | 'customerId'
        | 'customerName'
        | 'items'
        | 'subtotal'
        | 'discount'
        | 'tax'
        | 'total'
        | 'paidAmount'
        | 'remainingAmount'
        | 'paymentMethod'
        | 'status'
      >;
    }) => invoiceStorage.editInvoice(id, invoice),
    onMutate: async ({ id, invoice }) => {
      const invoices = queryClient.getQueryData<Invoice[]>(queryKeys.invoices) ?? [];
      const existing = invoices.find((entry) => entry.id === id);
      const customerIds = new Set(
        [existing?.customerId, invoice.customerId].filter(Boolean) as string[],
      );
      const ctx = await beginOptimisticUpdate([
        queryKeys.invoices,
        queryKeys.products,
        queryKeys.payments,
        queryKeys.dashboard,
        queryKeys.invoice(id),
        ...Array.from(customerIds).flatMap((customerId) => [
          queryKeys.customerPayments(customerId),
          queryKeys.customerBalance(customerId),
          queryKeys.customerInvoices(customerId),
        ]),
      ]);
      return ctx;
    },
    onSuccess: (updated) => {
      replaceOptimisticItem(queryKeys.invoices, updated);
      setSingleEntity(queryKeys.invoice(updated.id), updated);
    },
    onError: (_e, _v, ctx) => rollbackOptimisticUpdate(ctx),
  });

  const close = useMutation({
    mutationFn: ({
      id,
      options,
    }: {
      id: string;
      options: InvoiceCloseOptions;
    }) => {
      const result = invoiceStorage.closeInvoice(id, options);
      if (!result) throw new Error('Invoice not found or already closed');
      return result;
    },
    onMutate: async ({ id, options }) => {
      const invoices = queryClient.getQueryData<Invoice[]>(queryKeys.invoices) ?? [];
      const invoice = invoices.find(i => i.id === id);
      const customerId = invoice?.customerId;
      const ctx = await beginOptimisticUpdate([
        queryKeys.invoices,
        queryKeys.products,
        queryKeys.payments,
        queryKeys.dashboard,
        queryKeys.invoice(id),
        ...(customerId
          ? [queryKeys.customerPayments(customerId), queryKeys.customerBalance(customerId)]
          : []),
      ]);

      if (invoice) {
        const shouldRestoreStock = options.restoreStock && !invoice.historical;
        if (shouldRestoreStock) {
          queryClient.setQueryData<Product[]>(queryKeys.products, (old) => {
            const deltas = buildStockDeltaMap(
              invoice.items.map((item) => ({
                productId: item.productId,
                quantity: item.quantity,
              })),
              'in',
            );
            return applyStockDeltasToProducts(old ?? [], deltas, {
              skipValidation: true,
            });
          });
        }

        const closedAt = new Date().toISOString();
        const closedInvoice: Invoice = {
          ...invoice,
          status: options.mode === 'return' ? 'returned' : 'cancelled',
          remainingAmount: 0,
          closedAt,
          stockRestoredOnClose: shouldRestoreStock,
          closureNote:
            options.mode === 'return'
              ? `Customer returned order ${invoice.invoiceNumber}`
              : `Voided mistaken invoice ${invoice.invoiceNumber}`,
          updatedAt: closedAt,
          dailySlipNumber: undefined,
        };

        const renumbered = applyDailySlipRenumbering(
          invoices.map((entry) => (entry.id === id ? closedInvoice : entry)),
        );
        queryClient.setQueryData<Invoice[]>(queryKeys.invoices, renumbered);
        const updatedClosed = renumbered.find((entry) => entry.id === id);
        if (updatedClosed) {
          setSingleEntity(queryKeys.invoice(id), updatedClosed);
        }

        queryClient.setQueryData<Payment[]>(queryKeys.payments, old =>
          (old ?? []).filter(p => p.invoiceId !== id)
        );
        if (customerId) {
          queryClient.setQueryData<Payment[]>(
            queryKeys.customerPayments(customerId),
            old => (old ?? []).filter(p => p.invoiceId !== id)
          );
        }
      }

      return ctx;
    },
    onSuccess: updated => {
      replaceOptimisticItem(queryKeys.invoices, updated);
      setSingleEntity(queryKeys.invoice(updated.id), updated);
    },
    onError: (_e, _v, ctx) => rollbackOptimisticUpdate(ctx),
  });

  const recordPayment = useMutation({
    mutationFn: ({ invoiceId, amount }: { invoiceId: string; amount: number }) => {
      const result = invoiceStorage.recordPayment(invoiceId, amount);
      if (!result) throw new Error('Invoice not found');
      return result;
    },
    onMutate: async ({ invoiceId, amount }) => {
      const ctx = await beginOptimisticUpdate([
        queryKeys.invoices,
        queryKeys.invoice(invoiceId),
        queryKeys.payments,
        queryKeys.dashboard,
      ]);
      const updated = applyInvoicePaymentOptimistic(invoiceId, amount);
      if (updated) setSingleEntity(queryKeys.invoice(invoiceId), updated);
      return ctx;
    },
    onSuccess: updated => {
      setSingleEntity(queryKeys.invoice(updated.id), updated);
      replaceOptimisticItem(queryKeys.invoices, updated);
    },
    onError: (_e, _v, ctx) => rollbackOptimisticUpdate(ctx),
  });

  return { create, edit, close, recordPayment };
}

export function useStockPurchaseMutations() {
  const create = useMutation({
    mutationFn: ({
      purchase,
      options,
    }: {
      purchase: Omit<
        StockPurchase,
        'id' | 'slipNumber' | 'createdAt' | 'updatedAt' | 'historical'
      >;
      options?: HistoricalEntryOptions;
    }) => stockPurchaseStorage.add(purchase, options),
    onMutate: async ({ purchase, options }) => {
      const ctx = await beginOptimisticUpdate([
        queryKeys.stockPurchases,
        queryKeys.products,
        queryKeys.dashboard,
      ]);
      const timestamp = resolveOrderTimestamp(options?.orderDate);
      const isHistorical = Boolean(options?.orderDate || options?.skipStockUpdate);
      appendListItem(queryKeys.stockPurchases, {
        ...purchase,
        id: tempId(),
        slipNumber: options?.manualNumber?.trim() || '…',
        createdAt: timestamp,
        updatedAt: timestamp,
        historical: isHistorical,
      } satisfies StockPurchase);

      if (!options?.skipStockUpdate) {
        queryClient.setQueryData<Product[]>(queryKeys.products, (old) => {
          const deltas = buildStockDeltaMap(
            purchase.items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
            })),
            'in',
          );
          return applyStockDeltasToProducts(old ?? [], deltas, {
            skipValidation: true,
          });
        });
      }
      return ctx;
    },
    onSuccess: created => replaceOptimisticItem(queryKeys.stockPurchases, created),
    onError: (_e, _v, ctx) => rollbackOptimisticUpdate(ctx),
  });

  const remove = useMutation({
    mutationFn: (id: string) => {
      const ok = stockPurchaseStorage.delete(id);
      if (!ok) throw new Error('Purchase not found');
    },
    onMutate: async id => {
      const purchases =
        queryClient.getQueryData<StockPurchase[]>(queryKeys.stockPurchases) ?? [];
      const purchase = purchases.find(p => p.id === id);
      const ctx = await beginOptimisticUpdate([
        queryKeys.stockPurchases,
        queryKeys.products,
        queryKeys.dashboard,
      ]);
      removeListItem<StockPurchase>(queryKeys.stockPurchases, id);
      if (purchase && !purchase.historical) {
        queryClient.setQueryData<Product[]>(queryKeys.products, (old) => {
          const deltas = buildStockDeltaMap(
            purchase.items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
            })),
            'out',
          );
          return applyStockDeltasToProducts(old ?? [], deltas);
        });
      }
      return ctx;
    },
    onError: (_e, _v, ctx) => rollbackOptimisticUpdate(ctx),
  });

  const recordPayment = useMutation({
    mutationFn: ({ purchaseId, amount }: { purchaseId: string; amount: number }) => {
      const result = stockPurchaseStorage.recordPayment(purchaseId, amount);
      if (!result) throw new Error('Purchase not found');
      return result;
    },
    onMutate: async ({ purchaseId, amount }) => {
      const ctx = await beginOptimisticUpdate([
        queryKeys.stockPurchases,
        queryKeys.stockPurchase(purchaseId),
        queryKeys.dashboard,
      ]);
      const updated = applyPurchasePaymentOptimistic(purchaseId, amount);
      if (updated) setSingleEntity(queryKeys.stockPurchase(purchaseId), updated);
      return ctx;
    },
    onSuccess: updated => {
      setSingleEntity(queryKeys.stockPurchase(updated.id), updated);
      replaceOptimisticItem(queryKeys.stockPurchases, updated);
    },
    onError: (_e, _v, ctx) => rollbackOptimisticUpdate(ctx),
  });

  return { create, remove, recordPayment };
}

export function usePaymentMutations() {
  const addManualPayment = useMutation({
    mutationFn: ({
      customerId,
      customerName,
      amount,
      note,
      options,
    }: {
      customerId: string;
      customerName: string;
      amount: number;
      note: string;
      options?: { orderDate?: string; applyToInvoices?: boolean };
    }) =>
      paymentStorage.addManualPayment(
        customerId,
        customerName,
        amount,
        note,
        options
      ),
    onMutate: async ({ customerId, customerName, amount, note, options }) => {
      const ctx = await beginOptimisticUpdate([
        queryKeys.payments,
        queryKeys.customerPayments(customerId),
        queryKeys.customerBalance(customerId),
        queryKeys.invoices,
        queryKeys.dashboard,
      ]);
      const payment: Payment = {
        id: tempId(),
        customerId,
        customerName,
        amount,
        type: 'credit',
        note: note || 'Manual payment',
        createdAt: resolveOrderTimestamp(options?.orderDate),
      };
      appendPaymentToCaches(payment, customerId);
      return ctx;
    },
    onError: (_e, _v, ctx) => rollbackOptimisticUpdate(ctx),
  });

  const addHistoricalLedgerEntry = useMutation({
    mutationFn: ({
      customerId,
      customerName,
      amount,
      type,
      note,
      orderDate,
    }: {
      customerId: string;
      customerName: string;
      amount: number;
      type: 'debit' | 'credit';
      note: string;
      orderDate?: string;
    }) =>
      paymentStorage.addHistoricalLedgerEntry(
        customerId,
        customerName,
        amount,
        type,
        note,
        orderDate
      ),
    onMutate: async ({ customerId, customerName, amount, type, note, orderDate }) => {
      const ctx = await beginOptimisticUpdate([
        queryKeys.payments,
        queryKeys.customerPayments(customerId),
        queryKeys.customerBalance(customerId),
        queryKeys.dashboard,
      ]);
      const defaultNote =
        type === 'debit'
          ? 'Old balance from previous records'
          : 'Old payment from previous records';
      appendPaymentToCaches(
        {
          id: tempId(),
          customerId,
          customerName,
          amount,
          type,
          note: note.trim() || defaultNote,
          createdAt: resolveOrderTimestamp(orderDate),
        },
        customerId
      );
      return ctx;
    },
    onError: (_e, _v, ctx) => rollbackOptimisticUpdate(ctx),
  });

  const addLedgerEntry = useMutation({
    mutationFn: ({
      customerId,
      customerName,
      amount,
      type,
      note,
      options,
    }: {
      customerId: string;
      customerName: string;
      amount: number;
      type: 'debit' | 'credit';
      note: string;
      options?: {
        orderDate?: string;
        applyToInvoices?: boolean;
        paymentMethod?: Payment['paymentMethod'];
      };
    }) =>
      paymentStorage.addLedgerEntry(
        customerId,
        customerName,
        amount,
        type,
        note,
        options,
      ),
    onMutate: async ({
      customerId,
      customerName,
      amount,
      type,
      note,
      options,
    }) => {
      const ctx = await beginOptimisticUpdate([
        queryKeys.payments,
        queryKeys.customerPayments(customerId),
        queryKeys.customerBalance(customerId),
        queryKeys.customerLedgers,
        queryKeys.invoices,
        queryKeys.dashboard,
      ]);
      const defaultNote =
        type === 'debit'
          ? 'Pending amount owed'
          : note || 'Manual payment';
      appendPaymentToCaches(
        {
          id: tempId(),
          customerId,
          customerName,
          amount,
          type,
          note: note.trim() || defaultNote,
          createdAt: resolveOrderTimestamp(options?.orderDate),
          paymentMethod:
            type === 'credit' ? options?.paymentMethod || 'cash' : undefined,
        },
        customerId,
      );
      return ctx;
    },
    onError: (_e, _v, ctx) => rollbackOptimisticUpdate(ctx),
  });

  const updateManualEntry = useMutation({
    mutationFn: ({
      id,
      updates,
    }: {
      id: string;
      updates: {
        amount?: number;
        note?: string;
        createdAt?: string;
        paymentMethod?: Payment['paymentMethod'];
      };
    }) => {
      const result = paymentStorage.updateManualEntry(id, updates);
      if (!result) throw new Error('Entry not found or cannot be edited');
      return result;
    },
    onMutate: async ({ id, updates }) => {
      const existing = paymentStorage.getById(id);
      if (!existing) return undefined;

      const ctx = await beginOptimisticUpdate([
        queryKeys.payments,
        queryKeys.customerPayments(existing.customerId),
        queryKeys.customerBalance(existing.customerId),
        queryKeys.invoices,
        queryKeys.dashboard,
      ]);

      const updated: Payment = {
        ...existing,
        amount: updates.amount ?? existing.amount,
        note: updates.note?.trim() || existing.note,
        createdAt: updates.createdAt ?? existing.createdAt,
        paymentMethod: updates.paymentMethod ?? existing.paymentMethod,
      };
      replacePaymentInCaches(updated);
      return ctx;
    },
    onSuccess: (updated) => {
      replacePaymentInCaches(updated);
      invalidateShopQueries(['payments', 'invoices', 'ledger']);
    },
    onError: (_e, _v, ctx) => rollbackOptimisticUpdate(ctx),
  });

  const deleteManualEntry = useMutation({
    mutationFn: (id: string) => {
      const removed = paymentStorage.deleteManualEntry(id);
      if (!removed) throw new Error('Entry not found or cannot be deleted');
      return removed;
    },
    onMutate: async (id) => {
      const existing = paymentStorage.getById(id);
      if (!existing) return undefined;

      const ctx = await beginOptimisticUpdate([
        queryKeys.payments,
        queryKeys.customerPayments(existing.customerId),
        queryKeys.customerBalance(existing.customerId),
        queryKeys.invoices,
        queryKeys.dashboard,
      ]);
      removePaymentFromCaches(existing);
      return ctx;
    },
    onSuccess: () => {
      invalidateShopQueries(['payments', 'invoices', 'ledger']);
    },
    onError: (_e, _v, ctx) => rollbackOptimisticUpdate(ctx),
  });

  return {
    addManualPayment,
    addHistoricalLedgerEntry,
    addLedgerEntry,
    updateManualEntry,
    deleteManualEntry,
  };
}

export function useCustomerLedgerMutations() {
  const create = useMutation({
    mutationFn: ({
      customerId,
      customerName,
    }: {
      customerId: string;
      customerName: string;
    }) => {
      const ledger = customerLedgerStorage.create(customerId, customerName);
      if (!ledger) throw new Error('Ledger already exists for this customer');
      return ledger;
    },
    onMutate: async ({ customerId, customerName }) => {
      const ctx = await beginOptimisticUpdate([queryKeys.customerLedgers]);
      const now = new Date().toISOString();
      appendListItem(queryKeys.customerLedgers, {
        id: tempId(),
        customerId,
        customerName,
        createdAt: now,
        updatedAt: now,
      } satisfies CustomerLedger);
      return ctx;
    },
    onSuccess: (created) =>
      replaceOptimisticItem(queryKeys.customerLedgers, created),
    onError: (_e, _v, ctx) => rollbackOptimisticUpdate(ctx),
  });

  return { create };
}

export function useSettingsMutation() {
  return useMutation({
    mutationFn: (data: Partial<ShopSettings>) => settingsStorage.update(data),
    onMutate: async data => {
      const ctx = await beginOptimisticUpdate([queryKeys.settings]);
      queryClient.setQueryData<ShopSettings>(queryKeys.settings, old => ({
        ...(old ?? settingsStorage.get()),
        ...data,
      }));
      return ctx;
    },
    onSuccess: updated => setSingleEntity(queryKeys.settings, updated),
    onError: (_e, _v, ctx) => rollbackOptimisticUpdate(ctx),
  });
}

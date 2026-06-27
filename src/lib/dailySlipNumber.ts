import { isSameDay, isToday, startOfDay } from 'date-fns';
import type { Invoice } from '@/lib/storage';
import { isActiveSale, isInvoiceClosed } from '@/lib/invoiceLifecycle';

/** Daily slip counter (#01, #02…) — separate from voucher / invoice number. Resets each calendar day. */
export function formatDailySlipNumber(slipNumber: number): string {
  return `#${slipNumber.toString().padStart(2, '0')}`;
}

export function isDailySlipInvoice(invoice: Invoice): boolean {
  return !invoice.historical;
}

/** Active (non-void / non-return) same-day invoices that receive a daily slip number. */
export function countsForDailySlip(invoice: Invoice): boolean {
  return isDailySlipInvoice(invoice) && isActiveSale(invoice);
}

function dayKey(date: Date): string {
  return startOfDay(date).toISOString();
}

export function getActiveSlipInvoicesForDate(
  invoices: Invoice[],
  date: Date,
): Invoice[] {
  return invoices
    .filter(
      (invoice) =>
        countsForDailySlip(invoice) &&
        isSameDay(new Date(invoice.createdAt), date),
    )
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
}

export function getNextDailySlipNumber(
  invoices: Invoice[],
  forDate: Date,
): number {
  return getActiveSlipInvoicesForDate(invoices, forDate).length + 1;
}

export function resolveDailySlipNumber(
  invoice: Invoice,
  allInvoices: Invoice[],
): number | null {
  if (!countsForDailySlip(invoice)) return null;

  const sameDayActive = getActiveSlipInvoicesForDate(
    allInvoices,
    new Date(invoice.createdAt),
  );
  const index = sameDayActive.findIndex((entry) => entry.id === invoice.id);
  if (index === -1) return null;
  return index + 1;
}

/**
 * Re-number active daily slips for each calendar day (1, 2, 3… with no gaps).
 * Closed / void / returned invoices lose their slip number.
 */
export function applyDailySlipRenumbering(invoices: Invoice[]): Invoice[] {
  const byDay = new Map<string, Invoice[]>();

  for (const invoice of invoices) {
    if (!isDailySlipInvoice(invoice)) continue;
    const key = dayKey(new Date(invoice.createdAt));
    const bucket = byDay.get(key) ?? [];
    bucket.push(invoice);
    byDay.set(key, bucket);
  }

  const slipById = new Map<string, number | undefined>();

  for (const dayInvoices of byDay.values()) {
    const activeOrdered = dayInvoices
      .filter(countsForDailySlip)
      .sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );

    activeOrdered.forEach((invoice, index) => {
      slipById.set(invoice.id, index + 1);
    });

    for (const invoice of dayInvoices) {
      if (isInvoiceClosed(invoice)) {
        slipById.set(invoice.id, undefined);
      }
    }
  }

  let changed = false;
  const next = invoices.map((invoice) => {
    if (!slipById.has(invoice.id)) return invoice;
    const newSlip = slipById.get(invoice.id);
    if (invoice.dailySlipNumber === newSlip) return invoice;
    changed = true;
    return { ...invoice, dailySlipNumber: newSlip };
  });

  return changed ? next : invoices;
}

export function formatInvoiceDailySlip(
  invoice: Invoice,
  allInvoices: Invoice[],
): string | null {
  const slipNumber = resolveDailySlipNumber(invoice, allInvoices);
  if (slipNumber == null) return null;
  return formatDailySlipNumber(slipNumber);
}

export function getTodaySlipInvoices(invoices: Invoice[]): Invoice[] {
  return invoices
    .filter(
      (invoice) =>
        countsForDailySlip(invoice) && isToday(new Date(invoice.createdAt)),
    )
    .sort((a, b) => {
      const slipA = resolveDailySlipNumber(a, invoices) ?? 0;
      const slipB = resolveDailySlipNumber(b, invoices) ?? 0;
      if (slipA !== slipB) return slipA - slipB;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
}

export function getTodaySlipInvoiceCount(invoices: Invoice[]): number {
  return getTodaySlipInvoices(invoices).length;
}

export function getInvoiceSlipLabel(
  invoice: Invoice,
  allInvoices: Invoice[],
): string | null {
  return formatInvoiceDailySlip(invoice, allInvoices);
}

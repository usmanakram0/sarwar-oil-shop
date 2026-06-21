import { isSameDay, isToday } from 'date-fns';
import type { Invoice } from '@/lib/storage';

/** Daily slip counter (#01, #02…) — separate from voucher / invoice number. Resets each calendar day. */
export function formatDailySlipNumber(slipNumber: number): string {
  return `#${slipNumber.toString().padStart(2, '0')}`;
}

export function isDailySlipInvoice(invoice: Invoice): boolean {
  return !invoice.historical;
}

export function getNextDailySlipNumber(
  invoices: Invoice[],
  forDate: Date,
): number {
  const sameDayInvoices = invoices.filter(
    (invoice) =>
      isDailySlipInvoice(invoice) &&
      isSameDay(new Date(invoice.createdAt), forDate),
  );

  const assignedNumbers = sameDayInvoices
    .map((invoice) => invoice.dailySlipNumber)
    .filter((value): value is number => typeof value === 'number' && value > 0);

  if (assignedNumbers.length > 0) {
    return Math.max(...assignedNumbers) + 1;
  }

  return sameDayInvoices.length + 1;
}

export function resolveDailySlipNumber(
  invoice: Invoice,
  allInvoices: Invoice[],
): number | null {
  if (!isDailySlipInvoice(invoice)) return null;

  if (typeof invoice.dailySlipNumber === 'number' && invoice.dailySlipNumber > 0) {
    return invoice.dailySlipNumber;
  }

  const sameDayInvoices = allInvoices
    .filter(
      (entry) =>
        isDailySlipInvoice(entry) &&
        isSameDay(new Date(entry.createdAt), new Date(invoice.createdAt)),
    )
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );

  const index = sameDayInvoices.findIndex((entry) => entry.id === invoice.id);
  if (index === -1) return null;
  return index + 1;
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
        isDailySlipInvoice(invoice) && isToday(new Date(invoice.createdAt)),
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

export function getInvoiceSlipLabel(invoice: Invoice): string | null {
  if (!isDailySlipInvoice(invoice)) return null;
  if (typeof invoice.dailySlipNumber === 'number' && invoice.dailySlipNumber > 0) {
    return formatDailySlipNumber(invoice.dailySlipNumber);
  }
  return null;
}

import type { Payment } from '@/lib/storage';

/** Customer balance (positive = owes) immediately before and after a ledger entry. */
export function getBalancesForPaymentEntry(
  payments: Payment[],
  entry: Payment,
): { previousBalance: number; currentBalance: number } {
  const sorted = [...payments].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  let running = 0;
  let previousBalance = 0;
  let found = false;

  for (const payment of sorted) {
    if (payment.id === entry.id) {
      previousBalance = running;
      found = true;
      break;
    }
    if (payment.type === 'debit') {
      running += payment.amount;
    } else {
      running -= payment.amount;
    }
  }

  if (!found) {
    previousBalance = running;
  }

  const currentBalance =
    entry.type === 'credit'
      ? previousBalance - entry.amount
      : previousBalance + entry.amount;

  return { previousBalance, currentBalance };
}

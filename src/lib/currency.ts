/** Fixed currency for the entire application. */
export const CURRENCY = 'Rs';

function formatNumber(amount: number, decimals: number): string {
  return amount.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatMoney(amount: number, decimals = 2): string {
  return `${CURRENCY} ${formatNumber(amount, decimals)}`;
}

export function formatMoneyWhole(amount: number): string {
  return `${CURRENCY} ${formatNumber(amount, 0)}`;
}

export function formatMoneyWithSign(amount: number, decimals = 2): string {
  const prefix = amount < 0 ? '-' : '';
  return `${prefix}${CURRENCY} ${formatNumber(Math.abs(amount), decimals)}`;
}

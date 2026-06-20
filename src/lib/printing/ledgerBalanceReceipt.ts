import { format } from 'date-fns';
import { formatMoney } from '@/lib/currency';
import {
  buildMetaTableRows,
  buildReceiptDocument,
} from '@/lib/printing/thermalStyles';

export interface LedgerBalanceReceiptContext {
  shopName: string;
  shopAddress: string;
  shopPhone: string;
  thankYouMessage: string;
  customerName: string;
  totalDebit: number;
  totalCredit: number;
  balance: number;
  dateFrom?: string;
  dateTo?: string;
}

function formatBalanceStatus(balance: number): string {
  if (balance === 0) return `${formatMoney(0, 0)} (Settled)`;
  if (balance > 0) return `${formatMoney(balance, 0)} Due`;
  return `${formatMoney(Math.abs(balance), 0)} Advance`;
}

function formatPeriodLabel(dateFrom?: string, dateTo?: string): string {
  if (dateFrom && dateTo) {
    return `${format(new Date(`${dateFrom}T12:00:00`), 'dd MMM yyyy')} – ${format(new Date(`${dateTo}T12:00:00`), 'dd MMM yyyy')}`;
  }
  if (dateFrom) {
    return `From ${format(new Date(`${dateFrom}T12:00:00`), 'dd MMM yyyy')}`;
  }
  if (dateTo) {
    return `Up to ${format(new Date(`${dateTo}T12:00:00`), 'dd MMM yyyy')}`;
  }
  return 'All transactions';
}

export function buildLedgerBalanceReceiptBody(
  context: LedgerBalanceReceiptContext,
): string {
  const {
    shopName,
    shopAddress,
    shopPhone,
    thankYouMessage,
    customerName,
    totalDebit,
    totalCredit,
    balance,
    dateFrom,
    dateTo,
  } = context;

  const metaRows = buildMetaTableRows([
    {
      label: 'Statement Date:',
      value: format(new Date(), 'EEE dd MMM yyyy'),
    },
    { label: 'Customer Name:', value: customerName },
    {
      label: 'Period:',
      value: formatPeriodLabel(dateFrom, dateTo),
    },
    {
      label: 'Total Pending:',
      value: formatMoney(totalDebit, 0),
    },
    {
      label: 'Total Paid:',
      value: formatMoney(totalCredit, 0),
    },
    {
      label: 'Balance:',
      value: formatBalanceStatus(balance),
      emphasize: true,
    },
  ]);

  return `
    <div class="receipt-container">
      <div class="header">
        <h2>${shopName}</h2>
        ${shopAddress ? `<p class="header-address">${shopAddress}</p>` : ''}
        ${shopPhone ? `<p>Tel: ${shopPhone}</p>` : ''}
        <p class="section-title">Account Balance</p>
      </div>
      <table class="meta-table payment-receipt-table">${metaRows}</table>
      <div class="footer">
        <p>${thankYouMessage || 'Thank You for Your Business!'}</p>
      </div>
    </div>
  `;
}

export function buildLedgerBalanceReceiptHtml(
  context: LedgerBalanceReceiptContext,
): string {
  return buildReceiptDocument(buildLedgerBalanceReceiptBody(context));
}

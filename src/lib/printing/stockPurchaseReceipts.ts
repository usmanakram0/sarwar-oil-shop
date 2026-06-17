import { formatMoney } from '@/lib/currency';
import type { StockPurchase } from '@/lib/storage';
import {
  buildMetaTableRows,
  buildReceiptDocument,
  buildTotalsTableRows,
} from '@/lib/printing/thermalStyles';

export interface StockPurchaseReceiptContext {
  shopName: string;
  shopAddress: string;
  shopPhone: string;
  purchase: StockPurchase;
  supplierPhone?: string;
}

function formatNow(): string {
  return (
    new Date().toLocaleDateString('en-GB', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }) +
    ' ' +
    new Date().toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    })
  );
}

export function buildStockPurchaseReceiptBody(context: StockPurchaseReceiptContext): string {
  const { shopName, shopAddress, shopPhone, purchase, supplierPhone } = context;
  const remaining = purchase.remainingAmount ?? purchase.total - (purchase.paidAmount || 0);

  const metaRows = buildMetaTableRows([
    { label: 'Slip No:', value: purchase.slipNumber, uppercase: true },
    { label: 'Supplier:', value: purchase.supplierName },
    ...(supplierPhone ? [{ label: 'Phone:', value: supplierPhone }] : []),
    ...(purchase.vehicleNumber ? [{ label: 'Vehicle No:', value: purchase.vehicleNumber }] : []),
    ...(purchase.vehicleDriver ? [{ label: 'Driver:', value: purchase.vehicleDriver }] : []),
    ...(purchase.vehicleType ? [{ label: 'Type:', value: purchase.vehicleType }] : []),
  ]);

  const totalRows = buildTotalsTableRows([
    { label: 'Total:', value: formatMoney(purchase.total, 0) },
    { label: 'Paid:', value: formatMoney(purchase.paidAmount || 0, 0) },
    { label: 'Pending:', value: formatMoney(remaining, 0) },
  ]);

  return `
    <div class="receipt-container">
      <div class="header">
        <h2>${shopName}</h2>
        ${shopAddress ? `<p class="header-address">${shopAddress}</p>` : ''}
        ${shopPhone ? `<p>Tel: ${shopPhone}</p>` : ''}
        <table class="title-row">
          <tr>
            <td>Purchase Slip</td>
            <td>Date: ${formatNow()}</td>
          </tr>
        </table>
      </div>
      <hr />
      <table class="meta-table">${metaRows}</table>
      <div class="products-table cols-5">
        <table>
          <thead>
            <tr><th>Item</th><th>Category</th><th>Qty</th><th>Rate</th><th>Total</th></tr>
          </thead>
          <tbody>
            ${purchase.items
              .map(
                (item) => `
              <tr>
                <td>${item.productName}</td>
                <td>${item.category}</td>
                <td>${item.quantity.toLocaleString()} L</td>
                <td>${formatMoney(item.pricePerLiter, 0)}</td>
                <td>${formatMoney(item.total, 0)}</td>
              </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>
      <table class="totals-table">${totalRows}</table>
      ${purchase.note ? `<p class="note-text"><strong>Note:</strong> ${purchase.note}</p>` : ''}
      <hr />
      <div class="footer"><p>Received oil into store inventory. Supplier copy.</p></div>
    </div>
  `;
}

export function buildStockPurchaseReceiptHtml(context: StockPurchaseReceiptContext): string {
  return buildReceiptDocument(buildStockPurchaseReceiptBody(context));
}

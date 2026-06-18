import { format } from 'date-fns';
import { formatMoney } from '@/lib/currency';
import { getInvoiceDiscountAmount, type Invoice } from '@/lib/storage';
import { formatLineItemQuantityWithUnit } from '@/lib/productTypes';
import { getInvoiceCustomerName } from '@/lib/walkingCustomer';
import {
  buildMetaTableRows,
  buildReceiptDocument,
  buildTotalsTableRows,
} from '@/lib/printing/thermalStyles';

export interface InvoiceReceiptContext {
  shopName: string;
  shopAddress: string;
  shopPhone: string;
  thankYouMessage: string;
  invoice: Invoice;
  customerPhone?: string;
  customerAddress?: string;
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

function buildReceiptHeader(
  shopName: string,
  shopAddress: string,
  shopPhone: string,
  title: string,
  dateLabel: string
): string {
  return `
    <div class="header">
      <h2>${shopName}</h2>
      ${shopAddress ? `<p class="header-address">${shopAddress}</p>` : ''}
      ${shopPhone ? `<p>Tel: ${shopPhone}</p>` : ''}
      <table class="title-row">
        <tr>
          <td>${title}</td>
          <td>${dateLabel}: ${formatNow()}</td>
        </tr>
      </table>
    </div>
  `;
}

export function buildBillReceiptBody(context: InvoiceReceiptContext): string {
  const { shopName, shopAddress, shopPhone, thankYouMessage, invoice, customerPhone, customerAddress } =
    context;
  const discountAmount = getInvoiceDiscountAmount(invoice);
  const remaining = invoice.remainingAmount ?? invoice.total - (invoice.paidAmount || 0);
  const customerName = getInvoiceCustomerName(invoice);

  const metaRows = buildMetaTableRows([
    { label: 'Voucher No:', value: invoice.invoiceNumber, uppercase: true },
    {
      label: 'Order Date:',
      value: format(new Date(invoice.createdAt), 'EEE dd MMM yyyy hh:mm a'),
    },
    { label: 'Name:', value: customerName },
    ...(customerPhone ? [{ label: 'Phone:', value: customerPhone }] : []),
    ...(customerAddress ? [{ label: 'Address:', value: customerAddress }] : []),
  ]);

  const totalRows = buildTotalsTableRows([
    { label: 'Sub Total:', value: formatMoney(invoice.subtotal, 0) },
    ...(discountAmount > 0
      ? [{ label: 'Discount:', value: `-${formatMoney(discountAmount, 0)}` }]
      : []),
    { label: 'Total:', value: formatMoney(invoice.total, 0) },
    { label: 'Received:', value: formatMoney(invoice.paidAmount || 0, 0) },
    { label: 'Pending:', value: formatMoney(remaining, 0) },
  ]);

  return `
    <div class="receipt-container">
      ${buildReceiptHeader(shopName, shopAddress, shopPhone, 'Invoice', 'Date')}
      <hr />
      <table class="meta-table">${metaRows}</table>
      <div class="products-table cols-4">
        <table>
          <thead>
            <tr><th>Item</th><th>Qty</th><th>Rate</th><th>Total</th></tr>
          </thead>
          <tbody>
            ${invoice.items
              .map(
                (item) => `
              <tr>
                <td>${item.productName}</td>
                <td>${formatLineItemQuantityWithUnit(item)}</td>
                <td>${formatMoney(item.appliedPrice || item.pricePerLiter, 0)}</td>
                <td>${formatMoney(item.total, 0)}</td>
              </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>
      <table class="totals-table">${totalRows}</table>
      <hr />
      <div class="footer"><p>${thankYouMessage || 'Thank You for Your Business!'}</p></div>
    </div>
  `;
}

export function buildGatePassReceiptBody(context: InvoiceReceiptContext): string {
  const { shopName, shopAddress, shopPhone, invoice, customerPhone } = context;
  const customerName = getInvoiceCustomerName(invoice);

  const metaRows = buildMetaTableRows([
    { label: 'Voucher No:', value: invoice.invoiceNumber, uppercase: true },
    { label: 'Name:', value: customerName },
    ...(customerPhone ? [{ label: 'Phone:', value: customerPhone }] : []),
  ]);

  return `
    <div class="receipt-container">
      <div class="header">
        <h2>${shopName}</h2>
        ${shopAddress ? `<p class="header-address">${shopAddress}</p>` : ''}
        ${shopPhone ? `<p>Tel: ${shopPhone}</p>` : ''}
        <p class="section-title">Gate Pass</p>
        <table class="title-row">
          <tr>
            <td></td>
            <td>Date: ${formatNow()}</td>
          </tr>
        </table>
      </div>
      <hr />
      <table class="meta-table">${metaRows}</table>
      <div class="products-table cols-2">
        <table>
          <thead>
            <tr><th>Item</th><th>Quantity</th></tr>
          </thead>
          <tbody>
            ${invoice.items
              .map(
                (item) => `
              <tr>
                <td>${item.productName}</td>
                <td>${formatLineItemQuantityWithUnit(item)}</td>
              </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>
      <div class="footer"><p>Mark as Completed After Processed!</p></div>
    </div>
  `;
}

export function buildBillReceiptHtml(context: InvoiceReceiptContext): string {
  return buildReceiptDocument(buildBillReceiptBody(context));
}

export function buildGatePassReceiptHtml(context: InvoiceReceiptContext): string {
  return buildReceiptDocument(buildGatePassReceiptBody(context));
}

export function buildInvoiceReceiptHtml(
  type: 'bill' | 'gatepass' | 'both',
  context: InvoiceReceiptContext
): string[] {
  if (type === 'bill') return [buildBillReceiptHtml(context)];
  if (type === 'gatepass') return [buildGatePassReceiptHtml(context)];
  return [buildBillReceiptHtml(context), buildGatePassReceiptHtml(context)];
}

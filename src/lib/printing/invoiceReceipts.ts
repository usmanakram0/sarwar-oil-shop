import { format } from 'date-fns';
import { formatMoney } from '@/lib/currency';
import { getInvoiceDiscountAmount, type Invoice } from '@/lib/storage';
import { buildReceiptDocument } from '@/lib/printing/thermalStyles';

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

export function buildBillReceiptBody(context: InvoiceReceiptContext): string {
  const { shopName, shopAddress, shopPhone, thankYouMessage, invoice, customerPhone, customerAddress } =
    context;
  const nowStr = formatNow();
  const discountAmount = getInvoiceDiscountAmount(invoice);
  const remaining = invoice.remainingAmount ?? invoice.total - (invoice.paidAmount || 0);

  return `
    <div class="receipt-container">
      <div class="header">
        <h2>${shopName}</h2>
        ${shopAddress ? `<p style="max-width:70%;margin:auto;line-height:14px">${shopAddress}</p>` : ''}
        ${shopPhone ? `<p style="margin-top:4px">Tel: ${shopPhone}</p>` : ''}
        <div style="width:100%;display:flex;justify-content:space-between;align-items:center;margin-top:6px">
          <p><strong>Invoice</strong></p>
          <p><strong>Date:</strong> ${nowStr}</p>
        </div>
      </div>
      <hr />
      <div class="info">
        <p style="text-transform:uppercase"><strong>Voucher No:</strong> ${invoice.invoiceNumber}</p>
        <p><strong>Order Date:</strong> ${format(new Date(invoice.createdAt), 'EEE dd MMM yyyy hh:mm a')}</p>
        <p><strong>Name:</strong> ${invoice.customerName || 'Walking Customer'}</p>
        ${customerPhone ? `<p><strong>Phone:</strong> ${customerPhone}</p>` : ''}
        ${customerAddress ? `<p><strong>Address:</strong> ${customerAddress}</p>` : ''}
      </div>
      <div class="products-table">
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
                <td>${item.quantity.toLocaleString()} Ltr</td>
                <td>${formatMoney(item.appliedPrice || item.pricePerLiter, 0)}</td>
                <td>${formatMoney(item.total, 0)}</td>
              </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>
      <div class="totals">
        <p><strong>Sub Total:</strong> ${formatMoney(invoice.subtotal, 0)}</p>
        ${discountAmount > 0 ? `<p><strong>Discount:</strong> -${formatMoney(discountAmount, 0)}</p>` : ''}
        <p><strong>Total:</strong> ${formatMoney(invoice.total, 0)}</p>
        <p><strong>Received:</strong> ${formatMoney(invoice.paidAmount || 0, 0)}</p>
        <p><strong>Pending:</strong> ${formatMoney(remaining, 0)}</p>
      </div>
      <hr />
      <div class="footer"><p>${thankYouMessage || 'Thank You for Your Business!'}</p></div>
    </div>
  `;
}

export function buildGatePassReceiptBody(context: InvoiceReceiptContext): string {
  const { shopName, invoice, customerPhone } = context;
  const nowStr = formatNow();

  return `
    <div class="receipt-container">
      <div class="header">
        <h2>${shopName}</h2>
        <p><strong>Date:</strong> ${nowStr}</p>
      </div>
      <p style="margin:0"><strong style="font-size:18px">Gate Pass</strong></p>
      <hr />
      <div class="info">
        <p style="text-transform:uppercase"><strong>Voucher No:</strong> ${invoice.invoiceNumber}</p>
        <p><strong>Name:</strong> ${invoice.customerName || 'Walking Customer'}</p>
        ${customerPhone ? `<p><strong>Phone:</strong> ${customerPhone}</p>` : ''}
      </div>
      <div class="products-table">
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
                <td>${item.quantity.toLocaleString()} Ltr</td>
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

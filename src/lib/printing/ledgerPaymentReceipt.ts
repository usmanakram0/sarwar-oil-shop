import { format } from "date-fns";
import { formatMoney } from "@/lib/currency";
import type { Payment } from "@/lib/storage";
import { getBalancesForPaymentEntry } from "@/lib/ledgerBalance";
import {
  buildMetaTableRows,
  buildReceiptDocument,
} from "@/lib/printing/thermalStyles";

export interface LedgerPaymentReceiptContext {
  shopName: string;
  shopAddress: string;
  shopPhone: string;
  thankYouMessage: string;
  customerName: string;
  payment: Payment;
  allCustomerPayments: Payment[];
}

export function getPaymentReceiptNumber(payment: Payment): string {
  if (payment.receiptNumber) {
    return payment.receiptNumber;
  }

  const date = new Date(payment.createdAt);
  const y = date.getFullYear().toString().slice(-2);
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  const d = date.getDate().toString().padStart(2, "0");
  const suffix = payment.id.slice(-5).toUpperCase();
  return `RCP-${y}${m}${d}-${suffix}`;
}

function formatPaymentMethodLabel(
  method: Payment["paymentMethod"] | undefined,
): string {
  if (method === "card") return "Card";
  if (method === "credit") return "Credit";
  return "Cash";
}

function formatReceiptBalance(balance: number): string {
  if (balance === 0) return formatMoney(0, 0);
  if (balance > 0) return `${formatMoney(balance, 0)} Due`;
  return `${formatMoney(Math.abs(balance), 0)} Advance`;
}

export function canPrintLedgerEntryReceipt(payment: Payment): boolean {
  if (payment.type === "credit") return true;
  return payment.type === "debit" && !payment.invoiceId;
}

export function buildLedgerPaymentReceiptBody(
  context: LedgerPaymentReceiptContext,
): string {
  const {
    shopName,
    shopAddress,
    shopPhone,
    thankYouMessage,
    customerName,
    payment,
    allCustomerPayments,
  } = context;

  const isPendingEntry = payment.type === "debit";
  const { previousBalance, currentBalance } = getBalancesForPaymentEntry(
    allCustomerPayments,
    payment,
  );

  const metaRows = buildMetaTableRows([
    {
      label: isPendingEntry ? "Voucher No:" : "Receipt No:",
      value: getPaymentReceiptNumber(payment),
      uppercase: true,
    },
    {
      label: isPendingEntry ? "Voucher Date:" : "Receipt Date:",
      value: format(new Date(payment.createdAt), "EEE dd MMM yyyy"),
    },
    { label: "Customer Name:", value: customerName },
    {
      label: isPendingEntry ? "Pending Amount:" : "Receipt Amount:",
      value: formatMoney(payment.amount, 0),
      emphasize: true,
    },
    ...(isPendingEntry
      ? []
      : [
          {
            label: "Payment Method:",
            value: formatPaymentMethodLabel(payment.paymentMethod),
          },
        ]),
    {
      label: "Previous Balance:",
      value: formatReceiptBalance(previousBalance),
    },
    {
      label: "Current Balance:",
      value: formatReceiptBalance(currentBalance),
    },
    // ...(payment.note ? [{ label: "Note:", value: payment.note }] : []),
  ]);

  const sectionTitle = isPendingEntry ? "Pending Voucher" : "Payment Receipt";
  const footerMessage = isPendingEntry
    ? thankYouMessage || "Thank You for Your Business!"
    : thankYouMessage || "Thank You for Your Payment!";

  return `
    <div class="receipt-container">
      <div class="header">
        <h2>${shopName}</h2>
        ${shopAddress ? `<p class="header-address">${shopAddress}</p>` : ""}
        ${shopPhone ? `<p>Tel: ${shopPhone}</p>` : ""}
        <p class="section-title">${sectionTitle}</p>
      </div>
      <table class="meta-table payment-receipt-table">${metaRows}</table>
    
      <div class="footer">
        <p>${footerMessage}</p>
      </div>
    </div>
  `;
}

export function buildLedgerPaymentReceiptHtml(
  context: LedgerPaymentReceiptContext,
): string {
  return buildReceiptDocument(buildLedgerPaymentReceiptBody(context));
}

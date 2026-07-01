import { format } from "date-fns";
import type { SupplierPayment } from "@/lib/storage";
import { getBalancesForSupplierPaymentEntry } from "@/lib/ledgerBalance";

export interface SupplierPaymentReceiptContext {
  shopName: string;
  shopAddress: string;
  shopPhone: string;
  thankYouMessage: string;
  supplierName: string;
  payment: SupplierPayment;
  allSupplierPayments: SupplierPayment[];
}

function formatReceiptAmount(amount: number): string {
  return amount.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function formatReceiptBalance(amount: number): string {
  return formatReceiptAmount(amount);
}

export function getSupplierReceiptNumber(
  payment: SupplierPayment,
  allPayments?: SupplierPayment[],
): string {
  if (payment.receiptNumber) {
    return payment.receiptNumber;
  }

  if (allPayments) {
    const sorted = [...allPayments].sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    const index = sorted.findIndex((entry) => entry.id === payment.id);
    if (index >= 0) {
      return (index + 1).toString().padStart(2, "0");
    }
  }

  return "01";
}

export function canPrintSupplierLedgerEntryReceipt(
  payment: SupplierPayment,
): boolean {
  if (payment.type === "credit") return true;
  return payment.type === "debit" && !payment.purchaseId;
}

export function buildSupplierPaymentReceiptHtml(
  context: SupplierPaymentReceiptContext,
): string {
  const {
    shopName,
    shopAddress,
    shopPhone,
    thankYouMessage,
    supplierName,
    payment,
    allSupplierPayments,
  } = context;

  const { previousBalance, currentBalance } =
    getBalancesForSupplierPaymentEntry(allSupplierPayments, payment);

  const receiptNumber = getSupplierReceiptNumber(payment, allSupplierPayments);
  const receiptDate = format(new Date(payment.createdAt), "dd-MMM-yy");
  const description = payment.note || "-";

  const slipRow = (
    label: string,
    value: string,
    options?: {
      boldLabel?: boolean;
      boldValue?: boolean;
      indent?: boolean;
    },
  ) => {
    const labelClass = [
      "label",
      options?.indent ? "indent" : "",
      options?.boldLabel ? "bold" : "",
    ]
      .filter(Boolean)
      .join(" ");
    const valueClass = ["value", options?.boldValue ? "bold" : ""]
      .filter(Boolean)
      .join(" ");
    return `
      <tr>
        <td class="${labelClass}">${label}</td>
        <td class="${valueClass}">${value}</td>
      </tr>
    `;
  };

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Supplier Receipt</title>
  <style>
    @page { margin: 12mm; }
    * { box-sizing: border-box; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 14px;
      color: #000;
      margin: 0;
      padding: 16px;
    }
    .header {
      text-align: center;
      margin-bottom: 14px;
    }
    .header h2 {
      margin: 0 0 4px;
      font-size: 20px;
      font-weight: 700;
    }
    .header p {
      margin: 2px 0;
      font-size: 13px;
    }
    .slip-table {
      width: 100%;
      max-width: 520px;
      margin: 0 auto;
      border: 1px solid #000;
      border-collapse: collapse;
    }
    .slip-table tr {
      border-bottom: 1px solid #000;
    }
    .slip-table tr:last-child {
      border-bottom: none;
    }
    .slip-table td {
      padding: 7px 10px;
      vertical-align: top;
    }
    .label {
      width: 50%;
      white-space: nowrap;
      border-right: 1px solid #000;
    }
    .label.bold,
    .value.bold {
      font-weight: 700;
    }
    .value {
      width: 50%;
      text-align: left;
      font-weight: 400;
    }
    .footer {
      max-width: 520px;
      margin: 14px auto 0;
      text-align: center;
    }
    .footer p {
      margin: 0;
      font-size: 13px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h2>${shopName}</h2>
    ${shopAddress ? `<p>${shopAddress}</p>` : ""}
    ${shopPhone ? `<p>Phone: ${shopPhone}</p>` : ""}
  </div>
  <table class="slip-table">
    ${slipRow("Receipt Number", receiptNumber)}
    ${slipRow("Receipt Date", receiptDate)}
    ${slipRow("Party Name", supplierName.toUpperCase())}
    ${slipRow("Receipt Amount", formatReceiptAmount(payment.amount), {
      boldLabel: true,
      boldValue: true,
    })}
    ${slipRow("Receipt Description", description)}
    ${slipRow("Party Previous Balance", formatReceiptBalance(previousBalance))}
    ${slipRow("Party Current Balance", formatReceiptBalance(currentBalance), {
      boldValue: true,
      indent: true,
    })}
  </table>
  <div class="footer">
    <p>${thankYouMessage || "Thank You for Your Business!"}</p>
  </div>
</body>
</html>`;
}

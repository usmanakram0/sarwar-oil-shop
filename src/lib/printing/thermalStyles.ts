/** Thermal receipt defaults matching shop printer setup (Envelope Monarch, min margins, portrait). */
export const THERMAL_PAGE_WIDTH_MM = 98.425;

export const THERMAL_PRINT_STYLES = `
  @page {
    size: ${THERMAL_PAGE_WIDTH_MM}mm auto;
    margin: 0;
  }

  * {
    box-sizing: border-box;
  }

  html, body {
    width: ${THERMAL_PAGE_WIDTH_MM}mm;
    margin: 0;
    padding: 0;
    font-family: Arial, sans-serif;
    text-align: center;
    color: #000;
    background: #fff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .receipt-container {
    width: ${THERMAL_PAGE_WIDTH_MM}mm;
    max-width: ${THERMAL_PAGE_WIDTH_MM}mm;
    margin: 0 auto;
    padding: 4mm 5mm 6mm;
    line-height: 1.45;
    page-break-after: always;
  }

  .header h2 {
    margin: 0;
    font-size: 20px;
    font-weight: 900;
  }

  .header p,
  .footer p {
    margin: 0;
    font-size: 11px;
  }

  .info p {
    font-size: 11px;
    margin: 2px 0;
    display: flex;
    justify-content: space-between;
    gap: 8px;
    text-align: left;
  }

  .products-table table {
    width: 100%;
    border-collapse: collapse;
    margin: 4px 0;
  }

  .products-table th,
  .products-table td {
    padding: 3px;
    text-align: left;
    border: 1px solid #000;
    font-size: 11px;
  }

  .totals p {
    font-size: 11px;
    margin: 2px 0;
    display: flex;
    justify-content: space-between;
    gap: 8px;
  }

  hr {
    border: none;
    border-top: 1px dashed #000;
    margin: 5px 0;
  }

  strong {
    font-size: 11px;
  }
`;

export function buildReceiptDocument(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=${THERMAL_PAGE_WIDTH_MM}mm, initial-scale=1.0" />
  <title>Receipt</title>
  <style>${THERMAL_PRINT_STYLES}</style>
</head>
<body>${bodyHtml}</body>
</html>`;
}

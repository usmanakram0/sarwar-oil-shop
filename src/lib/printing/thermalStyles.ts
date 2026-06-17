/** Thermal receipt defaults matching shop printer setup (Envelope Monarch, min margins, portrait). */
export const THERMAL_PAGE_WIDTH_MM = 98.425;
export const THERMAL_PAGE_WIDTH_PX = Math.round((THERMAL_PAGE_WIDTH_MM / 25.4) * 96);

export const THERMAL_PRINT_STYLES = `
  @page {
    size: ${THERMAL_PAGE_WIDTH_MM}mm auto;
    margin: 0;
  }

  * {
    box-sizing: border-box;
  }

  html, body {
    width: ${THERMAL_PAGE_WIDTH_PX}px;
    max-width: ${THERMAL_PAGE_WIDTH_PX}px;
    margin: 0;
    padding: 0;
    font-family: Arial, Helvetica, sans-serif;
    color: #000;
    background: #fff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .receipt-container {
    width: ${THERMAL_PAGE_WIDTH_PX}px;
    max-width: ${THERMAL_PAGE_WIDTH_PX}px;
    margin: 0 auto;
    padding: 8px 10px 12px;
    line-height: 1.4;
  }

  .header {
    text-align: center;
    margin-bottom: 4px;
  }

  .header h2 {
    margin: 0 0 2px;
    font-size: 18px;
    font-weight: 900;
    line-height: 1.2;
  }

  .header p {
    margin: 0;
    font-size: 11px;
    line-height: 1.35;
  }

  .header-address {
    max-width: 92%;
    margin: 0 auto;
  }

  .title-row {
    width: 100%;
    border-collapse: collapse;
    margin-top: 6px;
  }

  .title-row td {
    padding: 0;
    font-size: 11px;
    font-weight: 700;
    vertical-align: top;
  }

  .title-row td:last-child {
    text-align: right;
    white-space: nowrap;
  }

  .section-title {
    margin: 4px 0 2px;
    font-size: 14px;
    font-weight: 700;
    text-align: center;
  }

  .meta-table,
  .totals-table {
    width: 100%;
    border-collapse: collapse;
    margin: 4px 0;
  }

  .meta-table td,
  .totals-table td {
    padding: 2px 0;
    font-size: 11px;
    vertical-align: top;
    text-align: left;
  }

  .meta-table td.label,
  .totals-table td.label {
    width: 42%;
    font-weight: 700;
    padding-right: 6px;
    white-space: nowrap;
  }

  .meta-table td.value,
  .totals-table td.value {
    width: 58%;
    word-break: break-word;
  }

  .meta-table tr.uppercase .value {
    text-transform: uppercase;
  }

  .products-table {
    width: 100%;
    margin: 6px 0;
  }

  .products-table table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }

  .products-table th,
  .products-table td {
    border: 1px solid #000;
    padding: 3px 2px;
    font-size: 10px;
    text-align: left;
    vertical-align: top;
    word-wrap: break-word;
    overflow-wrap: anywhere;
  }

  .products-table th {
    font-weight: 700;
  }

  .products-table.cols-4 th:nth-child(1),
  .products-table.cols-4 td:nth-child(1) { width: 38%; }
  .products-table.cols-4 th:nth-child(2),
  .products-table.cols-4 td:nth-child(2) { width: 18%; }
  .products-table.cols-4 th:nth-child(3),
  .products-table.cols-4 td:nth-child(3) { width: 22%; }
  .products-table.cols-4 th:nth-child(4),
  .products-table.cols-4 td:nth-child(4) { width: 22%; text-align: right; }

  .products-table.cols-5 th:nth-child(1),
  .products-table.cols-5 td:nth-child(1) { width: 30%; }
  .products-table.cols-5 th:nth-child(2),
  .products-table.cols-5 td:nth-child(2) { width: 18%; }
  .products-table.cols-5 th:nth-child(3),
  .products-table.cols-5 td:nth-child(3) { width: 16%; }
  .products-table.cols-5 th:nth-child(4),
  .products-table.cols-5 td:nth-child(4) { width: 18%; }
  .products-table.cols-5 th:nth-child(5),
  .products-table.cols-5 td:nth-child(5) { width: 18%; text-align: right; }

  .products-table.cols-2 th:nth-child(1),
  .products-table.cols-2 td:nth-child(1) { width: 62%; }
  .products-table.cols-2 th:nth-child(2),
  .products-table.cols-2 td:nth-child(2) { width: 38%; text-align: right; }

  .totals-table td.value {
    text-align: right;
    font-weight: 600;
  }

  .note-text {
    margin: 6px 0 0;
    font-size: 10px;
    text-align: left;
    word-break: break-word;
  }

  .footer {
    text-align: center;
    margin-top: 4px;
  }

  .footer p {
    margin: 0;
    font-size: 11px;
  }

  hr {
    border: none;
    border-top: 1px dashed #000;
    margin: 6px 0;
  }
`;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildMetaTableRows(
  rows: Array<{ label: string; value: string; uppercase?: boolean }>
): string {
  return rows
    .map(
      (row) => `
        <tr class="${row.uppercase ? 'uppercase' : ''}">
          <td class="label">${escapeHtml(row.label)}</td>
          <td class="value">${escapeHtml(row.value)}</td>
        </tr>`
    )
    .join('');
}

export function buildTotalsTableRows(rows: Array<{ label: string; value: string }>): string {
  return rows
    .map(
      (row) => `
        <tr>
          <td class="label">${escapeHtml(row.label)}</td>
          <td class="value">${escapeHtml(row.value)}</td>
        </tr>`
    )
    .join('');
}

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
